#!/usr/bin/env python3
"""Load independent Valhalla packages without granting NOMAD a Docker socket.

Only this internal service can address the engine. A lock covers dataset switches
and the entire route request, so concurrent requests cannot use the wrong graph.
No runtime code downloads graph tiles, traffic, or auxiliary data.
"""
import atexit
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

ROOT = Path(os.environ.get('MAP_PACKS_PATH', '/packs')).resolve()
REGIONS_ROOT = Path(os.environ.get('MAP_REGIONS_PATH', '/regions')).resolve()
WORK = Path(os.environ.get('MAP_ROUTER_WORK_PATH', '/tmp/nomad-router'))
LOCK = threading.Lock()
PROCESS = None
DATASET = None
ID = re.compile(r'^[a-z0-9][a-z0-9_-]{0,79}$')
VERSION = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')
ENGINE = 'http://127.0.0.1:8002'
MAX_ENGINE_RESPONSE = 16 * 1024 * 1024


class BrokerError(Exception):
    def __init__(self, status, message, code='ENGINE_UNAVAILABLE'):
        super().__init__(message)
        self.status = status
        self.code = code


class NoEngineRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise HTTPError(request.full_url, code, 'Engine redirects are not permitted', headers, response)


# Ignore host proxy variables and never follow an engine redirect off loopback.
ENGINE_OPENER = build_opener(ProxyHandler({}), NoEngineRedirects())


def open_engine(request, timeout):
    return ENGINE_OPENER.open(request, timeout=timeout)


def json_object(content):
    def invalid_constant(_value):
        raise ValueError('Non-finite JSON value')
    value = json.loads(content, parse_constant=invalid_constant)
    if not isinstance(value, dict):
        raise ValueError('Expected a JSON object')
    return value


def engine_json(response):
    content = response.read(MAX_ENGINE_RESPONSE + 1)
    if len(content) > MAX_ENGINE_RESPONSE:
        raise BrokerError(502, 'Navigation engine response is too large', 'ENGINE_INVALID_RESPONSE')
    try:
        return json_object(content)
    except (ValueError, UnicodeError) as error:
        raise BrokerError(502, 'Navigation engine returned invalid JSON', 'ENGINE_INVALID_RESPONSE') from error


def stop_engine():
    global PROCESS, DATASET
    DATASET = None
    if PROCESS:
        try:
            if PROCESS.poll() is None:
                PROCESS.terminate()
                try:
                    PROCESS.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    PROCESS.kill()
                    PROCESS.wait(timeout=5)
        except ProcessLookupError:
            pass
        # Do not lose the handle to a process which could not be stopped.
        if PROCESS.poll() is not None:
            PROCESS = None


def graph_path(package_id, version, namespace='packs'):
    if not isinstance(package_id, str) or not (re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,119}',package_id) if namespace=='regions' else ID.fullmatch(package_id)):
        raise ValueError('Invalid package ID')
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError('Invalid package version')
    if namespace not in ('packs', 'regions'):
        raise ValueError('Invalid graph namespace')
    path = (REGIONS_ROOT / 'installed' / package_id / 'routing' / version / 'routing.tar') if namespace=='regions' else (ROOT / 'installed' / package_id / version / 'routing.tar')
    try:
        resolved = path.resolve(strict=True)
        if resolved != path or not resolved.is_file() or resolved.stat().st_size == 0:
            raise BrokerError(409, 'The requested package graph is not installed')
    except OSError as error:
        raise BrokerError(409, 'The requested package graph is not installed') from error
    return resolved


def engine_config(graph):
    config = json_object(subprocess.check_output(['valhalla_build_config'], text=True, timeout=15))
    WORK.mkdir(parents=True, exist_ok=True)
    for directory in ('empty-tiles', 'empty-elevation', 'empty-transit'):
        (WORK / directory).mkdir(exist_ok=True)
    config['mjolnir'].update({
        'tile_dir': str(WORK / 'empty-tiles'),
        'tile_extract': str(graph),
        'tile_url': '',
        'traffic_extract': '',
        'admin': str(WORK / 'admins.sqlite'),
        'landmarks': str(WORK / 'landmarks.sqlite'),
        'timezone': str(WORK / 'timezones.sqlite'),
        'transit_dir': str(WORK / 'empty-transit'),
        'transit_feeds_dir': str(WORK / 'empty-transit'),
        'max_cache_size': 268435456,
    })
    config['additional_data'] = {'elevation': str(WORK / 'empty-elevation')}
    config['httpd']['service'].update({
        'listen': 'tcp://127.0.0.1:8002',
        'loopback': 'ipc://' + str(WORK / 'loopback'),
        'interrupt': 'ipc://' + str(WORK / 'interrupt'),
    })
    # Keep IPC endpoints isolated from other Valhalla processes as well.
    for service in ('loki', 'thor', 'odin', 'meili'):
        if service in config:
            config[service]['service']['proxy'] = 'ipc://' + str(WORK / service)
    config['loki']['actions'] = ['route', 'status']
    return config


def ensure_engine(package_id, version, namespace='packs'):
    global PROCESS, DATASET
    graph = graph_path(package_id, version, namespace)
    info = graph.stat()
    dataset = (package_id, version, info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
    if DATASET == dataset and PROCESS and PROCESS.poll() is None:
        return
    stop_engine()
    try:
        config_path = WORK / 'config.json'
        config = engine_config(graph)
        config_path.write_text(json.dumps(config), encoding='utf-8')
        PROCESS = subprocess.Popen(['valhalla_service', str(config_path), '1'])
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if PROCESS.poll() is not None:
                raise RuntimeError('Navigation engine exited while loading the graph')
            try:
                with open_engine(ENGINE + '/status', timeout=1) as response:
                    if response.status == 200:
                        engine_json(response)
                        DATASET = dataset
                        return
            except (OSError, URLError):
                pass
            time.sleep(0.15)
        raise RuntimeError('Navigation engine took too long to load the graph')
    except (ValueError, KeyError, subprocess.SubprocessError) as error:
        stop_engine()
        print(f'Navigation engine startup failed: {error}', flush=True)
        raise BrokerError(503, 'Navigation engine failed to initialize') from error
    except Exception:
        stop_engine()
        raise


def route_request(body):
    if not isinstance(body, dict) or not isinstance(body.get('request'), dict):
        raise ValueError('Invalid route request')
    if body.get('namespace', 'packs') not in ('packs', 'regions'):
        raise ValueError('Invalid graph namespace')
    request = body['request']
    locations = request.get('locations')
    if request.get('costing') not in ('auto', 'pedestrian') or not isinstance(locations, list) or not 2 <= len(locations) <= 7:
        raise ValueError('Two to seven locations and a supported travel mode are required')
    points = []
    for location in locations:
        if not isinstance(location, dict):
            raise ValueError('Invalid coordinates')
        point = {}
        for coordinate, limit in (('lat', 90), ('lon', 180)):
            number = location.get(coordinate)
            if type(number) not in (int, float) or abs(number) > limit or not math.isfinite(number):
                raise ValueError('Invalid coordinates')
            point[coordinate] = number
        # Every selected point is a stop, producing one separate leg between
        # consecutive points. Do not accept arbitrary engine location options.
        point['type'] = 'break'
        points.append(point)
    language = request.get('language', 'en-US')
    if not isinstance(language, str) or not re.fullmatch(r'[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', language):
        raise ValueError('Invalid route language')
    # Never forward arbitrary engine options from an internal HTTP caller.
    payload = {'locations': points, 'costing': request['costing'], 'units': 'kilometers',
               'language': language, 'shape_format': 'polyline6'}
    if not LOCK.acquire(timeout=5):
        raise BrokerError(503, 'Navigation engine is busy; please retry', 'ENGINE_BUSY')
    try:
        if body.get('namespace') == 'regions':
            ensure_engine(body.get('packageId'), body.get('packageVersion'), 'regions')
        else:
            ensure_engine(body.get('packageId'), body.get('packageVersion'))
        request = Request(ENGINE + '/route', data=json.dumps(payload, allow_nan=False).encode(),
                          headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with open_engine(request, timeout=35) as response:
                return 200, engine_json(response)
        except HTTPError as error:
            with error:
                details = engine_json(error)
            if error.code in (400, 404, 422):
                message = details.get('error')
                return error.code, {'message': message if isinstance(message, str) else 'The routing engine rejected this route', 'engine': details}
            raise BrokerError(503 if error.code == 503 else 502, 'Navigation engine failed to calculate the route') from error
        except TimeoutError as error:
            stop_engine()
            raise BrokerError(504, 'Navigation engine calculation timed out', 'ENGINE_TIMEOUT') from error
        except (OSError, URLError) as error:
            # Drop the graph handle so the next attempt restarts an unhealthy engine.
            stop_engine()
            raise BrokerError(503, 'Navigation engine unavailable') from error
    finally:
        LOCK.release()


def broker_status():
    ready = bool(shutil.which('valhalla_service') and shutil.which('valhalla_build_config'))
    process, dataset = PROCESS, DATASET
    running = bool(process and process.poll() is None and dataset)
    return {'ready': ready, 'engineReady': running, 'loadedPackage': list(dataset[:2]) if running else None}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def send_json(self, status, body):
        content = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if self.path != '/status':
            return self.send_json(404, {'message': 'Not found'})
        status = broker_status()
        self.send_json(200 if status['ready'] else 503, status)

    def do_POST(self):
        if self.path not in ('/route', '/unload'):
            return self.send_json(404, {'message': 'Not found'})
        try:
            if self.headers.get('Transfer-Encoding'):
                raise ValueError('Chunked request bodies are not supported')
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 16384:
                return self.send_json(413, {'message': 'Request too large'})
            body = json_object(self.rfile.read(length) or b'{}')
            if self.path == '/unload':
                if not LOCK.acquire(timeout=5):
                    raise BrokerError(503, 'Navigation engine is busy; please retry', 'ENGINE_BUSY')
                try:
                    stop_engine()
                finally:
                    LOCK.release()
                return self.send_json(200, {'ready': True})
            status, payload = route_request(body)
            self.send_json(status, payload)
        except BrokerError as error:
            self.send_json(error.status, {'message': str(error), 'code': error.code})
        except (ValueError, TypeError, UnicodeError) as error:
            self.send_json(400, {'message': str(error)})
        except (OSError, RuntimeError, URLError, KeyError, subprocess.SubprocessError) as error:
            print(f'Route engine unavailable: {error}', flush=True)
            self.send_json(503, {'message': 'Navigation engine unavailable'})


atexit.register(stop_engine)
if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: exit(0))
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8082'))), Handler).serve_forever()
