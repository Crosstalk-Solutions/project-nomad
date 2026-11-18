"""Run synthetic world archive lifecycle checks in the isolated worker image."""

from contextlib import contextmanager
import errno
import gzip
import json
import os
from pathlib import Path
import secrets
import struct
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from PIL import Image
from rasterio import __gdal_version__

from server import WORLD
import world_pack as worker


def varint(number):
    encoded = bytearray()
    while number > 127:
        encoded.append(number & 127 | 128)
        number >>= 7
    encoded.append(number)
    return encoded


def make_webp_fixture(path, maximum_zoom, *, minimum_zoom=0, tile_size=1):
    from io import BytesIO

    # A complete global tile address space with one tiny, distinct color
    # per zoom. This keeps a valid z10 archive small enough for CI.
    tiles = []
    zooms = range(minimum_zoom, maximum_zoom + 1)
    for zoom in zooms:
        buffer = BytesIO()
        Image.new("RGB", (tile_size, tile_size), color=(128 + zoom, 100, 150)).save(buffer, "WEBP", lossless=True)
        tiles.append(buffer.getvalue())

    runs = [4 ** zoom for zoom in zooms]
    count = sum(runs)
    directory_values = [
        len(tiles), (4**minimum_zoom - 1) // 3, *runs[:-1], *runs, *(len(tile) for tile in tiles), 1,
        *([0] * (len(tiles) - 1)),
    ]
    directory = gzip.compress(b"".join(varint(n) for n in directory_values))
    metadata = gzip.compress(b'{"format":"webp","name":"Synthetic test fixture"}')
    metadata_offset = 127 + len(directory)
    tile_offset = metadata_offset + len(metadata)
    payload = b"".join(tiles)
    header = b"PMTiles\x03" + struct.pack(
        "<11Q", 127, len(directory), metadata_offset, len(metadata), tile_offset, 0,
        tile_offset, len(payload), count, len(tiles), len(tiles),
    )
    header += bytes((1, 2, 1, 4, minimum_zoom, maximum_zoom))
    header += struct.pack("<4iB2i", -1800000000, -850511288, 1800000000, 850511288, 0, 0, 0)
    assert len(header) == 127
    path.write_bytes(header + directory + metadata + payload)
    return tiles


class WorkerLifecycleTest(unittest.TestCase):
    def setUp(self):
        sandbox = Path(self.enterContext(TemporaryDirectory(prefix="nomad-world-test-")))
        self.output = sandbox / "maps"
        self.work = sandbox / "state"
        self.output.mkdir()
        self.work.mkdir()
        self.token = secrets.token_hex(32)
        self.fixture = self.output / worker.ASSETS["satellite-z10"][0].filename
        self.unrelated = self.output / "user-owned.pmtiles"
        self.unrelated.write_bytes(b"user map is protected")
        make_webp_fixture(self.fixture, 10)
        artifact = {
            "filename": self.fixture.name,
            "installedBytes": self.fixture.stat().st_size,
            "sha256": worker.digest_file(self.fixture, lambda: None),
            "minzoom": 0,
            "maxzoom": 10,
        }
        self.manifest = self.output / worker.MANIFEST_NAME
        worker.write_state(self.manifest, {"schemaVersion": 1, "packs": {"satellite-z10": [artifact]}})

    def request(self, path, body=None, auth="X-Nomad-World-Token"):
        headers = {"Content-Type": "application/json"}
        if auth:
            headers[auth] = self.token
        query = Request(
            "http://127.0.0.1:8083" + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
        )
        try:
            with urlopen(query, timeout=5) as reply:
                return reply.status, json.load(reply)
        except HTTPError as reply:
            with reply:
                return reply.code, json.load(reply)

    @contextmanager
    def server(self):
        config = dict(
            os.environ,
            WORLD_MAPS_DIR=str(self.output),
            WORLD_STATE_DIR=str(self.work),
            WORLD_WORKER_HOST="127.0.0.1",
            WORLD_WORKER_PORT="8083",
            WORLD_WORKER_TOKEN=self.token,
        )
        with subprocess.Popen(
            [sys.executable, str(Path(worker.__file__).with_name("server.py"))],
            env=config, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        ) as process:
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        break
                    try:
                        if self.request("/health", auth=None)[0] == 200:
                            break
                    except URLError:
                        time.sleep(0.05)
                self.assertIsNone(process.poll())
                self.assertEqual(self.request("/health", auth=None)[0], 200)
                yield
            finally:
                process.terminate()
                try:
                    log, _ = process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    log, _ = process.communicate()
                if sys.exc_info()[0] is not None:
                    sys.stderr.write(log.decode(errors="replace"))

    def wait_for_job(self, snapshot=None):
        for _ in range(200):
            if snapshot is None:
                status, state = self.request(WORLD)
                self.assertEqual(status, 200)
            else:
                state = snapshot()
            if state["job"]["status"] in worker.TERMINAL:
                return state
            time.sleep(0.05)
        self.fail("The synthetic worker job did not finish within 10 seconds")

    def test_offline_reduction_and_worker_restart(self):
        self.assertTrue(__gdal_version__)
        self.assertNotEqual(os.getuid(), 0)
        job_id = "e" * 32
        body = {"packIds": ["satellite-z8"], "requestId": job_id}
        with self.server():
            self.assertEqual(self.request(WORLD, auth=None)[0], 403)
            self.assertEqual(self.request(WORLD, auth="X-Nomad-Lab-Token")[0], 200)
            self.assertEqual(self.request("/api/lab-imagery/estimate", {})[0], 404)
            self.assertEqual(self.request(WORLD + "/download", {**body, "requestId": "invalid"})[0], 400)
            status, reply = self.request(WORLD + "/download", body)
            self.assertEqual(status, 202, reply)
            self.assertEqual(reply["job"]["id"], job_id)
            inventory = self.wait_for_job()
            self.assertEqual(inventory["job"]["status"], "completed", inventory["job"])
            self.assertEqual(inventory["job"]["bytesDownloaded"], 0)
            self.assertFalse(self.fixture.exists())

        with self.server():
            status, inventory = self.request(WORLD)
            self.assertEqual(status, 200)
            active = next(row for row in inventory["packs"] if row["id"] == "satellite-z8")
            self.assertTrue(active["installed"])
            self.assertEqual(self.request(WORLD + "/download", body)[1]["job"]["status"], "completed")
            local_archive = self.output / worker.ASSETS[active["id"]][0].filename
            self.assertTrue(local_archive.is_file())
            self.assertEqual(self.request(WORLD + "/remove", {"packId": active["id"]})[0], 200)
            self.assertFalse(local_archive.exists())
            self.assertEqual(self.unrelated.read_bytes(), b"user map is protected")

    def test_discard_removes_only_owned_partial(self):
        work = self.work / "world-packs-v1"
        partial = work / "satellite-z8" / "satellite.versatiles.part"
        partial.parent.mkdir(parents=True)
        partial.write_bytes(b"interrupted transfer")
        protected = partial.with_name("user-owned.checkpoint")
        protected.write_bytes(b"not managed by this task")
        job_id = "f" * 32
        worker.write_state(work / "job.json", {
            "id": job_id, "packIds": ["satellite-z8"], "status": "failed", "stage": "failed",
            "message": "Synthetic interrupted transfer", "bytesDownloaded": partial.stat().st_size,
            "totalBytes": 123, "speedBytesPerSecond": 0,
        })
        with self.server():
            status, reply = self.request(WORLD + "/discard", {"id": job_id})
            self.assertEqual(status, 200, reply)
            self.assertEqual(reply["job"]["status"], "discarded")
            self.assertEqual(reply["removedBytes"], len(b"interrupted transfer"))
            self.assertFalse(partial.exists())
            self.assertTrue(protected.is_file())
            self.assertTrue(self.fixture.is_file())
        with self.server():
            status, state = self.request(WORLD)
            self.assertEqual(status, 200)
            self.assertEqual(state["job"]["status"], "discarded")

    def test_full_disk_preserves_active_map_and_worker_can_retry(self):
        world = worker.WorldPacks(
            self.output, self.work, Path(os.environ["WORLD_PMTILES_BIN"]), lambda: 1024**4,
        )
        real_write = worker.write_state
        terminal_writes = []

        def full_on_first_terminal_write(path, payload):
            if path == world.history and payload["status"] == "failed":
                terminal_writes.append(world.state_reserve.exists())
                if len(terminal_writes) == 1:
                    raise OSError(errno.ENOSPC, "synthetic full disk")
            real_write(path, payload)

        job_id = "a" * 32
        with (
            patch.object(world, "run", side_effect=OSError(errno.ENOSPC, "synthetic full disk")),
            patch.object(worker, "write_state", side_effect=full_on_first_terminal_write),
        ):
            world.submit(["satellite-z8"], job_id)
            failed = self.wait_for_job(world.snapshot)["job"]
            self.assertEqual(failed["status"], "failed")
            self.assertIn("Free disk space", failed["message"])
            self.assertEqual(terminal_writes, [True, False])
            self.assertEqual(worker.read_state(world.history, {})["status"], "failed")
            self.assertTrue(self.fixture.is_file())

        world.retry(job_id)
        self.assertEqual(self.wait_for_job(world.snapshot)["job"]["status"], "completed")
        self.assertFalse(self.fixture.exists())

    def test_elevation_bands_reuse_installed_levels_and_allow_offline_reduction(self):
        world = worker.WorldPacks(
            self.output, self.work, Path(os.environ["WORLD_PMTILES_BIN"]), lambda: 1024**4,
        )
        calls = []

        def fixture(dataset, zoom, checkpoint, filename, active, on_bytes, on_total, on_prepare):
            self.assertEqual(dataset.encoding, "terrarium")
            self.assertEqual(dataset.min_zoom, 0 if zoom == 6 else zoom)
            active()
            calls.append(zoom)
            destination = checkpoint / filename
            make_webp_fixture(destination, zoom, minimum_zoom=dataset.min_zoom)
            on_total(1234)
            on_bytes(1234)
            on_prepare(1234)
            return destination, 1234

        def install(tier):
            world.submit([f"elevation-z{tier}"])
            result = self.wait_for_job(world.snapshot)
            self.assertEqual(result["job"]["status"], "completed", result["job"])
            return result

        with patch.object(world, "download_versatiles", side_effect=fixture):
            installed = install(6)
            archive = self.output / "raster-lab-world-elevation-z6.pmtiles"
            initial_inode = archive.stat().st_ino
            z8 = next(item for item in installed["packs"] if item["id"] == "elevation-z8")
            self.assertEqual(z8["additionalDownloadBytes"], 2_930_439_047)
            upgraded = install(8)
            self.assertEqual(calls, [6, 7, 8])
            self.assertEqual(archive.stat().st_ino, initial_inode)
            z8 = next(item for item in upgraded["packs"] if item["id"] == "elevation-z8")
            self.assertTrue(z8["installed"])
            self.assertEqual(
                [(item["minzoom"], item["maxzoom"], item["tileSize"], item["format"], item["encoding"])
                 for item in z8["archives"]],
                [(0, 6, 512, "webp", "terrarium"), (7, 7, 512, "webp", "terrarium"), (8, 8, 512, "webp", "terrarium")],
            )
            z7 = next(item for item in upgraded["packs"] if item["id"] == "elevation-z7")
            self.assertTrue(z7["covered"])
            self.assertEqual(z7["additionalDownloadBytes"], 0)
            reduced = install(7)
            self.assertEqual(reduced["job"]["bytesDownloaded"], 0)
            self.assertEqual(calls, [6, 7, 8])
            self.assertFalse((self.output / "raster-lab-world-elevation-z8.pmtiles").exists())
            self.assertTrue(archive.is_file())
            world.remove("elevation-z7")
            self.assertFalse(archive.exists())
            self.assertTrue(self.fixture.is_file())
            self.assertEqual(self.unrelated.read_bytes(), b"user map is protected")

    def test_elevation_conversion_preserves_encoded_elevation_bytes(self):
        from satellite_provider import ELEVATION, prepare_versatiles

        origin = self.work / "terrain-original.pmtiles"
        tiles = make_webp_fixture(origin, 1, tile_size=512)
        source = self.work / "elevation.versatiles"
        binary = Path(os.environ["WORLD_VERSATILES_BIN"])
        pmtiles = Path(os.environ["WORLD_PMTILES_BIN"])
        subprocess.run([binary, "convert", origin, source], check=True, capture_output=True)

        converted = self.work / "terrain-converted.pmtiles"
        prepare_versatiles(ELEVATION, source, converted, 1, pmtiles, lambda: None)
        result = subprocess.run([pmtiles, "tile", converted, "1", "0", "0"], check=True, capture_output=True)
        self.assertEqual(result.stdout, tiles[1], "Terrarium WebP payload must be copied byte for byte")


if __name__ == "__main__":
    unittest.main()
