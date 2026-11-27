"""Small, offline fixtures for the independent partial-map worker."""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Thread
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import gzip
import json
import os
import struct
import time
import unittest

import local_detail as detail


def write_json(path, value):
    path.write_text(json.dumps(value))


def varint(number):
    result = bytearray()
    while number > 127:
        result.append(number & 127 | 128)
        number >>= 7
    result.append(number)
    return result


def encode_directory(entries):
    output = bytearray(varint(len(entries)))
    previous = 0
    for identifier, _, _, _ in entries:
        output += varint(identifier - previous)
        previous = identifier
    for _, run, _, _ in entries:
        output += varint(run)
    for _, _, length, _ in entries:
        output += varint(length)
    for _, _, _, offset in entries:
        output += varint(offset + 1)
    return bytes(output)


class FakeSource:
    local = None
    def __init__(self, ranges):
        self.ranges, self.calls = ranges, []
    def get(self, start, length):
        self.calls.append((start, length))
        value = self.ranges[(start, length)]
        assert len(value) == length
        return value
    def identity(self):
        return {"url": "https://example.invalid/fixture", "etag": '"fixture"', "remoteSize": 1000000, "localPath": None}


class LocalGeometryTests(unittest.TestCase):
    def test_selection_and_stable_addresses(self):
        cells = detail.selection([{"x": 255, "y": 255}, {"x": 0, "y": 0}, {"x": 0, "y": 0}])
        self.assertEqual([cell["label"] for cell in cells], ["A1", "IV256"])
        self.assertEqual(cells[-1]["bounds"][2], 180)
        for invalid in ([], [{"x": True, "y": 1}], [{"x": -1, "y": 0}], [{"x": 0, "y": 256}], "8/95/145"):
            with self.assertRaises(detail.LocalDetailError):
                detail.selection(invalid)

    def test_quadrant_edges_are_half_open(self):
        cell = {"x": 95, "y": 145}
        self.assertEqual(detail.tile_window(cell, 8), (95, 145, 95, 145))
        self.assertEqual(detail.tile_window(cell, 12), (1520, 2320, 1535, 2335))
        self.assertEqual(detail.tile_window(cell, 15), (12160, 18560, 12287, 18687))
        self.assertEqual(detail.tile_window(cell, 0), (0, 0, 0, 0))
        self.assertEqual([detail.tile_id(1, x, y) for x, y in [(0, 0), (0, 1), (1, 1), (1, 0)]], [1, 2, 3, 4])

    def test_ranges_are_bounded_and_deduplicated(self):
        tiles = [[8, 0, 0, 100, 20], [9, 0, 0, 100, 20], [9, 1, 0, 121, 40], [12, 0, 0, 9_000_000, 30]]
        self.assertEqual(detail.groups_for(tiles), [[100, 61], [9_000_000, 30]])

    def test_versa_metadata_selects_only_its_quadrant(self):
        ranges, entries = {}, []
        for z, bx, by, x0, y0, x1, y1, offset in [(8, 0, 0, 94, 145, 96, 146, 100), (12, 5, 9, 239, 15, 255, 32, 10000)]:
            count = (x1 - x0 + 1) * (y1 - y0 + 1)
            directory = b"".join(struct.pack(">QI", i * 10, 10) for i in range(count))
            size = count * 10
            entries.append((z, bx, by, x0, y0, x1, y1, offset, size, len(directory)))
            ranges[(offset + size, len(directory))] = directory
        source = FakeSource(ranges)
        with patch.object(detail, "brotli_index", lambda raw: raw):
            plan = detail.plan_versa({"x": 95, "y": 145}, "satellite", (source, {}, entries, 1000000))
        self.assertEqual(len(plan["tiles"]), 257)
        self.assertEqual(source.calls, list(ranges))
        self.assertEqual([tile[:3] for tile in plan["tiles"] if tile[0] == 8], [[8, 95, 145]])
        self.assertTrue(all(1520 <= x <= 1535 and 2320 <= y <= 2335 for z, x, y, _, _ in plan["tiles"] if z == 12))

    def test_street_directory_selects_requested_tiles(self):
        inside = detail.tile_id(15, 12160, 18560)
        outside = detail.tile_id(15, 12288, 18560)
        entries = sorted([(inside, 1, 15, 0), (outside, 1, 15, 15)])
        directory = encode_directory(entries)
        source = FakeSource({(127, len(directory)): directory})
        plan = detail.plan_street({"x": 95, "y": 145}, (source, {}, (127, len(directory), 1000, 0, 2000, 30), lambda value: value, 2))
        self.assertEqual(plan["tiles"], [[15, 12160, 18560, 2000, 15]])

    def test_regional_terrain_plans_retain_provider_license_and_dem_source_links(self):
        directory = struct.pack(">QI", 0, 8)
        entries = [(12, 5, 9, 240, 16, 240, 16, 1000, 8, len(directory))]
        plans = {}
        with patch.object(detail, "brotli_index", lambda raw: raw):
            for role in ("topography", "elevation"):
                source = FakeSource({(1008, len(directory)): directory})
                plans[role] = detail.plan_versa({"x": 95, "y": 145}, role, (source, {}, entries, 2000))
        topo = plans["topography"]["attribution"]
        self.assertEqual(topo, detail.TOPO_MAP_ATTRIBUTION)
        self.assertIn('href="https://docs.versatiles.org/basics/tilesets.html#hillshade"', topo)
        self.assertIn('href="https://creativecommons.org/licenses/by/4.0/"', topo)
        self.assertIn('href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"', topo)
        elevation = plans["elevation"]["attribution"]
        self.assertEqual(elevation, detail.ELEVATION_MAP_ATTRIBUTION)
        self.assertIn('href="https://docs.versatiles.org/basics/tilesets.html#elevation"', elevation)
        self.assertIn('href="https://mapterhorn.com/attribution/"', elevation)
        for plan in plans.values():
            self.assertEqual(plan["etag"], '"fixture"')
            self.assertEqual(plan["maxzoom"], 12)
            self.assertEqual(plan["downloadBytes"], 8)
            self.assertEqual(plan["payloadBytes"], 8)


class StreetDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.sandbox = self.enterContext(TemporaryDirectory())
        self.cache = Path(self.sandbox)
        self.enterContext(patch.object(detail, "write_state", write_json))

    def test_catalog_uses_recent_safe_keys_only(self):
        builds = [{"key": "20261123.pmtiles", "size": 1000}, {"key": "../../secrets.pmtiles", "size": 1000},
                  {"key": "https://attacker.invalid/20261124.pmtiles", "size": 1000}, {"key": "20261124.pmtiles", "size": 1100}]
        class Opener:
            def open(self, request, timeout):
                self.url = request.full_url
                return BytesIO(json.dumps(builds).encode())
        opener = Opener()
        with patch.object(detail, "build_opener", return_value=opener):
            urls = detail.street_build_urls(self.cache)
        self.assertEqual(opener.url, "https://build-metadata.protomaps.dev/builds.json")
        self.assertEqual(urls, ["https://build.protomaps.com/20261124.pmtiles", "https://build.protomaps.com/20261123.pmtiles"])

    def test_unavailable_catalog_uses_saved_public_build(self):
        write_json(self.cache / "street-build.json", {"url": "https://build.protomaps.com/20261123.pmtiles"})
        class Opener:
            def open(self, *_args, **_kwargs):
                raise OSError("Catalog disconnected")
        with patch.object(detail, "build_opener", return_value=Opener()):
            self.assertEqual(detail.street_build_urls(self.cache), ["https://build.protomaps.com/20261123.pmtiles"])
        write_json(self.cache / "street-build.json", {"url": "https://attacker.invalid/20261123.pmtiles"})
        with patch.object(detail, "build_opener", return_value=Opener()):
            with self.assertRaises(detail.LocalDetailError):
                detail.street_build_urls(self.cache)

    def test_removed_recent_build_falls_back_and_records_pinned_etag(self):
        urls = ["https://build.protomaps.com/20261124.pmtiles", "https://build.protomaps.com/20261123.pmtiles"]
        calls = []
        def read(source):
            calls.append(source.url)
            if source.url == urls[0]:
                raise HTTPError(source.url, 404, "Rotated", {}, None)
            source.etag = '"verified-source-revision"'
            return source, {}, (), None, 2
        with patch.dict(detail.os.environ, {}, clear=True), patch.object(detail, "street_build_urls", return_value=urls), patch.object(detail, "read_street_source", side_effect=read):
            result = detail.street_source(self.cache)
        self.assertEqual(calls, urls)
        self.assertEqual(result[0].etag, '"verified-source-revision"')
        self.assertEqual(json.loads((self.cache / "street-build.json").read_text())["etag"], '"verified-source-revision"')

    def test_local_archive_does_not_need_build_catalog(self):
        archive = self.cache / "20261103.pmtiles"
        archive.write_bytes(b"fixture")
        with patch.dict(detail.os.environ, {"LOCAL_DETAIL_STREET_SOURCE": str(archive)}), patch.object(detail, "street_build_urls", side_effect=AssertionError("Must stay offline")), patch.object(detail, "read_street_source", side_effect=lambda source: source):
            source = detail.street_source(self.cache)
        self.assertEqual(source.local, archive)
        self.assertEqual(source.url, "https://build.protomaps.com/20261103.pmtiles")


class LocalLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.sandbox = self.enterContext(TemporaryDirectory())
        self.root = Path(self.sandbox)
        self.maps, self.state = self.root / "maps", self.root / "state"
        self.enterContext(patch.object(detail, "write_state", write_json))
        self.worker = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.world = self.root / "world.pmtiles"
        self.world.write_bytes(b"Worldwide package stays unchanged")

    def quote(self, cells):
        selected = detail.selection(cells)
        quote_id = "a" * 32
        for cell in selected:
            cell.update(downloadBytes=400, estimatedInstalledBytes=500, plans=[{"role": role, "groups": []} for role in detail.LEVELS])
        write_json(self.state / "quotes" / (quote_id + ".json"), {"id": quote_id, "createdAt": time.time(), "cells": selected,
                   "inventoryRevision": self.worker.manifest.get("deletionRevision", "")})
        return quote_id

    def archive(self, cell, plan, stage):
        filename = f"partial-z8-{cell['x']}-{cell['y']}-{plan['role']}.pmtiles"
        output = stage / filename
        output.write_bytes(b"small verified fixture")
        return {"filename": filename, "role": plan["role"], "installedBytes": output.stat().st_size,
                "sha256": detail.digest_file(output), "minzoom": 0, "maxzoom": detail.LEVELS[plan["role"]], "bounds": cell["bounds"]}

    def wait(self):
        self.worker.thread.join(timeout=5)
        self.assertFalse(self.worker.thread.is_alive())
        return self.worker.snapshot()

    def test_quote_subset_and_atomic_publication(self):
        cells = [{"x": 95, "y": 145}, {"x": 96, "y": 145}]
        quote = self.quote(cells)
        with patch.object(self.worker, "_archive", self.archive):
            self.worker.submit(cells[:1], quote)
            result = self.wait()
        self.assertEqual(result["job"]["status"], "ready")
        self.assertEqual(result["job"]["totalBytes"], 400)
        self.assertEqual(len(result["cells"]), 1)
        self.assertEqual(len(result["cells"][0]["archives"]), 4)
        self.assertEqual(self.world.read_bytes(), b"Worldwide package stays unchanged")
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertEqual(len(restored.snapshot()["cells"]), 1)
        with self.assertRaises(detail.LocalDetailError):
            self.worker.submit([{"x": 97, "y": 145}], quote)

    def test_failure_does_not_publish_a_partial_bundle_and_retry_works(self):
        cells = [{"x": 95, "y": 145}]
        quote = self.quote(cells)
        def broken(cell, plan, stage):
            if plan["role"] == "elevation":
                raise OSError("Source disconnected")
            return self.archive(cell, plan, stage)
        with patch.object(self.worker, "_archive", broken):
            failed = self.worker.submit(cells, quote)
            result = self.wait()
        self.assertEqual(result["job"]["status"], "failed")
        self.assertEqual(result["cells"], [])
        self.assertEqual(list(self.maps.glob("*.pmtiles")), [])
        with patch.object(self.worker, "_archive", self.archive):
            self.worker.retry(failed["job"]["id"])
            self.assertEqual(self.wait()["job"]["status"], "ready")

    def test_manifest_write_failure_keeps_memory_and_disk_coherent_and_retry_publishes(self):
        installed = [{"x": 95, "y": 145}]
        quote = self.quote(installed)
        with patch.object(self.worker, "_archive", self.archive):
            self.worker.submit(installed, quote)
            self.assertEqual(self.wait()["job"]["status"], "ready")
        previous = self.worker.manifest
        previous_disk = self.worker.manifest_path.read_bytes()
        remaining = [{"x": 96, "y": 145}]
        quote = self.quote(remaining)

        def fail_inventory(path, value):
            if path == self.worker.manifest_path:
                raise OSError("Synthetic inventory persistence failure")
            write_json(path, value)

        with patch.object(self.worker, "_archive", self.archive), patch.object(detail, "write_state", fail_inventory):
            self.worker.submit(remaining, quote)
            failed = self.wait()
        self.assertEqual(failed["job"]["status"], "failed")
        self.assertIs(self.worker.manifest, previous)
        self.assertEqual([cell["id"] for cell in previous["cells"]], ["8/95/145"])
        self.assertEqual([cell["id"] for cell in failed["cells"]], ["8/95/145"])
        self.assertEqual(self.worker.manifest_path.read_bytes(), previous_disk)

        with patch.object(self.worker, "_archive", self.archive):
            self.worker.retry(failed["job"]["id"])
            recovered = self.wait()
        self.assertEqual(recovered["job"]["status"], "ready")
        self.assertEqual({cell["id"] for cell in recovered["cells"]}, {"8/95/145", "8/96/145"})
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertEqual({cell["id"] for cell in restored.snapshot()["cells"]}, {"8/95/145", "8/96/145"})

    def test_disk_space_and_restart_recovery(self):
        cells = [{"x": 95, "y": 145}]
        quote = self.quote(cells)
        self.worker.free_bytes = lambda: 100
        with self.assertRaisesRegex(detail.LocalDetailError, "free disk"):
            self.worker.submit(cells, quote)
        self.assertIsNone(self.worker.job)
        write_json(self.state / "job.json", {"id": "interrupted", "status": "downloading", "cells": cells})
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertEqual(restored.job["status"], "failed")
        self.assertIn("Retry", restored.job["message"])

    def test_real_http_requests_only_the_planned_range_and_reuses_it(self):
        payload, requests = b"some-bounded-tile-content", []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.headers["Range"])
                start, end = map(int, self.headers["Range"][6:].split("-"))
                data = payload[start:end + 1]
                self.send_response(206)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(payload)}")
                self.send_header("ETag", '"fixture"')
                self.end_headers()
                self.wfile.write(data)
            def log_message(self, *_):
                pass
        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.worker.job = {"id": "range", "cancelRequested": False, "bytesDownloaded": 0, "bytesTransferred": 0, "totalBytes": 8, "status": "downloading", "progress": 0}
            plan = {"url": f"http://127.0.0.1:{server.server_port}/fixture", "etag": '"fixture"', "remoteSize": len(payload), "localPath": None}
            self.worker._fetch_group(plan, [5, 8])
            self.assertEqual(self.worker.job["bytesDownloaded"], 8)
            self.assertEqual(self.worker.job["bytesTransferred"], 8)
            self.worker.job["bytesDownloaded"] = 0
            self.worker._fetch_group(plan, [5, 8])
            self.assertEqual(self.worker.job["bytesTransferred"], 8)
            self.assertEqual(requests, ["bytes=5-12"])
            server.shutdown()


class LocalDeletionTests(LocalLifecycleTests):
    def install(self, coordinates):
        cells = detail.selection(coordinates)
        stage = self.state / "install-fixture"
        stage.mkdir(exist_ok=True)
        for cell in cells:
            cell["archives"] = [self.archive(cell, {"role": role}, stage) for role in detail.LEVELS]
            cell["status"] = "ready"
            for archive in cell["archives"]:
                (stage / archive["filename"]).replace(self.maps / archive["filename"])
        self.worker.manifest["cells"] += cells
        write_json(self.worker.manifest_path, self.worker.manifest)
        return cells

    def test_delete_batch_offline_is_idempotent_and_preserves_other_data(self):
        installed = self.install([{"x": 41, "y": 93}, {"x": 42, "y": 93}, {"x": 95, "y": 145}])
        pins = self.root / "pins.json"
        pins.write_bytes(b"Pins must be preserved")
        world_copy = self.maps / "world.pmtiles"
        world_copy.write_bytes(b"Worldwide baseline must be preserved")
        before = self.worker.snapshot()["generation"]
        with patch.object(self.worker, "_sources", side_effect=AssertionError("Deletion must stay offline")):
            result = self.worker.delete([{"x": 41, "y": 93}, {"x": 42, "y": 93}, {"x": 41, "y": 93}])
            self.assertEqual(len(result["removed"]), 2)
            self.assertEqual(result["freedBytes"], sum(a["installedBytes"] for cell in installed[:2] for a in cell["archives"]))
            self.assertFalse(result["cleanupPending"])
            self.assertNotEqual(before, result["generation"])
            again = self.worker.delete([{"x": 41, "y": 93}, {"x": 42, "y": 93}])
        self.assertEqual(again["removed"], [])
        self.assertEqual(len(again["alreadyAbsent"]), 2)
        self.assertEqual(again["freedBytes"], 0)
        self.assertEqual(again["generation"], result["generation"])
        self.assertEqual([cell["id"] for cell in self.worker.snapshot()["cells"]], ["8/95/145"])
        self.assertEqual(world_copy.read_bytes(), b"Worldwide baseline must be preserved")
        self.assertEqual(self.world.read_bytes(), b"Worldwide package stays unchanged")
        self.assertEqual(pins.read_bytes(), b"Pins must be preserved")

    def test_invalid_and_symlink_paths_fail_the_whole_batch(self):
        cells = self.install([{"x": 41, "y": 93}, {"x": 42, "y": 93}])
        archive = cells[1]["archives"][0]
        path = self.maps / archive["filename"]
        path.unlink()
        path.symlink_to(self.world)
        before = self.worker.manifest_path.read_bytes()
        with self.assertRaises(detail.LocalDetailError) as caught:
            self.worker.delete([{"x": 41, "y": 93}, {"x": 42, "y": 93}])
        self.assertEqual(caught.exception.status, 422)
        self.assertEqual(self.worker.manifest_path.read_bytes(), before)
        self.assertTrue((self.maps / cells[0]["archives"][0]["filename"]).is_file())
        self.assertEqual(self.world.read_bytes(), b"Worldwide package stays unchanged")
        path.unlink()
        path.write_bytes(b"fixture")
        archive["filename"] = "../world.pmtiles"
        with self.assertRaises(detail.LocalDetailError):
            self.worker.delete([{"x": 42, "y": 93}])
        for invalid in ([], [{"x": True, "y": 0}], [{"x": -1, "y": 93}], [{"x": 0, "y": 0}] * 65):
            with self.assertRaises(detail.LocalDetailError) as caught:
                self.worker.delete(invalid)
            self.assertEqual(caught.exception.status, 422)

    def test_symlink_directory_and_manifest_are_rejected(self):
        self.install([{"x": 41, "y": 93}])
        original = self.root / "original-maps"
        self.maps.rename(original)
        self.maps.symlink_to(original, target_is_directory=True)
        with self.assertRaises(detail.LocalDetailError):
            self.worker.delete([{"x": 41, "y": 93}])
        self.maps.unlink()
        original.rename(self.maps)
        manifest_copy = self.root / "manifest.json"
        self.worker.manifest_path.rename(manifest_copy)
        self.worker.manifest_path.symlink_to(manifest_copy)
        with self.assertRaises(detail.LocalDetailError):
            self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(len(list(self.maps.glob("*.pmtiles"))), 4)

    def test_manifest_commit_failure_never_unlinks_files(self):
        self.install([{"x": 41, "y": 93}])
        before = self.worker.manifest_path.read_bytes()
        with patch.object(detail, "write_state", side_effect=OSError("Disk full")):
            with self.assertRaises(OSError):
                self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(self.worker.manifest_path.read_bytes(), before)
        self.assertEqual(len(self.worker.snapshot()["cells"]), 1)
        self.assertEqual(len(list(self.maps.glob("*.pmtiles"))), 4)

    def test_partial_unlink_failure_reports_pending_and_retry_finishes(self):
        cells = self.install([{"x": 41, "y": 93}])
        failed_name = cells[0]["archives"][0]["filename"]
        unlink = os.unlink
        def fail_one(path, *args, **kwargs):
            if path == failed_name:
                raise PermissionError("Fixture file busy")
            return unlink(path, *args, **kwargs)
        with patch.object(detail.os, "unlink", side_effect=fail_one):
            result = self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(result["cleanupPending"], [{"x": 41, "y": 93}])
        self.assertEqual(self.worker.snapshot()["cells"], [])
        self.assertEqual(len(list(self.maps.glob("*.pmtiles"))), 1)
        with patch.object(self.worker, "_sources", side_effect=AssertionError("No provider call")):
            retry = self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(retry["alreadyAbsent"], [{"x": 41, "y": 93}])
        self.assertEqual(retry["removed"], [])
        self.assertFalse(retry["cleanupPending"])
        self.assertEqual(result["freedBytes"] + retry["freedBytes"], sum(a["installedBytes"] for a in cells[0]["archives"]))
        self.assertFalse(self.worker.manifest["pendingDeletes"])

    def test_restart_recovers_manifest_commit_before_cleanup_offline(self):
        self.install([{"x": 41, "y": 93}])
        with patch.object(self.worker, "_finish_deletions", side_effect=OSError("Simulated power loss")):
            with self.assertRaises(OSError):
                self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(len(list(self.maps.glob("*.pmtiles"))), 4)
        self.assertEqual(self.worker.manifest["cells"], [])
        with patch.object(detail.LocalDetails, "_sources", side_effect=AssertionError("Restart must stay offline")):
            restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertEqual(restored.snapshot()["cells"], [])
        self.assertEqual(list(self.maps.glob("*.pmtiles")), [])
        self.assertEqual(restored.manifest["pendingDeletes"], [])

    def test_journal_cleanup_failure_remains_idempotent(self):
        self.install([{"x": 41, "y": 93}])
        calls = 0
        def commit_once(path, data):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("Fixture sync unavailable")
            write_json(path, data)
        with patch.object(detail, "write_state", side_effect=commit_once):
            result = self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(len(result["cleanupPending"]), 1)
        self.assertEqual(list(self.maps.glob("*.pmtiles")), [])
        retry = self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(retry["freedBytes"], 0)
        self.assertFalse(retry["cleanupPending"])

    def test_cancelled_download_must_finish_before_deletion(self):
        self.install([{"x": 41, "y": 93}])
        cells = [{"x": 42, "y": 93}]
        quote = self.quote(cells)
        started, resume = Event(), Event()
        def waiting(cell, plan, stage):
            started.set()
            self.assertTrue(resume.wait(5))
            return self.archive(cell, plan, stage)
        with patch.object(self.worker, "_archive", side_effect=waiting):
            job = self.worker.submit(cells, quote)["job"]
            self.assertTrue(started.wait(5))
            self.worker.cancel(job["id"])
            with self.assertRaises(detail.LocalDetailError) as caught:
                self.worker.delete([{"x": 41, "y": 93}])
            self.assertEqual(caught.exception.status, 409)
            resume.set()
            self.wait()
        self.assertEqual(self.worker.job["status"], "cancelled")
        self.assertEqual(len(self.worker.snapshot()["cells"]), 1)
        self.worker.delete([{"x": 41, "y": 93}])
        self.assertEqual(self.worker.snapshot()["cells"], [])

    def test_terminal_status_with_live_thread_is_not_safe_for_deletion(self):
        self.install([{"x": 41, "y": 93}])
        stop = Event()
        self.worker.job = {"id": "fixture", "status": "ready", "cells": []}
        self.worker.thread = Thread(target=lambda: stop.wait(5))
        self.worker.thread.start()
        try:
            with self.assertRaises(detail.LocalDetailError) as caught:
                self.worker.delete([{"x": 41, "y": 93}])
            self.assertEqual(caught.exception.status, 409)
        finally:
            stop.set()
            self.worker.thread.join(5)
        self.assertEqual(len(self.worker.snapshot()["cells"]), 1)

    def test_deletion_invalidates_old_quote_and_terminal_retry(self):
        self.install([{"x": 41, "y": 93}])
        cells = [{"x": 42, "y": 93}]
        quote = self.quote(cells)
        self.worker.job = {"id": "old", "status": "failed", "cells": [{"x": 41, "y": 93}], "quoteId": quote}
        write_json(self.worker.job_path, self.worker.job)
        self.worker.delete([{"x": 41, "y": 93}])
        self.assertIsNone(self.worker.job)
        self.assertFalse(self.worker.job_path.exists())
        with self.assertRaises(detail.LocalDetailError) as caught:
            self.worker.submit(cells, quote)
        self.assertEqual(caught.exception.status, 409)
        with self.assertRaises(detail.LocalDetailError):
            self.worker.retry("old")

    def test_submit_waiting_on_delete_cannot_use_a_stale_quote(self):
        self.install([{"x": 41, "y": 93}])
        quote = self.quote([{"x": 42, "y": 93}])
        entered, resume = Event(), Event()
        finish = self.worker._finish_deletions
        def waiting(records, directory):
            entered.set()
            self.assertTrue(resume.wait(5))
            return finish(records, directory)
        result = []
        def submit():
            try:
                self.worker.submit([{"x": 42, "y": 93}], quote)
            except detail.LocalDetailError as error:
                result.append(error.status)
        with patch.object(self.worker, "_finish_deletions", side_effect=waiting):
            deletion = Thread(target=lambda: self.worker.delete([{"x": 41, "y": 93}]))
            deletion.start()
            self.assertTrue(entered.wait(5))
            request = Thread(target=submit)
            request.start()
            resume.set()
            deletion.join(5)
            request.join(5)
        self.assertEqual(result, [409])
        self.assertIsNone(self.worker.job)

    def test_internal_delete_http_authentication_and_status_contract(self):
        from server import WorldHandler
        self.install([{"x": 41, "y": 93}])
        class QuietHandler(WorldHandler):
            def log_message(self, *_args):
                pass
        with ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler) as server:
            server.world_token, server.local_detail, server.world = b"fixture-token-for-offline-test-only", self.worker, None
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def request(payload, token="fixture-token-for-offline-test-only"):
                body = json.dumps(payload).encode()
                req = Request(f"http://127.0.0.1:{server.server_port}{detail.API}/delete", body,
                              headers={"Content-Type": "application/json", "X-Nomad-Lab-Token": token})
                try:
                    response = urlopen(req, timeout=3)
                except HTTPError as error:
                    response = error
                with response:
                    return response.status, json.loads(response.read())
            try:
                selected = {"cells": [{"x": 41, "y": 93}]}
                self.assertEqual(request(selected, token="wrong")[0], 403)
                self.assertEqual(len(self.worker.snapshot()["cells"]), 1)
                self.assertEqual(request({"cells": [{"x": 256, "y": 93}]})[0], 422)
                self.worker.job = {"id": "fixture", "status": "downloading", "cells": []}
                self.assertEqual(request(selected)[0], 409)
                self.worker.job = None
                with patch.object(self.worker, "_sources", side_effect=AssertionError("Delete must not use the provider")):
                    status, result = request(selected)
                self.assertEqual(status, 200)
                self.assertEqual(result["removed"], selected["cells"])
                self.assertFalse(result["cleanupPending"])
            finally:
                server.shutdown()
                thread.join(5)


@unittest.skipUnless(Path("/usr/local/bin/pmtiles").is_file(), "The packaged PMTiles converter is required")
class ActualArchiveTests(LocalLifecycleTests):
    def test_four_archive_encodings_and_verification(self):
        from PIL import Image
        cell = detail.selection([{"x": 95, "y": 145}])[0]
        buffer = BytesIO()
        Image.new("RGB", (512, 512), (128, 100, 150)).save(buffer, format="WEBP", lossless=True)
        image = buffer.getvalue()
        stage = self.state / "conversion-fixture"
        stage.mkdir()
        self.worker.job = {"id": "conversion", "cancelRequested": False, "bytesDownloaded": 0, "bytesTransferred": 0, "totalBytes": 0, "progress": 0, "status": "preparing"}
        for role in detail.LEVELS:
            maximum = detail.LEVELS[role]
            raw = detail.brotli_index(b"", encode=True) if role == "topography" else gzip.compress(b"", mtime=0) if role == "street" else image
            plan = {"url": "https://example.invalid/fixture-" + role, "etag": '"fixture"', "remoteSize": len(raw), "localPath": "/fixture", "role": role,
                    "groups": [[0, len(raw)]], "tiles": [[maximum, 95 << (maximum - 8), 145 << (maximum - 8), 0, len(raw)]],
                    "metadata": {}, "minzoom": maximum, "maxzoom": maximum, "attribution": "Synthetic fixture", "compression": 2,
                    "sourceLayer": "hillshade-vectors" if role == "topography" else "", "encoding": "terrarium" if role == "elevation" else ""}
            self.worker._group_path(plan, 0, len(raw)).write_bytes(raw)
            write_json(self.worker._group_path(plan, 0, len(raw)).with_name(self.worker._group_path(plan, 0, len(raw)).name + ".sha256.json"),
                       {"size": len(raw), "sha256": detail.sha256(raw).hexdigest()})
            archive = self.worker._archive(cell, plan, stage)
            self.assertEqual(archive["maxzoom"], maximum)
            self.assertEqual(archive["format"], "mvt" if role in ("topography", "street") else "webp")
            self.assertEqual(archive["sha256"], detail.digest_file(stage / archive["filename"]))


class RegionalQueueRecoveryTests(LocalLifecycleTests):
    def new_quote(self, cells, *, expired=False, ranges=False):
        identifier = detail.uuid4().hex
        selected = detail.selection(cells)
        for cell in selected:
            plans = [{"role": role, "groups": [[0, 8]] if ranges else [], "url": "https://example.invalid/" + role,
                      "etag": '"revision-A"', "remoteSize": 8, "localPath": None} for role in detail.LEVELS]
            cell.update(downloadBytes=32, estimatedInstalledBytes=500, plans=plans)
        write_json(self.state / "quotes" / (identifier + ".json"), {"id": identifier,
            "createdAt": time.time() - (detail.QUOTE_TTL + 1 if expired else 0), "cells": selected,
            "inventoryRevision": self.worker.manifest.get("deletionRevision", "")})
        return identifier

    def cached(self, plan, payload=b"abcdefgh"):
        path = self.worker._group_path(plan, 0, len(payload))
        path.write_bytes(payload)
        write_json(path.with_name(path.name + ".sha256.json"), {"size": len(payload), "sha256": detail.sha256(payload).hexdigest()})
        return path

    def test_65_squares_admitted_once_and_prepared_in_sequential_batches(self):
        first = [{"x": x, "y": 100} for x in range(64)]
        second = [{"x": 64, "y": 100}]
        one, two = self.new_quote(first), self.new_quote(second)
        with patch.object(self.worker, "_archive", self.archive):
            admitted = self.worker.enqueue([{"quoteId": one}, {"quoteId": two}], "one-reviewed-selection")
            result = self.wait()
        self.assertEqual(result["queue"]["totalBatches"], 2)
        self.assertEqual(result["queue"]["completedCells"], 65)
        self.assertEqual(result["queue"]["status"], "ready")
        self.assertEqual(len(result["cells"]), 65)
        duplicate = self.worker.enqueue([{"quoteId": one}, {"quoteId": two}], "one-reviewed-selection")
        self.assertEqual(duplicate["queue"]["id"], admitted["queue"]["id"])
        self.assertEqual(self.world.read_bytes(), b"Worldwide package stays unchanged")

    def test_queue_exclusions_preserve_reviewed_subset_and_atomic_failure(self):
        one = self.new_quote([{"x": 41, "y": 93}, {"x": 42, "y": 93}])
        bad = self.new_quote([{"x": 43, "y": 93}], expired=True, ranges=True)
        with self.assertRaises(detail.LocalDetailError):
            self.worker.enqueue([{"quoteId": one}, {"quoteId": bad}])
        self.assertIsNone(self.worker.queue)
        self.assertFalse(self.worker.queue_path.exists())
        self.assertEqual(self.worker.snapshot()["cells"], [])
        with patch.object(self.worker, "_archive", self.archive):
            self.worker.enqueue([{"quoteId": one, "excludedCells": ["8/42/93"]}])
            result = self.wait()
        self.assertEqual([cell["id"] for cell in result["cells"]], ["8/41/93"])

    def test_retired_source_requires_recalculation_and_preserves_published_squares(self):
        LocalDeletionTests.install(self, [{"x": 41, "y": 93}])
        pending = [{"x": 42, "y": 93}]
        quote = self.new_quote(pending, ranges=True)
        def failed(cell, plan, _stage):
            self.worker._fetch_group(plan, [0, 8])
        with patch.object(self.worker, "_archive", failed), patch.object(detail, "source_range", side_effect=HTTPError("https://example.invalid/old", 404, "retired", {}, None)):
            self.worker.enqueue([{"quoteId": quote}])
            result = self.wait()
        self.assertEqual(result["queue"]["status"], "failed")
        self.assertTrue(result["queue"]["recovery"]["needsRecalculation"])
        self.assertFalse(result["queue"]["recovery"]["canRetry"])
        recovered = self.worker.recalculate(result["queue"]["id"])
        self.assertEqual(recovered["cells"], pending)
        self.assertEqual(len(self.worker.snapshot()["cells"]), 1)

    def test_expired_quote_with_verified_ranges_finishes_without_public_requests(self):
        cells = [{"x": 41, "y": 93}]
        quote = self.new_quote(cells, expired=True, ranges=True)
        record = self.worker._quote(quote, allow_expired=True)
        for plan in record["cells"][0]["plans"]:
            self.cached(plan)
        def offline_archive(cell, plan, stage):
            self.worker._fetch_group(plan, [0, 8])
            return self.archive(cell, plan, stage)
        with patch.object(detail, "source_range", side_effect=AssertionError("Offline preparation contacted a provider")), patch.object(self.worker, "_archive", offline_archive):
            self.worker.enqueue([{"quoteId": quote}])
            result = self.wait()
        self.assertEqual(result["queue"]["status"], "ready")
        self.assertEqual(len(result["cells"]), 1)

    def test_corrupt_cached_range_is_not_used_or_silently_downloaded(self):
        cells = [{"x": 41, "y": 93}]
        quote = self.new_quote(cells, expired=True, ranges=True)
        record = self.worker._quote(quote, allow_expired=True)
        for plan in record["cells"][0]["plans"]:
            self.cached(plan)
        self.worker._group_path(record["cells"][0]["plans"][0], 0, 8).write_bytes(b"corrupt!")
        def archive(cell, plan, stage):
            self.worker._fetch_group(plan, [0, 8])
            return self.archive(cell, plan, stage)
        with patch.object(detail, "source_range", side_effect=AssertionError("Corruption must not silently trigger network")), patch.object(self.worker, "_archive", archive):
            self.worker.enqueue([{"quoteId": quote}])
            result = self.wait()
        self.assertEqual(result["queue"]["status"], "failed")
        self.assertTrue(result["queue"]["recovery"]["needsRecalculation"])
        self.assertEqual(result["cells"], [])

    def test_queue_cancel_and_restart_resumes_only_unverified_squares(self):
        cells = [{"x": 41, "y": 93}, {"x": 42, "y": 93}]
        quote = self.new_quote(cells)
        waiting, resume = Event(), Event()
        def archive(cell, plan, stage):
            if cell["x"] == 42:
                waiting.set()
                self.assertTrue(resume.wait(5))
            return self.archive(cell, plan, stage)
        with patch.object(self.worker, "_archive", archive):
            result = self.worker.enqueue([{"quoteId": quote}])
            self.assertTrue(waiting.wait(5))
            self.worker.cancel(result["queue"]["id"])
            resume.set()
            self.wait()
        self.assertEqual(len(self.worker.snapshot()["cells"]), 1)
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertEqual(restored.recalculate(result["queue"]["id"])["cells"], cells[1:])
        with patch.object(restored, "_archive", self.archive):
            restored.retry(result["queue"]["id"])
            restored.thread.join(5)
        self.assertEqual(restored.snapshot()["queue"]["status"], "ready")
        self.assertEqual(len(restored.snapshot()["cells"]), 2)

    def test_cleanup_is_scoped_protects_resume_quotes_and_preserves_unknown_files(self):
        LocalDeletionTests.install(self, [{"x": 41, "y": 93}])
        old = self.new_quote([{"x": 42, "y": 93}], expired=True, ranges=True)
        keep = self.new_quote([{"x": 43, "y": 93}], expired=True, ranges=True)
        self.worker.job = {"id": "f" * 32, "quoteId": keep, "status": "failed", "cells": [{"x": 43, "y": 93}]}
        write_json(self.worker.job_path, self.worker.job)
        plan = self.worker._quote(keep, allow_expired=True)["cells"][0]["plans"][0]
        cached = self.cached(plan)
        index = self.state / "provider-index" / ("b" * 64 + ".bin")
        index.write_bytes(b"expired metadata")
        os.utime(index, (time.time() - detail.INDEX_TTL - 1,) * 2)
        unknown = self.state / "ranges" / "user-notes.txt"
        unknown.write_bytes(b"preserve")
        before = self.worker.temporary_storage()
        self.assertTrue(before["canPrune"])
        self.assertTrue(before["canDiscard"])
        self.worker.cleanup("expired-metadata")
        self.assertFalse((self.state / "quotes" / (old + ".json")).exists())
        self.assertTrue((self.state / "quotes" / (keep + ".json")).exists())
        self.assertFalse(index.exists())
        self.worker.cleanup("saved-preparation", self.worker.temporary_storage()["discardId"])
        self.assertFalse(cached.exists())
        self.assertFalse((self.state / "quotes" / (keep + ".json")).exists())
        self.assertEqual(unknown.read_bytes(), b"preserve")
        self.assertEqual(len(self.worker.snapshot()["cells"]), 1)
        self.assertIsNone(self.worker.snapshot()["job"])
        self.assertIsNone(self.worker.snapshot()["queue"])

    def test_cleanup_rejects_active_work_changed_task_and_symlinks(self):
        self.worker.job = {"id": "f" * 32, "status": "downloading", "cells": []}
        with self.assertRaises(detail.LocalDetailError) as error:
            self.worker.cleanup("saved-preparation", "f" * 32)
        self.assertEqual(error.exception.status, 409)
        self.worker.job["status"] = "failed"
        with self.assertRaises(detail.LocalDetailError):
            self.worker.cleanup("saved-preparation", "e" * 32)
        self.worker.calculation_lock.acquire()
        try:
            with self.assertRaises(detail.LocalDetailError):
                self.worker.cleanup("expired-metadata")
        finally:
            self.worker.calculation_lock.release()
        if hasattr(os, "symlink"):
            link = self.state / "ranges" / ("b" * 64 + ".bin")
            try:
                link.symlink_to(self.world)
            except OSError:
                return
            with self.assertRaises(detail.LocalDetailError):
                self.worker.cleanup("saved-preparation", "f" * 32)
            self.assertTrue(self.world.is_file())

    def test_saved_preparation_review_token_expires_when_ranges_change(self):
        quote = self.new_quote([{"x": 41, "y": 93}], ranges=True)
        self.worker.job = {"id": "f" * 32, "status": "failed", "quoteId": quote, "cells": [{"x": 41, "y": 93}]}
        plan = self.worker._quote(quote)["cells"][0]["plans"][0]
        cached = self.cached(plan)
        old_token = self.worker.temporary_storage()["discardId"]
        cached.write_bytes(b"changed!")
        with self.assertRaises(detail.LocalDetailError) as error:
            self.worker.cleanup("saved-preparation", old_token)
        self.assertEqual(error.exception.status, 409)
        self.assertTrue(cached.exists())
        self.worker.cleanup("saved-preparation", self.worker.temporary_storage()["discardId"])
        self.assertFalse(cached.exists())

    def test_startup_maintenance_prunes_only_expired_metadata_and_preserves_offline_recovery(self):
        LocalDeletionTests.install(self, [{"x": 41, "y": 93}])
        unused = self.new_quote([{"x": 42, "y": 93}], expired=True)
        resume = self.new_quote([{"x": 43, "y": 93}], expired=True, ranges=True)
        for plan in self.worker._quote(resume, allow_expired=True)["cells"][0]["plans"]:
            self.cached(plan)
        self.worker.job = {"id": "f" * 32, "quoteId": resume, "status": "failed", "cells": detail.selection([{"x": 43, "y": 93}])}
        write_json(self.worker.job_path, self.worker.job)
        index = self.state / "provider-index" / ("b" * 64 + ".bin")
        index.write_bytes(b"expired index")
        os.utime(index, (time.time() - detail.INDEX_TTL - 1,) * 2)
        unknown = self.state / "ranges" / "notes.txt"
        unknown.write_bytes(b"keep")
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        with patch.object(restored, "_sources", side_effect=AssertionError("Maintenance must stay offline")):
            self.assertTrue(restored.maintain())
            self.assertFalse(restored.maintain())
        self.assertFalse(index.exists())
        self.assertFalse((self.state / "quotes" / (unused + ".json")).exists())
        self.assertTrue((self.state / "quotes" / (resume + ".json")).exists())
        self.assertTrue(restored.snapshot()["job"]["recovery"]["canPrepareOffline"])
        with patch.object(restored, "_archive", self.archive):
            restored.retry("f" * 32)
            restored.thread.join(5)
        self.assertEqual(restored.snapshot()["job"]["status"], "ready")
        self.assertEqual(len(restored.snapshot()["cells"]), 2)
        self.assertEqual(unknown.read_bytes(), b"keep")
        self.assertEqual(self.world.read_bytes(), b"Worldwide package stays unchanged")

    def test_maintenance_runs_once_per_day_without_a_browser(self):
        with patch.object(detail.time, "monotonic", return_value=100) as clock, patch.object(self.worker, "cleanup", wraps=self.worker.cleanup) as cleanup:
            self.assertTrue(self.worker.maintain())
            self.assertFalse(self.worker.maintain())
            clock.return_value = 100 + detail.MAINTENANCE_INTERVAL - 1
            self.assertFalse(self.worker.maintain())
            clock.return_value += 1
            self.assertTrue(self.worker.maintain())
            self.assertEqual(cleanup.call_count, 2)

    def test_maintenance_waits_for_download_calculation_and_cancelling_thread(self):
        old = self.new_quote([{"x": 42, "y": 93}], expired=True)
        path = self.state / "quotes" / (old + ".json")
        with patch.object(detail.time, "monotonic", return_value=100) as clock:
            self.worker.job = {"id": "f" * 32, "status": "downloading", "cells": []}
            self.assertFalse(self.worker.maintain())
            self.assertTrue(path.exists())
            self.worker.job["status"] = "cancelled"
            stop, entered = Event(), Event()
            def finishing():
                entered.set()
                stop.wait(5)
            self.worker.thread = Thread(target=finishing)
            self.worker.thread.start()
            entered.wait(5)
            try:
                clock.return_value += detail.MAINTENANCE_POLL
                self.assertFalse(self.worker.maintain())
                self.assertTrue(path.exists())
            finally:
                stop.set()
                self.worker.thread.join(5)
            self.worker.calculation_lock.acquire()
            try:
                clock.return_value += detail.MAINTENANCE_POLL
                self.assertFalse(self.worker.maintain())
                self.assertTrue(path.exists())
            finally:
                self.worker.calculation_lock.release()
            clock.return_value += detail.MAINTENANCE_POLL
            self.assertTrue(self.worker.maintain())
            self.assertFalse(path.exists())

    def test_maintenance_failure_is_nonfatal_and_retries_are_bounded(self):
        with patch.object(detail.time, "monotonic", return_value=100) as clock, patch.object(self.worker, "cleanup", side_effect=OSError("fixture disk failure")) as cleanup, patch("builtins.print") as log:
            self.assertFalse(self.worker.maintain())
            self.assertIsNone(self.worker.snapshot()["job"])
            clock.return_value = 100 + detail.MAINTENANCE_RETRY - 1
            self.assertFalse(self.worker.maintain())
            self.assertEqual(cleanup.call_count, 1)
            clock.return_value += 1
            self.assertFalse(self.worker.maintain())
            self.assertEqual(cleanup.call_count, 2)
            self.assertEqual(log.call_count, 2)

    def test_maintenance_loop_stops_without_leaking_a_thread(self):
        stop = Event()
        stop.set()
        with patch.object(self.worker, "maintain") as maintenance:
            thread = Thread(target=self.worker.maintenance_loop, args=(stop,))
            thread.start()
            thread.join(1)
            self.assertFalse(thread.is_alive())
            maintenance.assert_not_called()

    def test_discard_abandons_zero_byte_task_and_repeat_does_not_touch_a_new_task(self):
        self.worker.job = {"id": "f" * 32, "status": "failed", "cells": []}
        write_json(self.worker.job_path, self.worker.job)
        temporary = self.worker.temporary_storage()
        self.assertEqual(temporary["savedPreparationBytes"], 0)
        self.assertTrue(temporary["canDiscard"])
        result = self.worker.cleanup("saved-preparation", temporary["discardId"])
        self.assertIsNone(result["job"])
        self.assertIsNone(result["queue"])
        self.assertIsNone(json.loads(self.worker.job_path.read_text()))
        self.assertEqual(self.worker.cleanup("saved-preparation", temporary["discardId"])["freedBytes"], 0)
        with self.assertRaises(detail.LocalDetailError):
            self.worker.retry("f" * 32)
        self.worker.job = {"id": "a" * 32, "status": "failed", "cells": []}
        with self.assertRaises(detail.LocalDetailError) as error:
            self.worker.cleanup("saved-preparation", temporary["discardId"])
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(self.worker.job["id"], "a" * 32)

    def test_discard_journal_finishes_after_restart_without_reviving_task(self):
        LocalDeletionTests.install(self, [{"x": 41, "y": 93}])
        quote = self.new_quote([{"x": 43, "y": 93}], expired=True, ranges=True)
        plan = self.worker._quote(quote, allow_expired=True)["cells"][0]["plans"][0]
        saved = self.cached(plan)
        self.worker.job = {"id": "f" * 32, "status": "failed", "quoteId": quote, "cells": [{"x": 43, "y": 93}]}
        write_json(self.worker.job_path, self.worker.job)
        token = self.worker.temporary_storage()["discardId"]
        with patch.object(self.worker, "_unlink_temporary", side_effect=OSError("fixture disk interruption")):
            with self.assertRaises(OSError):
                self.worker.cleanup("saved-preparation", token)
        self.assertTrue(saved.exists())
        self.assertIsNone(self.worker.snapshot()["job"])
        self.assertTrue(self.worker._pending_discard())
        with self.assertRaises(detail.LocalDetailError):
            self.worker.submit([{"x": 43, "y": 93}], quote)
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertIsNone(restored.job)
        self.assertTrue(restored.maintain())
        self.assertFalse(saved.exists())
        self.assertFalse((self.state / "quotes" / (quote + ".json")).exists())
        self.assertIsNone(restored.snapshot()["job"])
        self.assertIsNone(restored.snapshot()["queue"])
        self.assertFalse(restored._pending_discard())
        self.assertEqual(len(restored.snapshot()["cells"]), 1)
        self.assertEqual(restored.cleanup("saved-preparation", token)["freedBytes"], 0)

    def test_maintenance_preserves_a_damaged_discard_record_and_still_serves_inventory(self):
        self.worker.discard_path.write_text('{"unexpected":true}')
        with patch("builtins.print"):
            self.assertFalse(self.worker.maintain())
        self.assertTrue(self.worker.discard_path.exists())
        self.assertEqual(self.worker.snapshot()["cells"], [])

    def test_partial_discard_commit_cannot_revive_queue_after_restart(self):
        quote = self.new_quote([{"x": 43, "y": 93}], expired=True, ranges=True)
        self.worker.job = {"id": "f" * 32, "status": "failed", "quoteId": quote, "cells": detail.selection([{"x": 43, "y": 93}])}
        self.worker.queue = {"id": "a" * 32, "status": "failed", "updatedAt": "fixture", "batches": [{"quoteId": quote, "cells": [{"x": 43, "y": 93}], "status": "failed"}]}
        write_json(self.worker.job_path, self.worker.job)
        write_json(self.worker.queue_path, self.worker.queue)
        token = self.worker.temporary_storage()["discardId"]
        def interrupted_write(path, value):
            if path == self.worker.queue_path:
                raise OSError("fixture interruption between task commits")
            write_json(path, value)
        with patch.object(detail, "write_state", side_effect=interrupted_write):
            with self.assertRaises(OSError):
                self.worker.cleanup("saved-preparation", token)
        restored = detail.LocalDetails(self.maps, self.state, Path("/usr/local/bin/pmtiles"))
        self.assertIsNone(restored.job)
        self.assertIsNotNone(restored.queue)
        recovery = restored.snapshot()["queue"]["recovery"]
        self.assertFalse(recovery["canRetry"])
        self.assertFalse(recovery["canPrepareOffline"])
        self.assertFalse(recovery["needsRecalculation"])
        with self.assertRaises(detail.LocalDetailError):
            restored.retry("a" * 32)
        with self.assertRaises(detail.LocalDetailError):
            restored.recalculate("a" * 32)
        self.assertTrue(restored.maintain())
        self.assertIsNone(restored.snapshot()["queue"])

    def test_pending_discard_is_retried_before_next_daily_metadata_sweep(self):
        with patch.object(detail.time, "monotonic", return_value=100) as clock:
            self.assertTrue(self.worker.maintain())
            self.worker.job = {"id": "f" * 32, "status": "failed", "cells": []}
            write_json(self.worker.job_path, self.worker.job)
            token = self.worker.temporary_storage()["discardId"]
            with patch.object(self.worker, "_unlink_temporary", side_effect=OSError("fixture discard failure")):
                with self.assertRaises(OSError):
                    self.worker.cleanup("saved-preparation", token)
                clock.return_value += detail.MAINTENANCE_POLL
                with patch("builtins.print"):
                    self.assertFalse(self.worker.maintain())
                self.assertTrue(self.worker._pending_discard())
            clock.return_value += detail.MAINTENANCE_RETRY - 1
            self.assertFalse(self.worker.maintain())
            clock.return_value += 1
            self.assertTrue(self.worker.maintain())
            self.assertFalse(self.worker._pending_discard())
            self.assertIsNone(self.worker.job)

    def test_inventory_change_never_advertises_an_impossible_offline_retry(self):
        quote = self.new_quote([{"x": 41, "y": 93}], expired=True, ranges=True)
        for plan in self.worker._quote(quote, allow_expired=True)["cells"][0]["plans"]:
            self.cached(plan)
        self.worker.job = {"id": "f" * 32, "status": "failed", "quoteId": quote, "cells": [{"x": 41, "y": 93}]}
        self.worker.manifest["deletionRevision"] = "a-new-inventory-revision"
        recovery = self.worker.snapshot()["job"]["recovery"]
        self.assertFalse(recovery["canPrepareOffline"])
        self.assertFalse(recovery["canRetry"])
        self.assertTrue(recovery["needsRecalculation"])

    def test_internal_http_queue_recalculate_and_cleanup_contract(self):
        from server import WorldHandler
        class QuietHandler(WorldHandler):
            def log_message(self, *_args):
                pass
        with ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler) as server:
            server.world_token, server.local_detail, server.world = b"fixture-token-for-offline-test-only", self.worker, None
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def request(action, payload, padding=0):
                body = json.dumps(payload).encode() + b" " * padding
                req = Request(f"http://127.0.0.1:{server.server_port}{detail.API}/{action}", body,
                    headers={"Content-Type": "application/json", "X-Nomad-Lab-Token": "fixture-token-for-offline-test-only"})
                try:
                    response = urlopen(req, timeout=5)
                except HTTPError as error:
                    response = error
                with response:
                    return response.status, json.loads(response.read())
            try:
                cells = [{"x": x, "y": 100} for x in range(65)]
                quotes = [self.new_quote(cells[:64]), self.new_quote(cells[64:])]
                self.assertEqual(request("delete", {"cells": cells[:1]}, 9000)[0], 400)
                with patch.object(self.worker, "_archive", self.archive):
                    code, result = request("queue", {"batches": [{"quoteId": identifier} for identifier in quotes]}, 9000)
                    self.assertEqual(code, 202)
                    self.wait()
                self.assertEqual(len(self.worker.snapshot()["cells"]), 65)
                self.assertEqual(request("recalculate", {"id": result["queue"]["id"]})[1]["cells"], [])
                self.assertEqual(request("cleanup", {"scope": "invalid"})[0], 422)
                self.assertEqual(request("cleanup", {"scope": "expired-metadata"})[0], 200)
            finally:
                server.shutdown()
                thread.join(5)


if __name__ == "__main__":
    unittest.main()
