#!/usr/bin/env python3
"""Tests for the startup check that keeps a non-AVX CPU from crash-looping.

Pure functions only, no Bergamot and no network, so this runs anywhere:

    python3 install/nomad-translate/test_engine_check.py

The failing case is #1512: on a Celeron N5105 (no AVX) `import bergamot` dies
with SIGILL, exit code 132 from a shell, -4 from subprocess.

The import_bergamot checks (#1673) use stand-ins for `requests` and `bergamot`
that do what bergamot 0.4.5 does at import time: download a model index with
`requests.get(url).text` and parse it.
"""

import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))

import engine_check  # noqa: E402

failures: list[str] = []


def check(name: str, got, want):
    if got != want:
        failures.append(f"{name}\n    expected: {want!r}\n    got:      {got!r}")


N5105 = "processor\t: 0\nflags\t\t: fpu vme sse sse2 ssse3 sse4_1 sse4_2 popcnt aes\n"
ZEN = "processor\t: 0\nflags\t\t: fpu sse4_2 avx avx2 fma\n"

check("flags parsed", engine_check.cpu_flags(ZEN), {"fpu", "sse4_2", "avx", "avx2", "fma"})
check("no flags line", engine_check.cpu_flags("processor : 0\n"), set())

check("probe passed", engine_check.reason_for(0, engine_check.cpu_flags(N5105)), None)
check(
    "SIGILL without avx names AVX",
    engine_check.reason_for(-signal.SIGILL, engine_check.cpu_flags(N5105)),
    engine_check.NO_AVX_REASON,
)
check(
    "exit 132 (shell form of SIGILL) without avx names AVX",
    engine_check.reason_for(132, engine_check.cpu_flags(N5105)),
    engine_check.NO_AVX_REASON,
)
check(
    "SIGILL with avx does not blame AVX",
    engine_check.reason_for(-signal.SIGILL, engine_check.cpu_flags(ZEN)),
    "this CPU lacks instructions the translation engine needs",
)
check(
    "SIGILL with unreadable cpuinfo does not blame AVX",
    engine_check.reason_for(-signal.SIGILL, set()),
    "this CPU lacks instructions the translation engine needs",
)
check(
    "other failure reports the exit code",
    engine_check.reason_for(1, set()),
    "the translation engine failed to load (exit 1)",
)


def fake_run(returncode):
    return lambda *args, **kwargs: SimpleNamespace(returncode=returncode)


with tempfile.NamedTemporaryFile("w", suffix=".cpuinfo", delete=False) as handle:
    handle.write(N5105)
    n5105_path = handle.name

check("check_engine: working engine", engine_check.check_engine(fake_run(0), n5105_path), None)
check(
    "check_engine: N5105 crash",
    engine_check.check_engine(fake_run(-signal.SIGILL), n5105_path),
    engine_check.NO_AVX_REASON,
)
check(
    "check_engine: missing cpuinfo still answers",
    engine_check.check_engine(fake_run(-signal.SIGILL), "/nonexistent/cpuinfo"),
    "this CPU lacks instructions the translation engine needs",
)


def raising_run(*args, **kwargs):
    raise TimeoutError("timed out")


check(
    "check_engine: probe that cannot run",
    engine_check.check_engine(raising_run, n5105_path),
    "the translation engine could not be checked (timed out)",
)

Path(n5105_path).unlink()


FAKE_REQUESTS = """
class RequestException(OSError):
    pass

class ConnectionError(RequestException):
    pass

class HTTPError(RequestException):
    pass

calls = []
mode = "offline"

class Response:
    def __init__(self, status_code, text):
        self.status_code = status_code
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise HTTPError(self.status_code)

def get(url, *args, **kwargs):
    calls.append((url, kwargs))
    if mode == "offline":
        raise ConnectionError("Temporary failure in name resolution")
    if mode == "error page":
        return Response(503, "<html>Service Unavailable</html>")
    return Response(200, '{"models": [{"code": "en-fr"}]}')
"""

FAKE_BERGAMOT = """
import json
import requests

INDEX = json.loads(requests.get("https://translatelocally.com/models.json").text)
"""

fakes = Path(tempfile.mkdtemp())
(fakes / "requests").mkdir()
(fakes / "requests" / "__init__.py").write_text(FAKE_REQUESTS)
(fakes / "bergamot").mkdir()
(fakes / "bergamot" / "__init__.py").write_text(FAKE_BERGAMOT)
sys.path.insert(0, str(fakes))

import requests  # noqa: E402  (the stand-in above)

real_get = requests.get


def fresh_import(mode: str):
    sys.modules.pop("bergamot", None)
    requests.mode = mode
    requests.calls.clear()
    try:
        return engine_check.import_bergamot().INDEX
    except Exception as exc:  # the regression: the import itself fails
        return f"import failed: {exc!r}"


check("import_bergamot: offline gets an empty index", fresh_import("offline"), {"models": []})
check("import_bergamot: offline restores requests.get", requests.get is real_get, True)
check(
    "import_bergamot: the index download has a timeout",
    [kwargs.get("timeout") for _, kwargs in requests.calls],
    [engine_check.INDEX_TIMEOUT],
)
check("import_bergamot: error page gets an empty index", fresh_import("error page"), {"models": []})
check(
    "import_bergamot: online keeps the downloaded index",
    fresh_import("online"),
    {"models": [{"code": "en-fr"}]},
)
check("import_bergamot: online restores requests.get", requests.get is real_get, True)

requests.mode = "offline"
requests.calls.clear()
check(
    "import_bergamot: already imported is not imported again",
    (engine_check.import_bergamot().INDEX, requests.calls),
    ({"models": [{"code": "en-fr"}]}, []),
)

offline_probe = subprocess.run(
    engine_check.PROBE,
    capture_output=True,
    text=True,
    timeout=60,
    env={**os.environ, "PYTHONPATH": str(fakes)},
)
check("PROBE: loads offline", offline_probe.returncode, 0)
check("PROBE: says why the index is missing", "unavailable" in offline_probe.stderr, True)

if failures:
    print(f"FAIL: {len(failures)} of the checks above did not hold\n")
    for failure in failures:
        print(f"  {failure}\n")
    sys.exit(1)

print("ok: all engine check checks passed")
