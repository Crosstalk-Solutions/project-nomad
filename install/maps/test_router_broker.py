"""Broker contract tests. No Docker, graph downloads, or Valhalla process is started."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError


spec = importlib.util.spec_from_file_location('router_broker', Path(__file__).with_name('router_broker.py'))
broker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)


class Response(io.BytesIO):
    status = 200


class FakeProcess:
    def __init__(self, running=True):
        self.running = running
        self.terminated = False

    def poll(self):
        return None if self.running else 0

    def terminate(self):
        self.terminated = True
        self.running = False

    def wait(self, timeout):
        return self.poll()


def route(package_id='region-a', **request_options):
    request = {
        'costing': 'auto',
        'locations': [{'lat': -22.9, 'lon': -43.2}, {'lat': -22.91, 'lon': -43.21}],
    }
    request.update(request_options)
    return {'packageId': package_id, 'packageVersion': '2026-11', 'request': request}


def config():
    return {
        'mjolnir': {'tile_url': 'https://unwanted.invalid/tiles', 'traffic_extract': '/data/traffic.tar'},
        'additional_data': {'elevation': '/data/elevation'},
        'httpd': {'service': {}},
        **{name: {'service': {}} for name in ('loki', 'thor', 'odin', 'meili')},
    }


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.patch(broker, 'ROOT', self.root / 'packs')
        self.patch(broker, 'REGIONS_ROOT', self.root / 'regions')
        self.patch(broker, 'WORK', self.root / 'work')
        broker.PROCESS, broker.DATASET = None, None
        self.addCleanup(self.clear_process)

    def clear_process(self):
        # All processes in these tests are fakes; never leave one for atexit.
        broker.PROCESS, broker.DATASET = None, None

    def patch(self, target, name, *args, **kwargs):
        patcher = patch.object(target, name, *args, **kwargs)
        result = patcher.start()
        self.addCleanup(patcher.stop)
        return result

    def graph(self, package_id='region-a'):
        path = broker.ROOT / 'installed' / package_id / '2026-11' / 'routing.tar'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'a locally prepared graph')
        return path

    def test_invalid_coordinates_and_envelopes_never_reach_engine(self):
        ensure = self.patch(broker, 'ensure_engine')
        invalid = [None, [], {'request': []}, route(locations=None), route(costing='bicycle')]
        for number in (True, '1', None, float('nan'), float('inf'), 91, 10 ** 400):
            invalid.append(route(locations=[{'lat': number, 'lon': 0}, {'lat': 0, 'lon': 0}]))
        invalid.append(route(locations=[{'lat': 0, 'lon': -181}, {'lat': 0, 'lon': 0}]))
        for count in (0, 1, 8):
            invalid.append(route(locations=[{'lat': 0, 'lon': 0}] * count))
        for body in invalid:
            with self.subTest(body=str(body)[:100]), self.assertRaises(ValueError):
                broker.route_request(body)
        ensure.assert_not_called()

    def test_engine_gets_only_supported_options_and_local_url(self):
        self.patch(broker, 'ensure_engine')
        engine = self.patch(broker, 'open_engine', return_value=Response(b'{"trip":{"status":0}}'))
        body = route(tile_url='https://unwanted.invalid', costing_options={'auto': {'use_tolls': 0}},
                     units='miles', shape_format='geojson', language='pt-BR')
        body['request']['locations'][0]['search_cutoff'] = 999999
        status, response = broker.route_request(body)
        self.assertEqual((status, response), (200, {'trip': {'status': 0}}))
        request = engine.call_args.args[0]
        forwarded = json.loads(request.data)
        self.assertEqual(request.full_url, broker.ENGINE + '/route')
        self.assertEqual(set(forwarded), {'locations', 'costing', 'units', 'language', 'shape_format'})
        self.assertEqual(forwarded['units'], 'kilometers')
        self.assertEqual(forwarded['shape_format'], 'polyline6')
        self.assertEqual(set(forwarded['locations'][0]), {'lat', 'lon', 'type'})
        self.assertEqual(forwarded['locations'][0]['type'], 'break')

    def test_ordered_stops_are_forwarded_as_breaks_without_location_options(self):
        self.patch(broker, 'ensure_engine')
        engine = self.patch(broker, 'open_engine', side_effect=lambda *_args, **_kwargs: Response(b'{"trip":{"status":0}}'))
        for count in (2, 3, 4, 7):
            with self.subTest(count=count):
                locations = [{'lat': -22.9 - index / 100, 'lon': -43.2 - index / 100,
                              'type': 'through', 'search_cutoff': 999999} for index in range(count)]
                broker.route_request(route(locations=locations))
                forwarded = json.loads(engine.call_args.args[0].data)['locations']
                self.assertEqual(forwarded, [{'lat': point['lat'], 'lon': point['lon'], 'type': 'break'}
                                             for point in locations])

    def test_default_route_narration_is_english_for_car_and_walking(self):
        self.patch(broker, 'ensure_engine')
        engine = self.patch(broker, 'open_engine', side_effect=lambda *_args, **_kwargs: Response(b'{"trip":{"status":0}}'))
        for mode in ('auto', 'pedestrian'):
            with self.subTest(mode=mode):
                broker.route_request(route(costing=mode))
                self.assertEqual(json.loads(engine.call_args.args[0].data)['language'], 'en-US')

    def test_no_path_is_real_engine_error_not_synthetic_geometry(self):
        self.patch(broker, 'ensure_engine')
        error = HTTPError(broker.ENGINE + '/route', 400, 'Bad Request', {},
                          Response(b'{"error":"No path could be found for input","error_code":442}'))
        self.patch(broker, 'open_engine', side_effect=error)
        status, body = broker.route_request(route())
        self.assertEqual(status, 400)
        self.assertEqual(body['engine']['error_code'], 442)
        self.assertIn('No path', body['message'])
        self.assertNotIn('trip', body)

    def test_distance_rejection_retains_its_engine_code_and_actual_limit(self):
        self.patch(broker, 'ensure_engine')
        details = {'error_code': 154, 'error': 'Path distance exceeds the max distance limit: 250000 meters'}
        self.patch(broker, 'open_engine', side_effect=HTTPError(
            broker.ENGINE + '/route', 400, 'Bad Request', {},
            Response(json.dumps(details).encode())))
        status, body = broker.route_request(route(costing='pedestrian'))
        self.assertEqual(status, 400)
        self.assertEqual(body['engine'], details)
        self.assertNotIn('trip', body)

    def test_calculation_timeout_is_distinct_from_a_missing_path(self):
        self.patch(broker, 'ensure_engine')
        self.patch(broker, 'open_engine', side_effect=TimeoutError('deadline'))
        stop = self.patch(broker, 'stop_engine')
        with self.assertRaises(broker.BrokerError) as caught:
            broker.route_request(route())
        self.assertEqual(caught.exception.status, 504)
        self.assertEqual(caught.exception.code, 'ENGINE_TIMEOUT')
        stop.assert_called_once()

    def test_engine_server_failure_is_not_reported_as_no_road(self):
        self.patch(broker, 'ensure_engine')
        self.patch(broker, 'open_engine', side_effect=HTTPError(
            broker.ENGINE + '/route', 500, 'Failure', {}, Response(b'{"error":"Internal failure"}')))
        with self.assertRaises(broker.BrokerError) as caught:
            broker.route_request(route())
        self.assertEqual(caught.exception.status, 502)
        self.assertNotIn('No road', str(caught.exception))

    def test_invalid_engine_json_is_bad_gateway_not_invalid_user_request(self):
        self.patch(broker, 'ensure_engine')
        self.patch(broker, 'open_engine', return_value=Response(b'<html>failed</html>'))
        with self.assertRaises(broker.BrokerError) as caught:
            broker.route_request(route())
        self.assertEqual(caught.exception.status, 502)

    def test_response_size_is_bounded(self):
        self.patch(broker, 'MAX_ENGINE_RESPONSE', 10)
        with self.assertRaises(broker.BrokerError) as caught:
            broker.engine_json(Response(b'{"too_long":true}'))
        self.assertEqual(caught.exception.status, 502)

    def test_nonfinite_json_is_rejected(self):
        with self.assertRaises(ValueError):
            broker.json_object('{"value":NaN}')
        with self.assertRaises(ValueError):
            broker.json_object('[]')

    def test_missing_graph_and_path_traversal_are_distinct_errors(self):
        with self.assertRaises(ValueError):
            broker.graph_path('../region-a', '2026-11')
        with self.assertRaises(ValueError):
            broker.graph_path('region-a', '../2026-11')
        with self.assertRaises(broker.BrokerError) as caught:
            broker.graph_path('region-a', '2026-11')
        self.assertEqual(caught.exception.status, 409)

    def test_symlink_cannot_substitute_another_graph(self):
        graph = self.graph()
        other = self.graph('region-b')
        graph.unlink()
        try:
            graph.symlink_to(other)
        except OSError as error:
            self.skipTest(f'Symlink creation is unavailable: {error}')
        with self.assertRaises(broker.BrokerError):
            broker.graph_path('region-a', '2026-11')

    def test_region_namespace_uses_component_version_path_independently_of_legacy_packs(self):
        legacy = self.graph('same-id')
        regional = broker.REGIONS_ROOT / 'installed' / 'same-id' / 'routing' / '2026-11' / 'routing.tar'
        regional.parent.mkdir(parents=True)
        regional.write_bytes(b'a separate full-region graph')
        self.assertEqual(broker.graph_path('same-id', '2026-11'), legacy)
        self.assertEqual(broker.graph_path('same-id', '2026-11', 'regions'), regional)
        self.assertNotEqual(legacy.read_bytes(), regional.read_bytes())

    def test_missing_region_graph_never_falls_back_to_a_legacy_pack_with_the_same_id(self):
        self.graph('same-id')
        with self.assertRaises(broker.BrokerError) as caught:
            broker.graph_path('same-id', '2026-11', 'regions')
        self.assertEqual(caught.exception.status, 409)

    def test_region_graph_ids_and_namespace_are_validated(self):
        for identity, version, namespace in [
            ('../region-a', '2026-11', 'regions'),
            ('region-a', '../2026-11', 'regions'),
            ('region-a', '2026-11', 'unknown'),
            ('a' * 121, '2026-11', 'regions'),
        ]:
            with self.subTest(identity=identity, namespace=namespace), self.assertRaises(ValueError):
                broker.graph_path(identity, version, namespace)

    def test_region_route_selects_the_region_namespace_instead_of_the_legacy_namespace(self):
        ensure = self.patch(broker, 'ensure_engine')
        self.patch(broker, 'open_engine', return_value=Response(b'{"trip":{"status":0}}'))
        body = route('brazil-southeast')
        body['namespace'] = 'regions'
        status, _ = broker.route_request(body)
        self.assertEqual(status, 200)
        ensure.assert_called_once_with('brazil-southeast', '2026-11', 'regions')

    def test_unknown_route_namespace_is_an_http_400_instead_of_silent_legacy_fallback(self):
        ensure = self.patch(broker, 'ensure_engine')
        body = route('region-a')
        body['namespace'] = 'unsupported-region-format'
        content = json.dumps(body).encode()
        handler = object.__new__(broker.Handler)
        handler.path = '/route'
        handler.headers = {'Content-Length': str(len(content))}
        handler.rfile = io.BytesIO(content)
        handler.send_json = Mock()
        handler.do_POST()
        self.assertEqual(handler.send_json.call_args.args[0], 400)
        ensure.assert_not_called()

    def test_config_has_no_remote_graph_or_shared_auxiliary_data(self):
        graph = self.graph()
        self.patch(broker.subprocess, 'check_output', return_value=json.dumps(config()))
        result = broker.engine_config(graph)
        self.assertEqual(result['mjolnir']['tile_url'], '')
        self.assertEqual(result['mjolnir']['traffic_extract'], '')
        self.assertEqual(result['mjolnir']['tile_extract'], str(graph))
        self.assertEqual(result['loki']['actions'], ['route', 'status'])
        self.assertEqual(result['httpd']['service']['listen'], 'tcp://127.0.0.1:8002')
        for key in ('tile_dir', 'admin', 'landmarks', 'timezone', 'transit_dir', 'transit_feeds_dir'):
            self.assertTrue(Path(result['mjolnir'][key]).is_relative_to(broker.WORK))
        self.assertTrue(Path(result['additional_data']['elevation']).is_relative_to(broker.WORK))
        self.assertTrue((broker.WORK / 'empty-tiles').is_dir())

    def test_engine_redirects_and_environment_proxies_are_disabled(self):
        for handler in broker.ENGINE_OPENER.handlers:
            if hasattr(handler, 'proxies'):
                self.assertEqual(handler.proxies, {})
        with self.assertRaises(HTTPError):
            broker.NoEngineRedirects().redirect_request(
                broker.Request(broker.ENGINE + '/route'), None, 302, 'Found', {}, 'https://elsewhere.invalid')

    def test_failed_startup_discards_process_and_dataset(self):
        self.graph()
        self.patch(broker.subprocess, 'check_output', return_value=json.dumps(config()))
        process = FakeProcess(running=False)
        self.patch(broker.subprocess, 'Popen', return_value=process)
        with self.assertRaises(RuntimeError):
            broker.ensure_engine('region-a', '2026-11')
        self.assertIsNone(broker.PROCESS)
        self.assertIsNone(broker.DATASET)

    def test_invalid_generated_config_is_service_error(self):
        self.graph()
        self.patch(broker.subprocess, 'check_output', return_value='not json')
        start = self.patch(broker.subprocess, 'Popen')
        with self.assertRaises(broker.BrokerError) as caught:
            broker.ensure_engine('region-a', '2026-11')
        self.assertEqual(caught.exception.status, 503)
        start.assert_not_called()

    def test_startup_timeout_terminates_unready_engine(self):
        self.graph()
        self.patch(broker.subprocess, 'check_output', return_value=json.dumps(config()))
        process = FakeProcess()
        self.patch(broker.subprocess, 'Popen', return_value=process)
        self.patch(broker.time, 'monotonic', side_effect=[0, 46])
        with self.assertRaises(RuntimeError):
            broker.ensure_engine('region-a', '2026-11')
        self.assertTrue(process.terminated)
        self.assertIsNone(broker.PROCESS)

    def test_unchanged_graph_reuses_engine_but_changed_file_reloads(self):
        graph = self.graph()
        self.patch(broker.subprocess, 'check_output', return_value=json.dumps(config()))
        processes = [FakeProcess(), FakeProcess()]
        start = self.patch(broker.subprocess, 'Popen', side_effect=processes)
        self.patch(broker, 'open_engine', side_effect=lambda *_args, **_kwargs: Response(b'{}'))
        broker.ensure_engine('region-a', '2026-11')
        broker.ensure_engine('region-a', '2026-11')
        self.assertEqual(start.call_count, 1)
        graph.write_bytes(b'a different graph, written to the same inode')
        broker.ensure_engine('region-a', '2026-11')
        self.assertEqual(start.call_count, 2)
        self.assertTrue(processes[0].terminated)

    def test_transport_failure_unloads_engine(self):
        self.patch(broker, 'ensure_engine')
        stop = self.patch(broker, 'stop_engine')
        self.patch(broker, 'open_engine', side_effect=URLError('disconnected'))
        with self.assertRaises(broker.BrokerError) as caught:
            broker.route_request(route())
        self.assertEqual(caught.exception.status, 503)
        stop.assert_called_once()

    def test_status_does_not_claim_a_crashed_graph_is_loaded(self):
        self.patch(broker.shutil, 'which', return_value='/bin/available')
        broker.PROCESS = FakeProcess(running=False)
        broker.DATASET = ('region-a', '2026-11', 1)
        self.assertEqual(broker.broker_status(), {'ready': True, 'engineReady': False, 'loadedPackage': None})

    def test_dataset_switch_waits_for_entire_inflight_route(self):
        first_entered, release_first = threading.Event(), threading.Event()
        second_attempted, second_loaded = threading.Event(), threading.Event()
        current = [None]
        results, errors = {}, []

        def ensure(package_id, _version):
            current[0] = package_id
            if package_id == 'region-b':
                second_loaded.set()

        def engine(_request, timeout):
            if current[0] == 'region-a':
                first_entered.set()
                if not release_first.wait(2):
                    raise RuntimeError('Test did not release the first route')
            return Response(json.dumps({'graph_used': current[0]}).encode())

        def calculate(package_id):
            try:
                if package_id == 'region-b':
                    second_attempted.set()
                results[package_id] = broker.route_request(route(package_id))[1]['graph_used']
            except Exception as error:
                errors.append(error)

        self.patch(broker, 'ensure_engine', side_effect=ensure)
        self.patch(broker, 'open_engine', side_effect=engine)
        first = threading.Thread(target=calculate, args=('region-a',))
        second = threading.Thread(target=calculate, args=('region-b',))
        first.start()
        try:
            self.assertTrue(first_entered.wait(1))
            second.start()
            self.assertTrue(second_attempted.wait(1))
            self.assertFalse(second_loaded.wait(0.05))
        finally:
            release_first.set()
            first.join(2)
            if second.ident:
                second.join(2)
        self.assertEqual(errors, [])
        self.assertEqual(results, {'region-a': 'region-a', 'region-b': 'region-b'})


if __name__ == '__main__':
    unittest.main()
