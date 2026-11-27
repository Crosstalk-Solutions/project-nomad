"""Internal HTTP adapter for the optional World Offline worker."""

import fcntl
import errno
from hmac import compare_digest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import IPv4Address
import json
import os
from pathlib import Path
import shutil
import signal
from tempfile import NamedTemporaryFile
from threading import Event, Thread
from urllib.parse import urlsplit

from world_pack import WorldPackError, WorldPacks
from local_detail import API as LOCAL_DETAIL, LocalDetailError, LocalDetails


WORLD = "/api/lab-imagery/world"
ACTIONS = {"cancel", "discard", "download", "pause", "remove", "resume", "retry"}
LOCAL_ACTIONS = {"calculate", "download", "queue", "cancel", "retry", "delete", "recalculate", "cleanup"}
MAX_BODY = 8192


class WorldHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(12)

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def authorized(self):
        supplied = (self.headers.get("X-Nomad-World-Token") or self.headers.get("X-Nomad-Lab-Token", "")).encode()
        if compare_digest(supplied, self.server.world_token):
            return True
        self.send_json(403, {"message": "World worker access denied."})
        return False

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/health":
            self.send_json(200, {"status": "ok"})
        elif self.authorized():
            if path == LOCAL_DETAIL and self.server.local_detail is not None:
                try:
                    self.send_json(200, self.server.local_detail.snapshot())
                except (OSError, ValueError) as error:
                    print(f"Local-detail inventory: {error}", flush=True)
                    self.send_json(503, {"message": "The local-detail inventory is unavailable."})
                return
            if path != WORLD:
                self.send_json(404, {"message": "Unknown world worker endpoint."})
                return
            if self.server.world is None:
                self.send_json(503, {"message": "Worldwide downloads are not enabled on this worker."})
                return
            try:
                self.send_json(200, self.server.world.snapshot())
            except (OSError, ValueError) as error:
                print(f"World map inventory: {error}", flush=True)
                self.send_json(503, {"message": "The world map inventory is unavailable."})

    def do_POST(self):
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        local = path.startswith(LOCAL_DETAIL + "/")
        action = path.removeprefix((LOCAL_DETAIL if local else WORLD) + "/")
        if action == path or action not in (LOCAL_ACTIONS if local else ACTIONS):
            self.send_json(404, {"message": "Unknown world worker endpoint."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            limit = 1024 * 1024 if local and action == "queue" else MAX_BODY
            if not 0 < size <= limit or self.headers.get_content_type() != "application/json":
                raise ValueError
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError
        except (ValueError, UnicodeError, TimeoutError):
            self.send_json(400, {"message": "Send a bounded JSON map operation (queue up to 1 MiB; other operations up to 8 KiB)."})
            self.close_connection = True
            return

        if local:
            if self.server.local_detail is None:
                self.send_json(503, {"message": "Local-detail downloads are not enabled on this worker."})
                return
            detail = self.server.local_detail
            try:
                if action == "calculate":
                    result = detail.calculate(payload.get("cells"))
                elif action == "download":
                    result = detail.submit(payload.get("cells"), payload.get("quoteId"), payload.get("requestId"))
                elif action == "delete":
                    result = detail.delete(payload.get("cells"))
                elif action == "queue":
                    result = detail.enqueue(payload.get("batches"), payload.get("requestId"))
                elif action == "cleanup":
                    result = detail.cleanup(payload.get("scope"), payload.get("id"))
                else:
                    result = getattr(detail, action)(payload.get("id"))
                self.send_json(202 if action in {"download", "queue", "retry"} else 200, result)
            except LocalDetailError as error:
                self.send_json(error.status, {"message": str(error)})
            except (OSError, ValueError, RuntimeError) as error:
                print(f"Local-detail {action}: {error}", flush=True)
                self.send_json(503, {"message": "Regional files could not be deleted from local storage. Refresh and retry; worldwide maps are unchanged."}
                               if action == "delete" else {"message": "The selected public map source or local storage is unavailable. Try again when connected."})
            return

        world = self.server.world
        if world is None:
            self.send_json(503, {"message": "Worldwide downloads are not enabled on this worker."})
            return
        try:
            if action == "download":
                result = world.submit(payload.get("packIds"), payload.get("requestId"))
            elif action == "remove":
                result = world.remove(payload.get("packId"))
            else:
                result = getattr(world, action)(payload.get("id"))
            self.send_json(202 if action in {"download", "resume", "retry"} else 200, result)
        except WorldPackError as error:
            self.send_json(400, {"message": str(error)})
        except (OSError, ValueError) as error:
            print(f"World map operation {action}: {error}", flush=True)
            self.send_json(503, {"message": "World map operation could not access local storage."})


def read_token():
    token = os.environ.get("WORLD_WORKER_TOKEN")
    secret_file = os.environ.get("WORLD_WORKER_TOKEN_FILE")
    if token and secret_file:
        raise ValueError("Configure either WORLD_WORKER_TOKEN or WORLD_WORKER_TOKEN_FILE.")
    if secret_file:
        token = Path(secret_file).read_text(encoding="utf8").strip()
    if not token or len(token.encode()) < 32:
        raise ValueError("Set a private world worker token of at least 32 bytes.")
    return token.encode()


def workspace():
    maps = Path(os.environ.get("WORLD_MAPS_DIR", "/data/maps/pmtiles")).resolve()
    state = Path(os.environ.get("WORLD_STATE_DIR", "/data/maps/.world-offline")).resolve()
    if maps.is_relative_to(state) or state.is_relative_to(maps):
        raise ValueError("Set separate map and worker directories under one shared mount.")
    for directory in (maps, state):
        directory.mkdir(parents=True, exist_ok=True)
    # Different bind mounts may share st_dev but still refuse cross-mount
    # hard links. Verify the publication operation before accepting jobs.
    try:
        with NamedTemporaryFile(prefix=".world-worker-link-", dir=state) as probe:
            target = maps / Path(probe.name).name
            os.link(probe.name, target, follow_symlinks=False)
            target.unlink()
    except OSError as error:
        if error.errno not in {errno.ENOSPC, errno.EDQUOT}:
            raise ValueError("The map and worker directories must be writable siblings on the same mount.") from error
        print("World Offline storage is full. The worker can still read its inventory and discard saved files.", flush=True)
    return maps, state


def main():
    token = read_token()
    host = IPv4Address(os.environ.get("WORLD_WORKER_HOST", "0.0.0.0"))
    if not (host.is_private or host.is_unspecified) or host.is_link_local:
        raise ValueError("Bind the worker to an internal container interface.")
    port = int(os.environ.get("WORLD_WORKER_PORT", "8083"))
    pmtiles = Path(os.environ.get("WORLD_PMTILES_BIN", "/usr/local/bin/pmtiles"))
    if not pmtiles.is_absolute() or not pmtiles.is_file() or not os.access(pmtiles, os.X_OK):
        raise ValueError("Set WORLD_PMTILES_BIN to an executable installed in the worker image.")
    local_only = os.environ.get("WORLD_WORKER_LOCAL_ONLY", "").lower() in {"true", "1"}
    local_enabled = local_only or bool(os.environ.get("LOCAL_DETAIL_MAPS_DIR"))
    if local_only:
        maps = Path(os.environ.get("LOCAL_DETAIL_MAPS_DIR", "/data/local-detail/pmtiles")).resolve()
        state = Path(os.environ.get("LOCAL_DETAIL_STATE_DIR", "/data/local-detail/.state")).resolve()
        for directory in (maps, state):
            directory.mkdir(parents=True, exist_ok=True)
    else:
        maps, state = workspace()
    host_disk = os.environ.get("WORLD_HOST_DISK")

    def free_bytes():
        free = shutil.disk_usage(state).free
        return min(free, shutil.disk_usage(host_disk).free) if host_disk else free

    def stop(*_args):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    with (state / "worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("This storage already has a world map worker.") from error
        with ThreadingHTTPServer((str(host), port), WorldHandler) as server:
            server.world_token = token
            server.world = None if local_only else WorldPacks(maps, state, pmtiles, free_bytes)
            server.local_detail = LocalDetails(
                Path(os.environ.get("LOCAL_DETAIL_MAPS_DIR", "/data/local-detail/pmtiles")),
                Path(os.environ.get("LOCAL_DETAIL_STATE_DIR", "/data/local-detail/.state")), pmtiles,
                free_bytes if local_only else None) if local_enabled else None
            maintenance_stop = Event()
            maintenance_thread = None
            try:
                if server.local_detail:
                    maintenance_thread = Thread(target=server.local_detail.maintenance_loop,
                                                args=(maintenance_stop,), daemon=True)
                    maintenance_thread.start()
                print(f"World Offline worker listening on {host}:{port}", flush=True)
                server.serve_forever()
            finally:
                maintenance_stop.set()
                if maintenance_thread:
                    maintenance_thread.join(timeout=2)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(f"World Offline worker: {error}") from error
