"""Can this CPU run the Bergamot translation engine?

The bergamot 0.4.5 wheel is compiled for CPUs with AVX. On one without it
(Celeron N5105, N100-class mini PCs, #1512) merely importing the module dies
with SIGILL, which takes the whole proxy down with it: Docker restarts the
container, the healthcheck (which only polls /viewer) still reads healthy, and
the next translated page kills it again.

A signal cannot be caught from Python, so the import is tried once in a child
process at startup. If the child dies, the proxy keeps forwarding the library
untranslated and says why, instead of crash-looping.

Importing bergamot 0.4.5 also downloads two model indexes (`bergamot/__init__.py`
builds its REPOSITORY, whose constructor calls `requests.get` with no timeout
and no error handling). NOMAD loads its models by path and never reads those
indexes, but with no internet the download raises and the import fails, so
translation was off on every offline start (#1673). `import_bergamot()` lets
the import go ahead with an empty index when the download fails.
"""

import json
import signal
import subprocess
import sys
from pathlib import Path

PROBE = [
    sys.executable,
    "-c",
    f"import sys; sys.path.insert(0, {str(Path(__file__).resolve().parent)!r}); "
    "import engine_check; engine_check.import_bergamot()",
]

# How long the model index download may take before the import goes ahead
# without it. Upstream passes no timeout, so a box whose DNS hangs instead of
# failing would otherwise hang the import.
INDEX_TIMEOUT = 15

EMPTY_INDEX = json.dumps({"models": []})

NO_AVX_REASON = "this CPU lacks the AVX instructions the translation engine needs"


class _EmptyIndex:
    """Stands in for the response of a model index download that failed."""

    status_code = 200
    text = EMPTY_INDEX


def import_bergamot():
    """Import bergamot, and return it, whether or not the internet is reachable.

    While the import runs, a failed model index download (no network, DNS
    failure, timeout, an HTTP error page) answers with an empty index instead
    of raising. A download that works is used unchanged.
    """
    if "bergamot" in sys.modules:
        return sys.modules["bergamot"]

    import requests

    real_get = requests.get

    def get(url, *args, **kwargs):
        kwargs.setdefault("timeout", INDEX_TIMEOUT)
        try:
            response = real_get(url, *args, **kwargs)
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            print(
                f"nomad-translate: model index {url} unavailable ({type(exc).__name__}); "
                "continuing without it, models are loaded from disk",
                file=sys.stderr,
            )
            return _EmptyIndex()

    requests.get = get
    try:
        import bergamot
    finally:
        requests.get = real_get
    return bergamot


def cpu_flags(cpuinfo: str) -> set[str]:
    """The CPU feature flags listed in /proc/cpuinfo text."""
    for line in cpuinfo.splitlines():
        key, _, value = line.partition(":")
        if key.strip() == "flags":
            return set(value.split())
    return set()


def reason_for(returncode: int, flags: set[str]) -> str | None:
    """None when the probe passed, otherwise why translation is unavailable."""
    if returncode == 0:
        return None
    if returncode == -signal.SIGILL or returncode == 128 + signal.SIGILL:
        if flags and "avx" not in flags:
            return NO_AVX_REASON
        return "this CPU lacks instructions the translation engine needs"
    return f"the translation engine failed to load (exit {returncode})"


def check_engine(run=subprocess.run, cpuinfo_path: str = "/proc/cpuinfo") -> str | None:
    """Probe the engine in a child process. None means translation can be used."""
    try:
        returncode = run(PROBE, capture_output=True, timeout=120).returncode
    except Exception as exc:  # timeout, missing interpreter, ...
        return f"the translation engine could not be checked ({exc})"
    try:
        with open(cpuinfo_path, encoding="utf-8", errors="ignore") as handle:
            flags = cpu_flags(handle.read())
    except OSError:
        flags = set()
    return reason_for(returncode, flags)
