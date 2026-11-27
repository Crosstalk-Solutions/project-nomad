"""No-network provisioning tests; optional Docker checks use small empty fixtures.

python3 install/tests/regional_maps_provision_test.py
NOMAD_REGIONAL_FIXTURE_IMAGE=<built-worker> python3 install/tests/regional_maps_provision_test.py
"""
from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
from tempfile import TemporaryDirectory
import time
import unittest
from uuid import uuid4

INSTALL = Path(__file__).resolve().parents[1]
REPOSITORY = INSTALL.parent
spec = importlib.util.spec_from_file_location('regional_preflight', INSTALL / 'prepare_regional_maps.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def token():
    return 'synthetic-provisioning-fixture-token-not-a-real-secret'


def configuration(storage):
    root = storage / 'local-detail'
    bind = lambda source, target, readonly=False: {'type': 'bind', 'source': str(source), 'target': target, 'read_only': readonly}
    return {'services': {
        'admin': {'environment': {
            'NOMAD_STORAGE_PATH': str(storage), 'WORLD_OFFLINE_ENABLED': 'true', 'LOCAL_DETAIL_ENABLED': 'true',
            'MAP_DETAIL_INDICATOR_ENABLED': 'true', 'WORLD_OFFLINE_WORKER_URL': 'http://world-offline-worker:8083',
            'LOCAL_DETAIL_WORKER_URL': 'http://world-offline-worker:8083', 'WORLD_OFFLINE_WORKER_TOKEN': token(),
            'LOCAL_DETAIL_WORKER_TOKEN': token(), 'LOCAL_DETAIL_STORAGE_PATH': '/app/local-detail'},
            'volumes': [bind(storage, '/app/storage'), bind(root, '/app/local-detail', True), bind(root, '/app/storage/local-detail', True)]},
        'world-offline-worker': {'environment': {'WORLD_WORKER_TOKEN': token(), 'WORLD_WORKER_LOCAL_ONLY': 'false',
            'LOCAL_DETAIL_MAPS_DIR': '/data/local-detail/pmtiles', 'LOCAL_DETAIL_STATE_DIR': '/data/local-detail/.state'},
            'volumes': [bind(storage / 'maps', '/data/maps'), bind(root, '/data/local-detail')]},
    }}


@unittest.skipUnless(os.name == 'posix', 'Directory ownership and mount permissions require Linux/WSL')
class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = self.enterContext(TemporaryDirectory())
        self.storage = Path(self.temporary) / 'storage'
        self.storage.mkdir()
        (self.storage / 'maps').mkdir()
        self.legacy = self.storage / 'maps' / 'legacy.pmtiles'
        self.legacy.write_bytes(b'legacy fixture must stay identical')
        self.before = (self.legacy.read_bytes(), self.legacy.stat().st_mode, (self.storage / 'maps').stat().st_mode)

    def ready(self):
        return helper.prepare_storage(self.storage, os.getuid(), os.getgid(), prepare=True)

    def test_prepare_is_idempotent_and_preserves_legacy(self):
        first, second = self.ready(), self.ready()
        self.assertEqual(first['newDirectories'], 3)
        self.assertEqual(second['newDirectories'], 0)
        helper.prepare_storage(self.storage, os.getuid(), os.getgid())
        self.assertEqual((self.legacy.read_bytes(), self.legacy.stat().st_mode, (self.storage / 'maps').stat().st_mode), self.before)
        self.assertEqual(stat.S_IMODE((self.storage / 'local-detail/.state').stat().st_mode), 0o700)
        self.assertEqual(list((self.storage / 'local-detail/.state').iterdir()), [])
        self.assertEqual(list((self.storage / 'local-detail/pmtiles').iterdir()), [])

    def test_missing_directories_fail_without_prepare(self):
        with self.assertRaises(helper.ProvisionError):
            helper.prepare_storage(self.storage, os.getuid(), os.getgid())
        self.assertFalse((self.storage / 'local-detail').exists())

    def test_symlink_and_unrelated_storage_are_rejected_before_changes(self):
        (self.storage / 'local-detail').symlink_to(self.storage / 'maps', target_is_directory=True)
        with self.assertRaises(helper.ProvisionError):
            self.ready()
        (self.storage / 'local-detail').unlink()
        (self.storage / 'local-detail').mkdir()
        sentinel = self.storage / 'local-detail/unrelated.txt'
        sentinel.write_bytes(b'keep')
        with self.assertRaises(helper.ProvisionError):
            self.ready()
        self.assertEqual(sentinel.read_bytes(), b'keep')
        self.assertFalse((self.storage / 'local-detail/pmtiles').exists())

    def test_parent_traversal_and_storage_mismatch_are_rejected(self):
        with self.assertRaises(helper.ProvisionError):
            helper.prepare_storage(self.storage / '..' / 'storage', os.getuid(), os.getgid(), True)
        with self.assertRaises(helper.ProvisionError):
            helper.validate_compose(configuration(self.storage), self.storage / 'other')


class ComposePolicyTests(unittest.TestCase):
    def setUp(self):
        self.storage = Path('/fixture/storage')
        self.value = configuration(self.storage)

    def test_one_existing_private_combined_worker_is_supported(self):
        result = helper.validate_compose(self.value, self.storage)
        self.assertTrue(result['combinedWorker'])
        self.assertEqual(set(self.value['services']), {'admin', 'world-offline-worker'})

    def test_token_mode_mount_and_public_port_mistakes_are_rejected(self):
        cases = [
            lambda value: value['services']['world-offline-worker']['environment'].update(WORLD_WORKER_TOKEN='short'),
            lambda value: value['services']['world-offline-worker']['environment'].update(WORLD_WORKER_TOKEN='x' * 32 + '\r\n'),
            lambda value: value['services']['admin']['environment'].update(LOCAL_DETAIL_WORKER_TOKEN='mismatch'),
            lambda value: value['services']['world-offline-worker']['environment'].update(WORLD_WORKER_LOCAL_ONLY='true'),
            lambda value: value['services']['world-offline-worker'].update(ports=[{'target': 8083, 'published': '8083'}]),
            lambda value: value['services']['admin']['volumes'][-1].update(read_only=False),
            lambda value: value['services']['admin']['volumes'].pop(),
            lambda value: value['services']['world-offline-worker']['volumes'][-1].update(source='/unrelated'),
        ]
        for change in cases:
            with self.subTest(change=change):
                value = deepcopy(self.value); change(value)
                with self.assertRaises(helper.ProvisionError):
                    helper.validate_compose(value, self.storage)


def docker_available():
    if not shutil.which('docker'):
        return False
    return subprocess.run(['docker', 'info', '--format', '{{.ServerVersion}}'], capture_output=True, timeout=15).returncode == 0


@unittest.skipUnless(os.name == 'posix' and shutil.which('docker'), 'Docker Compose fixture requires Linux/WSL Docker')
class CommittedComposeTests(unittest.TestCase):
    def test_actual_three_file_merge_preserves_existing_service_and_storage_behavior(self):
        if not docker_available():
            self.skipTest('Docker daemon unavailable')
        environment = {**os.environ, 'NOMAD_STORAGE_PATH': '/opt/project-nomad/storage', 'NOMAD_WORLD_ADMIN_IMAGE': 'nomad-admin:provisioning-fixture', 'WORLD_OFFLINE_TOKEN': token(),
                       'NOMAD_WORLD_WORKER_CONTEXT': str(REPOSITORY / 'world-offline-worker')}
        command = ['docker', 'compose', '--project-directory', str(INSTALL), '-f', str(INSTALL / 'management_compose.yaml'), '-f', str(INSTALL / 'world_offline_compose.yaml')]
        previous = json.loads(subprocess.check_output(command + ['config', '--format', 'json'], env=environment, text=True))
        current = json.loads(subprocess.check_output(command + ['-f', str(INSTALL / 'regional_maps_compose.yaml'), 'config', '--format', 'json'], env=environment, text=True))
        helper.validate_compose(current, Path(environment['NOMAD_STORAGE_PATH']))
        self.assertEqual(set(previous['services']), set(current['services']))
        for name in set(previous['services']) - {'admin', 'world-offline-worker'}:
            self.assertEqual(previous['services'][name], current['services'][name])
        for name in ('admin', 'world-offline-worker'):
            for item in previous['services'][name]['volumes']:
                self.assertIn(item, current['services'][name]['volumes'])
        self.assertFalse(helper.mount(current['services']['admin'], '/app/storage').get('read_only', False))
        self.assertFalse(truth_or_false(previous['services']['admin']['environment'].get('LOCAL_DETAIL_ENABLED')))


def truth_or_false(value):
    return str(value).lower() in {'true', '1'}


@unittest.skipUnless(os.environ.get('NOMAD_REGIONAL_FIXTURE_IMAGE'), 'Set NOMAD_REGIONAL_FIXTURE_IMAGE for the packaged-worker empty-install fixture')
class PackagedWorkerFixtureTests(unittest.TestCase):
    def test_empty_combined_install_starts_offline_and_regional_reader_is_read_only(self):
        if not docker_available():
            self.skipTest('Docker daemon unavailable')
        image = os.environ['NOMAD_REGIONAL_FIXTURE_IMAGE']
        name = 'nomad-regional-provision-fixture-' + uuid4().hex[:10]
        with TemporaryDirectory() as temporary:
            storage = Path(temporary) / 'storage'; storage.mkdir()
            (storage / 'maps').mkdir()
            # Permission preparation is constrained to a newly generated fixture.
            prepare = "from pathlib import Path;import os; p=Path('/fixture/maps'); [(p/n).mkdir(exist_ok=True) for n in ('pmtiles','.world-offline')]; [os.chown(p/n,65532,65532) for n in ('pmtiles','.world-offline')]"
            run = lambda *args: subprocess.check_output(['docker', *args], text=True, timeout=40).strip()
            run('run', '--rm', '--network', 'none', '--user', '0:0', '-v', str(storage) + ':/fixture', '--entrypoint', 'python', image, '-c', prepare)
            run('run', '--rm', '--network', 'none', '--user', '0:0', '-v', str(storage) + ':/fixture', '-v', str(INSTALL) + ':/installer:ro',
                '--entrypoint', 'python', image, '/installer/prepare_regional_maps.py', '--storage', '/fixture', '--prepare')
            try:
                run('run', '-d', '--name', name, '--network', 'none', '--read-only', '--tmpfs', '/tmp',
                    '-e', 'WORLD_WORKER_TOKEN=' + token(), '-e', 'WORLD_WORKER_LOCAL_ONLY=false', '-e', 'WORLD_HOST_DISK=', '-e', 'WORLD_WORKER_TOKEN_FILE=',
                    '-e', 'LOCAL_DETAIL_MAPS_DIR=/data/local-detail/pmtiles', '-e', 'LOCAL_DETAIL_STATE_DIR=/data/local-detail/.state',
                    '-v', str(storage / 'maps') + ':/data/maps', '-v', str(storage / 'local-detail') + ':/data/local-detail', image)
                probe = "import json,urllib.request; token='" + token() + "'; origin='http://127.0.0.1:8083'; result={};\nfor p in ('/api/lab-imagery/world','/api/lab-imagery/local-detail'):\n r=urllib.request.Request(origin+p,headers={'X-Nomad-World-Token':token}); result[p]=json.load(urllib.request.urlopen(r,timeout=2))\nassert result['/api/lab-imagery/local-detail']['cells']==[]; assert result['/api/lab-imagery/world']; print('empty-combined-worker-ready')"
                success = False
                for _ in range(30):
                    result = subprocess.run(['docker', 'exec', name, 'python', '-c', probe], capture_output=True, text=True, timeout=8)
                    if result.returncode == 0:
                        success = True; break
                    time.sleep(.2)
                self.assertTrue(success, 'Empty combined worker must start from committed setup files without network or downloaded maps')
                readonly = "from pathlib import Path;\nfor p in (Path('/app/local-detail/pmtiles'),Path('/app/storage/local-detail/pmtiles')):\n assert p.is_dir()\n try: (p/'forbidden').write_bytes(b'x')\n except OSError: pass\n else: raise AssertionError('Regional reader unexpectedly writable')\nPath('/app/storage/legacy-write-check').write_bytes(b'original storage stays writable'); print('reader-read-only')"
                self.assertEqual(run('run', '--rm', '--network', 'none', '--user', '0:0', '-v', str(storage) + ':/app/storage',
                    '-v', str(storage / 'local-detail') + ':/app/local-detail:ro', '-v', str(storage / 'local-detail') + ':/app/storage/local-detail:ro',
                    '--entrypoint', 'python', image, '-c', readonly), 'reader-read-only')
                self.assertEqual(list((storage / 'maps/pmtiles').iterdir()), [])
                self.assertEqual(list((storage / 'local-detail/pmtiles').iterdir()), [])
            finally:
                subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                # The worker-owned 0700 state would prevent a non-root CI user
                # from removing its own fixture. Change only this fresh mount.
                restore = ("import os; from pathlib import Path; root=Path('/fixture'); "
                           "assert root.is_dir() and not root.is_symlink(); "
                           "paths=[root]+list(root.rglob('*')); "
                           f"[(os.chown(p,{os.getuid()},{os.getgid()}),os.chmod(p,0o755 if p.is_dir() else 0o600)) for p in paths]")
                run('run', '--rm', '--network', 'none', '--user', '0:0', '-v', str(storage) + ':/fixture', '--entrypoint', 'python', image, '-c', restore)


if __name__ == '__main__':
    unittest.main(verbosity=2)
