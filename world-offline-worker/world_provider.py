"""Retrieve and prepare the pinned world imagery packages for the NOMAD lab."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import dataclass
from http.client import HTTPException
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryFile
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from warnings import catch_warnings, simplefilter
from xml.etree.ElementTree import Element, ElementTree, SubElement
import errno
import json
import os
import re
import sqlite3
import struct
import subprocess
import time


WORLD_BOUNDS = (-180.0, -85.05112878, 180.0, 85.05112878)
NASA_URL = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base"
NASA_CREDIT = "NASA Earth Observatory (Reto Stöckli), Blue Marble: Next Generation, monthly composites for 2004."
NASA_INPUTS = (
    ("january", 23_716_627),
    ("february", 23_369_623),
    ("march", 22_848_375),
    ("april", 22_209_925),
    ("may", 21_829_549),
    ("june", 21_793_655),
    ("july", 21_125_326),
    ("august", 21_206_743),
    ("september", 22_359_549),
    ("october", 22_853_895),
    ("november", 23_766_556),
    ("december", 23_931_114),
)
BLUE_MARBLE_ZOOMS = {"blue-marble-z4": 4, "blue-marble": 6, "blue-marble-z8": 8}
NASA_SIZES_PATH = Path(__file__).with_name("blue_marble_source_sizes.json")
DETAIL_OVERVIEWS = (2, 4, 16, 64)
DETAIL_VRT_LEVELS = ((2, 64), (4, 16), (6, 4), (7, 2), (8, 1))


class WorldAssetError(RuntimeError):
    """A pinned source could not be downloaded or prepared."""


class InvalidPreparedArchive(WorldAssetError):
    """A prepared PMTiles archive failed structural verification."""


class InvalidSourceArchive(WorldAssetError):
    """A provider input failed validation or decoding."""

    def __init__(self, message, path=None):
        super().__init__(message)
        self.path = path


class PMTilesCommandError(WorldAssetError):
    """The PMTiles process ran and returned a nonzero exit code."""


@dataclass(frozen=True)
class Source:
    filename: str
    url: str
    download_bytes: int
    dimensions: tuple[int, int]
    bounds: tuple[float, float, float, float]


@dataclass(frozen=True)
class Asset:
    filename: str
    url: str
    download_bytes: int
    max_zoom: int
    tile_size: int
    tile_type: int
    attribution: str
    version: str
    month: int | None = None
    sources: tuple[Source, ...] = ()


def _monthly_sources(prefix, stem, zoom, sizes):
    if zoom != 8:
        width, height = (5400, 2700) if zoom == 4 else (21600, 10800)
        return (Source(f"{stem}.jpg", f"{prefix}{width}x{height}.jpg", sizes,
                       (width, height), (-180, -90, 180, 90)),)
    sources = []
    for index, size in enumerate(sizes):
        row, column = divmod(index, 4)
        code = f"{'ABCD'[column]}{row + 1}"
        west = -180 + 90 * column
        north = 90 - 90 * row
        bounds = (west, north - 90, west + 90, north)
        sources.append(Source(f"{stem}-{code}.jpg", f"{prefix}21600x21600.{code}.jpg",
                              size, (21600, 21600), bounds))
    return tuple(sources)


def _blue_marble_assets():
    # Pinned from the official NASA asset Content-Length headers, in Jan–Dec
    # order. The full resolution grid stores A1–D1 followed by A2–D2.
    sizes = json.loads(NASA_SIZES_PATH.read_text(encoding="utf-8"))
    assets = {}
    for pack, zoom in BLUE_MARBLE_ZOOMS.items():
        months = []
        for index in range(11, -1, -1):
            month = index + 1
            name, standard_bytes = NASA_INPUTS[index]
            version = f"2004-{month:02}"
            stem = f"raster-lab-world-{pack}-{month:02}"
            prefix = f"{NASA_URL}/{name}/world.2004{month:02}.3x"
            source_bytes = sizes["detail"][index] if zoom == 8 else (
                sizes["compact"][index] if zoom == 4 else standard_bytes)
            sources = _monthly_sources(prefix, stem, zoom, source_bytes)
            months.append(Asset(f"{stem}.pmtiles", sources[0].url,
                                sum(source.download_bytes for source in sources),
                                zoom, 256, 3, NASA_CREDIT, version, month, sources))
        assets[pack] = tuple(months)
    return assets


ASSETS = _blue_marble_assets()

CONTENT_RANGE = re.compile(r"bytes (\d+)-(\d+)/(\d+)\Z")
CHUNK_SIZE = 1024 ** 2
RETRYABLE_HTTP = {408, 412, 416, 429, 500, 502, 503, 504}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(req.full_url, code, "Unexpected redirect from world imagery source", headers, fp)


def _open(opener, asset, method="GET", **headers):
    return opener.open(Request(
        asset.url, method=method,
        headers={"Accept-Encoding": "identity", "User-Agent": "NOMAD-raster-lab/1.0", **headers},
    ), timeout=35)


def _version(headers):
    tag = headers.get("ETag")
    if tag and not tag.startswith("W/"):
        return {"ETag": tag}
    modified = headers.get("Last-Modified")
    return {"Last-Modified": modified} if modified else {}


def _content_range(headers):
    value = CONTENT_RANGE.fullmatch(headers.get("Content-Range", ""))
    return tuple(map(int, value.groups())) if value else ()


def _remote_version(opener, asset):
    # Some CDN configurations omit Content-Length on HEAD. A one-byte range
    # confirms the expected representation without consuming the archive.
    try:
        with _open(opener, asset, "HEAD") as response:
            length = response.headers.get("Content-Length")
            version = _version(response.headers)
            if length is not None:
                if length != str(asset.download_bytes):
                    raise WorldAssetError("World imagery source size differs from the pinned catalog.")
                return version
    except HTTPError as error:
        if error.code not in {403, 405, 501}:
            raise
        error.close()
    with _open(opener, asset, Range="bytes=0-0") as response:
        expected = response.status == 206 and _content_range(response.headers) == (0, 0, asset.download_bytes)
        full_response = response.status == 200 and response.headers.get("Content-Length") == str(asset.download_bytes)
        if not expected and not full_response:
            raise WorldAssetError("The source did not confirm the pinned world imagery size.")
        return _version(response.headers)


def _resume_metadata(path):
    try:
        metadata = json.loads(path.read_bytes())
    except (FileNotFoundError, UnicodeDecodeError, ValueError):
        return None
    return metadata


def _checkpoint_version(path, version):
    stage = path.with_suffix(".pending")
    try:
        with stage.open("w", encoding="utf8") as output:
            json.dump(version, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        stage.replace(path)
    finally:
        stage.unlink(missing_ok=True)


def _transfer(opener, asset, partial, offset, version, ensure_active, on_bytes):
    headers = {}
    if offset:
        headers["Range"] = f"bytes={offset}-"
        headers["If-Range"] = next(iter(version.values()))

    with _open(opener, asset, **headers) as response:
        if version and _version(response.headers) != version:
            raise WorldAssetError("The world imagery source changed during transfer.")
        if response.headers.get("Content-Encoding", "identity") != "identity":
            raise WorldAssetError("Unexpected compression in the world imagery transfer.")
        if response.status == 206:
            received_range = _content_range(response.headers)
            if received_range != (offset, asset.download_bytes - 1, asset.download_bytes):
                raise WorldAssetError("The source returned an unexpected world imagery byte range.")
        elif response.status == 200:
            if response.headers.get("Content-Length") != str(asset.download_bytes):
                raise WorldAssetError("The world imagery response does not match the pinned file size.")
            # A server can ignore Range and return a complete, matching version.
            # Restart the partial file instead of appending another full copy.
            offset = 0
        else:
            raise WorldAssetError("Unexpected response from the world imagery source.")

        on_bytes(offset)
        with partial.open("ab" if offset else "wb") as output:
            received = offset
            for chunk in iter(lambda: response.read(CHUNK_SIZE), b""):
                ensure_active()
                received += len(chunk)
                if received > asset.download_bytes:
                    raise WorldAssetError("The world imagery source exceeded the pinned file size.")
                output.write(chunk)
                on_bytes(received)
            output.flush()
            os.fsync(output.fileno())

        if received != asset.download_bytes:
            raise OSError("The world imagery transfer was interrupted.")


def _fetch_source(asset, checkpoint: Path, ensure_active, on_bytes) -> Path:
    """Stream one pinned source to disk, resuming only a matching origin version."""
    ensure_active()
    checkpoint.mkdir(parents=True, exist_ok=True)
    source = checkpoint / asset.filename
    partial = source.with_suffix(source.suffix + ".part")
    marker = source.with_suffix(source.suffix + ".resume")
    if any(path.is_symlink() for path in (source, partial, marker)):
        raise WorldAssetError("The NASA checkpoint must use local regular files.")
    if source.is_file() and source.stat().st_size == asset.download_bytes:
        on_bytes(asset.download_bytes)
        return source
    opener = build_opener(ProxyHandler({}), NoRedirect)
    for attempt in range(4):
        ensure_active()
        try:
            version = _remote_version(opener, asset)
            offset = partial.stat().st_size if partial.is_file() else 0
            recorded = _resume_metadata(marker)
            if offset and (not version or recorded != version or offset > asset.download_bytes):
                partial.unlink()
                offset = 0
            _checkpoint_version(marker, version)
            if offset != asset.download_bytes:
                _transfer(opener, asset, partial, offset, version, ensure_active, on_bytes)
            ensure_active()
            partial.replace(source)
            marker.unlink(missing_ok=True)
            on_bytes(asset.download_bytes)
            return source
        except (HTTPError, URLError, HTTPException, OSError) as error:
            if isinstance(error, HTTPError):
                code = error.code
                error.close()
                if code not in RETRYABLE_HTTP:
                    break
            if isinstance(error, OSError) and error.errno in {errno.ENOSPC, errno.EDQUOT}:
                raise WorldAssetError("Free disk space is insufficient to continue the world package.") from error
            if attempt < 3:
                time.sleep(attempt + 1)
    raise WorldAssetError("Could not finish downloading the world imagery. Retry to continue from the checkpoint.")


def _read_pmtiles(path, asset):
    try:
        archive_size = path.stat().st_size
        with path.open("rb") as source:
            header = source.read(127)
        if len(header) != 127 or header[:8] != b"PMTiles\x03":
            raise InvalidPreparedArchive("The world archive has an invalid PMTiles header.")
        extents = struct.unpack_from("<8Q", header, 8)
        addressed_tiles = struct.unpack_from("<Q", header, 72)[0]
        tile_type, min_zoom, max_zoom = header[99:102]
        bounds = tuple(value / 1e7 for value in struct.unpack_from("<4i", header, 102))
        full_pyramid = (4 ** (asset.max_zoom + 1) - 1) // 3
        if (
            (tile_type, min_zoom, max_zoom) != (asset.tile_type, 0, asset.max_zoom)
            or addressed_tiles != full_pyramid
            or any(abs(expected - actual) > 0.0001 for expected, actual in zip(WORLD_BOUNDS, bounds))
            or any(offset + size > archive_size for offset, size in zip(extents[::2], extents[1::2]))
        ):
            raise InvalidPreparedArchive("The world archive does not match the expected tile coverage or format.")
    except FileNotFoundError:
        raise InvalidPreparedArchive("The verified world archive could not be opened.") from None


def pmtiles_time_budget(args):
    # Extraction writes a new archive and verification reads the existing one.
    # A world archive may be over 100 GB, so allow for slower local disks.
    try:
        size = Path(args[1]).stat().st_size
    except OSError:
        size = 0
    return 600 + size // (8 * 1024**2)


def _run_pmtiles(pmtiles: Path, args, ensure_active):
    ensure_active()
    with TemporaryFile() as log:
        try:
            process = subprocess.Popen(
                [str(pmtiles), *map(str, args)], stdin=subprocess.DEVNULL,
                stdout=log, stderr=subprocess.STDOUT,
            )
        except OSError as error:
            raise WorldAssetError("The PMTiles tool is unavailable in the test instance.") from error
        deadline = time.monotonic() + pmtiles_time_budget(args)
        try:
            while process.poll() is None:
                try:
                    process.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    ensure_active()
                if time.monotonic() > deadline:
                    raise WorldAssetError("Preparing the world archive took too long. Retry from the checkpoint.")
            if process.returncode:
                log.seek(max(0, log.tell() - 500))
                details = log.read().decode("utf8", errors="replace").strip()
                raise PMTilesCommandError(f"PMTiles {args[0]} failed for the world archive: {details}")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    ensure_active()


def _verify_archive(path, asset, pmtiles, ensure_active):
    _read_pmtiles(path, asset)
    try:
        _run_pmtiles(pmtiles, ("verify", path), ensure_active)
    except PMTilesCommandError as error:
        raise InvalidPreparedArchive(str(error)) from error


def _nasajpeg_to_geotiff(path, source, target, ensure_active, overviews=()):
    """Georeference the published JPEG while decoding it in sequential strips."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.errors import NotGeoreferencedWarning, RasterioIOError
    from rasterio.transform import from_bounds
    from rasterio.windows import Window

    with catch_warnings():
        simplefilter("ignore", NotGeoreferencedWarning)
        try:
            image = rasterio.open(path)
        except RasterioIOError as error:
            raise InvalidSourceArchive("A cached NASA image could not be opened.", path) from error
    with image:
        if (
            (image.width, image.height) != source.dimensions or image.count != 3
            or tuple(image.dtypes) != ("uint8",) * 3
            or image.driver != "JPEG"
        ):
            raise InvalidSourceArchive("NASA returned an unexpected Blue Marble image.", path)
        transform = from_bounds(*source.bounds, image.width, image.height)
        options = {
            "driver": "GTiff", "count": 3, "dtype": "uint8",
            "width": image.width, "height": image.height, "crs": "EPSG:4326", "transform": transform,
            "tiled": True, "blockxsize": 512, "blockysize": 512, "interleave": "pixel",
            "compress": "zstd", "zstd_level": 1, "predictor": 2,
        }
        with rasterio.open(target, "w", **options) as geotiff:
            for row in range(0, image.height, 512):
                ensure_active()
                window = Window(0, row, image.width, min(512, image.height - row))
                try:
                    pixels = image.read(window=window)
                except RasterioIOError as error:
                    raise InvalidSourceArchive("A cached NASA image could not be decoded.", path) from error
                geotiff.write(pixels, window=window)
            if overviews:
                ensure_active()
                geotiff.build_overviews(list(overviews), Resampling.average)


def _mosaic_blue_marble(sources, geotiffs, target, factor=1):
    """Join tiled sources in WGS84, optionally reading averaged TIFF overviews."""
    def dimensions(source):
        return tuple((pixels + factor - 1) // factor for pixels in source.dimensions)

    width, height = dimensions(sources[0])
    east_west = (sources[0].bounds[2] - sources[0].bounds[0]) / width
    north_south = (sources[0].bounds[3] - sources[0].bounds[1]) / height
    dataset = Element("VRTDataset", rasterXSize=str(round(360 / east_west)),
                      rasterYSize=str(round(180 / north_south)))
    srs = SubElement(dataset, "SRS", dataAxisToSRSAxisMapping="2,1")
    srs.text = "EPSG:4326"
    transform = SubElement(dataset, "GeoTransform")
    transform.text = f"-180,{east_west},0,90,0,{-north_south}"
    for band, color in enumerate(("Red", "Green", "Blue"), 1):
        output = SubElement(dataset, "VRTRasterBand", dataType="Byte", band=str(band))
        SubElement(output, "ColorInterp").text = color
        for source, image in zip(sources, geotiffs, strict=True):
            node = SubElement(output, "SimpleSource")
            SubElement(node, "SourceFilename", relativeToVRT="1").text = image.name
            if factor > 1:
                options = SubElement(node, "OpenOptions")
                SubElement(options, "OOI", key="OVERVIEW_LEVEL").text = str(DETAIL_OVERVIEWS.index(factor))
            SubElement(node, "SourceBand").text = str(band)
            width, height = dimensions(source)
            size = dict(xSize=str(width), ySize=str(height))
            SubElement(node, "SrcRect", xOff="0", yOff="0", **size)
            SubElement(node, "DstRect",
                       xOff=str(round((source.bounds[0] + 180) / east_west)),
                       yOff=str(round((90 - source.bounds[3]) / north_south)), **size)
    ElementTree(dataset).write(target, encoding="utf-8", xml_declaration=True)


def _write_blue_marble_tiles(mosaics, database, asset, ensure_active):
    import numpy as np
    from PIL import Image
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import Window

    # EPSG:3857 square at latitude ±85.05112878; its antimeridian edges
    # coincide with the published EPSG:4326 source extent at longitude ±180.
    edge = 20_037_508.342789244
    tile_size = asset.tile_size
    metadata = {
        "name": f"NASA Blue Marble {asset.version}", "type": "baselayer",
        "format": "jpg", "scheme": "tms", "minzoom": "0", "maxzoom": str(asset.max_zoom),
        "bounds": ",".join(map(str, WORLD_BOUNDS)), "center": "0,0,0",
        "attribution": asset.attribution,
    }
    with closing(sqlite3.connect(database)) as db:
        db.executescript("""
            PRAGMA journal_mode=OFF;
            CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE tiles (zoom_level INTEGER NOT NULL, tile_column INTEGER NOT NULL,
                                tile_row INTEGER NOT NULL, tile_data BLOB NOT NULL,
                                PRIMARY KEY (zoom_level, tile_column, tile_row));
        """)
        db.executemany("INSERT INTO metadata VALUES (?, ?)", metadata.items())
        for zoom in range(asset.max_zoom + 1):
            mosaic = next(path for max_zoom, path in mosaics if max_zoom >= zoom)
            side = 1 << zoom
            width = tile_size * side
            transform = from_bounds(-edge, -edge, edge, edge, width, width)
            with rasterio.open(mosaic) as dataset, WarpedVRT(
                dataset, crs="EPSG:3857", transform=transform, width=width, height=width,
                resampling=Resampling.bilinear, warp_mem_limit=96, NUM_THREADS="2",
            ) as warped:
                for row in range(side):
                    ensure_active()
                    strip = warped.read(window=Window(0, row * tile_size, width, tile_size))
                    rgb = np.moveaxis(strip, 0, -1)
                    tiles = []
                    for column in range(side):
                        tile = rgb[:, column * tile_size:(column + 1) * tile_size]
                        with BytesIO() as encoded:
                            Image.fromarray(tile).save(encoded, format="JPEG", quality=85)
                            tiles.append((zoom, column, side - 1 - row, encoded.getvalue()))
                    db.executemany("INSERT INTO tiles VALUES (?, ?, ?, ?)", tiles)
        db.commit()
        if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise WorldAssetError("The Blue Marble tile database failed its integrity check.")


def _prepare_blue_marble_month(asset, source_paths, checkpoint, pmtiles, ensure_active):
    output = checkpoint / asset.filename
    staging = output.with_suffix(".preparing.pmtiles")
    geotiffs = [output.with_suffix(f".source-{index}.tif") for index, _ in enumerate(source_paths)]
    detail = len(geotiffs) > 1
    mosaics = ([(zoom, output.with_suffix(f".mosaic-{factor}.vrt")) for zoom, factor in DETAIL_VRT_LEVELS]
               if detail else [(asset.max_zoom, geotiffs[0])])
    database = output.with_suffix(".mbtiles")
    temporary = {*geotiffs, *(path for _, path in mosaics), output.with_suffix(".mosaic.vrt"), database, staging}
    for path in temporary:
        path.unlink(missing_ok=True)
    try:
        import rasterio
        options = dict(GDAL_CACHEMAX=256 * 1024**2, GDAL_NUM_THREADS="2", GDAL_PAM_ENABLED="NO",
                       COMPRESS_OVERVIEW="ZSTD", PREDICTOR_OVERVIEW="2", ZSTD_LEVEL_OVERVIEW="1")
        inputs = zip(source_paths, asset.sources, geotiffs, strict=True)
        with rasterio.Env(**options):
            if detail:
                def write_source(item):
                    with rasterio.Env(**options):
                        _nasajpeg_to_geotiff(*item, ensure_active, DETAIL_OVERVIEWS)

                with ThreadPoolExecutor(max_workers=3) as pool:
                    for _ in pool.map(write_source, inputs):
                        pass
                for (_, factor), (_, path) in zip(DETAIL_VRT_LEVELS, mosaics, strict=True):
                    _mosaic_blue_marble(asset.sources, geotiffs, path, factor)
            else:
                _nasajpeg_to_geotiff(*next(inputs), ensure_active)
            _write_blue_marble_tiles(mosaics, database, asset, ensure_active)
        for path in geotiffs:
            path.unlink()
        _run_pmtiles(pmtiles, ("convert", database, staging), ensure_active)
        _verify_archive(staging, asset, pmtiles, ensure_active)
        staging.replace(output)
        return output
    except ImportError as error:
        raise WorldAssetError("The Blue Marble renderer is unavailable in the test instance.") from error
    finally:
        for path in temporary:
            path.unlink(missing_ok=True)


def marble_downloaded_bytes(asset, checkpoint: Path) -> int:
    """Account for a verified month or the source bytes present in its checkpoint."""
    ready = checkpoint / asset.filename
    if ready.is_file():
        try:
            _read_pmtiles(ready, asset)
            return asset.download_bytes
        except WorldAssetError:
            pass
    downloaded = 0
    for source in asset.sources:
        path = checkpoint / source.filename
        try:
            ready_bytes = path.stat().st_size
        except FileNotFoundError:
            ready_bytes = 0
        if ready_bytes == source.download_bytes:
            downloaded += source.download_bytes
            continue
        partial = path.with_suffix(path.suffix + ".part")
        if _resume_metadata(path.with_suffix(path.suffix + ".resume")):
            try:
                downloaded += min(partial.stat().st_size, source.download_bytes)
            except FileNotFoundError:
                pass
    return downloaded


def stage_blue_marble_month(asset, checkpoint: Path, pmtiles: Path, active, on_bytes, on_prepare) -> Path:
    """Download, convert and verify a month, keeping data usable after a failed job."""
    active()
    ready = checkpoint / asset.filename
    if ready.is_file():
        try:
            _verify_archive(ready, asset, pmtiles, active)
        except InvalidPreparedArchive:
            ready.unlink()
        else:
            on_bytes(asset.download_bytes)
            on_prepare()
            _clear_nasa_sources(asset, checkpoint)
            return ready

    progress = {}
    lock = Lock()

    def fetch(source):
        def report(size):
            with lock:
                progress[source.filename] = size
                on_bytes(sum(progress.values()))
        return _fetch_source(source, checkpoint, active, report)

    if len(asset.sources) == 1:
        source_paths = [fetch(asset.sources[0])]
    else:
        with ThreadPoolExecutor(max_workers=4) as pool:
            source_paths = list(pool.map(fetch, asset.sources))
    on_prepare()
    for attempt in range(2):
        try:
            result = _prepare_blue_marble_month(asset, source_paths, checkpoint, pmtiles, active)
            break
        except InvalidSourceArchive as error:
            # Keep other sources in this month. A malformed replacement is
            # rejected once rather than trapping every retry on the same bytes.
            selected = next((source for source in asset.sources if checkpoint / source.filename == error.path), None)
            if selected is None:
                raise
            active()
            _clear_nasa_source(selected, checkpoint)
            if attempt:
                raise
            fetch(selected)
    _clear_nasa_sources(asset, checkpoint)
    return result


def _clear_nasa_sources(asset, checkpoint):
    for source in asset.sources:
        _clear_nasa_source(source, checkpoint)


def _clear_nasa_source(source, checkpoint):
    path = checkpoint / source.filename
    for saved in (path, path.with_suffix(".jpg.part"), path.with_suffix(".jpg.resume")):
        saved.unlink(missing_ok=True)
