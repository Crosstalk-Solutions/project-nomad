#!/usr/bin/env python3
"""Prepare only opt-in regional storage; never starts Docker or changes legacy data.

Run in Linux/WSL. Compose validation captures private configuration in memory;
neither tokens nor the resolved configuration are printed or saved.
"""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from uuid import uuid4


class ProvisionError(ValueError):
    pass


def truth(value):
    return str(value).lower() in {'true', '1'}


def directory(path):
    if path.is_symlink() or not path.is_dir() or path.resolve() != path:
        raise ProvisionError('Use an existing, absolute storage directory without symlinks or parent traversal.')


def mount(service, target):
    found = [item for item in service.get('volumes', []) if isinstance(item, dict) and item.get('target') == target]
    if len(found) != 1 or found[0].get('type') != 'bind':
        raise ProvisionError('The expected persistent bind mounts are missing or ambiguous.')
    return found[0]


def validate_compose(value, storage, uid=65532, gid=65532):
    services = value.get('services', {})
    admin, worker = services.get('admin', {}), services.get('world-offline-worker', {})
    app_env, worker_env = admin.get('environment', {}), worker.get('environment', {})
    if not truth(app_env.get('WORLD_OFFLINE_ENABLED')) or not truth(app_env.get('LOCAL_DETAIL_ENABLED')) \
            or not truth(app_env.get('MAP_DETAIL_INDICATOR_ENABLED')):
        raise ProvisionError('Load both optional overlays after the existing management Compose file.')
    if truth(worker_env.get('WORLD_WORKER_LOCAL_ONLY')):
        raise ProvisionError('The shared downloader must run in combined mode, not regional-only mode.')
    token = worker_env.get('WORLD_WORKER_TOKEN')
    if not isinstance(token, str) or len(token.encode()) < 32 or any(not 33 <= ord(character) <= 126 for character in token) \
            or token in {'replaceme', 'change-me'} or worker_env.get('WORLD_WORKER_TOKEN_FILE') \
            or app_env.get('WORLD_OFFLINE_WORKER_TOKEN') != token or app_env.get('LOCAL_DETAIL_WORKER_TOKEN') != token:
        raise ProvisionError('Set one private token of at least 32 printable ASCII bytes, without whitespace, shared by both admin worker settings and the downloader.')
    expected_url = 'http://world-offline-worker:8083'
    if app_env.get('WORLD_OFFLINE_WORKER_URL') != expected_url or app_env.get('LOCAL_DETAIL_WORKER_URL') != expected_url:
        raise ProvisionError('Use the same private world-offline-worker service URL for both map download features.')
    if worker.get('ports') or worker.get('network_mode'):
        raise ProvisionError('Do not publish the map worker port or use host networking.')
    configured_user = str(worker.get('user') or '65532:65532')
    if configured_user != f'{uid}:{gid}' or uid == 0 or gid == 0:
        raise ProvisionError('Match --uid/--gid to the downloader non-root numeric user.')
    world = mount(worker, '/data/maps')
    original = mount(admin, '/app/storage')
    local = mount(admin, '/app/local-detail')
    alias = mount(admin, '/app/storage/local-detail')
    writable = mount(worker, '/data/local-detail')
    root = storage / 'local-detail'
    if Path(original['source']) != storage or Path(world['source']) != storage / 'maps':
        raise ProvisionError('NOMAD_STORAGE_PATH must match the existing admin storage bind. This helper does not relocate data.')
    if Path(app_env.get('NOMAD_STORAGE_PATH', '')) != storage:
        raise ProvisionError('Keep the admin NOMAD_STORAGE_PATH fallback equal to its existing storage bind.')
    if (Path(local['source']) != root or Path(alias['source']) != root or Path(writable['source']) != root
            or not local.get('read_only') or not alias.get('read_only') or writable.get('read_only')):
        raise ProvisionError('Use a separate shared regional bind: read-only in admin, writable only by the downloader.')
    if app_env.get('LOCAL_DETAIL_STORAGE_PATH') != '/app/local-detail' \
            or worker_env.get('LOCAL_DETAIL_MAPS_DIR') != '/data/local-detail/pmtiles' \
            or worker_env.get('LOCAL_DETAIL_STATE_DIR') != '/data/local-detail/.state':
        raise ProvisionError('Use the documented sibling regional archive and checkpoint paths.')
    return {'combinedWorker': True, 'privateWorkerPort': True, 'regionalAdminReadOnly': True}


def compose_configuration(files, project_directory=None, env_file=None):
    command = ['docker', 'compose']
    if project_directory:
        command += ['--project-directory', str(project_directory)]
    if env_file:
        command += ['--env-file', str(env_file)]
    for filename in files:
        command += ['-f', str(filename)]
    try:
        result = subprocess.run(command + ['config', '--format', 'json'], capture_output=True, text=True, timeout=30, check=True)
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise ProvisionError('Compose validation failed. Check the file paths, required environment and Docker Compose installation. No private configuration is printed.') from error


def prepare_storage(storage, uid=65532, gid=65532, prepare=False):
    if os.name != 'posix':
        raise ProvisionError('Run this helper inside Linux or WSL, using the Linux path to the existing NOMAD storage.')
    if not storage.is_absolute() or '..' in storage.parts:
        raise ProvisionError('Use the absolute Linux path to the existing NOMAD storage.')
    directory(storage)
    directory(storage / 'maps')
    if prepare and os.geteuid() != 0 and (uid, gid) != (os.getuid(), os.getgid()):
        raise ProvisionError('Run --prepare with sudo to create the downloader-owned regional directories.')
    root = storage / 'local-detail'
    targets = [(root, 0o755), (root / 'pmtiles', 0o755), (root / '.state', 0o700)]
    # Validate all existing paths before making any permission changes.
    for path, _ in targets:
        if path.exists() or path.is_symlink():
            directory(path)
    if root.exists():
        known = {'pmtiles', '.state'}
        if any(path.name not in known for path in root.iterdir()):
            raise ProvisionError('The regional root contains unrelated files. Choose the documented dedicated layout; no data was changed.')
    created = 0
    for path, mode in targets:
        if prepare:
            if not path.exists():
                path.mkdir(mode=mode)
                created += 1
            info = path.stat()
            if (info.st_uid, info.st_gid) != (uid, gid):
                if os.geteuid() != 0:
                    raise ProvisionError('Run --prepare with sudo to grant the downloader access to its three regional directories only.')
                os.chown(path, uid, gid)
            os.chmod(path, mode)
        if not path.exists():
            raise ProvisionError('Regional storage is not prepared. Run this command with --prepare first.')
        info = path.stat()
        if (info.st_uid, info.st_gid) != (uid, gid) or stat.S_IMODE(info.st_mode) != mode:
            raise ProvisionError('Regional directory permissions do not match the downloader. Use --prepare on a Linux filesystem; WSL /mnt drives may require metadata support.')
    if len({path.stat().st_dev for path, _ in targets}) != 1:
        raise ProvisionError('Regional archives and checkpoint state must be siblings on one persistent filesystem.')
    # This small probe never opens, changes or deletes existing map/state files.
    name = '.nomad-regional-preflight-' + uuid4().hex
    probe, published = root / '.state' / name, root / 'pmtiles' / name
    try:
        probe.write_bytes(b'regional-storage-preflight\n')
        os.link(probe, published, follow_symlinks=False)
    except OSError as error:
        raise ProvisionError('Regional storage must support writable regular files and hard links on the same filesystem.') from error
    finally:
        probe.unlink(missing_ok=True)
        published.unlink(missing_ok=True)
    return {'regionalDirectoriesReady': True, 'newDirectories': created, 'workerUid': uid, 'workerGid': gid,
            'legacyDirectoriesChanged': False, 'installedArchivesChanged': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--storage', required=True, type=Path, help='Existing absolute Linux NOMAD storage path')
    parser.add_argument('--prepare', action='store_true', help='Create/fix only local-detail, pmtiles and .state directory ownership/modes')
    parser.add_argument('--uid', type=int, default=65532)
    parser.add_argument('--gid', type=int, default=65532)
    parser.add_argument('--compose', action='append', type=Path, default=[], help='Compose file, in merge order; repeat for all three files')
    parser.add_argument('--project-directory', type=Path, help='Optional Compose project directory; by default Compose uses the first file directory')
    parser.add_argument('--env-file', type=Path, help='Optional private Compose environment file; its values are never printed')
    args = parser.parse_args()
    try:
        if args.uid < 1 or args.gid < 1:
            raise ProvisionError('The downloader must use a non-root UID/GID.')
        configuration = validate_compose(compose_configuration(args.compose, args.project_directory, args.env_file), args.storage, args.uid, args.gid) if args.compose else {}
        result = prepare_storage(args.storage, args.uid, args.gid, args.prepare)
        print(json.dumps({**result, **configuration, 'composeValidated': bool(args.compose)}))
    except (OSError, ProvisionError) as error:
        print('Regional map preflight: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
