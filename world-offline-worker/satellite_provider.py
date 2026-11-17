"""Download and repack selected levels from public VersaTiles world archives."""

from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextlib import contextmanager
import ctypes
from dataclasses import dataclass
import errno
from hashlib import sha256
from http.client import HTTPException
from pathlib import Path
import json
import os
import re
import struct
import subprocess
from stat import S_ISREG
from tempfile import TemporaryFile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

from world_provider import (InvalidPreparedArchive, InvalidSourceArchive, NoRedirect, PMTilesCommandError,
                            WorldAssetError, _checkpoint_version, _resume_metadata, _run_pmtiles)


SOURCE_URL = "https://download.versatiles.org/satellite-raster/satellite-raster.versatiles"
SOURCE_PAGE = "https://docs.versatiles.org/basics/tilesets.html#satellite"
ATTRIBUTION = "VersaTiles · Copernicus Sentinel-2 Global Mosaic (CC BY 4.0) · NASA Blue Marble"
# Compressed source blocks and block indices, measured from the publishing archive.
ESTIMATED_BYTES = {8: 1_023_000_000, 9: 2_850_000_000, 10: 9_120_000_000,
                   11: 31_318_000_000, 12: 102_828_000_000}
TOPO_URL = "https://download.versatiles.org/hillshade-vector/hillshade-vector.versatiles"
TOPO_PAGE = "https://docs.versatiles.org/basics/tilesets.html#hillshade"
TOPO_ATTRIBUTION = "VersaTiles (CC BY 4.0) · Mapzen Terrain Tiles, DEM Sources"
TOPO_MAP_ATTRIBUTION = (
    '<a href="https://docs.versatiles.org/basics/tilesets.html#hillshade">VersaTiles</a> '
    '(<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>) · '
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen Terrain Tiles, DEM Sources</a>'
)
TOPO_SOURCE_LAYER = "hillshade-vectors"
TOPO_MIN_ZOOM = 9
TOPO_ESTIMATED_BYTES = {9: 2_155_245_900, 10: 10_716_150_700, 11: 33_839_754_500, 12: 111_916_682_000}
HEADER = struct.Struct(">14sBBBB4i4Q")
BLOCK = struct.Struct(">BIIBBBBQQI")
RANGE = re.compile(r"bytes (\d+)-(\d+)/(\d+)\Z")
SEGMENT_BYTES = 16 * 1024**2
TRANSFER_WORKERS = 8


@dataclass(frozen=True)
class VersaDataset:
    stem: str
    title: str
    url: str
    attribution: str
    min_zoom: int
    source_header: tuple[int, int]
    pmtiles_header: tuple[int, int]
    source_layer: str = ""


SATELLITE = VersaDataset("satellite", "satellite", SOURCE_URL, ATTRIBUTION, 0, (18, 0), (1, 4))
TOPOGRAPHY = VersaDataset("topography", "topography", TOPO_URL, TOPO_ATTRIBUTION, TOPO_MIN_ZOOM,
                          (32, 2), (2, 1), TOPO_SOURCE_LAYER)


@dataclass(frozen=True)
class Segment:
    upstream: int
    local: int
    length: int


@dataclass(frozen=True)
class VersaPlan:
    dataset: VersaDataset
    etag: str
    remote_size: int
    header: bytes
    metadata: bytes
    index: bytes
    index_offset: int
    segments: tuple[Segment, ...]

    @property
    def size(self):
        return self.index_offset + len(self.index)

    @property
    def checkpoint_identity(self):
        return {"etag": self.etag, "size": self.size, "index": sha256(self.index).hexdigest(),
                "segmentBytes": SEGMENT_BYTES}


@contextmanager
def source_range(start, length, *, etag=None, remote_size=None, url=SOURCE_URL):
    end = start + length - 1
    headers = {"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity", "User-Agent": "NOMAD-raster-lab/1.0"}
    if etag:
        headers["If-Match"] = etag
    request = Request(url, headers=headers)
    with build_opener(ProxyHandler({}), NoRedirect).open(request, timeout=30) as response:
        match = RANGE.fullmatch(response.headers.get("Content-Range", ""))
        representation = response.headers.get("ETag", "")
        if (response.status != 206 or not match or tuple(map(int, match.groups()[:2])) != (start, end)
                or not representation or representation.startswith("W/")
                or (etag and etag != representation) or (remote_size and remote_size != int(match[3]))
                or response.headers.get("Content-Encoding", "identity") != "identity"):
            raise WorldAssetError("The VersaTiles provider returned an unexpected or changed byte range.")
        yield response, representation, int(match[3])


def source_metadata(start, length, etag=None, remote_size=None, *, url=SOURCE_URL):
    with source_range(start, length, etag=etag, remote_size=remote_size, url=url) as (response, tag, total):
        data = response.read(length + 1)
    if len(data) != length:
        raise OSError("VersaTiles source metadata was interrupted.")
    return data, tag, total


def brotli_index(value, *, encode=False):
    library = ctypes.CDLL("libbrotlienc.so.1" if encode else "libbrotlidec.so.1")
    buffer = ctypes.create_string_buffer(len(value) * 2 + 1024 if encode else 16 * 1024**2)
    size = ctypes.c_size_t(len(buffer))
    pointer = ctypes.c_void_p
    if encode:
        convert = library.BrotliEncoderCompress
        convert.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_size_t, pointer,
                            ctypes.POINTER(ctypes.c_size_t), pointer]
        status = convert(5, 22, 0, len(value), value, ctypes.byref(size), buffer)
    else:
        convert = library.BrotliDecoderDecompress
        convert.argtypes = [ctypes.c_size_t, pointer, ctypes.POINTER(ctypes.c_size_t), pointer]
        status = convert(len(value), value, ctypes.byref(size), buffer)
    if status != 1:
        raise WorldAssetError("The VersaTiles source index could not be processed.")
    return buffer.raw[:size.value]


def build_plan(max_zoom, dataset=SATELLITE):
    if not dataset.min_zoom <= max_zoom <= 12:
        raise WorldAssetError(f"Unsupported worldwide {dataset.title} zoom.")
    header, etag, total = source_metadata(0, HEADER.size, url=dataset.url)
    fields = list(HEADER.unpack(header))
    meta_offset, meta_length, index_offset, index_length = fields[-4:]
    if (fields[0] != b"versatiles_v02" or tuple(fields[1:3]) != dataset.source_header
            or fields[3] > dataset.min_zoom or fields[4] < max_zoom
            or not (HEADER.size <= meta_offset < meta_offset + meta_length <= index_offset)
            or not (0 < index_length <= 2 * 1024**2 and index_offset + index_length <= total)
            or meta_length > 1024**2):
        raise WorldAssetError(f"The {dataset.title} source container does not match the expected VersaTiles format.")
    raw_meta, _, _ = source_metadata(meta_offset, meta_length, etag, total, url=dataset.url)
    metadata = json.loads(brotli_index(raw_meta) if dataset.source_header[1] == 2 else raw_meta)
    if dataset.source_layer and dataset.source_layer not in {layer["id"] for layer in metadata.get("vector_layers", [])}:
        raise WorldAssetError(f"The {dataset.title} source did not contain the expected vector layer.")
    metadata.update(maxzoom=max_zoom, attribution=dataset.attribution)
    if dataset.min_zoom:
        metadata["minzoom"] = dataset.min_zoom
    raw_meta = json.dumps(metadata, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if dataset.source_header[1] == 2:
        raw_meta = brotli_index(raw_meta, encode=True)
    compressed, _, _ = source_metadata(index_offset, index_length, etag, total, url=dataset.url)
    blocks = brotli_index(compressed)
    if len(blocks) % BLOCK.size:
        raise WorldAssetError("The VersaTiles block directory is incomplete.")
    selected = {}
    for entry in BLOCK.iter_unpack(blocks):
        z, x, y, min_x, min_y, max_x, max_y, offset, size, directory_size = entry
        if not dataset.min_zoom <= z <= max_zoom:
            continue
        key = z, x, y
        if (key in selected or not (min_x <= max_x and min_y <= max_y)
                or offset < HEADER.size or not directory_size
                or offset + size + directory_size > index_offset):
            raise WorldAssetError("The VersaTiles source contains an invalid or duplicate block.")
        selected[key] = entry
    if {level for level, _, _ in selected} != set(range(dataset.min_zoom, max_zoom + 1)):
        raise WorldAssetError(f"The source did not contain all selected {dataset.title} zoom levels.")

    position = HEADER.size + len(raw_meta)
    rebased = bytearray()
    segments = []
    for entry in selected.values():
        *coordinates, offset, size, directory_size = entry
        rebased.extend(BLOCK.pack(*coordinates, position, size, directory_size))
        span = size + directory_size
        for start in range(0, span, SEGMENT_BYTES):
            segments.append(Segment(offset + start, position + start, min(SEGMENT_BYTES, span - start)))
        position += span
    index = brotli_index(bytes(rebased), encode=True)
    fields[3:5] = (dataset.min_zoom, max_zoom)
    fields[-4:] = (HEADER.size, len(raw_meta), position, len(index))
    return VersaPlan(dataset, etag, total, HEADER.pack(*fields), raw_meta, index, position, tuple(segments))


def write_at(fd, data, position):
    view = memoryview(data)
    while view:
        count = os.pwrite(fd, view, position)
        if count <= 0:
            raise OSError("Could not save the VersaTiles map on disk.")
        view = view[count:]
        position += count


def fetch_segment(fd, plan, segment, active, report):
    offset = 0
    for attempt in range(4):
        active()
        try:
            with source_range(segment.upstream + offset, segment.length - offset,
                              etag=plan.etag, remote_size=plan.remote_size, url=plan.dataset.url) as (response, _, _):
                while offset < segment.length:
                    active()
                    chunk = response.read(min(1024**2, segment.length - offset))
                    if not chunk:
                        raise OSError("The VersaTiles range was interrupted.")
                    write_at(fd, chunk, segment.local + offset)
                    offset += len(chunk)
                    report(len(chunk))
            return
        except (OSError, HTTPException, URLError) as error:
            if isinstance(error, HTTPError):
                status = error.code
                error.close()
                if status not in {408, 429, 500, 502, 503, 504}:
                    raise
            if attempt == 3:
                raise
            time.sleep(attempt + 1)


def valid_source(path, marker):
    if not isinstance(marker, dict) or type(marker.get("size")) is not int:
        return False
    try:
        details = path.lstat()
        return S_ISREG(details.st_mode) and details.st_size == marker["size"]
    except FileNotFoundError:
        return False


def valid_completed_source(path, marker, dataset, max_zoom):
    with path.open("rb") as source:
        header = source.read(HEADER.size)
        if len(header) != HEADER.size:
            return False
        format_id, encoding, compression, min_zoom, zoom, *layout = HEADER.unpack(header)
        offset, length = layout[-2:]
        if (
            format_id != b"versatiles_v02" or (encoding, compression) != dataset.source_header
            or (min_zoom, zoom) != (dataset.min_zoom, max_zoom)
            or offset < HEADER.size or not 0 < length <= 2 * 1024**2
            or offset + length != marker["size"]
        ):
            return False
        source.seek(offset)
        return sha256(source.read(length)).hexdigest() == marker.get("index")


@contextmanager
def checkpoint_lock(path, ensure_active):
    import fcntl

    with path.open("a+b") as lock:
        while True:
            ensure_active()
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(0.25)
        yield lock.fileno()


def fetch_versatiles(dataset, max_zoom, checkpoint, ensure_active, on_bytes, on_total):
    """Download only the selected blocks. The checkpoint records committed segments."""
    checkpoint.mkdir(parents=True, exist_ok=True)
    with checkpoint_lock(checkpoint / f"{dataset.stem}.lock", ensure_active):
        return _fetch_versatiles(dataset, max_zoom, checkpoint, ensure_active, on_bytes, on_total)


def _fetch_versatiles(dataset, max_zoom, checkpoint, ensure_active, on_bytes, on_total):
    source = checkpoint / f"{dataset.stem}.versatiles"
    partial = checkpoint / f"{dataset.stem}.versatiles.part"
    state = checkpoint / f"{dataset.stem}.resume.json"
    if any(path.is_symlink() for path in (source, partial, state, state.with_suffix(".pending"))):
        raise WorldAssetError("The VersaTiles checkpoint must use local regular files.")
    ready = _resume_metadata(state)
    if valid_source(source, ready):
        if valid_completed_source(source, ready, dataset, max_zoom):
            on_total(ready["size"])
            on_bytes(ready["size"])
            return source
        source.unlink()

    ensure_active()
    plan = build_plan(max_zoom, dataset)
    on_total(plan.size)
    identity = plan.checkpoint_identity
    if valid_source(partial, ready) and all(ready.get(key) == value for key, value in identity.items()):
        completed = {number for number in ready.get("completed", [])
                     if type(number) is int and 0 <= number < len(plan.segments)}
        mode = "r+b"
    else:
        completed = set()
        mode = "w+b"
    pending = iter(number for number in range(len(plan.segments)) if number not in completed)

    with partial.open(mode) as output:
        if mode == "w+b":
            output.truncate(plan.size)
            write_at(output.fileno(), plan.header + plan.metadata, 0)
            write_at(output.fileno(), plan.index, plan.index_offset)
            os.fdatasync(output.fileno())
            _checkpoint_version(state, {**identity, "completed": []})

        from threading import Event, Lock
        stop = Event()
        arrivals = Lock()
        received = sum(plan.segments[number].length for number in completed)
        on_bytes(received)

        def report(delta):
            nonlocal received
            with arrivals:
                received += delta
                on_bytes(received)

        def active():
            if stop.is_set():
                raise InterruptedError("VersaTiles work stopped.")
            ensure_active()

        with ThreadPoolExecutor(TRANSFER_WORKERS) as pool:
            def submit(number):
                if number is not None:
                    future = pool.submit(fetch_segment, output.fileno(), plan, plan.segments[number], active, report)
                    tasks[future] = number

            tasks = {}
            for _ in range(TRANSFER_WORKERS):
                submit(next(pending, None))
            try:
                while tasks:
                    ensure_active()
                    finished, _ = wait(tasks, timeout=0.25, return_when=FIRST_COMPLETED)
                    committed = set()
                    for future in finished:
                        number = tasks.pop(future)
                        future.result()
                        committed.add(number)
                    if committed:
                        os.fdatasync(output.fileno())
                        completed.update(committed)
                        _checkpoint_version(state, {**identity, "completed": sorted(completed)})
                        for _ in committed:
                            submit(next(pending, None))
            finally:
                stop.set()
    ensure_active()
    partial.replace(source)
    on_bytes(plan.size)
    return source


def converter():
    """Use the verified executable packaged in the worker image."""
    executable = Path(os.environ.get("WORLD_VERSATILES_BIN", "/usr/local/bin/versatiles"))
    if not executable.is_absolute() or not executable.is_file() or not os.access(executable, os.X_OK):
        raise WorldAssetError("Set WORLD_VERSATILES_BIN to an executable installed in the worker image.")
    return executable


def verify_versatiles(dataset, path, max_zoom, pmtiles, ensure_active):
    with path.open("rb") as source:
        header = source.read(127)
    if (len(header) != 127 or header[:8] != b"PMTiles\x03"
            or tuple(header[98:102]) != (*dataset.pmtiles_header, dataset.min_zoom, max_zoom)
            or struct.unpack_from("<Q", header, 72)[0] < 4**max_zoom // 10
            or any(abs(left - right) > 10_000 for left, right in zip(
                struct.unpack_from("<4i", header, 102), (-1800000000, -850511288, 1800000000, 850511288)))):
        raise InvalidPreparedArchive(f"The prepared PMTiles did not match worldwide {dataset.title} coverage.")
    try:
        _run_pmtiles(pmtiles, ["verify", path], ensure_active)
    except PMTilesCommandError as error:
        raise InvalidPreparedArchive(str(error)) from error


def prepare_versatiles(dataset, source, destination, max_zoom, pmtiles, ensure_active):
    with checkpoint_lock(source.parent / f"{dataset.stem}-convert.lock", ensure_active) as lock:
        return _prepare_versatiles(dataset, source, destination, max_zoom, pmtiles, ensure_active, lock)


def _prepare_versatiles(dataset, source, destination, max_zoom, pmtiles, ensure_active, lock):
    staged = destination.with_name(f".{destination.stem}.preparing.pmtiles")
    incomplete = staged.with_name(f"{staged.stem}.incomplete.pmtiles")
    if any(path.is_symlink() for path in (destination, staged, incomplete)):
        raise WorldAssetError("The PMTiles checkpoint must use local regular files.")
    if destination.is_file():
        try:
            verify_versatiles(dataset, destination, max_zoom, pmtiles, ensure_active)
        except InvalidPreparedArchive:
            destination.unlink()
        else:
            return destination
    if staged.is_file():
        # A converter that finished after the worker stopped leaves a reusable archive.
        try:
            verify_versatiles(dataset, staged, max_zoom, pmtiles, ensure_active)
        except InvalidPreparedArchive:
            staged.unlink()
        else:
            staged.replace(destination)
            return destination

    executable = converter()
    ensure_active()
    try:
        with TemporaryFile() as log:
            # Preserve the preparation lock across a hard worker stop while the child writes.
            options = ["--compress=gzip"] if dataset.source_layer else []
            process = subprocess.Popen([executable, "convert", *options, source, staged], stdin=subprocess.DEVNULL,
                                       stdout=log, stderr=subprocess.STDOUT, pass_fds=(lock,))
            try:
                while process.poll() is None:
                    ensure_active()
                    time.sleep(0.5)
                if process.returncode:
                    log.seek(max(0, log.tell() - 1500))
                    detail = log.read().decode("utf8", errors="replace").strip()
                    message = f"Preparing the {dataset.title} map failed: {detail}"
                    reason = detail.lower()
                    if "no space left" in reason or "disk quota exceeded" in reason:
                        raise OSError(errno.ENOSPC, message)
                    if any(phrase in reason for phrase in ("invalid tile", "unexpected eof", "corrupt", "could not decode")):
                        raise InvalidSourceArchive(message, source)
                    raise WorldAssetError(message)
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
        try:
            verify_versatiles(dataset, staged, max_zoom, pmtiles, ensure_active)
        except InvalidPreparedArchive as error:
            raise InvalidSourceArchive(str(error), source) from error
        staged.replace(destination)
    finally:
        staged.unlink(missing_ok=True)
        incomplete.unlink(missing_ok=True)
    return destination
