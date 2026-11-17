"""Queue and publish the optional world map datasets in the raster laboratory."""

from contextlib import ExitStack
from dataclasses import dataclass, replace
from datetime import datetime, timezone
import errno
from hashlib import sha256
from pathlib import Path
from queue import Queue
from threading import RLock, Thread
from uuid import uuid4
import json
import os
import re
from stat import S_ISREG
import time

from satellite_provider import (SATELLITE, TOPOGRAPHY, TOPO_MAP_ATTRIBUTION, ESTIMATED_BYTES as SATELLITE_SIZES,
                                SOURCE_PAGE as SATELLITE_PAGE, TOPO_ESTIMATED_BYTES as TOPO_SIZES, TOPO_PAGE,
                                ELEVATION, ELEVATION_MAP_ATTRIBUTION, ELEVATION_PAGE, VersaDataset, checkpoint_lock,
                                fetch_versatiles, prepare_versatiles, valid_source, verify_versatiles)
from world_provider import (ASSETS as ORIGINAL_ASSETS, DETAIL_VRT_LEVELS, Asset, InvalidPreparedArchive, InvalidSourceArchive,
                            WorldAssetError, _resume_metadata, _run_pmtiles, _verify_archive)


MANIFEST_NAME = "lab-world-archive-manifest.json"
TERMINAL = {"completed", "cancelled", "failed", "discarded"}
MERCATOR_BOUNDS = [-180, -85.05112878, 180, 85.05112878]
MARBLE_PAGE = "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/"
# Map zoom, nominal NASA source scale, estimated installed bytes, temporary
# workspace for the biggest month (sources, georeferencing and encoding).
BLUE_MARBLE_TIERS = {
    "blue-marble-z4": (4, 8_000, 27_000_000, 256 * 1024**2),
    "blue-marble": (6, 2_000, 306_381_280, 1536 * 1024**2),
    "blue-marble-z8": (8, 500, 3_520_000_000, 4 * 1024**3),
}
VERSA_PACKS = {
    f"{prefix}-z{zoom}": (dataset, page, zoom, size)
    for prefix, dataset, page, sizes in (
        ("satellite", SATELLITE, SATELLITE_PAGE, SATELLITE_SIZES),
        ("topo", TOPOGRAPHY, TOPO_PAGE, TOPO_SIZES),
    )
    for zoom, size in sizes.items()
}
ASSETS = {
    **ORIGINAL_ASSETS,
    **{
        pack: (Asset(f"raster-lab-world-{pack}.pmtiles", dataset.url, size,
                     zoom, 512, dataset.pmtiles_header[1], dataset.attribution, "versatiles-v02"),)
        for pack, (dataset, _, zoom, size) in VERSA_PACKS.items()
    },
}
# Each archive owns a disjoint set of zooms. Reducing a tier can remove whole
# archives, and upgrading can keep the installed files and fetch only new levels.
EARTH_BAND_BYTES = {8: 1_297_145_576, 9: 2_155_245_900, 10: 8_560_904_800,
                    11: 23_123_603_800, 12: 78_076_927_500}
# Payload and block-directory bytes measured from the published Elevation archive.
# The first band includes z0–6. All higher bands contain exactly one zoom.
ELEVATION_BAND_BYTES = {6: 277_950_047, 7: 670_281_006, 8: 2_260_158_041, 9: 7_313_140_813,
                        10: 21_824_917_493, 11: 59_967_777_380, 12: 263_305_475_144}


@dataclass(frozen=True)
class WorldBandFamily:
    prefix: str
    role: str
    title: str
    retirement_key: str
    dataset: VersaDataset
    page: str
    attribution: str
    sizes: dict[int, int]

    @property
    def base(self):
        return min(self.sizes)

    def pack(self, zoom):
        return f"{self.prefix}-z{zoom}"

    def filename(self, zoom):
        return f"raster-lab-world-{self.pack(zoom)}.pmtiles"

    def dataset_for(self, zoom):
        return replace(self.dataset, min_zoom=0 if zoom == self.base else zoom)

    def preparation_bytes(self, size):
        return preparation_bytes(size, self.dataset)


EARTH = WorldBandFamily("earth-relief", "topography", "Earth Relief", "retiredEarth",
                        TOPOGRAPHY, TOPO_PAGE, TOPO_MAP_ATTRIBUTION, EARTH_BAND_BYTES)
ELEVATION_FAMILY = WorldBandFamily("elevation", "elevation", "Elevation", "retiredElevation",
                                   ELEVATION, ELEVATION_PAGE, ELEVATION_MAP_ATTRIBUTION, ELEVATION_BAND_BYTES)
BAND_FAMILIES = (EARTH, ELEVATION_FAMILY)
BANDED_PACKS = {family.pack(zoom): (family, zoom) for family in BAND_FAMILIES for zoom in family.sizes}
SATELLITE_TIERS = {f"satellite-z{zoom}": zoom for zoom in SATELLITE_SIZES}
LEGACY_TOPO = {f"topo-z{zoom}": zoom for zoom in TOPO_SIZES}
AVAILABLE = (ASSETS.keys() - LEGACY_TOPO.keys()) | BANDED_PACKS.keys()
WORK_RESERVE = 256 * 1024**2
JOB_STATE_RESERVE = 64 * 1024
DISK_FULL = {errno.ENOSPC, errno.EDQUOT}


class WorldPackError(ValueError):
    pass


class WorldPackCancelled(Exception):
    pass


class WorldPackPaused(Exception):
    pass


def world_catalog():
    catalog = []
    for pack, assets in ASSETS.items():
        size = sum(asset.download_bytes for asset in assets)
        item = {"id": pack, "downloadBytes": size, "files": [asset.filename for asset in assets]}
        if pack in BLUE_MARBLE_TIERS:
            zoom, scale, installed, scratch = BLUE_MARBLE_TIERS[pack]
            item.update(role="blue-marble", minZoom=0, maxZoom=zoom, metersPerPixel=scale,
                        estimatedInstalledBytes=installed, temporaryBytes=scratch)
        if pack in LEGACY_TOPO:
            item["legacy"] = True
        if pack in VERSA_PACKS:
            dataset, _, zoom, _ = VERSA_PACKS[pack]
            # Vector tiles are recompressed from Brotli to browser-compatible gzip.
            converted = (size * 12 + 9) // 10 if dataset.source_layer else size
            item.update(maxZoom=zoom, metersPerPixel=round(40075016.68557849 / (512 * 2**zoom), 1),
                        temporaryBytes=converted + 256 * 1024**2)
            item["minZoom"] = dataset.min_zoom
            if pack in SATELLITE_TIERS:
                item.update(role="satellite", estimatedInstalledBytes=size)
        catalog.append(item)
    for pack, (family, maximum) in BANDED_PACKS.items():
        levels = range(family.base, maximum + 1)
        size = sum(family.sizes[level] for level in levels)
        item = {
            "id": pack, "role": family.role, "minZoom": 0, "maxZoom": maximum,
            "metersPerPixel": round(40075016.68557849 / (512 * 2**maximum), 1),
            "downloadBytes": size, "temporaryBytes": family.preparation_bytes(size) + WORK_RESERVE,
            "files": [family.filename(level) for level in levels],
        }
        if family.dataset.encoding:
            item["estimatedInstalledBytes"] = size
        catalog.append(item)
    return catalog


def read_manifest(path):
    data = read_state(path, {"schemaVersion": 1, "packs": {}})
    if data.get("schemaVersion") != 1 or not isinstance(data.get("packs"), dict):
        raise WorldPackError("The local world map inventory is invalid.")
    if not isinstance(data.get("retiredBlueMarble", {}), dict):
        raise WorldPackError("The Blue Marble retirement inventory is invalid.")
    if not isinstance(data.get("retiredSatellite", {}), dict):
        raise WorldPackError("The satellite retirement inventory is invalid.")
    for family in BAND_FAMILIES:
        if not isinstance(data.get(family.retirement_key, {}), dict):
            raise WorldPackError(f"The {family.title} retirement inventory is invalid.")
    return data


def physical_size(path):
    try:
        details = path.lstat()
        return details.st_blocks * 512 if S_ISREG(details.st_mode) else 0
    except FileNotFoundError:
        return 0


def preparation_bytes(size, dataset):
    # Brotli vector tiles are converted to gzip. Elevation WebP is copied
    # unchanged and needs modest headroom for the PMTiles directory.
    if dataset.source_layer:
        return (size * 12 + 9) // 10
    return size + max(1024**2, size // 100) if dataset.encoding else size


def versatiles_provenance(dataset, checkpoint, size):
    result = {"source": "versatiles-range", "sourceArchiveUrl": dataset.url, "sourceBytes": size}
    marker = _resume_metadata(checkpoint / f"{dataset.stem}.resume.json")
    if isinstance(marker, dict):
        if isinstance(marker.get("etag"), str):
            result["providerEtag"] = marker["etag"]
        if isinstance(marker.get("index"), str):
            result["localIndexSha256"] = marker["index"]
    return result


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_state(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def sync_directory(path):
    handle = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(handle)
    finally:
        os.close(handle)


def write_state(path, data):
    stage = path.with_name(f".{path.name}.{uuid4().hex}.partial")
    try:
        with stage.open("x", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, allow_nan=False)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        stage.replace(path)
        sync_directory(path.parent)
    finally:
        stage.unlink(missing_ok=True)


def digest_file(path, check_active):
    digest = sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(2 * 1024**2), b""):
            check_active()
            digest.update(block)
    return digest.hexdigest()


def prepare_local_band(level, origin, origin_digest, checkpoint, pmtiles, active):
    destination = checkpoint / EARTH.filename(level)
    marker = checkpoint / "legacy-reuse.json"
    reused_from = {"sha256": origin_digest, "filename": origin.name}
    dataset = EARTH.dataset_for(level)
    with checkpoint_lock(checkpoint / "legacy-reuse.lock", active):
        if read_state(marker, None) == reused_from and destination.is_file() and not destination.is_symlink():
            try:
                verify_versatiles(dataset, destination, level, pmtiles, active)
            except InvalidPreparedArchive:
                destination.unlink()
            else:
                return destination
        staged = checkpoint / f".reusing-z{level}.pmtiles"
        staged.unlink(missing_ok=True)
        try:
            _run_pmtiles(pmtiles, ["extract", origin, staged, f"--minzoom={level}", f"--maxzoom={level}"], active)
            verify_versatiles(dataset, staged, level, pmtiles, active)
            staged.replace(destination)
            write_state(marker, reused_from)
        finally:
            staged.unlink(missing_ok=True)
    return destination


def prepare_local_archive(asset, origin, source_digest, checkpoint, pmtiles, active, verify):
    destination = checkpoint / asset.filename
    marker = destination.with_suffix(".derived.json")
    provenance = {"sha256": source_digest, "filename": origin.name}
    if read_state(marker, None) == provenance and destination.is_file() and not destination.is_symlink():
        try:
            verify(destination)
            return destination
        except InvalidPreparedArchive:
            pass
    temporary = destination.with_suffix(".extracting.pmtiles")
    temporary.unlink(missing_ok=True)
    try:
        _run_pmtiles(pmtiles, ["extract", origin, temporary, f"--maxzoom={asset.max_zoom}"], active)
        verify(temporary)
        temporary.replace(destination)
        write_state(marker, provenance)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def _marble_retirement_files(output, work, pack, records, verify_digest):
    assets = ORIGINAL_ASSETS[pack]
    if not isinstance(records, list) or [record.get("filename") for record in records] != [asset.filename for asset in assets]:
        raise WorldPackError("The retired Blue Marble archive set could not be verified.")
    checkpoint = work / "world-packs-v1" / pack
    if checkpoint.is_symlink():
        raise WorldPackError("The retired Blue Marble checkpoint is not a local directory.")
    files = {}
    for asset, record in zip(assets, records):
        published = output / asset.filename
        for path in (published, checkpoint / asset.filename):
            try:
                details = path.lstat()
            except FileNotFoundError:
                continue
            if not S_ISREG(details.st_mode) or details.st_size != record["installedBytes"]:
                raise WorldPackError("The retired Blue Marble archive does not match the verified inventory.")
            if verify_digest and not any(
                (stat.st_dev, stat.st_ino) == (details.st_dev, details.st_ino) for stat in files.values()
            ) and digest_file(path, lambda: None) != record["sha256"]:
                raise WorldPackError("The retired Blue Marble archive digest could not be verified.")
            files[path] = details
        # Earlier worker versions kept the original standard JPEGs in this
        # checkpoint after a successful install.
        if pack == "blue-marble":
            source = checkpoint / (Path(asset.filename).stem + ".jpg")
            try:
                details = source.lstat()
            except FileNotFoundError:
                continue
            if not S_ISREG(details.st_mode) or details.st_size != asset.download_bytes:
                raise WorldPackError("The retired Blue Marble JPEG does not match the NASA catalog.")
            files[source] = details
    return files


def purge_retired_blue_marble(output, work, pack, *, after_offline_validation=False):
    """Remove only verified inactive Blue Marble archives and their checkpoint aliases."""
    manifest = output / MANIFEST_NAME
    state = read_manifest(manifest)
    retired = state.get("retiredBlueMarble", {})
    entry = retired.get(pack)
    if not entry:
        return {"removedBytes": 0, "freedDiskBytes": 0}
    if pack not in BLUE_MARBLE_TIERS or pack in state["packs"]:
        raise WorldPackError("The Blue Marble tier must be retired before removing its files.")
    if entry.get("hold") and not (after_offline_validation and BLUE_MARBLE_TIERS.keys() & state["packs"].keys()):
        raise WorldPackError("Validate the replacement Blue Marble package offline first.")
    records = entry.get("archives")
    files = _marble_retirement_files(output, work, pack, records, after_offline_validation)
    inode_files = {}
    for details in files.values():
        inode_files.setdefault((details.st_dev, details.st_ino), []).append(details)
    reclaimed = sum(links[0].st_blocks * 512 for links in inode_files.values() if len(links) == links[0].st_nlink)
    for path in files:
        path.unlink(missing_ok=True)
    retired.pop(pack)
    write_state(manifest, state)
    return {"removedBytes": sum(record["installedBytes"] for record in records), "freedDiskBytes": reclaimed}


class WorldPacks:
    """One recoverable user task can contain multiple complete archive sets."""

    def __init__(self, output, work, pmtiles, free_bytes):
        self.output = output
        self.work = work / "world-packs-v1"
        self.work.mkdir(exist_ok=True)
        self.manifest = output / MANIFEST_NAME
        self.history = self.work / "job.json"
        self.receipts = self.work / "request-receipts"
        self.state_reserve = self.work / ".job-state-reserve"
        self.pmtiles = pmtiles
        self.free_bytes = free_bytes
        self.catalog = world_catalog()
        self.lock = RLock()
        self.queue = Queue()
        self.job = read_state(self.history, None)
        self.replenish_state_reserve()
        self.cleanup_retired_blue_marble()
        self.cleanup_retired_satellite()
        for family in BAND_FAMILIES:
            self.cleanup_retired_bands(family)
        if self.job and self.job["status"] not in TERMINAL:
            if self.job.get("cancelRequested"):
                self.update(status="cancelled", stage="cancelled", message="Download cancelled.")
            elif any(pack not in AVAILABLE for pack in self.job["packIds"]):
                self.update(status="failed", stage="failed", message="The world pack catalog changed.")
            elif self.job["status"] == "paused" or self.job.get("pauseRequested"):
                self.update(status="paused", stage="paused", speedBytesPerSecond=0, message="Ready to resume.")
            else:
                self.update(status="queued", stage="queued", message="Resuming saved files.", speedBytesPerSecond=0)
                self.queue.put_nowait(self.job["id"])
        Thread(target=self.worker, daemon=True).start()

    def manifest_packs(self):
        return read_manifest(self.manifest)["packs"]

    def publish_manifest(self, packs, **metadata):
        write_state(self.manifest, {**read_manifest(self.manifest), "packs": packs, **metadata})

    def installed_records(self, saved):
        result = []
        for entry in self.catalog:
            records = saved.get(entry["id"], [])
            if isinstance(records, list) and len(records) == len(entry["files"]) and all(
                self.archive_matches(name, record) for name, record in zip(entry["files"], records)
            ):
                result.append((entry["id"], records))
        return dict(result)

    def archive_matches(self, name, record):
        path = self.output / name
        try:
            return (isinstance(record, dict) and record.get("filename") == name
                    and not path.is_symlink() and path.is_file() and path.stat().st_size > 0
                    and path.stat().st_size == record.get("installedBytes"))
        except FileNotFoundError:
            return False

    def installed_bands(self, family, installed):
        current = next((zoom for zoom in reversed(family.sizes) if family.pack(zoom) in installed), None)
        return dict(zip(range(family.base, current + 1), installed[family.pack(current)])) if current else {}

    def legacy_topography(self, installed):
        pack = next((name for name in reversed(LEGACY_TOPO) if name in installed), None)
        if pack:
            record = installed[pack][0]
            if (record.get("minzoom") == 9 and record.get("maxzoom") == LEGACY_TOPO[pack]
                    and record.get("format") == "mvt" and record.get("sourceLayer") == TOPOGRAPHY.source_layer
                    and isinstance(record.get("sha256"), str)):
                return record
        return None

    def band_plan(self, family, maximum, bands, legacy=None):
        current = max(bands, default=0)
        missing = range(max(family.base, current + 1), maximum + 1)
        reused = [level for level in missing if legacy and 9 <= level <= legacy["maxzoom"]]
        downloads = [level for level in missing if level not in reused]
        required = additional = reclaim = 0
        resumable = False
        for level in missing:
            size = family.sizes[level]
            checkpoint = self.work / family.pack(level)
            stem = family.dataset.stem
            raw = physical_size(checkpoint / f"{stem}.versatiles")
            partial = physical_size(checkpoint / f"{stem}.versatiles.part")
            converted = physical_size(checkpoint / family.filename(level))
            resumable |= bool(raw or partial or converted)
            remaining = max(0, size - max(raw, partial)) if level in downloads else 0
            additional += remaining
            required += remaining + max(0, family.preparation_bytes(size) - converted)
        for level, record in bands.items():
            if level > maximum:
                reclaim += record["installedBytes"]
        operation = "downgrade" if current > maximum else "upgrade" if current else "migrate" if reused else "install"
        return {"operation": operation, "downloads": downloads, "reused": reused,
                "additionalDownloadBytes": additional, "requiredFreeBytes": required + (WORK_RESERVE if required else 0),
                "reclaimBytes": reclaim, "resumable": resumable}

    def active_blue_marble(self, installed):
        return next((name for name in reversed(BLUE_MARBLE_TIERS) if name in installed), None)

    def active_satellite(self, installed):
        return next((name for name in reversed(SATELLITE_TIERS) if name in installed), None)

    def satellite_plan(self, pack, current, installed):
        asset = ASSETS[pack][0]
        estimate = asset.download_bytes
        checkpoint = self.work / pack
        if pack == current:
            return {"operation": "install", "additionalDownloadBytes": 0, "requiredFreeBytes": 0,
                    "reclaimBytes": 0, "resumable": False}
        if current and SATELLITE_TIERS[pack] < SATELLITE_TIERS[current]:
            prepared = physical_size(checkpoint / "local-reduction" / asset.filename)
            return {"operation": "downgrade", "additionalDownloadBytes": 0,
                    "requiredFreeBytes": max(0, estimate - prepared) + WORK_RESERVE,
                    "reclaimBytes": max(0, installed[current][0]["installedBytes"] - estimate),
                    "resumable": bool(prepared)}

        marker = _resume_metadata(checkpoint / "satellite.resume.json")
        source = checkpoint / "satellite.versatiles"
        source_ready = valid_source(source, marker)
        # Partial VersaTiles containers are sparse. Their apparent size already
        # includes pending ranges, so estimate recovery from allocated bytes.
        partial_path = checkpoint / "satellite.versatiles.part"
        partial = physical_size(partial_path) if valid_source(partial_path, marker) else 0
        prepared = physical_size(checkpoint / asset.filename)
        remaining = 0 if source_ready else max(1, (marker["size"] if partial else estimate) - partial)
        return {"operation": "upgrade" if current else "install", "additionalDownloadBytes": remaining,
                "requiredFreeBytes": remaining + max(0, estimate - prepared) + WORK_RESERVE,
                "reclaimBytes": 0, "resumable": bool(source_ready or partial or prepared)}

    def blue_marble_plan(self, pack, current, installed):
        from world_provider import marble_downloaded_bytes

        zoom, _, estimate, scratch = BLUE_MARBLE_TIERS[pack]
        current_zoom = BLUE_MARBLE_TIERS[current][0] if current else -1
        if pack == current:
            return {"operation": "install", "additionalDownloadBytes": 0, "requiredFreeBytes": 0,
                    "reclaimBytes": 0, "resumable": False}
        assets = ORIGINAL_ASSETS[pack]
        checkpoint = self.work / pack
        prepared = sum(physical_size(checkpoint / asset.filename) for asset in assets)
        if zoom < current_zoom:
            current_bytes = sum(record["installedBytes"] for record in installed[current])
            return {"operation": "downgrade", "additionalDownloadBytes": 0,
                    "requiredFreeBytes": max(0, estimate - prepared) + WORK_RESERVE,
                    "reclaimBytes": max(0, current_bytes - estimate), "resumable": bool(prepared)}
        downloaded = sum(marble_downloaded_bytes(asset, checkpoint) for asset in assets)
        return {"operation": "upgrade" if current else "install",
                "additionalDownloadBytes": max(0, sum(asset.download_bytes for asset in assets) - downloaded),
                "requiredFreeBytes": max(0, estimate - prepared) + scratch,
                "reclaimBytes": 0, "resumable": bool(downloaded or prepared)}

    def inventory(self):
        known = self.installed_records(self.manifest_packs())
        bands_by_role = {family.role: self.installed_bands(family, known) for family in BAND_FAMILIES}
        legacy = self.legacy_topography(known)
        marble = self.active_blue_marble(known)
        satellite = self.active_satellite(known)
        result = []
        for entry in self.catalog:
            pack = entry["id"]
            archives = [] if pack in SATELLITE_TIERS and pack != satellite else known.get(pack, [])
            item = {key: value for key, value in entry.items() if key != "files"}
            item["installed"] = bool(archives)
            if archives:
                item.update(installedBytes=sum(archive["installedBytes"] for archive in archives), archives=archives)
            if pack in BANDED_PACKS:
                family, maximum = BANDED_PACKS[pack]
                bands = bands_by_role[family.role]
                plan = self.band_plan(family, maximum, bands, legacy if family is EARTH else None)
                item.update(covered=maximum < max(bands, default=0), **{key: plan[key] for key in (
                    "additionalDownloadBytes", "requiredFreeBytes", "reclaimBytes", "resumable",
                )})
            if pack in BLUE_MARBLE_TIERS:
                plan = self.blue_marble_plan(pack, marble, known)
                item.update(covered=plan["operation"] == "downgrade", **{key: plan[key] for key in (
                    "additionalDownloadBytes", "requiredFreeBytes", "reclaimBytes", "resumable",
                )})
            if pack in SATELLITE_TIERS:
                plan = self.satellite_plan(pack, satellite, known)
                item.update(covered=plan["operation"] == "downgrade", **{key: plan[key] for key in (
                    "additionalDownloadBytes", "requiredFreeBytes", "reclaimBytes", "resumable",
                )})
            result.append(item)
        return result

    def snapshot(self):
        with self.lock:
            return {"packs": self.inventory(), "job": dict(self.job) if self.job else None,
                    "freeBytes": self.free_bytes(), "canPause": True}

    def update(self, *, persist=True, **fields):
        with self.lock:
            self.job.update(**fields, updatedAt=timestamp())
            if persist:
                self.persist_job()

    def replenish_state_reserve(self):
        # A small preallocated file buys room for a terminal state write on a
        # full filesystem. Memory remains authoritative if even that fails.
        try:
            if self.state_reserve.exists() or self.free_bytes() < WORK_RESERVE:
                return
            with self.state_reserve.open("xb") as handle:
                try:
                    os.posix_fallocate(handle.fileno(), 0, JOB_STATE_RESERVE)
                    os.fsync(handle.fileno())
                except OSError:
                    self.state_reserve.unlink(missing_ok=True)
                    raise
        except OSError:
            pass

    def persist_job(self, *, required=False):
        previously_unavailable = self.job.pop("stateWriteFailed", False)
        try:
            try:
                write_state(self.history, self.job)
            except OSError as error:
                if error.errno not in DISK_FULL:
                    raise
                self.state_reserve.unlink(missing_ok=True)
                write_state(self.history, self.job)
        except OSError as error:
            self.job["stateWriteFailed"] = True
            if not previously_unavailable:
                print(f"World map job state: {error}", flush=True)
            if required:
                raise WorldPackError("The task could not be saved. Free disk space or check the map storage.") from error
        else:
            self.replenish_state_reserve()

    def submit(self, pack_ids, request_id=None):
        with self.lock:
            if (not isinstance(pack_ids, list) or not pack_ids or len(pack_ids) > len(AVAILABLE)
                    or any(not isinstance(pack, str) or pack not in AVAILABLE for pack in pack_ids)):
                raise WorldPackError("Choose at least one available world map pack.")
            selected_bands = BANDED_PACKS.keys() & set(pack_ids)
            if selected_bands and len(pack_ids) != 1:
                raise WorldPackError("Choose one world map zoom level at a time.")
            selected_blue_marble = BLUE_MARBLE_TIERS.keys() & set(pack_ids)
            if selected_blue_marble and len(pack_ids) != 1:
                raise WorldPackError("Choose one Blue Marble resolution at a time.")
            if SATELLITE_TIERS.keys() & set(pack_ids) and len(pack_ids) != 1:
                raise WorldPackError("Choose one maximum zoom for the worldwide satellite map.")
            if request_id is not None:
                if not isinstance(request_id, str) or not re.fullmatch(r"[a-f0-9]{32}", request_id):
                    raise WorldPackError("The request ID must contain 32 lowercase hexadecimal characters.")
                receipt = (self.job if self.job and self.job["id"] == request_id
                           else read_state(self.receipts / f"{request_id}.json", None))
                if receipt is not None:
                    if receipt["packIds"] != pack_ids:
                        raise WorldPackError("That request ID already belongs to a different world map selection.")
                    return {"job": dict(receipt), "skipped": receipt.get("skipped", False)}
                if self.job and self.job["status"] not in TERMINAL:
                    raise WorldPackError("A different world map task is already active.")
            installed = self.installed_records(self.manifest_packs())
            if selected_bands:
                return self.submit_bands(pack_ids[0], installed, request_id)
            if selected_blue_marble:
                return self.submit_blue_marble(pack_ids[0], installed, request_id)
            return self.submit_satellite(pack_ids[0], installed, request_id)

    def submit_satellite(self, pack, installed, request_id=None):
        if self.job and self.job["status"] not in TERMINAL:
            if self.job["packIds"] == [pack]:
                return {"job": dict(self.job)}
            raise WorldPackError("A world map task is already active.")
        current = self.active_satellite(installed)
        if pack == current:
            return self.already_installed(pack, request_id)
        plan = self.satellite_plan(pack, current, installed)
        if self.free_bytes() < plan["requiredFreeBytes"]:
            raise WorldPackError("Free disk space for the satellite map and temporary preparation files.")
        total = 0 if plan["operation"] == "downgrade" else ASSETS[pack][0].download_bytes
        return self.enqueue([pack], total, request_id=request_id, operation=plan["operation"])

    def submit_blue_marble(self, pack, installed, request_id=None):
        if self.job and self.job["status"] not in TERMINAL:
            if self.job["packIds"] == [pack]:
                return {"job": dict(self.job)}
            raise WorldPackError("A world map task is already active.")
        current = self.active_blue_marble(installed)
        if pack == current:
            return self.already_installed(pack, request_id)
        plan = self.blue_marble_plan(pack, current, installed)
        if self.free_bytes() < plan["requiredFreeBytes"]:
            raise WorldPackError("Free disk space to prepare this Blue Marble resolution.")
        total = 0 if plan["operation"] == "downgrade" else sum(asset.download_bytes for asset in ORIGINAL_ASSETS[pack])
        return self.enqueue([pack], total, request_id=request_id, operation=plan["operation"])

    def submit_bands(self, pack, installed, request_id=None):
        if self.job and self.job["status"] not in TERMINAL:
            if self.job["packIds"] == [pack]:
                return {"job": dict(self.job)}
            raise WorldPackError("A world map task is already active.")
        if pack in installed:
            return self.already_installed(pack, request_id)
        family, maximum = BANDED_PACKS[pack]
        legacy = self.legacy_topography(installed) if family is EARTH else None
        plan = self.band_plan(family, maximum, self.installed_bands(family, installed), legacy)
        if self.free_bytes() < plan["requiredFreeBytes"]:
            raise WorldPackError(f"Free disk space to prepare this {family.title} level.")
        return self.enqueue([pack], sum(family.sizes[level] for level in plan["downloads"]),
                            request_id=request_id, operation=plan["operation"], reusedZooms=plan["reused"])

    def save_receipt(self, job):
        try:
            self.receipts.mkdir(exist_ok=True)
            write_state(self.receipts / (job["requestId"] + ".json"), job)
        except OSError as error:
            raise WorldPackError("The task receipt could not be saved. Check the map storage.") from error

    def already_installed(self, pack, request_id):
        if request_id is None:
            return {"job": None, "skipped": True}
        job = {
            "id": request_id, "requestId": request_id, "packIds": [pack], "status": "completed", "stage": "ready",
            "bytesDownloaded": 0, "completedMonths": 12 if pack in BLUE_MARBLE_TIERS else 0,
            "totalBytes": 0, "speedBytesPerSecond": 0, "message": "Already installed.",
            "createdAt": timestamp(), "updatedAt": timestamp(), "skipped": True,
        }
        self.save_receipt(job)
        return {"job": job, "skipped": True}

    def enqueue(self, selected, total, *, request_id=None, **fields):
        previous = self.job
        if previous and previous.get("requestId"):
            self.save_receipt(previous)
        self.job = {
            "id": request_id or uuid4().hex, "packIds": selected, "status": "queued", "stage": "queued",
            "bytesDownloaded": 0, "completedMonths": 0, "totalBytes": total, "speedBytesPerSecond": 0,
            "message": "Waiting to start.", "createdAt": timestamp(), "updatedAt": timestamp(), **fields,
        }
        if request_id is not None:
            self.job["requestId"] = request_id
        try:
            self.persist_job(required=True)
        except WorldPackError:
            self.job = previous
            raise
        self.queue.put_nowait(self.job["id"])
        return {"job": dict(self.job)}

    def remove(self, pack):
        with self.lock:
            if not isinstance(pack, str) or pack not in BANDED_PACKS.keys() | BLUE_MARBLE_TIERS.keys() | SATELLITE_TIERS.keys():
                raise WorldPackError("Select an installed world map tier.")
            if self.job and self.job["status"] not in TERMINAL:
                raise WorldPackError("Finish or cancel the active world map task first.")
            saved = self.manifest_packs()
            installed = self.installed_records(saved)
            if pack in SATELLITE_TIERS:
                if pack != self.active_satellite(installed):
                    raise WorldPackError("Satellite changed. Refresh the installed level and try again.")
                return self.replace_satellite(saved, installed, None)
            if pack in BLUE_MARBLE_TIERS:
                if pack != self.active_blue_marble(installed):
                    raise WorldPackError("Blue Marble changed. Refresh the installed resolution and try again.")
                return self.replace_blue_marble(saved, pack, preserve_legacy=False)
            family, maximum = BANDED_PACKS[pack]
            bands = self.installed_bands(family, installed)
            if pack not in installed or max(bands, default=0) != maximum:
                raise WorldPackError(f"{family.title} changed. Refresh the installed level and try again.")
            retired = self.replace_bands(family, saved, bands, {})
            return {"removed": True, "removedBytes": sum(record["installedBytes"] for record in retired.values())}

    def replace_bands(self, family, saved, previous, next_bands, *, retire_legacy=False):
        retired = read_manifest(self.manifest).get(family.retirement_key, {})
        for zoom in family.sizes:
            saved.pop(family.pack(zoom), None)
        if next_bands:
            highest = max(next_bands)
            saved[family.pack(highest)] = [next_bands[level] for level in range(family.base, highest + 1)]
        if retire_legacy:
            for pack in LEGACY_TOPO.keys() & saved.keys():
                # Keep the source file until the new maps have been verified after a restart.
                saved.pop(pack)
        for level, record in previous.items():
            if level not in next_bands:
                retired[family.pack(level)] = record
        for level in next_bands:
            retired.pop(family.pack(level), None)
        self.publish_manifest(saved, **{family.retirement_key: retired})
        return self.cleanup_retired_bands(family)

    def cleanup_retired_bands(self, family):
        state = read_manifest(self.manifest)
        retired = state.get(family.retirement_key, {})
        releases = {family.pack(zoom): zoom for zoom in family.sizes}
        active_names = {
            record.get("filename") for pack, records in state["packs"].items()
            if pack in releases and isinstance(records, list)
            for record in records if isinstance(record, dict)
        }
        cleared = {}
        for pack, record in retired.items():
            level = releases.get(pack)
            if level is None or not isinstance(record, dict):
                continue
            filename = family.filename(level)
            if record.get("filename") != filename or filename in active_names:
                continue
            path = self.output / filename
            try:
                if (path.exists() or path.is_symlink()) and not self.archive_matches(filename, record):
                    raise WorldPackError(f"The retired archive does not match the {family.title} inventory.")
                self.clear_band_checkpoint(family, level)
                path.unlink(missing_ok=True)
                cleared[pack] = record
            except (OSError, WorldPackError) as error:
                print(f"{family.title} retirement {pack}: {error}", flush=True)
        if cleared:
            for pack in cleared:
                retired.pop(pack)
            try:
                write_state(self.manifest, state)
            except OSError as error:
                # The removal is already safe. Leave the durable ledger for
                # the next start if this compaction cannot be saved.
                print(f"{family.title} retirement ledger: {error}", flush=True)
        return cleared

    def clear_band_checkpoint(self, family, level):
        checkpoint = self.work / family.pack(level)
        if checkpoint.is_symlink():
            raise WorldPackError(f"The {family.title} checkpoint is not a local directory.")
        stem = family.dataset.stem
        for name in (family.filename(level), f"{stem}.versatiles", f"{stem}.versatiles.part",
                     f"{stem}.resume.json", "legacy-reuse.json"):
            (checkpoint / name).unlink(missing_ok=True)

    def clear_satellite_checkpoint(self, pack, local):
        checkpoint = self.work / pack
        if checkpoint.is_symlink():
            return
        filename = ASSETS[pack][0].filename
        if local:
            checkpoint = checkpoint / "local-reduction"
            names = (filename, Path(filename).with_suffix(".derived.json").name)
        else:
            names = (filename, "satellite.versatiles", "satellite.resume.json")
        if not checkpoint.is_symlink():
            for name in names:
                (checkpoint / name).unlink(missing_ok=True)

    def cleanup_retired_satellite(self):
        state = read_manifest(self.manifest)
        retired = state.get("retiredSatellite", {})
        removed = freed = 0
        cleared = []
        for pack, record in retired.items():
            if pack not in SATELLITE_TIERS or pack in state["packs"] or not isinstance(record, dict):
                continue
            filename = ASSETS[pack][0].filename
            if record.get("filename") != filename:
                continue
            path = self.output / filename
            try:
                try:
                    details = path.lstat()
                except FileNotFoundError:
                    cleared.append(pack)
                    continue
                if not S_ISREG(details.st_mode) or details.st_size != record.get("installedBytes"):
                    raise WorldPackError("The retired archive does not match the satellite inventory.")
                aliases = [path]
                checkpoint = self.work / pack
                for directory in (checkpoint, checkpoint / "local-reduction"):
                    if checkpoint.is_symlink() or directory.is_symlink():
                        continue
                    alias = directory / filename
                    try:
                        candidate = alias.lstat()
                    except FileNotFoundError:
                        continue
                    if (candidate.st_dev, candidate.st_ino) == (details.st_dev, details.st_ino):
                        aliases.insert(0, alias)
                for alias in aliases:
                    alias.unlink(missing_ok=True)
                cleared.append(pack)
                removed += details.st_size
                if details.st_nlink == len(aliases):
                    freed += details.st_blocks * 512
            except (OSError, WorldPackError) as error:
                print(f"Satellite retirement {pack}: {error}", flush=True)
        if cleared:
            for pack in cleared:
                retired.pop(pack)
            try:
                write_state(self.manifest, state)
            except OSError as error:
                print(f"Satellite retirement ledger: {error}", flush=True)
        return {"removedBytes": removed, "freedDiskBytes": freed}

    def replace_satellite(self, saved, installed, pack, record=None):
        retired = read_manifest(self.manifest).get("retiredSatellite", {})
        for previous in SATELLITE_TIERS.keys() & saved.keys() - {pack}:
            saved.pop(previous)
            if previous in installed:
                retired[previous] = installed[previous][0]
        if pack:
            saved[pack] = [record]
            retired.pop(pack, None)
        self.publish_manifest(saved, retiredSatellite=retired)
        return {"removed": pack is None, **self.cleanup_retired_satellite()}

    def clear_blue_marble_checkpoint(self, pack):
        checkpoint = self.work / pack
        for asset in ORIGINAL_ASSETS[pack]:
            ready = checkpoint / asset.filename
            ready.unlink(missing_ok=True)
            ready.with_suffix(".derived.json").unlink(missing_ok=True)

    def cleanup_retired_blue_marble(self):
        summary = {"removedBytes": 0, "freedDiskBytes": 0}
        for pack, entry in read_manifest(self.manifest).get("retiredBlueMarble", {}).items():
            if entry.get("hold"):
                continue
            try:
                cleared = purge_retired_blue_marble(self.output, self.work.parent, pack)
            except (OSError, WorldPackError) as error:
                print(f"Blue Marble retirement {pack}: {error}", flush=True)
                continue
            for key in summary:
                summary[key] += cleared[key]
        return summary

    def replace_blue_marble(self, saved, previous, pack=None, verified=(), *, preserve_legacy=True):
        retired = read_manifest(self.manifest).get("retiredBlueMarble", {})
        if previous:
            archives = saved.pop(previous)
            hold = preserve_legacy and previous == "blue-marble" and all(
                not archive.get("source") for archive in archives
            )
            retired[previous] = {"archives": archives, "hold": hold}
        if pack:
            retired.pop(pack, None)
            records = []
            for source, record in verified:
                destination = self.output / record["filename"]
                # A previous interrupted publication may have left an inactive
                # file at this tier's canonical path. Keep the active pack's
                # differently named archive set untouched until commit.
                stage = destination.with_name(f".{destination.name}.{uuid4().hex}.partial")
                try:
                    os.link(source, stage, follow_symlinks=False)
                    stage.replace(destination)
                finally:
                    stage.unlink(missing_ok=True)
                records.append(record)
            saved[pack] = records
        self.publish_manifest(saved, retiredBlueMarble=retired)

        if pack:
            self.clear_blue_marble_checkpoint(pack)
        result = self.cleanup_retired_blue_marble()
        return {"removed": bool(previous and not pack), **result}

    def run_blue_marble(self, pack, active):
        from world_provider import stage_blue_marble_month

        with self.lock:
            saved = self.manifest_packs()
            installed = self.installed_records(saved)
            current = self.active_blue_marble(installed)
            if pack == current:
                self.clear_blue_marble_checkpoint(pack)
                self.update(status="completed", stage="ready", completedMonths=12,
                            message="Ready offline.", speedBytesPerSecond=0)
                return
            plan = self.blue_marble_plan(pack, current, installed)
            if self.free_bytes() < plan["requiredFreeBytes"]:
                raise WorldPackError("Free disk space to prepare this Blue Marble resolution.")
            local = plan["operation"] == "downgrade"
            assets = ORIGINAL_ASSETS[pack]
            self.update(status="running", stage="preparing",
                        operation=plan["operation"], message="Preparing Blue Marble.",
                        completedMonths=0, bytesDownloaded=0, speedBytesPerSecond=0,
                        totalBytes=0 if local else sum(asset.download_bytes for asset in assets))

        received = 0
        verified = []
        source_records = {record["month"]: record for record in installed[current]} if local else {}
        checkpoint = self.work / pack
        checkpoint.mkdir(exist_ok=True)
        for asset in assets:
            active()
            description = f"Blue Marble 2004 · {asset.month:02d}"
            self.update(currentMonth=asset.month, stage="preparing" if local else "downloading",
                        message=f"Preparing {description}." if local else f"Downloading {description}.")
            if local:
                prior = source_records[asset.month]
                origin = self.output / prior["filename"]
                if digest_file(origin, active) != prior["sha256"]:
                    raise WorldPackError("The installed Blue Marble archive could not be verified for reuse.")
                ready = prepare_local_archive(
                    asset, origin, prior["sha256"], checkpoint, self.pmtiles, active,
                    lambda path: _verify_archive(path, asset, self.pmtiles, active),
                )
                provenance = {
                    "source": "local-reduction", "reusedFrom": origin.name, "sourceSha256": prior["sha256"],
                    "sourceMetersPerPixel": prior.get("sourceMetersPerPixel", BLUE_MARBLE_TIERS[current][1]),
                }
            else:
                previous = None
                position = time.monotonic()

                def progress(value):
                    nonlocal previous, position
                    active()
                    now = time.monotonic()
                    delta = now - position
                    if previous is None or delta >= 0.5:
                        speed = max(0, int((value - previous) / delta)) if previous is not None else 0
                        self.update(persist=False, bytesDownloaded=received + value, speedBytesPerSecond=speed)
                        position, previous = now, value

                def preparing():
                    self.update(stage="preparing", message=f"Preparing {description}.",
                                bytesDownloaded=received + asset.download_bytes, speedBytesPerSecond=0)

                ready = stage_blue_marble_month(asset, checkpoint, self.pmtiles, active, progress, preparing)
                received += asset.download_bytes
                provenance = {"source": "nasa-monthly", "sourceBytes": asset.download_bytes,
                              "sourceFiles": [{"url": original.url, "bytes": original.download_bytes}
                                              for original in asset.sources],
                              "sourceMetersPerPixel": BLUE_MARBLE_TIERS[pack][1]}

            if ready != checkpoint / asset.filename or ready.is_symlink() or not ready.is_file():
                raise WorldPackError("Blue Marble preparation did not return a safe local file.")
            with ready.open("rb") as archive:
                os.fsync(archive.fileno())
            record = {
                "filename": ready.name, "installedBytes": ready.stat().st_size, "sha256": digest_file(ready, active),
                "bounds": MERCATOR_BOUNDS, "minzoom": 0, "maxzoom": asset.max_zoom, "tileSize": asset.tile_size,
                "format": "jpeg", "attribution": asset.attribution, "sourceUrl": MARBLE_PAGE,
                "month": asset.month, **provenance,
            }
            verified.append((ready, record))
            self.update(completedMonths=len(verified), bytesDownloaded=received, speedBytesPerSecond=0)

        with self.lock:
            active()
            self.update(stage="verifying", message="Publishing all 12 verified Blue Marble months.")
            self.replace_blue_marble(saved, current, pack, verified)
            self.update(status="completed", stage="ready", message="Ready offline.", currentMonth=None,
                        completedMonths=len(verified), bytesDownloaded=received, speedBytesPerSecond=0)

    def run_bands(self, pack, active):
        family, target = BANDED_PACKS[pack]
        with self.lock:
            saved = self.manifest_packs()
            installed = self.installed_records(saved)
            bands = self.installed_bands(family, installed)
            if pack in installed:
                for level in bands:
                    self.clear_band_checkpoint(family, level)
                self.update(status="completed", stage="ready", message="Ready offline.", speedBytesPerSecond=0)
                return
            legacy = self.legacy_topography(installed) if family is EARTH else None
            plan = self.band_plan(family, target, bands, legacy)
            if self.free_bytes() < plan["requiredFreeBytes"]:
                raise WorldPackError(f"Free disk space to prepare this {family.title} level.")
            self.update(status="running", stage="preparing", message=f"Preparing {family.title}.",
                        operation=plan["operation"], reusedZooms=plan["reused"])

        next_bands = {level: record for level, record in bands.items() if level <= target}
        if plan["reused"]:
            self.update(stage="verifying", message="Checking the existing VersaTiles archive.")
            if digest_file(self.output / legacy["filename"], active) != legacy["sha256"]:
                raise WorldPackError("The existing VersaTiles archive could not be verified for reuse.")
        expected_total = sum(family.sizes[level] for level in plan["downloads"])
        received = 0
        prepared = {}
        for level in sorted(plan["downloads"] + plan["reused"]):
            active()
            checkpoint = self.work / family.pack(level)
            if checkpoint.is_symlink():
                raise WorldPackError(f"The {family.title} checkpoint is not a local directory.")
            checkpoint.mkdir(exist_ok=True)
            dataset = family.dataset_for(level)
            filename = family.filename(level)
            span = f"0–{family.base}" if level == family.base else str(level)
            if level in plan["reused"]:
                self.update(stage="preparing", message=f"Reusing installed {family.title} zoom {span}.")
                origin = self.output / legacy["filename"]
                ready = prepare_local_band(level, origin, legacy["sha256"], checkpoint, self.pmtiles, active)
                provenance = {"source": "legacy-local", "reusedFrom": origin.name, "sourceSha256": legacy["sha256"]}
            else:
                self.update(stage="downloading", message=f"Downloading {family.title} zoom {span}.")
                previous = None
                position = time.monotonic()
                band_total = family.sizes[level]

                def progress(value):
                    nonlocal previous, position
                    active()
                    now = time.monotonic()
                    delta = now - position
                    if previous is None or delta >= 0.5:
                        speed = int(max(0, value - previous) / delta) if previous is not None else 0
                        self.update(persist=False, bytesDownloaded=received + value, speedBytesPerSecond=speed)
                        position, previous = now, value

                def exact_total(value):
                    nonlocal expected_total, band_total
                    expected_total += value - band_total
                    band_total = value
                    self.update(totalBytes=expected_total)

                def preparing(size):
                    self.update(stage="preparing", message=f"Preparing {family.title} zoom {span}.",
                                bytesDownloaded=received + size, speedBytesPerSecond=0)

                ready, source_size = self.download_versatiles(
                    dataset, level, checkpoint, filename, active, progress, exact_total, preparing,
                )
                received += source_size
                provenance = versatiles_provenance(dataset, checkpoint, source_size)

            if ready.is_symlink() or not ready.is_file() or ready != checkpoint / filename:
                raise WorldPackError(f"{family.title} preparation did not return a safe local file.")
            with ready.open("rb") as archive:
                os.fsync(archive.fileno())
            next_bands[level] = {
                "filename": ready.name, "installedBytes": ready.stat().st_size, "sha256": digest_file(ready, active),
                "bounds": MERCATOR_BOUNDS, "minzoom": dataset.min_zoom, "maxzoom": level, "tileSize": 512,
                "format": "mvt" if dataset.source_layer else "webp",
                "attribution": family.attribution, "sourceUrl": family.page, **provenance,
            }
            if dataset.source_layer:
                next_bands[level]["sourceLayer"] = dataset.source_layer
            if dataset.encoding:
                next_bands[level]["encoding"] = dataset.encoding
            prepared[level] = ready

        with self.lock:
            active()
            self.update(stage="verifying", message=f"Publishing verified {family.title}.")
            for level, source in prepared.items():
                record = next_bands[level]
                destination = self.output / record["filename"]
                try:
                    os.link(source, destination, follow_symlinks=False)
                except FileExistsError:
                    if not self.archive_matches(record["filename"], record) or digest_file(destination, active) != record["sha256"]:
                        raise WorldPackError(f"An existing {family.title} file could not be verified.")
            self.replace_bands(family, saved, bands, next_bands, retire_legacy=family is EARTH)
            for level in prepared:
                self.clear_band_checkpoint(family, level)
            self.update(status="completed", stage="ready", message="Ready offline.", bytesDownloaded=received,
                        totalBytes=expected_total, speedBytesPerSecond=0)

    def cancel(self, job_id):
        with self.lock:
            if not self.job or self.job["id"] != job_id or self.job["status"] in TERMINAL:
                raise WorldPackError("Choose an active world map download.")
            if self.job["status"] == "paused":
                self.update(status="cancelled", stage="cancelled", message="Download cancelled. Saved files can be reused.")
            else:
                self.update(cancelRequested=True, message="Cancelling. Downloaded data will be kept for retry.")
            return {"job": dict(self.job)}

    def discard(self, job_id):
        import fcntl

        with self.lock, ExitStack() as handles:
            if not self.job or self.job["id"] != job_id or self.job["status"] not in {"failed", "cancelled", "discarded"}:
                raise WorldPackError("Choose a failed or cancelled world map task to discard its saved files.")
            if self.job["status"] == "discarded":
                return {"job": dict(self.job), "removedBytes": 0, "freedDiskBytes": 0}

            candidates = set()
            for pack in self.job["packIds"]:
                candidates.update(self.discard_paths(pack))
            details = {}
            for path in sorted(candidates):
                for parent in path.parents:
                    if parent == self.work:
                        break
                    if parent.is_symlink():
                        raise WorldPackError("The task checkpoint is not a local directory.")
                try:
                    info = path.lstat()
                except FileNotFoundError:
                    continue
                if not S_ISREG(info.st_mode):
                    raise WorldPackError("The task checkpoint must use local regular files.")
                if path.suffix == ".lock":
                    handle = handles.enter_context(path.open("rb"))
                    try:
                        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError as error:
                        raise WorldPackError("Preparation still holds this checkpoint. Try again after it stops.") from error
                    continue
                details[path] = info

            inodes = {}
            for path, info in details.items():
                path.unlink()
                inodes.setdefault((info.st_dev, info.st_ino), []).append(info)
            freed = sum(group[0].st_blocks * 512 for group in inodes.values() if group[0].st_nlink == len(group))
            self.update(status="discarded", stage="discarded", speedBytesPerSecond=0,
                        message="Saved preparation files were discarded.")
            return {"job": dict(self.job), "removedBytes": sum(info.st_size for info in details.values()),
                    "freedDiskBytes": freed}

    def discard_paths(self, pack):
        def converted(folder, filename, stem):
            base = folder / filename
            staged = base.with_name(f".{base.stem}.preparing.pmtiles")
            return {
                base, staged, staged.with_name(f"{staged.stem}.incomplete.pmtiles"),
                *(folder / f"{stem}{suffix}" for suffix in (
                    ".versatiles", ".versatiles.part", ".resume.json", ".resume.pending", ".lock", "-convert.lock",
                )),
            }

        folder = self.work / pack
        if pack in SATELLITE_TIERS:
            filename = ASSETS[pack][0].filename
            files = converted(folder, filename, "satellite")
            local = folder / "local-reduction" / filename
            return files | {local, local.with_suffix(".extracting.pmtiles"), local.with_suffix(".derived.json")}
        if pack in BANDED_PACKS:
            family, maximum = BANDED_PACKS[pack]
            active_bands = self.installed_bands(family, self.installed_records(self.manifest_packs()))
            files = set()
            for level in range(family.base, maximum + 1):
                if level in active_bands:
                    continue
                folder = self.work / family.pack(level)
                files.update(converted(folder, family.filename(level), family.dataset.stem))
                if family is EARTH:
                    files.update(folder / name for name in (
                        "legacy-reuse.lock", "legacy-reuse.json", f".reusing-z{level}.pmtiles",
                    ))
            return files
        if pack in BLUE_MARBLE_TIERS:
            files = set()
            for asset in ORIGINAL_ASSETS[pack]:
                ready = folder / asset.filename
                files.add(ready)
                files.update(ready.with_suffix(suffix) for suffix in (
                    ".extracting.pmtiles", ".derived.json", ".mbtiles", ".preparing.pmtiles", ".mosaic.vrt",
                ))
                files.update(ready.with_suffix(f".mosaic-{factor}.vrt") for _, factor in DETAIL_VRT_LEVELS)
                for index, source in enumerate(asset.sources):
                    files.add(ready.with_suffix(f".source-{index}.tif"))
                    files.update(folder / (source.filename + suffix) for suffix in ("", ".part", ".resume", ".pending"))
            return files
        raise WorldPackError("The task has an unknown world map pack.")

    def pause(self, job_id):
        with self.lock:
            if (not self.job or self.job["id"] != job_id or self.job["status"] not in {"queued", "running"}
                    or self.job.get("cancelRequested")):
                raise WorldPackError("Choose an active world map download.")
            self.update(pauseRequested=True, message="Pausing at a checkpoint.")
            return {"job": dict(self.job)}

    def resume(self, job_id):
        with self.lock:
            if not self.job or self.job["id"] != job_id or self.job["status"] != "paused":
                raise WorldPackError("Choose a paused world map download.")
            self.update(status="queued", stage="queued", pauseRequested=False, message="Resuming saved files.")
            self.queue.put_nowait(job_id)
            return {"job": dict(self.job)}

    def retry(self, job_id):
        with self.lock:
            if not self.job or self.job["id"] != job_id or self.job["status"] not in {"failed", "cancelled"}:
                raise WorldPackError("Choose a failed or cancelled world map download to retry.")
            return self.submit(self.job["packIds"])

    def ensure_active(self, job_id):
        with self.lock:
            if not self.job or self.job["id"] != job_id or self.job.get("cancelRequested"):
                raise WorldPackCancelled()
            if self.job.get("pauseRequested"):
                raise WorldPackPaused()

    def worker(self):
        while True:
            job_id = self.queue.get()
            try:
                self.run(job_id)
            except WorldPackCancelled:
                self.update(status="cancelled", stage="cancelled", speedBytesPerSecond=0,
                            message="Download cancelled. Ready files are saved for retry.")
            except WorldPackPaused:
                with self.lock:
                    if self.job.get("cancelRequested"):
                        self.update(status="cancelled", stage="cancelled", speedBytesPerSecond=0,
                                    message="Download cancelled. Saved files can be reused.")
                    else:
                        self.update(status="paused", stage="paused", speedBytesPerSecond=0,
                                    message="Ready to resume.")
            except (WorldPackError, WorldAssetError) as error:
                self.update(status="failed", stage="failed", speedBytesPerSecond=0, message=str(error))
            except OSError as error:
                message = ("Free disk space is insufficient. Discard saved files or free space before retrying."
                           if error.errno in DISK_FULL else "Map storage could not be accessed. Check available storage and retry.")
                print(f"World map storage {job_id}: {error}", flush=True)
                self.update(status="failed", stage="failed", speedBytesPerSecond=0, message=message)
            except Exception as error:
                print(f"World maps {job_id}: {type(error).__name__}: {error}", flush=True)
                self.update(status="failed", stage="failed", speedBytesPerSecond=0,
                            message="A world map could not be downloaded or prepared. Retry to resume.")
            finally:
                self.queue.task_done()

    def run(self, job_id):
        checked_at = 0.0

        def active():
            nonlocal checked_at
            self.ensure_active(job_id)
            now = time.monotonic()
            if now - checked_at >= 1:
                checked_at = now
                if self.free_bytes() < WORK_RESERVE:
                    raise WorldPackError("Free disk space is insufficient to continue. Discard saved files or free space.")

        active()
        with self.lock:
            selected = tuple(self.job["packIds"])
        if any(pack in BANDED_PACKS for pack in selected):
            self.run_bands(selected[0], active)
            return
        if any(pack in BLUE_MARBLE_TIERS for pack in selected):
            if len(selected) != 1:
                raise WorldPackError("Choose one Blue Marble resolution at a time.")
            self.run_blue_marble(selected[0], active)
            return
        self.run_satellite(selected[0], active)

    def run_satellite(self, pack, active):
        _, page, zoom, _ = VERSA_PACKS[pack]
        asset = ASSETS[pack][0]
        with self.lock:
            saved = self.manifest_packs()
            installed = self.installed_records(saved)
            current = self.active_satellite(installed)
            if pack == current:
                self.clear_satellite_checkpoint(pack, self.job.get("operation") == "downgrade")
                self.update(status="completed", stage="ready", message="Ready offline.",
                            bytesDownloaded=self.job["totalBytes"], speedBytesPerSecond=0)
                return
            plan = self.satellite_plan(pack, current, installed)
            if self.free_bytes() < plan["requiredFreeBytes"]:
                raise WorldPackError("Free disk space for the satellite map and temporary preparation files.")
            local = plan["operation"] == "downgrade"
            self.update(status="running", stage="preparing" if local else "downloading",
                        operation=plan["operation"], bytesDownloaded=0, speedBytesPerSecond=0,
                        totalBytes=0 if local else asset.download_bytes,
                        message=f"Reducing local satellite detail to zoom {zoom}." if local
                        else f"Downloading world satellite · zoom {zoom}.")

        checkpoint = self.work / pack
        if checkpoint.is_symlink():
            raise WorldPackError("The satellite checkpoint is not a local directory.")
        if local:
            checkpoint = checkpoint / "local-reduction"
            if checkpoint.is_symlink():
                raise WorldPackError("The satellite reduction checkpoint is not a local directory.")
        checkpoint.mkdir(parents=True, exist_ok=True)
        if local:
            prior = installed[current][0]
            origin = self.output / prior["filename"]
            if not self.archive_matches(origin.name, prior) or digest_file(origin, active) != prior["sha256"]:
                raise WorldPackError("The installed satellite archive could not be verified for reuse.")
            ready = prepare_local_archive(
                asset, origin, prior["sha256"], checkpoint, self.pmtiles, active,
                lambda path: verify_versatiles(SATELLITE, path, zoom, self.pmtiles, active),
            )
            received = 0
            provenance = {"source": "local-reduction", "reusedFrom": origin.name, "sourceSha256": prior["sha256"]}
        else:
            ready, received = self.download_satellite(asset, checkpoint, active)
            provenance = versatiles_provenance(SATELLITE, checkpoint, received)
        if ready != checkpoint / asset.filename or ready.is_symlink() or not ready.is_file():
            raise WorldPackError("Satellite preparation did not return a safe local file.")
        with ready.open("rb") as archive:
            os.fsync(archive.fileno())
        record = {
            "filename": asset.filename, "installedBytes": ready.stat().st_size, "sha256": digest_file(ready, active),
            "bounds": MERCATOR_BOUNDS, "minzoom": 0, "maxzoom": zoom, "tileSize": asset.tile_size,
            "attribution": asset.attribution, "sourceUrl": page, **provenance,
        }

        with self.lock:
            active()
            self.update(stage="verifying", message="Publishing verified satellite maps.")
            destination = self.output / record["filename"]
            try:
                os.link(ready, destination, follow_symlinks=False)
            except FileExistsError:
                if not self.archive_matches(record["filename"], record) or digest_file(destination, active) != record["sha256"]:
                    raise WorldPackError("An existing satellite archive could not be verified.")
            self.replace_satellite(saved, installed, pack, record)
            self.clear_satellite_checkpoint(pack, local)
            self.update(status="completed", stage="ready", message="Ready offline.",
                        speedBytesPerSecond=0, bytesDownloaded=received, totalBytes=received)

    def download_satellite(self, asset, checkpoint, active):
        previous = None
        position = time.monotonic()

        def progress(value):
            nonlocal previous, position
            active()
            now = time.monotonic()
            delta = now - position
            if previous is None or delta >= 0.5:
                speed = max(0, int((value - previous) / delta)) if previous is not None else 0
                self.update(persist=False, bytesDownloaded=value, speedBytesPerSecond=speed)
                position, previous = now, value

        def exact_total(value):
            self.update(totalBytes=value)

        zoom = asset.max_zoom
        def preparing(size):
            self.update(stage="preparing", message=f"Preparing world satellite · zoom {zoom}.", bytesDownloaded=size,
                        speedBytesPerSecond=0)

        return self.download_versatiles(SATELLITE, zoom, checkpoint, asset.filename, active, progress, exact_total, preparing)

    def download_versatiles(self, dataset, zoom, checkpoint, filename, active, on_bytes, on_total, on_prepare):
        raw = checkpoint / f"{dataset.stem}.versatiles"
        partial = raw.with_suffix(".versatiles.part")
        marker = checkpoint / f"{dataset.stem}.resume.json"
        destination = checkpoint / filename

        def check_exact_size(size):
            cached = max(physical_size(raw), physical_size(partial))
            converted = preparation_bytes(size, dataset)
            remaining = max(0, size - cached) + max(0, converted - physical_size(destination))
            if self.free_bytes() < remaining + WORK_RESERVE:
                raise WorldPackError(f"Free disk space is insufficient for the measured {dataset.title} download and preparation.")
            on_total(size)

        for attempt in range(2):
            source = fetch_versatiles(dataset, zoom, checkpoint, active, on_bytes, check_exact_size)
            size = source.stat().st_size
            on_prepare(size)
            try:
                return prepare_versatiles(dataset, source, destination, zoom, self.pmtiles, active), size
            except InvalidSourceArchive:
                active()
                if source != raw or any(path.is_symlink() for path in (raw, partial, marker)):
                    raise
                for path in (raw, partial, marker):
                    path.unlink(missing_ok=True)
                if attempt:
                    raise
                self.update(stage="downloading", speedBytesPerSecond=0,
                            message=f"Downloading a fresh {dataset.title} source after verification failed.")
