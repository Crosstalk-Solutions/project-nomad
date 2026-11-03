#!/usr/bin/env python3
"""Tests for the startup check that keeps a non-AVX CPU from crash-looping.

Pure functions only, no Bergamot and no network, so this runs anywhere:

    python3 install/nomad-translate/test_engine_check.py

The failing case is #1512: on a Celeron N5105 (no AVX) `import bergamot` dies
with SIGILL, exit code 132 from a shell, -4 from subprocess.
"""

import signal
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

if failures:
    print(f"FAIL: {len(failures)} of the checks above did not hold\n")
    for failure in failures:
        print(f"  {failure}\n")
    sys.exit(1)

print("ok: all engine check checks passed")
