"""Can this CPU run the Bergamot translation engine?

The bergamot 0.4.5 wheel is compiled for CPUs with AVX. On one without it
(Celeron N5105, N100-class mini PCs, #1512) merely importing the module dies
with SIGILL, which takes the whole proxy down with it: Docker restarts the
container, the healthcheck (which only polls /viewer) still reads healthy, and
the next translated page kills it again.

A signal cannot be caught from Python, so the import is tried once in a child
process at startup. If the child dies, the proxy keeps forwarding the library
untranslated and says why, instead of crash-looping.
"""

import signal
import subprocess
import sys

PROBE = [sys.executable, "-c", "import bergamot"]

NO_AVX_REASON = "this CPU lacks the AVX instructions the translation engine needs"


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
