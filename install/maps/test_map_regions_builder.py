"""Cancellation tests with real disposable process groups; no map data needed."""
import concurrent.futures
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch


class BuilderCancellationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        spec=importlib.util.spec_from_file_location('builder_under_test',Path(__file__).with_name('map_regions_builder.py'))
        cls.builder=importlib.util.module_from_spec(spec)
        with patch.dict(os.environ,{'MAP_REGIONS_PATH':cls.temp.name}), patch('subprocess.check_output',return_value='test-engine'):
            spec.loader.exec_module(cls.builder)

    @classmethod
    def tearDownClass(cls):
        cls.builder.POOL.shutdown(wait=True,cancel_futures=True)
        cls.temp.cleanup()

    def setUp(self):
        self.job='test-'+self._testMethodName.replace('_','-')

    def test_cancel_before_start_is_a_durable_tombstone(self):
        result=self.builder.cancel_build(self.job)
        self.assertEqual(result['status'],'cancelled')
        self.assertTrue((self.builder.JOBS/(self.job+'.cancel')).exists())
        with self.assertRaises(self.builder.Cancelled):
            self.builder.check_cancelled(self.job)

    def test_late_completion_cannot_override_cancellation(self):
        self.builder.cancel_build(self.job)
        self.builder.state(self.job,{'status':'completed','artifact':{'relativePath':'late/routing.tar'}})
        value=json.loads((self.builder.JOBS/(self.job+'.json')).read_text())
        self.assertEqual(value['status'],'cancelled')
        self.assertNotIn('artifact',value)

    def test_queued_future_is_cancelled_before_it_starts(self):
        hold=threading.Event()
        executor=concurrent.futures.ThreadPoolExecutor(max_workers=1)
        active=executor.submit(hold.wait)
        started=[]
        try:
            self.builder.state(self.job,{'status':'preparing'})
            future=executor.submit(lambda:started.append(True))
            self.builder.FUTURES[self.job]=future
            self.assertEqual(self.builder.cancel_build(self.job)['status'],'cancelled')
            self.assertTrue(future.cancelled())
        finally:
            hold.set();active.result(timeout=2);executor.shutdown(wait=True,cancel_futures=True)
        self.assertEqual(started,[])

    @unittest.skipUnless(os.name=='posix','Process groups are used inside the Linux map builder')
    def test_running_command_and_its_child_process_stop(self):
        directory=self.builder.ROOT/self.job
        directory.mkdir()
        heartbeat=directory/'heartbeat'
        child=directory/'child.py'
        child.write_text('import pathlib,time\np=pathlib.Path('+repr(str(heartbeat))+')\nwhile True:\n p.write_text(str(time.time()))\n time.sleep(.04)\n')
        command=[sys.executable,'-c','import subprocess,sys,time; subprocess.Popen([sys.executable,sys.argv[1]]); time.sleep(60)',str(child)]
        errors=[]
        self.builder.state(self.job,{'status':'preparing'})
        def run():
            try:
                self.builder.run(command,directory,directory/'build.log',self.job)
            except self.builder.Cancelled as error:
                errors.append(str(error))
        worker=threading.Thread(target=run)
        worker.start()
        deadline=time.monotonic()+4
        while not heartbeat.exists():
            self.assertLess(time.monotonic(),deadline)
            time.sleep(.02)
        response=self.builder.cancel_build(self.job)
        worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(response['status'],'cancelled')
        self.assertTrue(errors)
        previous=heartbeat.read_text()
        time.sleep(.2)
        self.assertEqual(heartbeat.read_text(),previous)
        self.assertNotIn(self.job,self.builder.PROCESSES)

    def test_finished_artifact_cancel_is_idempotent(self):
        self.builder.state(self.job,{'jobId':self.job,'status':'completed','artifact':{'sizeBytes':8}})
        self.assertEqual(self.builder.cancel_build(self.job)['status'],'completed')
        self.assertEqual(self.builder.cancel_build(self.job)['status'],'completed')

    def test_cancel_endpoint_prevents_a_late_build_post(self):
        source=self.builder.ROOT/'sources'/self.job/'source.osm.pbf'
        source.parent.mkdir(parents=True);source.write_bytes(b'not executed')
        server=self.builder.ThreadingHTTPServer(('127.0.0.1',0),self.builder.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(server.server_port)
        try:
            with urllib.request.urlopen(urllib.request.Request(base+'/build/'+self.job+'/cancel',method='POST')) as response:
                self.assertEqual(json.load(response)['status'],'cancelled')
            request={'jobId':self.job,'regionId':'andorra','component':'routing','source':{'relativePath':str(source.relative_to(self.builder.ROOT)),'format':'osm-pbf'},'outputRelativePath':'staging/'+self.job+'/routing.tar'}
            with self.assertRaises(urllib.error.HTTPError) as failure:
                urllib.request.urlopen(urllib.request.Request(base+'/build',json.dumps(request).encode(),headers={'Content-Type':'application/json'}))
            self.assertEqual(failure.exception.code,409)
            self.assertNotIn(self.job,self.builder.FUTURES)
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)

    def test_job_namespaces_are_independent_and_reject_paths_or_data_directories(self):
        root=self.builder.ROOT
        self.assertEqual(self.builder.job_directory(root,'builder-jobs'),root/'builder-jobs')
        self.assertEqual(self.builder.job_directory(root,'builder-other-jobs'),root/'builder-other-jobs')
        for namespace in ('../builder-jobs','/tmp/jobs','a/b','', '.', 'sources','staging','state','installed','tmp'):
            with self.assertRaises(ValueError,msg=namespace):
                self.builder.job_directory(root,namespace)

    def test_status_reports_routing_only_without_changing_job_namespace(self):
        server=self.builder.ThreadingHTTPServer(('127.0.0.1',0),self.builder.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port)+'/status') as response:
                value=json.load(response)
            self.assertTrue(value['ready'])
            self.assertTrue(value['routingReady'])
            self.assertEqual(value['jobNamespace'],'builder-jobs')
            self.assertEqual(value['telemetryVersion'],1)
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)

    def test_heartbeat_is_independent_of_advancement_and_phase_counters_do_not_leak(self):
        clock=[0.0]
        telemetry=self.builder.JobTelemetry(self.job,'source_update',clock=lambda:clock[0],now=lambda:'stamp-'+str(clock[0]))
        telemetry.update(phase='verifying_source',detail='source_checksum',bytesProcessed=0,totalBytes=100)
        clock[0]=2
        telemetry.update(bytesProcessed=40)
        self.assertEqual(telemetry.value['bytesPerSecond'],20)
        self.assertEqual(telemetry.value['etaSeconds'],3)
        self.assertEqual(telemetry.value['lastProgressAt'],'stamp-2')
        clock[0]=5
        telemetry.heartbeat()
        value=json.loads((self.builder.JOBS/(self.job+'.json')).read_text())
        self.assertEqual(value['heartbeatAt'],'stamp-5')
        self.assertEqual(value['lastProgressAt'],'stamp-2')
        self.assertEqual(value['bytesProcessed'],40)
        telemetry.update(phase='building_routing',detail='routing_tiles')
        for field in ('bytesProcessed','totalBytes','bytesPerSecond','etaSeconds','progress','recordsTotal'):
            self.assertNotIn(field,telemetry.value)
        self.assertEqual(telemetry.value['operationKind'],'source_update')

    def test_source_verification_reports_real_bytes_and_obeys_cancellation(self):
        path=self.builder.ROOT/(self.job+'-source')
        contents=b'local public fixture'*100
        path.write_bytes(contents)
        telemetry=self.builder.JobTelemetry(self.job)
        digest=self.builder.verified_digest(path,telemetry,'verifying_source','source_checksum',self.job)
        self.assertEqual(digest,hashlib.sha256(contents).hexdigest())
        self.assertEqual(telemetry.value['bytesProcessed'],len(contents))
        self.assertEqual(telemetry.value['totalBytes'],len(contents))
        self.builder.cancel_build(self.job)
        with self.assertRaises(self.builder.Cancelled):
            self.builder.verified_digest(path,telemetry,'verifying_source','source_checksum',self.job)

    def test_http_submission_is_really_queued_until_serial_worker_is_available(self):
        source=self.builder.ROOT/'sources'/self.job/'source.osm.pbf'
        source.parent.mkdir(parents=True);source.write_bytes(b'not executed')
        hold=threading.Event()
        executor=concurrent.futures.ThreadPoolExecutor(max_workers=1)
        active=executor.submit(hold.wait)
        server=self.builder.ThreadingHTTPServer(('127.0.0.1',0),self.builder.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            request={'jobId':self.job,'regionId':'andorra','component':'routing','operationKind':'install',
                     'source':{'relativePath':str(source.relative_to(self.builder.ROOT)),'format':'osm-pbf'},
                     'outputRelativePath':'staging/'+self.job+'/routing.tar'}
            with patch.object(self.builder,'POOL',executor):
                with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+'/build',json.dumps(request).encode(),headers={'Content-Type':'application/json'})) as response:
                    self.assertEqual(response.status,202)
            value=json.loads((self.builder.JOBS/(self.job+'.json')).read_text())
            self.assertEqual(value['status'],'queued')
            self.assertEqual(value['phase'],'queued')
            self.assertEqual(value['operationKind'],'install')
            self.assertNotIn('startedAt',value)
            self.assertEqual(self.builder.cancel_build(self.job)['status'],'cancelled')
            self.assertTrue(self.builder.FUTURES[self.job].cancelled())
        finally:
            hold.set();active.result(timeout=2);executor.shutdown(wait=True,cancel_futures=True)
            server.shutdown();server.server_close();thread.join(timeout=2)

    def test_http_rejects_unsupported_components_before_source_io_or_queueing(self):
        server=self.builder.ThreadingHTTPServer(('127.0.0.1',0),self.builder.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        # No source/output fields: component rejection must happen before their validation.
        body={'jobId':self.job,'regionId':'andorra','component':'unsupported'}
        try:
            with patch.object(self.builder,'local_path') as local, patch.object(self.builder.POOL,'submit') as submit:
                with self.assertRaises(urllib.error.HTTPError) as failure:
                    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+'/build',json.dumps(body).encode(),headers={'Content-Type':'application/json'}))
                self.assertEqual(failure.exception.code,400)
                self.assertIn('Only routing',json.load(failure.exception)['error'])
                local.assert_not_called();submit.assert_not_called()
            self.assertFalse((self.builder.JOBS/(self.job+'.json')).exists())
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)

    def test_direct_unsupported_build_fails_before_hashing_output_or_native_work(self):
        body={'jobId':self.job,'regionId':'andorra','component':'unsupported'}
        with patch.object(self.builder,'verified_digest') as digest, patch.object(self.builder,'local_path') as local, patch.object(self.builder,'run') as run:
            self.builder.build(body)
            digest.assert_not_called();local.assert_not_called();run.assert_not_called()
        value=json.loads((self.builder.JOBS/(self.job+'.json')).read_text())
        self.assertEqual(value['status'],'failed')
        self.assertIn('Only routing',value['error'])
        self.assertNotIn('artifact',value)

    def test_routing_build_persists_ready_telemetry_and_verified_artifact(self):
        source=self.builder.ROOT/'sources'/self.job/'source.osm.pbf'
        source.parent.mkdir(parents=True);source.write_bytes(b'local route fixture')
        body={'jobId':self.job,'regionId':'andorra','component':'routing','operationKind':'install',
              'source':{'relativePath':str(source.relative_to(self.builder.ROOT)),'format':'osm-pbf',
                        'sourceId':'geofabrik','sha256':hashlib.sha256(source.read_bytes()).hexdigest()},
              'outputRelativePath':'staging/'+self.job+'/routing.tar'}
        commands=[]
        def native_run(command,directory,log,job_id):
            commands.append(command[0])
            if command[0]=='valhalla_build_extract':
                config=json.loads(Path(command[2]).read_text())
                Path(config['mjolnir']['tile_extract']).write_bytes(b'prepared route fixture')
        self.builder.state(self.job,{'jobId':self.job,'status':'queued','phase':'queued','queuedAt':'original-queue-time'})
        with patch.object(self.builder,'run',side_effect=native_run), patch.object(self.builder.subprocess,'check_output',return_value=json.dumps({'mjolnir':{}})):
            self.builder.build(body)
        value=json.loads((self.builder.JOBS/(self.job+'.json')).read_text())
        self.assertEqual(value['status'],'completed',value)
        self.assertEqual(commands,['valhalla_build_admins','valhalla_build_tiles','valhalla_build_extract'])
        self.assertEqual(value['phase'],'ready');self.assertEqual(value['progress'],100)
        self.assertEqual(value['queuedAt'],'original-queue-time')
        self.assertEqual(value['operationKind'],'install')
        self.assertTrue(value['startedAt'] and value['heartbeatAt'] and value['lastProgressAt'])
        artifact=self.builder.ROOT/value['artifact']['relativePath']
        self.assertEqual(value['artifact']['sha256'],hashlib.sha256(artifact.read_bytes()).hexdigest())
        self.assertFalse((artifact.parent/'tiles').exists())


if __name__=='__main__':
    unittest.main()
