#!/usr/bin/env python3
"""Internal, serial preparation worker. It consumes local source files only."""
import concurrent.futures
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import threading
import time

ROOT=Path(os.environ.get('MAP_REGIONS_PATH','/regions')).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
(ROOT/'tmp').mkdir(exist_ok=True)
# Large SQLite sorts must spill to the data disk, including with a read-only
# container root. The small /tmp tmpfs is reserved for runtime scratch files.
os.environ.setdefault('TMPDIR',str(ROOT/'tmp'))
os.environ.setdefault('SQLITE_TMPDIR',str(ROOT/'tmp'))
def job_directory(root, namespace):
    if (not isinstance(namespace,str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}',namespace)
            or namespace in ('sources','staging','installed','state','tmp')):
        raise ValueError('MAP_REGION_JOBS_SUBDIR must be a safe job-directory basename')
    directory=(root/namespace).resolve()
    if directory.parent!=root.resolve():
        raise ValueError('Job directory must remain inside the map-data directory')
    return directory


JOBS=job_directory(ROOT,os.environ.get('MAP_REGION_JOBS_SUBDIR','builder-jobs'))
JOBS.mkdir(exist_ok=True)
LOCK=threading.RLock()
PROCESSES={}
FUTURES={}
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=1)
ENGINE_VERSION=subprocess.check_output(['valhalla_service','--version'],text=True).strip()
ID=re.compile(r'^[a-z0-9][a-z0-9_-]{0,119}$')
TELEMETRY_VERSION=1
OPERATION_KINDS={'install','source_update'}
COUNTERS=('recordsProcessed','recordsTotal','bytesProcessed','totalBytes')
RATES=('bytesPerSecond','recordsPerSecond','etaSeconds')


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')


class JobTelemetry:
    """Small atomic job snapshots; a heartbeat is never counted as work advancing."""
    def __init__(self, job_id, operation_kind='install', clock=time.monotonic, now=utc_now):
        self.job_id,self.clock,self.now=job_id,clock,now
        path=JOBS/(job_id+'.json')
        previous=json.loads(path.read_text()) if path.exists() else {}
        stamp=now()
        self.value={'jobId':job_id,'status':'preparing','engineVersion':ENGINE_VERSION,
                    'telemetryVersion':TELEMETRY_VERSION,'operationKind':operation_kind,
                    'queuedAt':previous.get('queuedAt',stamp),'startedAt':stamp}
        self.bases={}
        self.phase_started=clock()
        self.stop=threading.Event()
        self.thread=None

    def update(self, **values):
        with LOCK:
            previous=dict(self.value)
            changed=(values.get('phase',previous.get('phase')),values.get('detail',previous.get('detail'))) != (previous.get('phase'),previous.get('detail'))
            if changed:
                for key in (*COUNTERS,*RATES,'progress'):
                    self.value.pop(key,None)
                self.bases={}
                self.phase_started=self.clock()
            self.value.update(values)
            advancing=changed or previous.get('status')!=self.value.get('status')
            for key in COUNTERS:
                number=self.value.get(key)
                if number is not None and number!=previous.get(key):
                    advancing=True
            stamp=self.now()
            self.value['heartbeatAt']=stamp
            if advancing:
                self.value['lastProgressAt']=stamp
            elapsed=self.clock()-self.phase_started
            for counter,total,rate in (('bytesProcessed','totalBytes','bytesPerSecond'),('recordsProcessed','recordsTotal','recordsPerSecond')):
                count=self.value.get(counter)
                if count is None:
                    continue
                self.bases.setdefault(counter,count)
                speed=(count-self.bases[counter])/elapsed if elapsed>0 else 0
                if speed>0:
                    self.value[rate]=speed
                    if self.value.get(total) is not None and self.value[total]>=count:
                        self.value['etaSeconds']=(self.value[total]-count)/speed
            state(self.job_id,self.value)

    def heartbeat(self):
        self.update()

    def start(self, interval=2):
        def beat():
            while not self.stop.wait(interval):
                self.heartbeat()
        self.thread=threading.Thread(target=beat,daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=3)


def verified_digest(path, telemetry, phase, detail, job_id):
    total=path.stat().st_size
    telemetry.update(phase=phase,detail=detail,bytesProcessed=0,totalBytes=total)
    digest=hashlib.sha256()
    processed=0
    previous=time.monotonic()
    with path.open('rb') as source:
        while chunk:=source.read(1024*1024):
            check_cancelled(job_id)
            digest.update(chunk)
            processed+=len(chunk)
            if time.monotonic()-previous>=1:
                telemetry.update(bytesProcessed=processed)
                previous=time.monotonic()
    telemetry.update(bytesProcessed=processed)
    return digest.hexdigest()



def local_path(relative, prefix):
    if not isinstance(relative,str) or len(relative)>600:
        raise ValueError('Invalid local path')
    path=(ROOT/relative).resolve()
    if not path.is_relative_to(ROOT/prefix):
        raise ValueError('Path is outside the prepared-data directory')
    return path

def state(job_id,value):
    with LOCK:
        value=dict(value)
        if (JOBS/(job_id+'.cancel')).exists() and value.get('status') not in ('cancelled','failed'):
            value['status']='cancelled' if value.get('status')=='completed' else 'cancelling'
            value.pop('artifact',None)
        path=JOBS/(job_id+'.json')
        temp=path.with_suffix('.tmp')
        temp.write_text(json.dumps(value))
        temp.replace(path)

class Cancelled(RuntimeError):
    pass

def check_cancelled(job_id):
    if (JOBS/(job_id+'.cancel')).exists():
        raise Cancelled('Preparation cancelled by the user.')

def stop_process(process):
    # New sessions isolate the entire command tree, including Valhalla children.
    try:
        os.killpg(process.pid,signal.SIGTERM)
    except ProcessLookupError:
        return process.poll() is not None
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
        return True
    except subprocess.TimeoutExpired:
        return False

def run(command, directory, log, job_id):
    check_cancelled(job_id)
    with log.open('ab') as stream:
        process=subprocess.Popen(command,cwd=directory,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
        with LOCK:
            PROCESSES[job_id]=process
        try:
            check_cancelled(job_id)
            deadline=time.monotonic()+12*3600
            while process.poll() is None:
                check_cancelled(job_id)
                if time.monotonic()>deadline:
                    raise subprocess.TimeoutExpired(command,12*3600)
                time.sleep(.1)
        except BaseException:
            if not stop_process(process):
                # A process stuck in kernel I/O may take time to acknowledge
                # SIGKILL. Keep the job cancelling until it actually exits.
                process.wait()
            raise
        finally:
            with LOCK:
                PROCESSES.pop(job_id,None)
    check_cancelled(job_id)
    if process.returncode:
        tail=log.read_bytes()[-5000:].decode(errors='replace')
        raise RuntimeError('Preparation command failed: '+tail[-1500:])

def build(body):
    job_id=body['jobId']
    telemetry=JobTelemetry(job_id,body.get('operationKind','install'))
    result=telemetry.value
    try:
        if body.get('component') != 'routing':
            raise ValueError('Only routing components can be prepared')
        if body.get('source',{}).get('format') != 'osm-pbf':
            raise ValueError('Routing requires an OSM PBF source')
        check_cancelled(job_id)
        telemetry.update(phase='verifying_source',detail='source_checksum')
        telemetry.start()
        source=local_path(body['source']['relativePath'],'sources')
        output=local_path(body['outputRelativePath'],'staging')
        output.parent.mkdir(parents=True,exist_ok=True)
        if verified_digest(source,telemetry,'verifying_source','source_checksum',job_id)!=body['source']['sha256']:
            raise ValueError('Local source checksum changed before preparation')
        check_cancelled(job_id)
        if output.exists():
            raise ValueError('Refusing to overwrite an existing staged artifact')
        log=output.parent/'build.log'
        tiles=output.parent/'tiles'
        tiles.mkdir()
        config=json.loads(subprocess.check_output(['valhalla_build_config'],text=True))
        config['mjolnir'].update({'tile_dir':str(tiles),'tile_extract':str(output),'concurrency':2,
                                'admin':str(output.parent/'admins.sqlite'),'timezone':'/builder/timezones.sqlite'})
        config_path=output.parent/'valhalla.json'
        config_path.write_text(json.dumps(config))
        telemetry.update(phase='building_routing',detail='routing_admins')
        run(['valhalla_build_admins','-c',str(config_path),str(source)],output.parent,log,job_id)
        telemetry.update(phase='building_routing',detail='routing_tiles')
        run(['valhalla_build_tiles','-c',str(config_path),str(source)],output.parent,log,job_id)
        telemetry.update(phase='building_routing',detail='routing_extract')
        run(['valhalla_build_extract','-c',str(config_path),'-O'],output.parent,log,job_id)
        shutil.rmtree(tiles)
        digest=verified_digest(output,telemetry,'validating','artifact_checksum',job_id)
        check_cancelled(job_id)
        telemetry.update(status='completed',phase='ready',detail='artifact_ready',progress=100,artifact={
            'relativePath':str(output.relative_to(ROOT)),'sizeBytes':output.stat().st_size,'sha256':digest})
    except Exception as error:
        telemetry.update(status='cancelled' if isinstance(error,Cancelled) or (JOBS/(job_id+'.cancel')).exists() else 'failed',error=str(error)[-2000:])
    finally:
        telemetry.close()

def cancel_build(job_id):
    with LOCK:
        path=JOBS/(job_id+'.json')
        previous=json.loads(path.read_text()) if path.exists() else {'jobId':job_id,'status':'cancelled'}
        (JOBS/(job_id+'.cancel')).write_text('cancelled')
        if previous.get('status') in ('completed','failed','cancelled'):
            return previous
        previous.update(status='cancelling')
        state(job_id,previous)
        future=FUTURES.get(job_id)
        if future and future.cancel():
            previous.update(status='cancelled')
            state(job_id,previous)
            return previous
        process=PROCESSES.get(job_id)
    if process:
        if not stop_process(process):
            return previous
    deadline=time.monotonic()+8
    while future and not future.done() and time.monotonic()<deadline:
        time.sleep(.05)
    with LOCK:
        if not future or future.done():
            previous=json.loads(path.read_text()) if path.exists() else previous
            if previous.get('status')=='cancelling':
                previous.update(status='cancelled')
                state(job_id,previous)
        return json.loads(path.read_text()) if path.exists() else previous

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(20)
    def send_json(self,status,value):
        content=json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(content)))
        self.end_headers()
        self.wfile.write(content)
    def do_GET(self):
        if self.path=='/status':
            return self.send_json(200,{'ready':True,'routingReady':True,'engineVersion':ENGINE_VERSION,
                                       'jobNamespace':JOBS.name,
                                       'telemetryVersion':TELEMETRY_VERSION})
        match=re.fullmatch(r'/build/([a-z0-9-]{1,100})',self.path)
        if match:
            path=JOBS/(match[1]+'.json')
            if path.exists():
                return self.send_json(200,json.loads(path.read_text()))
        self.send_json(404,{'error':'Preparation job not found'})
    def do_POST(self):
        cancel=re.fullmatch(r'/build/([a-z0-9-]{1,100})/cancel',self.path)
        if cancel:
            return self.send_json(200,cancel_build(cancel[1]))
        if self.path!='/build':
            return self.send_json(404,{'error':'Not found'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>200000:
                raise ValueError('Invalid request size')
            body=json.loads(self.rfile.read(length))
            job_id=body['jobId']
            if not isinstance(job_id,str) or not re.fullmatch(r'[a-z0-9-]{1,100}',job_id) or not ID.fullmatch(body['regionId']):
                raise ValueError('Invalid job or region ID')
            if body['component']!='routing':
                raise ValueError('Only routing components can be prepared')
            if body.get('operationKind','install') not in OPERATION_KINDS:
                raise ValueError('Invalid operation kind')
            if body['source'].get('format')!='osm-pbf':
                raise ValueError('Routing requires an OSM PBF source')
            source=local_path(body['source']['relativePath'],'sources')
            output=local_path(body['outputRelativePath'],'staging')
            if not source.is_file() or output.name!='routing.tar':
                raise ValueError('Invalid source or artifact')
            with LOCK:
                if (JOBS/(job_id+'.cancel')).exists():
                    return self.send_json(409,{'error':'This preparation was cancelled; create a new job identity.'})
                if not (JOBS/(job_id+'.json')).exists():
                    stamp=utc_now()
                    state(job_id,{'jobId':job_id,'status':'queued','phase':'queued','progress':0,
                                  'telemetryVersion':TELEMETRY_VERSION,'operationKind':body.get('operationKind','install'),
                                  'queuedAt':stamp,'heartbeatAt':stamp,'lastProgressAt':stamp})
                    FUTURES[job_id]=POOL.submit(build,body)
            self.send_json(202,{'jobId':job_id})
        except (ValueError,KeyError,TypeError) as error:
            self.send_json(400,{'error':str(error)})

if __name__=='__main__':
    for previous in JOBS.glob('*.json'):
        value=json.loads(previous.read_text())
        if value.get('status') in ('queued','preparing','cancelling'):
            value.update({'status':'cancelled' if (JOBS/(previous.stem+'.cancel')).exists() else 'failed','error':'Preparation was interrupted. Retry this component.'})
            state(previous.stem,value)
    ThreadingHTTPServer(('0.0.0.0',8083),Handler).serve_forever()
