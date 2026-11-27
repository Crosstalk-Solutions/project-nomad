"""Bounded, independent XYZ-z8 map packages. No worldwide archive is modified."""

from bisect import bisect_left
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from threading import Lock, RLock, Thread
from uuid import uuid4
import gzip
import json
import math
import os
import re
import shutil
import sqlite3
import stat
import struct
import time
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from satellite_provider import (BLOCK, HEADER, SATELLITE, TOPOGRAPHY, ELEVATION,
                                TOPO_MAP_ATTRIBUTION, ELEVATION_MAP_ATTRIBUTION,
                                brotli_index, source_metadata, source_range)
from world_provider import NoRedirect, _run_pmtiles
from world_pack import write_state


API = "/api/lab-imagery/local-detail"
LEVELS = {"satellite": 12, "topography": 12, "elevation": 12, "street": 15}
MANIFEST = "local-detail-manifest.json"
TERMINAL = {"ready", "failed", "cancelled"}
MAX_CELLS = 64  # A bounded API batch, not a storage or download-size ceiling.
MAX_BATCHES = 256 * 256 // MAX_CELLS  # The fixed grid, packed into UI batches.
QUOTE_TTL = 86400
INDEX_TTL = 7 * 86400
MAINTENANCE_INTERVAL = 86400
MAINTENANCE_RETRY = 300
MAINTENANCE_POLL = 60
STREET_BUILD_ORIGIN = "https://build.protomaps.com/"
STREET_BUILDS_URL = "https://build-metadata.protomaps.dev/builds.json"
STREET_KEY = re.compile(r"\d{8}\.pmtiles\Z")
STREET_ATTRIBUTION = "© OpenStreetMap contributors · Protomaps (ODbL)"
DATASETS = {"satellite": SATELLITE, "topography": TOPOGRAPHY, "elevation": ELEVATION}


class LocalDetailError(ValueError):
    def __init__(self, message, status=400, code=None):
        super().__init__(message)
        self.status = status
        self.code = code


class Cancelled(Exception):
    pass


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def cell_label(x, y):
    result, n = "", x + 1
    while n:
        n, digit = divmod(n - 1, 26)
        result = chr(65 + digit) + result
    return result + str(y + 1)


def cell_bounds(x, y):
    latitude = lambda row: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * row / 256))))
    return [x / 256 * 360 - 180, latitude(y + 1), (x + 1) / 256 * 360 - 180, latitude(y)]


def selection(value):
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_CELLS:
        raise LocalDetailError(f"Select between 1 and {MAX_CELLS} squares per download batch.")
    found = set()
    result = []
    for item in value:
        if (not isinstance(item, dict) or type(item.get("x")) is not int or type(item.get("y")) is not int
                or not 0 <= item["x"] < 256 or not 0 <= item["y"] < 256):
            raise LocalDetailError("Use valid XYZ zoom-8 squares.")
        x, y = item["x"], item["y"]
        if (x, y) not in found:
            found.add((x, y))
            result.append({"id": f"8/{x}/{y}", "x": x, "y": y, "label": cell_label(x, y), "bounds": cell_bounds(x, y)})
    return sorted(result, key=lambda cell: (cell["x"], cell["y"]))


def tile_window(cell, z):
    """Half-open bounds avoid accidentally fetching the next quadrant."""
    x, y = cell["x"], cell["y"]
    if z < 8:
        factor = 1 << (8 - z)
        return x // factor, y // factor, x // factor, y // factor
    factor = 1 << (z - 8)
    return x * factor, y * factor, (x + 1) * factor - 1, (y + 1) * factor - 1


def tile_id(z, x, y):
    result = (4**z - 1) // 3
    a = z - 1
    s = 1 << a if a >= 0 else 0
    while s:
        rx, ry = x & s, y & s
        result += ((3 * rx) ^ ry) * (1 << a)
        if ry == 0:
            x, y = (s - 1 - y, s - 1 - x) if rx else (y, x)
        a -= 1
        s >>= 1
    return result


def groups_for(tiles):
    """Coalesce close ranges; never fetch a whole VersaTiles block."""
    spans = sorted(set((tile[3], tile[4]) for tile in tiles))
    groups = []
    for start, length in spans:
        if (groups and start <= groups[-1][0] + groups[-1][1] + 4096
                and start + length - groups[-1][0] <= 2 * 1024**2):
            groups[-1][1] = max(groups[-1][1], start + length - groups[-1][0])
        else:
            groups.append([start, length])
    return groups


def digest_file(path):
    digest = sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024**2):
            digest.update(chunk)
    return digest.hexdigest()


class Source:
    def __init__(self, url, cache, local_path=None):
        self.url, self.cache = url, cache
        self.local = Path(local_path).resolve() if local_path else None
        self.etag = None
        self.total = None
        self.local_identity = None
        self.metadata_bytes = 0
        cache.mkdir(parents=True, exist_ok=True)

    def get(self, offset, length, *, cached=True):
        if not 0 <= offset or not 0 < length <= 16 * 1024**2:
            raise LocalDetailError("The public source returned an invalid metadata range.")
        if self.local:
            stat = self.local.stat()
            current = f"local:{stat.st_dev}:{stat.st_ino}:{stat.st_size}:{stat.st_mtime_ns}"
            if self.etag and self.etag != current:
                raise LocalDetailError("The source changed. Calculate the selected squares again.")
            self.etag, self.total = current, stat.st_size
            with self.local.open("rb") as source:
                source.seek(offset)
                data = source.read(length)
        else:
            identity = sha256(f"{self.url}|{self.etag}|{offset}|{length}".encode()).hexdigest()
            path = self.cache / (identity + ".bin")
            if cached and self.etag and path.is_file() and path.stat().st_size == length:
                return path.read_bytes()
            data, self.etag, self.total = source_metadata(offset, length, self.etag, self.total, url=self.url)
            self.metadata_bytes += len(data)
            if cached:
                path = self.cache / (sha256(f"{self.url}|{self.etag}|{offset}|{length}".encode()).hexdigest() + ".bin")
                temporary = path.with_suffix(".partial")
                temporary.write_bytes(data)
                temporary.replace(path)
        if len(data) != length or offset + length > self.total:
            raise LocalDetailError("The public source metadata is incomplete.")
        return data

    def identity(self):
        return {"url": self.url, "etag": self.etag, "remoteSize": self.total,
                "localPath": str(self.local) if self.local else None}


def versa_source(dataset, cache):
    source = Source(dataset.url, cache)
    raw = source.get(0, HEADER.size, cached=False)
    fields = HEADER.unpack(raw)
    meta_offset, meta_length, index_offset, index_length = fields[-4:]
    if (fields[0] != b"versatiles_v02" or tuple(fields[1:3]) != dataset.source_header
            or fields[4] < 12 or not HEADER.size <= meta_offset < meta_offset + meta_length <= index_offset
            or not 0 < index_length <= 2 * 1024**2 or index_offset + index_length > source.total
            or not 0 < meta_length <= 1024**2):
        raise LocalDetailError("The public VersaTiles source does not match its expected format.")
    raw_meta = source.get(meta_offset, meta_length)
    metadata = json.loads(brotli_index(raw_meta) if dataset.source_header[1] == 2 else raw_meta)
    if dataset.source_layer and dataset.source_layer not in {item.get("id") for item in metadata.get("vector_layers", [])}:
        raise LocalDetailError("The public terrain source is missing its vector layer.")
    if dataset.encoding and (metadata.get("tile_schema") != "dem/terrarium" or metadata.get("tile_size") != 512):
        raise LocalDetailError("The public elevation source is not 512-pixel Terrarium data.")
    index = brotli_index(source.get(index_offset, index_length))
    if len(index) % BLOCK.size:
        raise LocalDetailError("The public terrain block index is incomplete.")
    entries = list(BLOCK.iter_unpack(index))
    return source, metadata, entries, index_offset


def plan_versa(cell, role, prepared):
    source, metadata, entries, index_offset = prepared
    tiles = []
    maximum = LEVELS[role]
    for entry in entries:
        z, bx, by, min_x, min_y, max_x, max_y, offset, size, directory_length = entry
        if z > maximum:
            continue
        x0, y0, x1, y1 = tile_window(cell, z)
        if bx * 256 + max_x < x0 or bx * 256 + min_x > x1 or by * 256 + max_y < y0 or by * 256 + min_y > y1:
            continue
        if (min_x > max_x or min_y > max_y or offset < HEADER.size
                or offset + size + directory_length > index_offset or directory_length > 2 * 1024**2):
            raise LocalDetailError("The public terrain block is invalid.")
        directory = brotli_index(source.get(offset + size, directory_length))
        columns, rows = max_x - min_x + 1, max_y - min_y + 1
        if len(directory) != columns * rows * 12:
            raise LocalDetailError("The public terrain tile directory is invalid.")
        for y in range(max(y0, by * 256 + min_y), min(y1, by * 256 + max_y) + 1):
            for x in range(max(x0, bx * 256 + min_x), min(x1, bx * 256 + max_x) + 1):
                local_offset, length = struct.unpack_from(">QI", directory, ((y - by * 256 - min_y) * columns + x - bx * 256 - min_x) * 12)
                if length:
                    if local_offset + length > size:
                        raise LocalDetailError("The public terrain tile points outside its block.")
                    tiles.append([z, x, y, offset + local_offset, length])
    dataset = DATASETS[role]
    attribution = {"topography": TOPO_MAP_ATTRIBUTION, "elevation": ELEVATION_MAP_ATTRIBUTION}.get(role, dataset.attribution)
    return make_plan(source, role, metadata, tiles, maximum, attribution,
                     dataset.source_header[1], dataset.source_layer, dataset.encoding)


def decode_directory(data):
    position = 0
    def varint():
        nonlocal position
        result = shift = 0
        while position < len(data) and shift < 70:
            value = data[position]
            position += 1
            result |= (value & 127) << shift
            if value < 128:
                return result
            shift += 7
        raise LocalDetailError("The street tile directory is invalid.")
    count = varint()
    if count > 1_000_000:
        raise LocalDetailError("The street tile directory is too large.")
    entries, identifier = [], 0
    for _ in range(count):
        identifier += varint()
        entries.append({"id": identifier})
    for entry in entries:
        entry["run"] = varint()
    for entry in entries:
        entry["length"] = varint()
    for number, entry in enumerate(entries):
        value = varint()
        if not value and not number:
            raise LocalDetailError("The street tile directory offset is invalid.")
        entry["offset"] = entries[number - 1]["offset"] + entries[number - 1]["length"] if value == 0 else value - 1
    return entries


def street_build_urls(cache):
    """Use NOMAD's official build catalog; dated public builds are rotated."""
    previous = cache / "street-build.json"
    cached_url = None
    try:
        saved = json.loads(previous.read_text())
        candidate = saved.get("url", "") if isinstance(saved, dict) else ""
        if isinstance(candidate, str) and candidate.startswith(STREET_BUILD_ORIGIN) and STREET_KEY.fullmatch(candidate.removeprefix(STREET_BUILD_ORIGIN)):
            cached_url = candidate
    except (OSError, ValueError):
        pass
    try:
        request = Request(STREET_BUILDS_URL, headers={"Accept-Encoding": "identity", "User-Agent": "NOMAD-raster-lab/1.0"})
        with build_opener(ProxyHandler({}), NoRedirect).open(request, timeout=20) as response:
            raw = response.read(1024**2 + 1)
        if len(raw) > 1024**2:
            raise LocalDetailError("The public Street build catalog is unexpectedly large.")
        builds = json.loads(raw)
        if not isinstance(builds, list):
            raise LocalDetailError("The public Street build catalog has an invalid format.")
        keys = {item.get("key") for item in builds if isinstance(item, dict) and isinstance(item.get("key"), str)
                and STREET_KEY.fullmatch(item["key"]) and type(item.get("size")) is int and item["size"] > 127}
        urls = [STREET_BUILD_ORIGIN + key for key in sorted(keys, reverse=True)[:3]]
        if cached_url and cached_url not in urls:
            urls.append(cached_url)
        if not urls:
            raise LocalDetailError("The public Street build catalog has no compatible dated builds.")
        return urls
    except (OSError, ValueError) as error:
        if cached_url:
            return [cached_url]
        raise LocalDetailError("The public Street build catalog is unavailable. Reconnect and calculate again.") from error


def read_street_source(source):
    header = source.get(0, 127, cached=False)
    if header[:8] != b"PMTiles\x03" or header[97] not in (1, 2) or header[98] not in (1, 2) or header[99] != 1 or header[101] < 15:
        raise LocalDetailError("The street source does not support native zoom 15.")
    root, root_length, meta, meta_length, leaves, leaves_length, data, data_length = struct.unpack_from("<8Q", header, 8)
    if any(length > 16 * 1024**2 for length in (root_length, meta_length)) or data + data_length > source.total:
        raise LocalDetailError("The public street archive header is invalid.")
    unpack = lambda raw: gzip.decompress(raw) if header[97] == 2 else raw
    metadata = json.loads(unpack(source.get(meta, meta_length)))
    return source, metadata, (root, root_length, leaves, leaves_length, data, data_length), unpack, header[98]


def street_source(cache):
    local = os.environ.get("LOCAL_DETAIL_STREET_SOURCE")
    if local:
        name = Path(local).name
        url = STREET_BUILD_ORIGIN + name if STREET_KEY.fullmatch(name) else "local:configured-protomaps-archive"
        return read_street_source(Source(url, cache, local))
    failures = []
    for url in street_build_urls(cache):
        try:
            prepared = read_street_source(Source(url, cache))
            write_state(cache / "street-build.json", {"url": url, "etag": prepared[0].etag, "checkedAt": timestamp()})
            return prepared
        except (OSError, ValueError, RuntimeError) as error:
            failures.append(f"{url}: {error}")
            print(f"Local-detail Street provider: {failures[-1]}", flush=True)
    raise LocalDetailError("No current public Street build was available. Reconnect and calculate again; installed maps remain usable.")


def plan_street(cell, prepared):
    source, metadata, offsets, unpack, compression = prepared
    root, root_length, leaves, leaves_length, data, data_length = offsets
    wanted = {}
    for z in range(16):
        x0, y0, x1, y1 = tile_window(cell, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                wanted[tile_id(z, x, y)] = [z, x, y]
    ids, tiles, visited = sorted(wanted), [], set()
    def directory(offset, length, depth=0):
        if depth > 4 or (offset, length) in visited or length > 16 * 1024**2:
            raise LocalDetailError("The public street tile directory is invalid.")
        visited.add((offset, length))
        entries = decode_directory(unpack(source.get(offset, length)))
        for number, entry in enumerate(entries):
            start = entry["id"]
            end = start + entry["run"] if entry["run"] else entries[number + 1]["id"] if number + 1 < len(entries) else (4**16 - 1) // 3
            left, right = bisect_left(ids, start), bisect_left(ids, end)
            if left == right:
                continue
            if entry["run"] == 0:
                if entry["offset"] + entry["length"] > leaves_length:
                    raise LocalDetailError("The public street leaf directory is invalid.")
                directory(leaves + entry["offset"], entry["length"], depth + 1)
            else:
                if entry["offset"] + entry["length"] > data_length:
                    raise LocalDetailError("The public street tile points outside its archive.")
                for identifier in ids[left:right]:
                    tiles.append([*wanted[identifier], data + entry["offset"], entry["length"]])
    directory(root, root_length)
    return make_plan(source, "street", metadata, tiles, 15, STREET_ATTRIBUTION, compression)


def make_plan(source, role, metadata, tiles, maximum, attribution, compression, source_layer="", encoding=""):
    if not tiles or not any(tile[0] == maximum for tile in tiles):
        raise LocalDetailError(f"This square has no maximum-detail {role} data in the public source.")
    groups = groups_for(tiles)
    payload = sum(length for _, length in groups)
    return {**source.identity(), "role": role, "tiles": tiles, "groups": groups, "metadata": metadata,
            "maxzoom": maximum, "minzoom": min(tile[0] for tile in tiles), "attribution": attribution,
            "compression": compression, "sourceLayer": source_layer, "encoding": encoding,
            "downloadBytes": 0 if source.local else payload, "payloadBytes": payload}


class LocalDetails:
    def __init__(self, maps, state, pmtiles, free_bytes=None):
        self.maps, self.state, self.pmtiles = Path(maps).resolve(), Path(state).resolve(), Path(pmtiles)
        if self.maps.is_relative_to(self.state) or self.state.is_relative_to(self.maps):
            raise LocalDetailError("Configure separate sibling local-detail map and worker directories.")
        for directory in (self.maps, self.state, self.state / "quotes", self.state / "provider-index", self.state / "ranges"):
            directory.mkdir(parents=True, exist_ok=True)
        self.free_bytes = free_bytes or (lambda: shutil.disk_usage(self.state).free)
        self.lock = RLock()
        self.calculation_lock = Lock()
        self.job_path = self.state / "job.json"
        self.queue_path = self.state / "queue.json"
        self.discard_path = self.state / "discard.json"
        self.manifest_path = self.maps / MANIFEST
        self.manifest = json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else {"schemaVersion": 1, "gridZoom": 8, "cells": []}
        if self.manifest.get("schemaVersion") != 1 or not isinstance(self.manifest.get("cells"), list):
            raise LocalDetailError("The local detail inventory is invalid.")
        self.job = json.loads(self.job_path.read_text()) if self.job_path.exists() else None
        self.queue = json.loads(self.queue_path.read_text()) if self.queue_path.exists() else None
        if self.job and self.job.get("status") not in TERMINAL:
            self.job.update(status="failed", stage="Interrupted", message="Preparation stopped when NOMAD restarted. Retry to continue using saved ranges.", updatedAt=timestamp(), speedBytesPerSecond=0)
            write_state(self.job_path, self.job)
        if self.queue and self.queue.get("status") not in TERMINAL:
            self.queue.update(status="failed", message="The queue stopped when NOMAD restarted. Retry to verify and continue the remaining squares.", updatedAt=timestamp())
            write_state(self.queue_path, self.queue)
        self.thread = None
        self.provider_cache = None
        self.last_write = 0
        self.last_progress = time.monotonic()
        self.speed_start = time.monotonic()
        self.speed_bytes = 0
        self._temporary_cache = None
        self._recovery_cache = None
        self._maintenance_lock = Lock()
        self._maintenance_next = 0
        self._discard_maintenance_next = 0
        pending = self.manifest.get("pendingDeletes", [])
        if pending:
            try:
                # Replay only recorded regional cleanup. No provider metadata,
                # quote, downloader thread or internet access is needed.
                for start in range(0, len(pending), MAX_CELLS):
                    result = self.delete([{"x": cell["x"], "y": cell["y"]} for cell in pending[start:start + MAX_CELLS]])
                    if result["cleanupPending"]:
                        print("Local-detail deletion cleanup remains pending; repeat Delete to retry.", flush=True)
            except (KeyError, TypeError, OSError, ValueError) as error:
                print(f"Local-detail deletion recovery preserved unsafe or unavailable files: {error}", flush=True)

    def maintain(self):
        """Best-effort service maintenance, never tied to a browser session."""
        if not self._maintenance_lock.acquire(blocking=False):
            return False
        try:
            now = time.monotonic()
            try:
                if now < self._maintenance_next:
                    # A confirmed discard that failed must not wait for tomorrow's
                    # metadata sweep before its cleanup can finish.
                    if now < self._discard_maintenance_next or not self._pending_discard():
                        return False
                result = self.cleanup("expired-metadata")
            except LocalDetailError as error:
                # Busy work is retried once idle; unsafe paths are preserved.
                self._maintenance_next = now + (MAINTENANCE_POLL if error.status == 409 else MAINTENANCE_RETRY)
                self._discard_maintenance_next = self._maintenance_next
                if error.status != 409:
                    print(f"Local-detail automatic maintenance deferred: {error}", flush=True)
                return False
            except Exception as error:
                self._maintenance_next = now + MAINTENANCE_RETRY
                self._discard_maintenance_next = self._maintenance_next
                print(f"Local-detail automatic maintenance deferred: {error}", flush=True)
                return False
            self._maintenance_next = now + MAINTENANCE_INTERVAL
            self._discard_maintenance_next = 0
            if result["freedBytes"]:
                print(f"Local-detail automatic maintenance released {result['freedBytes']} temporary bytes.", flush=True)
            return True
        finally:
            self._maintenance_lock.release()

    def maintenance_loop(self, stop):
        if stop.is_set():
            return
        # Startup pruning runs in this background thread so a large cache does
        # not delay the local HTTP service becoming available.
        self.maintain()
        while not stop.wait(MAINTENANCE_POLL):
            self.maintain()

    def _discard_record(self):
        if not self.discard_path.exists():
            return None
        if self.discard_path.is_symlink() or not self.discard_path.is_file():
            raise LocalDetailError("An unsafe download-discard record was preserved.", 422)
        value = json.loads(self.discard_path.read_text())
        if (not isinstance(value, dict) or value.get("schemaVersion") != 1
                or not re.fullmatch(r"[a-f0-9]{64}", str(value.get("id", "")))
                or type(value.get("pending")) is not bool
                or not isinstance(value.get("taskIds"), list) or len(value["taskIds"]) > 2
                or any(not isinstance(item, str) or not 1 <= len(item) <= 128 for item in value["taskIds"])
                or not isinstance(value.get("quoteIds"), list) or len(value["quoteIds"]) > MAX_BATCHES + 1
                or any(not isinstance(item, str) or not re.fullmatch(r"[a-f0-9]{32}", item) for item in value["quoteIds"])):
            raise LocalDetailError("An invalid download-discard record was preserved.", 422)
        return value

    def _pending_discard(self):
        value = self._discard_record()
        return value if value and value["pending"] else None

    def _require_discard_finished(self):
        if self._pending_discard():
            raise LocalDetailError("Temporary cleanup from a discarded download is pending. Try again shortly.", 409)

    def _finish_discard(self, record):
        current_ids = {task["id"] for task in (self.queue, self.job) if task}
        if not current_ids.issubset(set(record["taskIds"])):
            raise LocalDetailError("The current download changed. Its files were preserved.", 409)
        # Persist the loss of resume capability before deleting a single range.
        # A pending journal completes cleanup after a crash without reviving it.
        for attribute, path in (("job", self.job_path), ("queue", self.queue_path)):
            if getattr(self, attribute) is not None:
                write_state(path, None)
                setattr(self, attribute, None)
        self._recovery_cache = None
        saved, _expired = self._temporary_files()
        files = list(saved)
        for identifier in record["quoteIds"]:
            path = self.state / "quotes" / (identifier + ".json")
            if path.is_symlink():
                raise LocalDetailError("An unsafe preparation estimate was preserved.", 422)
            if path.is_file():
                files.append(path)
        freed = self._unlink_temporary(dict.fromkeys(files))
        write_state(self.discard_path, {**record, "pending": False})
        return freed

    def _unlink_temporary(self, files):
        freed, descriptors = 0, {}
        try:
            for path in files:
                if path.parent not in descriptors:
                    if path.parent.resolve() != path.parent or path.parent.is_symlink():
                        raise LocalDetailError("Temporary storage changed while cleaning. Files were preserved.", 422)
                    descriptors[path.parent] = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                descriptor = descriptors[path.parent]
                try:
                    info = os.stat(path.name, dir_fd=descriptor, follow_symlinks=False)
                except FileNotFoundError:
                    continue
                if not stat.S_ISREG(info.st_mode):
                    raise LocalDetailError("A temporary file changed to an unsafe path. It was preserved.", 422)
                os.unlink(path.name, dir_fd=descriptor)
                freed += info.st_size
            for descriptor in descriptors.values():
                os.fsync(descriptor)
        finally:
            for descriptor in descriptors.values():
                os.close(descriptor)
        return freed

    def _delete_files(self, cell):
        """Derive owned names; never trust a caller or a manifest path."""
        selected = selection([cell])[0]
        archives = cell.get("archives")
        if (cell.get("id") != selected["id"] or not isinstance(archives, list) or len(archives) != len(LEVELS)
                or any(not isinstance(archive, dict) for archive in archives)
                or {archive.get("role") for archive in archives} != set(LEVELS)):
            raise LocalDetailError("This square has an invalid ownership record. Its files were preserved.", 422)
        files = []
        for archive in archives:
            expected = f"partial-z8-{selected['x']}-{selected['y']}-{archive['role']}.pmtiles"
            if (archive.get("filename") != expected or not re.fullmatch(r"[a-f0-9]{64}", str(archive.get("sha256", "")))
                    or type(archive.get("installedBytes")) is not int or archive["installedBytes"] < 1):
                raise LocalDetailError("This square has an unsafe ownership record. Its files were preserved.", 422)
            files.append(expected)
        return files

    def _deletion_directory(self):
        # Keep unlink operations anchored to the checked directory, even if its
        # name is subsequently moved. No symlink or recursive deletion is used.
        for directory in (self.maps, self.state):
            if directory.is_symlink() or directory.resolve() != directory or not directory.is_dir():
                raise LocalDetailError("Regional storage is not a regular managed directory. Files were preserved.", 422)
        if self.manifest_path.is_symlink():
            raise LocalDetailError("The regional inventory is a symlink. Files were preserved.", 422)
        return os.open(self.maps, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)

    def _inspect_delete_files(self, records, directory):
        for cell in records:
            for filename in self._delete_files(cell):
                try:
                    info = os.stat(filename, dir_fd=directory, follow_symlinks=False)
                except FileNotFoundError:
                    continue
                if not stat.S_ISREG(info.st_mode):
                    raise LocalDetailError("A regional archive is not a regular owned file. Files were preserved.", 422)

    def _finish_deletions(self, records, directory):
        pending, freed = [], 0
        for cell in records:
            failed = False
            for filename in self._delete_files(cell):
                try:
                    info = os.stat(filename, dir_fd=directory, follow_symlinks=False)
                    if not stat.S_ISREG(info.st_mode):
                        raise OSError("Regional archive changed to a non-regular file")
                    os.unlink(filename, dir_fd=directory)
                    freed += info.st_size
                except FileNotFoundError:
                    pass
                except OSError as error:
                    failed = True
                    print(f"Local-detail deletion cleanup {filename}: {error}", flush=True)
            if failed:
                pending.append(cell)
        # Directory fsync makes completed unlinks durable before their journal
        # entries can be removed. A failed sync keeps all tombstones retryable.
        try:
            os.fsync(directory)
        except OSError:
            pending = records
        return pending, freed

    def delete(self, cells):
        try:
            selected = selection(cells)
        except LocalDetailError as error:
            raise LocalDetailError(str(error), 422) from error
        ids = {cell["id"] for cell in selected}
        with self.lock:
            if self._running():
                raise LocalDetailError("Wait for the current download to stop completely before deleting squares.", 409)
            installed = [cell for cell in self.manifest["cells"] if cell.get("id") in ids]
            if len({cell["id"] for cell in installed}) != len(installed):
                raise LocalDetailError("The regional inventory contains duplicate ownership records. Files were preserved.", 422)
            tombstones = self.manifest.get("pendingDeletes", [])
            if not isinstance(tombstones, list) or any(not isinstance(cell, dict) for cell in tombstones):
                raise LocalDetailError("The regional cleanup inventory is invalid. Files were preserved.", 422)
            previous = [cell for cell in tombstones if cell.get("id") in ids]
            installed_ids = {cell["id"] for cell in installed}
            records = installed + [cell for cell in previous if cell["id"] not in installed_ids]
            already_absent = [{"x": cell["x"], "y": cell["y"]} for cell in selected if cell["id"] not in installed_ids]
            if not records:
                return {"removed": [], "alreadyAbsent": already_absent, "freedBytes": 0,
                        "cleanupPending": [], "generation": self._generation(), "job": self.snapshot()["job"]}
            directory = self._deletion_directory()
            try:
                self._inspect_delete_files(records, directory)
                old = self.manifest
                retained = [cell for cell in old["cells"] if cell.get("id") not in ids]
                pending = [cell for cell in tombstones if cell.get("id") not in ids] + records
                committed = {**old, "cells": retained, "pendingDeletes": pending,
                             "deletionRevision": uuid4().hex, "updatedAt": timestamp()}
                # This is the commit point: a crash leaves explicit cleanup
                # ownership, and the removed square is never advertised again.
                write_state(self.manifest_path, committed)
                self.manifest = committed
                unfinished, freed = self._finish_deletions(records, directory)
                completed = {**committed, "pendingDeletes": [cell for cell in pending if cell.get("id") not in ids] + unfinished}
                try:
                    write_state(self.manifest_path, completed)
                    self.manifest = completed
                except OSError as error:
                    print(f"Local-detail deletion journal cleanup: {error}", flush=True)
                    unfinished = records
                # A terminal task containing the deleted square must not offer
                # Retry that would resurrect it. Old quotes are also invalidated.
                if self.job and any(cell.get("id") in ids or f"8/{cell.get('x')}/{cell.get('y')}" in ids for cell in self.job.get("cells", [])):
                    self.job = None
                    try:
                        self.job_path.unlink(missing_ok=True)
                    except OSError as error:
                        print(f"Local-detail old job cleanup: {error}", flush=True)
                if self.queue and any(f"8/{cell['x']}/{cell['y']}" in ids for batch in self.queue["batches"] for cell in batch["cells"]):
                    self.queue = None
                    try:
                        self.queue_path.unlink(missing_ok=True)
                    except OSError as error:
                        print(f"Local-detail old queue cleanup: {error}", flush=True)
                coordinate = lambda cell: {"x": cell["x"], "y": cell["y"]}
                return {"removed": list(map(coordinate, installed)), "alreadyAbsent": already_absent,
                        "freedBytes": freed, "cleanupPending": list(map(coordinate, unfinished)),
                        "generation": self._generation(), "job": self.snapshot()["job"]}
            finally:
                os.close(directory)

    def _generation(self, cells=None):
        revisions = sorted(archive["filename"] + ":" + archive["sha256"]
                           for cell in (self._ready() if cells is None else cells) for archive in cell["archives"])
        return sha256("|".join(revisions).encode()).hexdigest()

    def _ready(self):
        result = []
        for cell in self.manifest["cells"]:
            archives = cell.get("archives", [])
            if (cell.get("status") == "ready" and len(archives) == 4
                    and {archive.get("role") for archive in archives} == set(LEVELS)
                    and all(self._valid_archive(archive) for archive in archives)):
                result.append(cell)
        return result

    def _valid_archive(self, archive):
        filename = archive.get("filename", "")
        if not filename.startswith("partial-z8-") or Path(filename).name != filename or not filename.endswith(".pmtiles"):
            return False
        path = self.maps / filename
        return path.is_file() and not path.is_symlink() and path.stat().st_size == archive.get("installedBytes")

    def snapshot(self):
        with self.lock:
            job = dict(self.job) if self.job else None
            if job and time.monotonic() - self.last_progress > 3:
                job["speedBytesPerSecond"] = 0
                if job["status"] == "downloading" and time.monotonic() - self.last_progress > 10:
                    job["stage"] = "Waiting for the public source"
            if job:
                job["recovery"] = self._recovery()
            cells = self._ready()
            pending = [{"x": cell["x"], "y": cell["y"]} for cell in self.manifest.get("pendingDeletes", [])
                       if isinstance(cell, dict) and type(cell.get("x")) is int and type(cell.get("y")) is int
                       and 0 <= cell["x"] < 256 and 0 <= cell["y"] < 256]
            return {"schemaVersion": 1, "gridZoom": 8, "levels": LEVELS, "cells": cells, "job": job,
                    "freeBytes": self.free_bytes(), "generation": self._generation(cells), "cleanupPending": pending,
                    "queue": self._queue_snapshot(), "temporaryStorage": self.temporary_storage()}

    def _queue_snapshot(self):
        if not self.queue:
            return None
        ready = {cell["id"] for cell in self._ready()}
        return {**self.queue, "batches": [{**batch, "cells": [dict(cell) for cell in batch["cells"]]} for batch in self.queue["batches"]],
                "completedCells": sum(f"8/{cell['x']}/{cell['y']}" in ready for batch in self.queue["batches"] for cell in batch["cells"]),
                "recovery": self._recovery()}

    def _recovery(self):
        try:
            if self._pending_discard():
                return {"canRetry": False, "canPrepareOffline": False, "needsRecalculation": False}
        except (OSError, ValueError):
            return {"canRetry": False, "canPrepareOffline": False, "needsRecalculation": False}
        current = self.queue or self.job
        if not current or current["status"] not in {"failed", "cancelled"}:
            return {"canRetry": False, "canPrepareOffline": False, "needsRecalculation": False}
        key = (current["id"], current.get("updatedAt"), current.get("recoveryReason"), self.manifest.get("deletionRevision"))
        if self._recovery_cache and self._recovery_cache[0] == key and time.monotonic() - self._recovery_cache[1] < 10:
            return dict(self._recovery_cache[2])
        batches = self.queue["batches"] if self.queue else [{"quoteId": self.job.get("quoteId"), "cells": self.job["cells"]}]
        ready = {cell["id"] for cell in self._ready()}
        complete, needs, remaining = True, False, 0
        reason = current.get("recoveryReason")
        inventory_changed = reason == "inventory-changed"
        needs = reason in {"source-changed", "cache-invalid", "quote-expired", "preparation-discarded", "inventory-changed"}
        for batch in batches:
            selected = {f"8/{cell['x']}/{cell['y']}" for cell in batch["cells"]} - ready
            if not selected:
                continue
            remaining += len(selected)
            try:
                quote = self._quote(batch["quoteId"], allow_expired=True)
                inventory_changed = inventory_changed or quote.get("inventoryRevision", "") != self.manifest.get("deletionRevision", "")
                needs = needs or time.time() - quote["createdAt"] > QUOTE_TTL or inventory_changed
                plans = [cell for cell in quote["cells"] if cell["id"] in selected]
                complete = complete and len(plans) == len(selected) and all(self._plan_cached(plan) for cell in plans for plan in cell["plans"])
            except (OSError, ValueError, KeyError, TypeError):
                needs, complete = True, False
        offline = bool(remaining and complete and reason != "cache-invalid" and not inventory_changed)
        recalculate = bool(remaining and needs and not offline)
        message = "All remaining source ranges are saved. Retry verifies and prepares them offline." if offline else (
            "Recalculate the remaining squares to use a currently available source revision. Installed squares are preserved." if recalculate
            else "Retry continues the remaining squares and reuses verified saved ranges.")
        result = {"canRetry": bool(remaining and not recalculate), "canPrepareOffline": offline,
                  "needsRecalculation": recalculate, "reason": message}
        self._recovery_cache = key, time.monotonic(), result
        return dict(result)

    def _sources(self):
        if not self.provider_cache or time.monotonic() - self.provider_cache[0] > 300:
            cache = self.state / "provider-index"
            prepared = {role: versa_source(dataset, cache) for role, dataset in DATASETS.items()}
            prepared["street"] = street_source(cache)
            self.provider_cache = time.monotonic(), prepared
        return self.provider_cache[1]

    def _task(self, identifier):
        self._require_discard_finished()
        current = self.queue or self.job
        if not current or identifier != current.get("id"):
            raise LocalDetailError("This regional preparation is no longer current. Refresh the panel.", 409)
        if self._running():
            raise LocalDetailError("Wait for the current preparation to stop completely.", 409)
        return current

    def recalculate(self, identifier):
        with self.lock:
            current = self._task(identifier)
            ready = {cell["id"] for cell in self._ready()}
            batches = current["batches"] if self.queue else [{"cells": current.get("cells", [])}]
            pending = {(cell["x"], cell["y"]) for batch in batches for cell in batch["cells"]
                       if f"8/{cell['x']}/{cell['y']}" not in ready}
            # The next Calculate performs fresh source discovery. Installed
            # archives and the stopped task remain intact until confirmation.
            self.provider_cache = None
            return {"cells": [{"x": x, "y": y} for x, y in sorted(pending)],
                    "job": self.snapshot()["job"], "queue": self._queue_snapshot()}

    def _protected_quotes(self):
        protected = set()
        if self.job and self.job.get("status") != "ready" and self.job.get("quoteId"):
            protected.add(self.job["quoteId"])
        if self.queue and self.queue.get("status") != "ready":
            protected.update(batch["quoteId"] for batch in self.queue["batches"])
        return protected

    def _temporary_files(self):
        """Enumerate only names this module writes, without following links."""
        if self.state.is_symlink() or self.state.resolve() != self.state:
            raise LocalDetailError("The regional preparation directory is not a regular managed path.", 422)
        now, protected = time.time(), self._protected_quotes()
        saved, expired = [], []
        patterns = {
            "ranges": re.compile(r"[a-f0-9]{64}\.bin(?:\.sha256\.json|\.partial-[a-f0-9]{32})?\Z"),
            "provider-index": re.compile(r"(?:[a-f0-9]{64}\.(?:bin|partial)|street-build\.json)\Z"),
            "quotes": re.compile(r"[a-f0-9]{32}\.json\Z"),
        }
        for name, pattern in patterns.items():
            directory = self.state / name
            if directory.is_symlink() or directory.resolve() != directory or not directory.is_dir():
                raise LocalDetailError("Regional temporary storage contains an unsafe managed directory.", 422)
            for path in directory.iterdir():
                if not pattern.fullmatch(path.name):
                    continue
                if path.is_symlink() or not path.is_file():
                    raise LocalDetailError("A managed temporary file is not a regular file. It was preserved.", 422)
                try:
                    info = path.stat()
                except FileNotFoundError:
                    continue # A completed range can disappear during a live inventory read.
                if name == "ranges":
                    saved.append(path)
                elif name == "quotes":
                    if path.stem in protected:
                        saved.append(path)
                        continue
                    try:
                        value = json.loads(path.read_text())
                        created = value.get("createdAt") if isinstance(value, dict) else None
                        old = now - created > QUOTE_TTL if isinstance(created, (int, float)) and math.isfinite(created) else now - info.st_mtime > QUOTE_TTL
                    except (OSError, ValueError, TypeError):
                        old = now - info.st_mtime > QUOTE_TTL
                    if old:
                        expired.append(path)
                elif now - info.st_mtime > INDEX_TTL:
                    expired.append(path)
        stage_pattern = re.compile(r"stage-[a-f0-9]{32}-\d+\Z")
        stage_file = re.compile(r"(?:(?:satellite|topography|elevation|street)\.mbtiles(?:-(?:journal|wal|shm))?|partial-z8-\d+-\d+-(?:satellite|topography|elevation|street)\.pmtiles)\Z")
        for directory in self.state.iterdir():
            if not stage_pattern.fullmatch(directory.name):
                continue
            if directory.is_symlink() or not directory.is_dir():
                raise LocalDetailError("A managed preparation stage is not a regular directory. It was preserved.", 422)
            for path in directory.iterdir():
                if not stage_file.fullmatch(path.name):
                    continue
                if path.is_symlink() or not path.is_file():
                    raise LocalDetailError("A managed stage file is not regular. It was preserved.", 422)
                saved.append(path)
        return saved, expired

    def temporary_storage(self):
        protected = self._running() or self.calculation_lock.locked()
        saved, expired = self._temporary_files()
        def size(path):
            try:
                return path.stat().st_size
            except FileNotFoundError:
                return 0
        saved_bytes, expired_bytes = sum(size(path) for path in saved), sum(size(path) for path in expired)
        current = self.queue or self.job
        try:
            pending = self._pending_discard()
        except (OSError, ValueError):
            # Keep serving installed maps even if the maintenance record is damaged.
            pending = None
            protected = True
        stopped = current and current.get("status") in {"failed", "cancelled"}
        return {"savedPreparationBytes": saved_bytes, "expiredMetadataBytes": expired_bytes,
                "totalBytes": saved_bytes + expired_bytes, "activeProtected": protected,
                "canDiscard": bool((saved or stopped or pending) and not protected), "canPrune": bool(expired and not protected),
                "discardId": "" if protected else pending["id"] if pending else self._discard_id(saved, current)}

    def _discard_id(self, files, current):
        revision = [(str(path.relative_to(self.state)), path.stat().st_size, path.stat().st_mtime_ns, path.stat().st_ino)
                    for path in sorted(files)]
        identity = [current.get("id") if current else "orphaned", current.get("updatedAt") if current else None, revision]
        return sha256(json.dumps(identity, separators=(",", ":")).encode()).hexdigest()

    def cleanup(self, scope, identifier=None):
        if scope not in {"saved-preparation", "expired-metadata"}:
            raise LocalDetailError("Choose a documented regional cleanup scope.", 422)
        if not self.calculation_lock.acquire(blocking=False):
            raise LocalDetailError("Wait for source estimation to finish before cleaning temporary data.", 409)
        try:
            with self.lock:
                if self._running():
                    raise LocalDetailError("Active downloads and preparation are protected. Stop them before cleanup.", 409)
                current = self.queue or self.job
                saved, expired = self._temporary_files()
                record = self._discard_record()
                freed = 0
                if scope == "saved-preparation":
                    if record and record["id"] == identifier:
                        if record["pending"]:
                            freed = self._finish_discard(record)
                        elif current:
                            raise LocalDetailError("The current download changed. Review it before discarding.", 409)
                        # A repeated acknowledgement of the same completed discard is harmless.
                    else:
                        if record and record["pending"]:
                            raise LocalDetailError("A previous download discard is still being cleaned up.", 409)
                        if identifier != self._discard_id(saved, current):
                            raise LocalDetailError("The saved preparation changed. Review its current size before discarding it.", 409)
                        quote_ids = sorted(self._protected_quotes())
                        if any(not isinstance(item, str) or not re.fullmatch(r"[a-f0-9]{32}", item) for item in quote_ids):
                            raise LocalDetailError("An invalid preparation estimate was preserved.", 422)
                        record = {"schemaVersion": 1, "id": identifier, "pending": True,
                                  "taskIds": [task["id"] for task in (self.queue, self.job) if task], "quoteIds": quote_ids}
                        write_state(self.discard_path, record)
                        self._discard_maintenance_next = 0
                        freed = self._finish_discard(record)
                else:
                    # Only a previously confirmed discard can retire its saved ranges.
                    if record and record["pending"]:
                        freed += self._finish_discard(record)
                        _saved, expired = self._temporary_files()
                    freed += self._unlink_temporary(expired)
                    self.provider_cache = None
                self._recovery_cache = None
                self._temporary_cache = None
                return {"freedBytes": freed, "temporaryStorage": self.temporary_storage(),
                        "job": self.snapshot()["job"], "queue": self._queue_snapshot()}
        finally:
            self.calculation_lock.release()

    def calculate(self, cells):
        cells = selection(cells)
        with self.calculation_lock:
            with self.lock:
                self._require_discard_finished()
                if self._running():
                    raise LocalDetailError("Wait for the current download, or cancel it before calculating a new batch.")
                ready = {cell["id"] for cell in self._ready()}
                if any(cell["id"] in ready for cell in cells):
                    raise LocalDetailError("Downloaded squares cannot be selected again.")
                if any(cell["id"] in {old.get("id") for old in self.manifest.get("pendingDeletes", [])} for cell in cells):
                    raise LocalDetailError("Finish deleting this square before downloading it again. Retry its deletion.", 409)
                revision = self.manifest.get("deletionRevision", "")
            prepared = self._sources()
            planned, items = [], []
            for cell in cells:
                plans = [plan_versa(cell, role, prepared[role]) for role in DATASETS]
                plans.append(plan_street(cell, prepared["street"]))
                transfer = sum(plan["downloadBytes"] for plan in plans)
                payload = sum(plan["payloadBytes"] for plan in plans)
                installed = math.ceil(payload * 1.3) + 1024**2
                item = {**cell, "downloadBytes": transfer, "estimatedInstalledBytes": installed}
                items.append(item)
                planned.append({**item, "plans": plans})
            quote_id = uuid4().hex
            quote = {"id": quote_id, "createdAt": time.time(), "cells": planned, "inventoryRevision": revision}
            write_state(self.state / "quotes" / (quote_id + ".json"), quote)
            total = sum(item["downloadBytes"] for item in items)
            installed = sum(item["estimatedInstalledBytes"] for item in items)
            return {"items": items, "downloadBytes": total, "estimatedInstalledBytes": installed,
                    "freeBytes": self.free_bytes(), "requiredFreeBytes": total + installed * 2 + 64 * 1024**2,
                    "quoteId": quote_id, "estimate": "Exact source-range payload; installed size is an estimate."}

    def _quote(self, quote_id, allow_expired=False):
        if not isinstance(quote_id, str) or len(quote_id) != 32 or any(c not in "0123456789abcdef" for c in quote_id):
            raise LocalDetailError("Calculate this selection before downloading.")
        try:
            path = self.state / "quotes" / (quote_id + ".json")
            if path.parent.is_symlink() or path.parent.resolve() != path.parent or path.is_symlink() or not path.is_file():
                raise OSError("The estimate is not a regular managed file")
            quote = json.loads(path.read_text())
        except (OSError, ValueError) as error:
            raise LocalDetailError("The estimate is unavailable. Calculate the selection again.") from error
        if (not isinstance(quote, dict) or quote.get("id") != quote_id
                or not isinstance(quote.get("createdAt"), (int, float)) or not math.isfinite(quote["createdAt"])
                or not isinstance(quote.get("cells"), list) or not 1 <= len(quote["cells"]) <= MAX_CELLS):
            raise LocalDetailError("The saved estimate is invalid. Recalculate the remaining squares.", 409, "quote-expired")
        if not allow_expired and time.time() - quote["createdAt"] > QUOTE_TTL:
            raise LocalDetailError("The estimate has expired. Recalculate the remaining squares.", 409, "quote-expired")
        return quote

    def _plans(self, cells, quote_id, remaining=False):
        selected = selection(cells)
        quote = self._quote(quote_id, allow_expired=True)
        if quote.get("inventoryRevision", "") != self.manifest.get("deletionRevision", ""):
            raise LocalDetailError("Regional maps changed after this estimate. Recalculate the remaining squares.", 409, "inventory-changed")
        if any(cell["id"] in {old.get("id") for old in self.manifest.get("pendingDeletes", [])} for cell in selected):
            raise LocalDetailError("Finish deleting this square before downloading it again. Retry its deletion.", 409)
        quoted = {cell["id"]: cell for cell in quote["cells"]}
        if any(cell["id"] not in quoted for cell in selected):
            raise LocalDetailError("The selection changed. Calculate it again.", 422)
        ready = {cell["id"] for cell in self._ready()}
        if not remaining and any(cell["id"] in ready for cell in selected):
            raise LocalDetailError("A selected square is already downloaded. Refresh the map.", 409)
        plans = [quoted[cell["id"]] for cell in selected if cell["id"] not in ready]
        if not plans:
            return []
        cached = all(self._plan_cached(plan) for cell in plans for plan in cell["plans"])
        changed_source = self.job and self.job.get("quoteId") == quote_id and self.job.get("recoveryReason") == "source-changed"
        if (time.time() - quote["createdAt"] > QUOTE_TTL or changed_source) and not cached:
            raise LocalDetailError("The source estimate expired or its revision was retired. Recalculate the remaining squares; installed squares are preserved.",
                                   409, "source-changed" if changed_source else "quote-expired")
        # Pinned URL+ETag identities remain separate. Fully cached preparations
        # never contact a provider, including after the quote TTL expires.
        return [{**cell, "plans": [{**plan, "offlineOnly": cached} for plan in cell["plans"]]} for cell in plans]

    def _begin(self, plans, quote_id, request_id=None, queue_id=None, batch_index=None):
        total = sum(cell["downloadBytes"] for cell in plans)
        installed = sum(cell["estimatedInstalledBytes"] for cell in plans)
        remaining = sum(length for cell in plans for plan in cell["plans"] if not plan.get("localPath")
                        for start, length in plan["groups"] if not self._cached_group(plan, start, length))
        required = remaining + installed * 2 + 64 * 1024**2
        if self.free_bytes() < required:
            raise LocalDetailError("There is not enough free disk space to prepare the remaining squares.", 507)
        selected = [{key: cell[key] for key in ("id", "x", "y", "label", "bounds")} for cell in plans]
        self.job = {"id": uuid4().hex, "quoteId": quote_id, "requestId": request_id, "cells": selected,
                    "status": "queued", "stage": "Queued", "createdAt": timestamp(), "updatedAt": timestamp(),
                    "bytesDownloaded": 0, "bytesTransferred": 0, "totalBytes": total, "speedBytesPerSecond": 0,
                    "progress": 0, "completedCells": 0, "totalCells": len(plans), "cancelRequested": False,
                    "queueId": queue_id, "batchIndex": batch_index,
                    "message": "Preparing verified saved ranges offline." if all(plan.get("offlineOnly") for cell in plans for plan in cell["plans"]) else "The remaining source ranges will be downloaded."}
        self._save()

    def submit(self, cells, quote_id, request_id=None):
        if request_id is not None and (not isinstance(request_id, str) or not 1 <= len(request_id) <= 128):
            raise LocalDetailError("Use a request identifier of at most 128 characters.")
        with self.lock:
            self._require_discard_finished()
            if self.job and request_id and self.job.get("requestId") == request_id:
                return {"job": self.snapshot()["job"]}
            if self._running():
                raise LocalDetailError("A local-detail download is already in progress.", 409)
            plans = self._plans(cells, quote_id)
            self._begin(plans, quote_id, request_id)
            if self.queue:
                self.queue = None
                self.queue_path.unlink(missing_ok=True)
            self.thread = Thread(target=self._run, args=(plans,), daemon=True)
            self.thread.start()
            return {"job": dict(self.job)}

    def _running(self):
        return bool((self.job and self.job["status"] not in TERMINAL)
                    or (self.queue and self.queue["status"] not in TERMINAL)
                    or (self.thread and self.thread.is_alive()))

    def _save_queue(self):
        self.queue["updatedAt"] = timestamp()
        write_state(self.queue_path, self.queue)
        self._recovery_cache = None

    def enqueue(self, batches, request_id=None):
        if not isinstance(batches, list) or not 1 <= len(batches) <= MAX_BATCHES:
            raise LocalDetailError("Send the calculated batches for the fixed worldwide grid.", 422)
        if request_id is not None and (not isinstance(request_id, str) or not 1 <= len(request_id) <= 128):
            raise LocalDetailError("Use a request identifier of at most 128 characters.", 422)
        with self.lock:
            self._require_discard_finished()
            if self.queue and request_id and self.queue.get("requestId") == request_id:
                return {"queue": self._queue_snapshot(), "job": self.snapshot()["job"]}
            if self._running():
                raise LocalDetailError("Stop the current queue before starting a new selection.", 409)
            admitted, used, installed_total, workspace = [], set(), 0, 0
            for batch in batches:
                if not isinstance(batch, dict):
                    raise LocalDetailError("Use a calculated quote for each batch.", 422)
                quote_id = batch.get("quoteId")
                quote = self._quote(quote_id, allow_expired=True)
                excluded = batch.get("excludedCells", [])
                quoted = {cell["id"] for cell in quote["cells"]}
                if (not isinstance(excluded, list) or len(excluded) > MAX_CELLS
                        or any(not isinstance(identifier, str) or identifier not in quoted for identifier in excluded)):
                    raise LocalDetailError("Excluded squares must belong to their calculated quote.", 422)
                selected = [cell for cell in quote["cells"] if cell["id"] not in excluded]
                if not selected:
                    continue
                if any(cell["id"] in used for cell in selected):
                    raise LocalDetailError("A square occurs in more than one batch. Recalculate the selection.", 422)
                plans = self._plans(selected, quote_id)
                used.update(cell["id"] for cell in plans)
                installed = sum(cell["estimatedInstalledBytes"] for cell in plans)
                installed_total += installed
                workspace = max(workspace, sum(cell["downloadBytes"] for cell in plans) + installed * 2)
                admitted.append({"quoteId": quote_id, "cells": [{"x": cell["x"], "y": cell["y"]} for cell in plans], "status": "queued"})
            if not admitted:
                raise LocalDetailError("No squares remain in this selection.", 422)
            if self.free_bytes() < installed_total + workspace + 64 * 1024**2:
                raise LocalDetailError("There is not enough free disk space for the queued squares and preparation workspace.", 507)
            queued = {"id": uuid4().hex, "requestId": request_id, "status": "queued", "createdAt": timestamp(),
                      "updatedAt": timestamp(), "batchIndex": 0, "totalBatches": len(admitted),
                      "completedCells": 0, "totalCells": len(used), "batches": admitted, "cancelRequested": False}
            # All estimates are validated before this sole admission commit.
            write_state(self.queue_path, queued)
            self.queue = queued
            self._recovery_cache = None
            self.thread = Thread(target=self._run_queue, daemon=True)
            self.thread.start()
            return {"queue": self._queue_snapshot(), "job": dict(self.job) if self.job else None}

    def _run_queue(self):
        for index, batch in enumerate(self.queue["batches"]):
            with self.lock:
                if self.queue.get("cancelRequested"):
                    self.queue.update(status="cancelled", message="Queue cancelled. Installed squares are preserved; Retry continues only the remainder.")
                    self._save_queue()
                    return
                try:
                    plans = self._plans(batch["cells"], batch["quoteId"], remaining=True)
                    if not plans:
                        batch["status"] = "ready"
                        continue
                    self._begin(plans, batch["quoteId"], queue_id=self.queue["id"], batch_index=index)
                    batch.update(status="running", jobId=self.job["id"])
                    self.queue.update(status="running", batchIndex=index)
                    self._save_queue()
                except (OSError, ValueError) as error:
                    batch["status"] = "failed"
                    self.queue.update(status="failed", batchIndex=index, message=str(error),
                                      recoveryReason=getattr(error, "code", None))
                    self._save_queue()
                    return
            self._run(plans)
            with self.lock:
                batch["status"] = self.job["status"]
                ready = {cell["id"] for cell in self._ready()}
                self.queue["completedCells"] = sum(f"8/{cell['x']}/{cell['y']}" in ready
                                                   for current in self.queue["batches"] for cell in current["cells"])
                if self.job["status"] != "ready":
                    self.queue.update(status=self.job["status"], message=self.job.get("message"),
                                      recoveryReason=self.job.get("recoveryReason"))
                    self._save_queue()
                    return
                self._save_queue()
        with self.lock:
            self.queue.update(status="ready", completedCells=self.queue["totalCells"], message="All queued squares are ready offline.")
            self._save_queue()

    def _save(self):
        self.job["updatedAt"] = timestamp()
        write_state(self.job_path, self.job)
        self.last_write = time.monotonic()

    def _update(self, **values):
        with self.lock:
            self.job.update(values)
            self._save()

    def _active(self):
        with self.lock:
            if self.job.get("cancelRequested"):
                raise Cancelled()

    def _arrived(self, count):
        with self.lock:
            self.job["bytesDownloaded"] += count
            self.job["progress"] = min(85, round(self.job["bytesDownloaded"] / max(1, self.job["totalBytes"]) * 85, 1))
            if time.monotonic() - self.last_write > .3:
                self._save()

    def _transferred(self, count):
        with self.lock:
            self.job["bytesTransferred"] += count
            self.speed_bytes += count
            now = time.monotonic()
            elapsed = now - self.speed_start
            self.job["speedBytesPerSecond"] = self.speed_bytes / max(.1, elapsed)
            if elapsed > 2:
                self.speed_start, self.speed_bytes = now, 0
            self.last_progress = now
            if now - self.last_write > .3:
                self._save()

    def _group_path(self, plan, start, length):
        identity = sha256(f"{plan['url']}|{plan['etag']}|{start}|{length}".encode()).hexdigest()
        return self.state / "ranges" / (identity + ".bin")

    def _cached_group(self, plan, start, length, verify=False):
        path = self._group_path(plan, start, length)
        checksum = path.with_name(path.name + ".sha256.json")
        try:
            if (path.is_symlink() or checksum.is_symlink() or not path.is_file() or not checksum.is_file()
                    or path.stat().st_size != length):
                return False
            recorded = json.loads(checksum.read_text())
            return (recorded.get("size") == length and bool(re.fullmatch(r"[a-f0-9]{64}", recorded.get("sha256", "")))
                    and (not verify or digest_file(path) == recorded["sha256"]))
        except (OSError, ValueError, TypeError):
            return False

    def _plan_cached(self, plan):
        return all(self._cached_group(plan, start, length) for start, length in plan.get("groups", []))

    def _fetch_group(self, plan, group):
        self._active()
        start, length = group
        destination = self._group_path(plan, start, length)
        if self._cached_group(plan, start, length, verify=True):
            if not plan["localPath"]:
                self._arrived(length)
            return
        if plan.get("offlineOnly"):
            raise LocalDetailError("A saved range failed its integrity check. Recalculate the remaining squares when connected; installed squares are preserved.", 409, "cache-invalid")
        temporary = destination.with_name(destination.name + ".partial-" + uuid4().hex)
        try:
            for attempt in range(4):
                self._active()
                try:
                    if plan["localPath"]:
                        source = Source(plan["url"], self.state / "provider-index", plan["localPath"])
                        source.etag, source.total = plan["etag"], plan["remoteSize"]
                        temporary.write_bytes(source.get(start, length, cached=False))
                    else:
                        received = 0
                        with source_range(start, length, etag=plan["etag"], remote_size=plan["remoteSize"], url=plan["url"]) as (response, _, _):
                            with temporary.open("wb") as output:
                                while received < length:
                                    self._active()
                                    data = response.read(min(64 * 1024, length - received))
                                    if not data:
                                        raise OSError("The public source disconnected before its tile range finished.")
                                    output.write(data)
                                    received += len(data)
                                    self._transferred(len(data))
                                output.flush()
                                os.fsync(output.fileno())
                        self._arrived(length)
                    if temporary.stat().st_size != length:
                        raise OSError("The source range is incomplete.")
                    temporary.replace(destination)
                    write_state(destination.with_name(destination.name + ".sha256.json"),
                                {"size": length, "sha256": digest_file(destination)})
                    return
                except Cancelled:
                    raise
                except (OSError, ValueError) as error:
                    if isinstance(error, HTTPError) and error.code in {404, 410, 412}:
                        raise LocalDetailError("The quoted public source changed or was removed. Recalculate the remaining squares; installed maps are unchanged.", 409, "source-changed") from error
                    if attempt == 3:
                        raise LocalDetailError(f"The public source could not finish its tile range. Retry when connected. {error}") from error
                    for _ in range((attempt + 1) * 4):
                        self._active()
                        time.sleep(.25)
        finally:
            temporary.unlink(missing_ok=True)

    def _archive(self, cell, plan, stage):
        self._active()
        role = plan["role"]
        self._update(status="downloading", stage=f"Downloading {cell['label']} · {role}", currentCell=cell["id"], currentLayer=role)
        with ThreadPoolExecutor(max_workers=6) as pool:
            tasks = [pool.submit(self._fetch_group, plan, group) for group in plan["groups"]]
            try:
                for task in as_completed(tasks):
                    self._active()
                    task.result()
            except BaseException:
                for task in tasks:
                    task.cancel()
                raise
        self._active()
        self._update(status="preparing", stage=f"Preparing {cell['label']} · {role}", speedBytesPerSecond=0)
        filename = f"partial-z8-{cell['x']}-{cell['y']}-{role}.pmtiles"
        output = stage / filename
        database = stage / (role + ".mbtiles")
        database.unlink(missing_ok=True)
        metadata = {"name": f"{cell['label']} · {role}", "format": "pbf" if role in ("street", "topography") else "webp",
                    "bounds": ",".join(map(str, cell["bounds"])), "minzoom": str(plan["minzoom"]), "maxzoom": str(plan["maxzoom"]),
                    "attribution": plan["attribution"], "type": "baselayer", "version": "1"}
        if role in ("street", "topography"):
            metadata["json"] = json.dumps({"vector_layers": plan["metadata"].get("vector_layers", [])})
        group_starts = [group[0] for group in plan["groups"]]
        with sqlite3.connect(database) as db:
            db.executescript("CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE tiles (zoom_level INTEGER NOT NULL, tile_column INTEGER NOT NULL, tile_row INTEGER NOT NULL, tile_data BLOB NOT NULL, PRIMARY KEY (zoom_level,tile_column,tile_row));")
            db.executemany("INSERT INTO metadata VALUES (?,?)", metadata.items())
            cached, cached_number = b"", -1
            sample = None
            for z, x, y, offset, length in sorted(plan["tiles"], key=lambda tile: tile[3]):
                self._active()
                number = max(0, bisect_left(group_starts, offset + 1) - 1)
                if number != cached_number:
                    start, group_length = plan["groups"][number]
                    cached = self._group_path(plan, start, group_length).read_bytes()
                    cached_number = number
                start = plan["groups"][number][0]
                data = cached[offset - start: offset - start + length]
                if len(data) != length:
                    raise LocalDetailError("A saved tile range is incomplete. Retry this square.")
                if role == "topography":
                    data = gzip.compress(brotli_index(data), mtime=0)
                elif role == "street" and plan["compression"] == 1:
                    data = gzip.compress(data, mtime=0)
                if sample is None:
                    sample = data
                db.execute("INSERT INTO tiles VALUES (?,?,?,?)", (z, x, (1 << z) - 1 - y, data))
            db.commit()
        if role in ("satellite", "elevation"):
            from io import BytesIO
            from PIL import Image
            with Image.open(BytesIO(sample)) as image:
                if image.format != "WEBP" or (role == "elevation" and image.size != (512, 512)):
                    raise LocalDetailError("The source tile has an unexpected image encoding.")
                image.verify()
        else:
            gzip.decompress(sample)
        output.unlink(missing_ok=True)
        _run_pmtiles(self.pmtiles, ("convert", database, output), self._active)
        self._update(status="verifying", stage=f"Verifying {cell['label']} · {role}")
        _run_pmtiles(self.pmtiles, ("verify", output), self._active)
        with output.open("rb") as handle:
            header = handle.read(127)
        expected_type = 1 if role in ("street", "topography") else 4
        if header[:8] != b"PMTiles\x03" or header[99] != expected_type or header[101] != plan["maxzoom"]:
            raise LocalDetailError("The prepared archive did not match the selected data level.")
        archive = {"filename": filename, "role": role, "installedBytes": output.stat().st_size, "sha256": digest_file(output),
                   "minzoom": header[100], "maxzoom": header[101], "bounds": cell["bounds"],
                   "format": "mvt" if role in ("street", "topography") else "webp", "tileSize": 512,
                   "attribution": plan["attribution"], "sourceArchiveUrl": plan["url"], "providerEtag": plan["etag"]}
        if plan["sourceLayer"]:
            archive["sourceLayer"] = plan["sourceLayer"]
        if plan["encoding"]:
            archive["encoding"] = plan["encoding"]
        database.unlink()
        return archive

    def _run(self, cells):
        self.speed_start, self.speed_bytes = time.monotonic(), 0
        stage = None
        try:
            for number, cell in enumerate(cells):
                self._active()
                stage = self.state / ("stage-" + self.job["id"] + "-" + str(number))
                stage.mkdir(exist_ok=True)
                archives = [self._archive(cell, plan, stage) for plan in cell["plans"]]
                self._active()
                with self.lock:
                    # The inventory is the commit point. Uncommitted files are never advertised.
                    for archive in archives:
                        source, destination = stage / archive["filename"], self.maps / archive["filename"]
                        if destination.is_symlink():
                            raise LocalDetailError("A map publication path is not a regular local file.")
                        source.replace(destination)
                    published = {key: value for key, value in cell.items() if key not in ("plans", "downloadBytes", "estimatedInstalledBytes")}
                    published.update(status="ready", archives=archives, installedAt=timestamp(), installedBytes=sum(a["installedBytes"] for a in archives))
                    committed = {**self.manifest,
                                 "cells": [old for old in self.manifest["cells"] if old["id"] != cell["id"]] + [published]}
                    # A failed inventory write must not advertise an installation
                    # only in memory, or Retry would skip its unpublished cell.
                    write_state(self.manifest_path, committed)
                    self.manifest = committed
                    self.job.update(completedCells=number + 1, progress=max(self.job["progress"], round((number + 1) / len(cells) * 85, 1)))
                    self._save()
                stage.rmdir()
            # Successful packages no longer need duplicate transfer checkpoints.
            # Keep failed/cancelled range files so Retry can continue offline work.
            for cell in cells:
                for plan in cell["plans"]:
                    for start, length in plan["groups"]:
                        try:
                            self._group_path(plan, start, length).unlink(missing_ok=True)
                            self._group_path(plan, start, length).with_name(self._group_path(plan, start, length).name + ".sha256.json").unlink(missing_ok=True)
                        except OSError as error:
                            print(f"Local-detail checkpoint cleanup: {error}", flush=True)
            self._update(status="ready", stage="Ready offline", progress=100, speedBytesPerSecond=0, message="All selected squares were verified and are available offline.")
        except Cancelled:
            self._update(status="cancelled", stage="Cancelled", speedBytesPerSecond=0, message="Download cancelled. Completed squares remain available offline; saved ranges can be reused by Retry.")
        except Exception as error:
            print(f"Local-detail task failed: {error}", flush=True)
            self.provider_cache = None
            self._update(status="failed", stage="Failed", speedBytesPerSecond=0, message=str(error)[:600],
                         recoveryReason=getattr(error, "code", None))
        finally:
            if stage and stage.parent == self.state and stage.name.startswith("stage-") and stage.is_dir() and not stage.is_symlink():
                try:
                    for child in stage.iterdir():
                        if child.is_file() or child.is_symlink():
                            child.unlink()
                    stage.rmdir()
                except OSError as error:
                    print(f"Local-detail staging cleanup: {error}", flush=True)

    def cancel(self, identifier):
        with self.lock:
            if self.queue and (identifier == self.queue["id"] or self.job and identifier == self.job["id"] and self.job.get("queueId") == self.queue["id"]):
                if self.queue["status"] not in TERMINAL:
                    self.queue["cancelRequested"] = True
                    self._save_queue()
                    if self.job and self.job["status"] not in TERMINAL:
                        self.job["cancelRequested"] = True
                        self._save()
                return {"queue": self._queue_snapshot(), "job": self.snapshot()["job"]}
            if not self.job or identifier != self.job["id"]:
                raise LocalDetailError("This local-detail task was not found.")
            if self.job["status"] not in TERMINAL:
                self.job["cancelRequested"] = True
                self._save()
            return {"job": self.snapshot()["job"]}

    def retry(self, identifier):
        with self.lock:
            self._require_discard_finished()
            if self.queue and (identifier == self.queue["id"] or self.job and identifier == self.job["id"] and self.job.get("queueId") == self.queue["id"]):
                if self.queue["status"] not in {"failed", "cancelled"} or self.thread and self.thread.is_alive():
                    raise LocalDetailError("Wait for the stopped queue's worker thread before retrying.", 409)
                self.queue.update(status="queued", cancelRequested=False, message="Verifying the remaining queued preparation.")
                self._save_queue()
                self.thread = Thread(target=self._run_queue, daemon=True)
                self.thread.start()
                return {"queue": self._queue_snapshot(), "job": self.snapshot()["job"]}
            if not self.job or identifier != self.job["id"] or self.job["status"] not in {"failed", "cancelled"}:
                raise LocalDetailError("Only failed or cancelled local-detail tasks can be retried.")
            ready = {cell["id"] for cell in self._ready()}
            cells = [cell for cell in self.job["cells"] if cell["id"] not in ready]
            if not cells:
                raise LocalDetailError("All squares from this task are already downloaded.")
            return self.submit(cells, self.job["quoteId"])
