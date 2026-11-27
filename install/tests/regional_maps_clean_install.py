#!/usr/bin/env python3
"""Isolated clean-admin integration fixture using committed setup files only.

Requires locally built admin/worker images. No production Compose, database dump,
downloaded maps or Docker socket is read/mounted. Keeps its own state after stop.
"""
import argparse
import asyncio
from copy import deepcopy
from hashlib import sha256
import html
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import struct
import subprocess
import sys
import time
import urllib.request
from uuid import uuid4
import zlib

INSTALL = Path(__file__).resolve().parents[1]
REPOSITORY = INSTALL.parent
spec = importlib.util.spec_from_file_location('regional_preflight', INSTALL / 'prepare_regional_maps.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)
SERVICES = ('mysql', 'redis', 'world-offline-worker', 'admin')


def run(*args, timeout=120, environment=None):
    return subprocess.check_output(args, text=True, timeout=timeout, env=environment).strip()


def inspect(identifier):
    return json.loads(run('docker', 'inspect', identifier))[0]


def save(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    stage = path.with_name(path.name + '.tmp')
    stage.write_text(json.dumps(value, indent=2) + '\n')
    stage.chmod(0o600 if private else 0o644)
    stage.replace(path)


def ownership(base):
    assert base.is_absolute() and base.resolve() == base and base.name.startswith('nomad-regional-clean-')
    value = json.loads((base / 'ownership.json').read_text())
    assert value['project'].startswith('nomad-regional-clean-') and value['syntheticOnly'] is True
    assert value['port'] not in {8080, 8082, 8084}
    return value


def compose(base, *args):
    identity = ownership(base)
    value = json.loads((base / 'compose.json').read_text())
    assert value['name'] == identity['project'] and set(value['services']) == set(SERVICES)
    assert value['networks'] == {'default':{'internal':True}}
    for service in value['services'].values():
        assert not service.get('container_name') and not service.get('ports') and not service.get('network_mode')
        for mount in service.get('volumes',[]):
            assert mount['type'] == 'bind'
            source = Path(mount['source']).resolve()
            assert source.is_relative_to(base) or source == INSTALL/'entrypoint.sh' and mount.get('read_only')
    return run('docker', 'compose', '-p', identity['project'], '-f', str(base / 'compose.json'), *args, timeout=240)


def synthetic_maps(storage):
    maps = storage / 'maps'
    for child in ('pmtiles', '.world-offline', 'basemaps-assets/sprites/v4', 'basemaps-assets/fonts'):
        (maps / child).mkdir(parents=True, exist_ok=True)
    # An empty vector layer in a complete tiny z0 PMTiles v3 archive. These
    # synthetic bytes provide a local map source, not downloaded geographic data.
    tile = b'\x1a\x0b\x0a\x07fixture\x78\x02'
    directory = bytes([1, 0, 1, len(tile), 1])
    metadata = json.dumps({'name': 'Synthetic empty clean-install fixture', 'vector_layers': [{'id': 'fixture'}]}).encode()
    header = bytearray(127)
    header[:8] = b'PMTiles\x03'
    metadata_start = 127 + len(directory)
    tile_start = metadata_start + len(metadata)
    for offset, value in ((8,127),(16,len(directory)),(24,metadata_start),(32,len(metadata)),
                          (40,tile_start),(48,0),(56,tile_start),(64,len(tile)),(72,1),(80,1),(88,1)):
        struct.pack_into('<Q', header, offset, value)
    header[96:102] = bytes([1,1,1,1,0,0])
    for index, value in enumerate((-180,-85.0511287,180,85.0511287)):
        struct.pack_into('<i', header, 102 + index * 4, round(value * 1e7))
    (maps / 'pmtiles/world.pmtiles').write_bytes(header + directory + metadata + tile)
    save(maps / 'nomad-base-styles.json', {'version':8, 'sources':{'fixture':{'type':'vector','url':'pmtiles:///fixture'}},
        'layers':[{'id':'background','type':'background','paint':{'background-color':'#e5e7e1'}},
                  {'id':'fixture-land','type':'fill','source':'fixture','source-layer':'fixture','paint':{'fill-color':'#e5e7e1'}}],
        'sprite':'', 'glyphs':''})
    def chunk(kind,data):
        return struct.pack('>I',len(data)) + kind + data + struct.pack('>I',zlib.crc32(kind + data))
    pixel = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,6,0,0,0))
             + chunk(b'IDAT',zlib.compress(b'\x00\x00\x00\x00\x00')) + chunk(b'IEND',b''))
    for suffix in ('', '@2x'):
        save(maps / ('basemaps-assets/sprites/v4/light' + suffix + '.json'), {})
        (maps / ('basemaps-assets/sprites/v4/light' + suffix + '.png')).write_bytes(pixel)
    for path in (maps / 'pmtiles', maps / '.world-offline'):
        os.chown(path,65532,65532)


def prepare(base, admin_image, worker_image, port):
    assert os.name == 'posix' and os.geteuid() == 0, 'Run fixture preparation inside Linux/WSL as root'
    assert base.is_absolute() and base.resolve() == base and base.name.startswith('nomad-regional-clean-')
    assert port not in {8080,8082,8084} and 1024 <= port <= 65535
    if (base / 'ownership.json').exists():
        identity = ownership(base)
        assert identity['port'] == port
        assert (base/'compose.json').is_file() and (base/'setup.json').is_file(), 'Incomplete fixture preparation; inspect it and use a new empty fixture directory'
        return
    assert not base.exists() or not any(base.iterdir()), 'Refusing an unrelated or populated fixture directory'
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',port))
    for image in (admin_image,worker_image,'mysql:8.0','redis:7-alpine'):
        inspect(image)
    base.mkdir(parents=True,mode=0o700,exist_ok=True)
    identity = {'project':'nomad-regional-clean-' + uuid4().hex[:10], 'port':port, 'syntheticOnly':True}
    save(base / 'ownership.json',identity,True)
    fixture_token = secrets.token_urlsafe(48)
    environment = {**os.environ,'NOMAD_STORAGE_PATH':'/opt/project-nomad/storage',
        'NOMAD_WORLD_ADMIN_IMAGE':admin_image,'WORLD_OFFLINE_TOKEN':fixture_token,
        'NOMAD_WORLD_WORKER_CONTEXT':str(REPOSITORY / 'world-offline-worker')}
    files = [INSTALL / name for name in ('management_compose.yaml','world_offline_compose.yaml','regional_maps_compose.yaml')]
    # Use explicit synthetic interpolation without changing the caller's shell.
    command = ['docker','compose']
    for filename in files:
        command += ['-f',str(filename)]
    committed = json.loads(run(*command,'config','--format','json',environment=environment))
    preflight.validate_compose(committed,Path(environment['NOMAD_STORAGE_PATH']))
    storage = base / 'storage'
    storage.mkdir()
    synthetic_maps(storage)
    preflight.prepare_storage(storage,prepare=True)
    for name in ('mysql','redis','update-shared'):
        (base / name).mkdir()
    assert not any((base / 'mysql').iterdir()), 'The integration database must start empty'
    value = {'name':identity['project'],'services':{},'networks':{'default':{'internal':True}}}
    for name in SERVICES:
        service = deepcopy(committed['services'][name])
        for field in ('container_name','ports','build','extra_hosts','networks','profiles'):
            service.pop(field,None)
        service.update(restart='no',pull_policy='never')
        value['services'][name] = service
    password,root_password = secrets.token_urlsafe(32),secrets.token_urlsafe(32)
    admin = value['services']['admin']
    admin['environment'].update(APP_KEY=secrets.token_hex(32), URL=f'http://localhost:{port}',
        DB_HOST='mysql',DB_DATABASE='nomad',DB_USER='nomad_user',DB_PASSWORD=password,DB_NAME='nomad',
        NOMAD_STORAGE_PATH=str(storage),REDIS_HOST='redis',WORLD_OFFLINE_WORKER_TOKEN=fixture_token,LOCAL_DETAIL_WORKER_TOKEN=fixture_token)
    admin['entrypoint']=['/bin/sh','/nomad-fixture-entrypoint.sh']
    admin.pop('command',None)
    admin['volumes']=[{'type':'bind','source':str(storage),'target':'/app/storage'},
        {'type':'bind','source':str(storage / 'local-detail'),'target':'/app/local-detail','read_only':True},
        {'type':'bind','source':str(storage / 'local-detail'),'target':'/app/storage/local-detail','read_only':True},
        {'type':'bind','source':str(base / 'update-shared'),'target':'/app/update-shared'},
        {'type':'bind','source':str(INSTALL / 'entrypoint.sh'),'target':'/nomad-fixture-entrypoint.sh','read_only':True}]
    mysql = value['services']['mysql']
    mysql['environment'].update(MYSQL_ROOT_PASSWORD=root_password,MYSQL_PASSWORD=password,MYSQL_DATABASE='nomad',MYSQL_USER='nomad_user')
    mysql['volumes']=[{'type':'bind','source':str(base / 'mysql'),'target':'/var/lib/mysql'}]
    value['services']['redis']['volumes']=[{'type':'bind','source':str(base / 'redis'),'target':'/data'}]
    worker = value['services']['world-offline-worker']
    worker['image']=worker_image
    worker['environment'].update(WORLD_WORKER_TOKEN=fixture_token,WORLD_WORKER_TOKEN_FILE='',WORLD_HOST_DISK='',
        LOCAL_DETAIL_STREET_SOURCE='',WORLD_WORKER_LOCAL_ONLY='false')
    worker['volumes']=[{'type':'bind','source':str(storage / 'maps'),'target':'/data/maps'},
        {'type':'bind','source':str(storage / 'local-detail'),'target':'/data/local-detail'}]
    preflight.validate_compose(value,storage)
    save(base / 'compose.json',value,True)
    save(base / 'setup.json',{'databaseInitiallyEmpty':True,'databaseDumpImported':False,'syntheticBasemapBytes':(storage/'maps/pmtiles/world.pmtiles').stat().st_size,
        'committedConfigurationFiles':[str(path.relative_to(REPOSITORY)) for path in files],
        'committedEntrypoint':'install/entrypoint.sh','entrypointSha256':sha256((INSTALL/'entrypoint.sh').read_bytes()).hexdigest(),
        'noDockerSocket':True,'noProductionMounts':True,
        'adminImage':admin_image,'workerImage':worker_image,'sourceDigests':{str(path.relative_to(REPOSITORY)):sha256(path.read_bytes()).hexdigest() for path in files}})
    print('Prepared clean fixture from committed configuration; no database or map content imported.',flush=True)


def relay_pid(base):
    file = base / 'relay.pid'
    if not file.exists():
        return None
    identifier = int(file.read_text())
    command = Path('/proc') / str(identifier) / 'cmdline'
    return identifier if command.exists() and str(__file__).encode() in command.read_bytes() and b'relay' in command.read_bytes() else None


async def pipe(reader,writer):
    while data := await reader.read(65536):
        writer.write(data)
        await writer.drain()
    if writer.can_write_eof():
        writer.write_eof()


async def connection(reader,writer,base):
    upstream = None
    try:
        address = ipaddress.IPv4Address((base/'admin-ip').read_text().strip())
        assert address.is_private
        other,upstream = await asyncio.open_connection(str(address),8080)
        await asyncio.gather(pipe(reader,upstream),pipe(other,writer))
    except (OSError,ValueError,AssertionError):
        pass
    finally:
        writer.close()
        if upstream:
            upstream.close()


async def relay(base):
    identity = ownership(base)
    server = await asyncio.start_server(lambda r,w:connection(r,w,base),'127.0.0.1',identity['port'])
    async with server:
        await server.serve_forever()


def refresh_relay(base):
    identity = ownership(base)
    admin = inspect(compose(base,'ps','-q','admin'))
    assert admin['Config']['Labels']['com.docker.compose.project'] == identity['project']
    (base/'admin-ip').write_text(admin['NetworkSettings']['Networks'][identity['project']+'_default']['IPAddress'])
    if not relay_pid(base):
        with (base/'relay.log').open('ab') as log:
            process = subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'relay','--state-dir',str(base)],
                stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        (base/'relay.pid').write_text(str(process.pid))


def request(base,path):
    with urllib.request.urlopen(f"http://127.0.0.1:{ownership(base)['port']}"+path,timeout=20) as response:
        return response.status,response.read().decode()


def start(base):
    print(compose(base,'up','-d','--wait','mysql','redis'),flush=True)
    print(compose(base,'up','-d','world-offline-worker','admin'),flush=True)
    refresh_relay(base)
    for _ in range(90):
        try:
            status,_ = request(base,'/api/health')
            if status == 200:
                verify(base)
                print('Clean NOMAD fixture ready on localhost:'+str(ownership(base)['port']),flush=True)
                return
        except (OSError,ValueError):
            pass
        time.sleep(1)
    raise RuntimeError('Fresh admin did not become ready; inspect this fixture service logs')


def verify(base):
    identity = ownership(base)
    network = inspect(identity['project']+'_default')
    assert network['Internal'] is True
    for name in SERVICES:
        container = inspect(compose(base,'ps','-q',name))
        assert container['Config']['Labels']['com.docker.compose.project'] == identity['project']
        assert container['State']['Running'] and not container['HostConfig'].get('PortBindings')
        for mount in container['Mounts']:
            if mount['Type']=='tmpfs':
                continue
            assert mount['Type']=='bind'
            source = Path(mount['Source'])
            assert source.is_relative_to(base) or source == INSTALL/'entrypoint.sh' and not mount['RW']
        assert set(container['NetworkSettings']['Networks']) == {identity['project']+'_default'}
    admin = inspect(compose(base,'ps','-q','admin'))
    for target in ('/app/local-detail','/app/storage/local-detail'):
        assert any(m['Destination']==target and not m['RW'] for m in admin['Mounts'])
    assert not any(m['Destination']=='/var/run/docker.sock' for m in admin['Mounts'])
    inventory = json.loads(request(base,'/api/maps/local-detail')[1])
    assert inventory['cells']==[] and not inventory.get('serviceUnavailable')
    pages = {}
    for path in ('/settings/maps','/maps'):
        status,body = request(base,path)
        assert status==200
        matched = re.search(r'data-page="([^"]*)"',body)
        assert matched, 'Expected a real Inertia app page'
        data = json.loads(html.unescape(matched.group(1)))
        assert data['props']['localDetailEnabled'] is True
        if path=='/maps':
            assert data['props']['mapDetailIndicatorEnabled'] is True
        pages[path]={'status':status,'component':data['component'],'regionalFlag':True}
    for path in ('/docs/local-detail','/docs/regional-setup','/docs/map-detail','/api/openapi.json'):
        assert request(base,path)[0]==200
    database = compose(base,'ps','-q','mysql')
    sql = 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -N -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM adonis_schema; SELECT COUNT(*) FROM services; SELECT COUNT(*) FROM map_markers;"'
    rows = [int(value) for value in run('docker','exec',database,'sh','-ec',sql).splitlines()]
    assert rows[0]>0 and rows[1]>0 and rows[2]==0
    blocked = "fetch('https://example.com/',{signal:AbortSignal.timeout(2000)}).then(()=>process.exit(1)).catch(()=>console.log('public-network-blocked'))"
    assert run('docker','exec',admin['Id'],'node','--input-type=module','-e',blocked)=='public-network-blocked'
    setup = json.loads((base/'setup.json').read_text())
    save(base/'verification.json',{'passed':True,'port':identity['port'],'project':identity['project'],**setup,
        'databaseMigrations':rows[0],'seededServiceRows':rows[1],'pins':rows[2],
        'emptyRegionalInventory':True,'workerAvailable':True,'pages':pages,'docsAndApi':True,
        'internalNetwork':True,'publicNetworkBlocked':True,'bothRegionalAliasesReadOnly':True})
    print('Fresh migrations, seed, maps/settings flags, empty inventory, docs/API and offline isolation verified.',flush=True)


def stop(base):
    identity = ownership(base)
    for name in SERVICES:
        identifier = compose(base,'ps','-aq',name)
        if identifier:
            assert inspect(identifier)['Config']['Labels']['com.docker.compose.project'] == identity['project']
    identifier = relay_pid(base)
    if identifier:
        os.kill(identifier,signal.SIGTERM)
    (base/'relay.pid').unlink(missing_ok=True)
    print(compose(base,'stop'),flush=True)
    print('Only clean fixture services stopped; its independent data retained.',flush=True)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','start','verify','stop','relay'])
    parser.add_argument('--state-dir',required=True,type=Path)
    parser.add_argument('--admin-image')
    parser.add_argument('--worker-image')
    parser.add_argument('--port',type=int,default=8085)
    options = parser.parse_args()
    if options.action=='prepare':
        assert options.admin_image and options.worker_image
        prepare(options.state_dir,options.admin_image,options.worker_image,options.port)
    elif options.action=='relay':
        asyncio.run(relay(options.state_dir))
    else:
        globals()[options.action](options.state_dir)
