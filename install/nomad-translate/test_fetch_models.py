#!/usr/bin/env python3
"""Tests for picking which model files to download.

Pure functions only, no Bergamot and no network, so this runs anywhere:

    python3 install/nomad-translate/test_fetch_models.py

The records below copy the shapes Firefox Remote Settings actually returned.
The first case is the one that broke: a pre-release version string ("1.0a1")
crashed the fetch, so Swedish and 21 other languages never downloaded.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import fetch_models  # noqa: E402

failures: list[str] = []

NIGHTLY = "env.channel == 'default' || env.channel == 'nightly'"
DESKTOP = "env.appinfo.OS != 'Android' || env.channel != 'release'"
ANDROID = "env.appinfo.OS == 'Android' "


def check(name: str, got, want):
    if got != want:
        failures.append(f"{name}\n    expected: {want!r}\n    got:      {got!r}")


def record(src, dst, kind, version, filter_expression=""):
    return {
        "fromLang": src,
        "toLang": dst,
        "fileType": kind,
        "version": version,
        "filter_expression": filter_expression,
        "name": f"{kind}.{src}{dst}",
    }


def pair(src, dst, version, filter_expression="", kinds=("model", "lex", "vocab")):
    return [record(src, dst, kind, version, filter_expression) for kind in kinds]


def chosen_versions(data, src, dst):
    files = fetch_models.choose_files(data, src, dst)
    if files is None:
        return None
    return {kind: r["version"] for kind, r in files.items()}


# --- versions ------------------------------------------------------------------

check("release: plain version", fetch_models.release_version(record("en", "sv", "model", "1.0")), (1, 0))
check("release: desktop filter", fetch_models.release_version(record("en", "ja", "model", "2.1", DESKTOP)), (2, 1))
check("release: missing filter", fetch_models.release_version({"version": "2.0", "filter_expression": None}), (2, 0))
check("skip: pre-release", fetch_models.release_version(record("en", "sv", "model", "1.0a1")), None)
check("skip: nightly only", fetch_models.release_version(record("en", "sv", "model", "1.0", NIGHTLY)), None)
check("skip: android only", fetch_models.release_version(record("en", "ja", "model", "2.2", ANDROID)), None)
check("compare: 2.10 beats 2.9", (2, 10) > fetch_models.release_version(record("en", "x", "model", "2.9")), True)

# --- choosing a pair -----------------------------------------------------------

# Swedish as published: a release and a nightly-only pre-release side by side.
SWEDISH = pair("en", "sv", "1.0") + pair("en", "sv", "1.0a1", NIGHTLY)
check("sv: pre-release ignored, release kept", chosen_versions(SWEDISH, "en", "sv"),
      {"model": "1.0", "lex": "1.0", "vocab": "1.0"})

# Newest complete release wins.
FRENCH = pair("en", "fr", "1.0") + pair("en", "fr", "2.0")
check("fr: newest release", chosen_versions(FRENCH, "en", "fr"),
      {"model": "2.0", "lex": "2.0", "vocab": "2.0"})

# A newer version missing a file must not be mixed with an older one.
PARTIAL = pair("en", "xx", "1.0") + pair("en", "xx", "2.0", kinds=("model", "lex"))
check("incomplete newer version: falls back whole", chosen_versions(PARTIAL, "en", "xx"),
      {"model": "1.0", "lex": "1.0", "vocab": "1.0"})

# Japanese publishes separate source and target vocabs, and an Android build.
JAPANESE = (
    pair("en", "ja", "2.1", DESKTOP, kinds=("model", "lex", "srcvocab", "trgvocab"))
    + pair("en", "ja", "2.2", ANDROID, kinds=("model", "lex", "srcvocab", "trgvocab"))
    + pair("en", "ja", "2.3", kinds=("model", "lex", "srcvocab", "trgvocab"))
)
check("ja: split vocab, android skipped", chosen_versions(JAPANESE, "en", "ja"),
      {"model": "2.3", "lex": "2.3", "srcvocab": "2.3", "trgvocab": "2.3"})

# Only pre-releases published: nothing to fetch, and no crash.
check("only pre-releases: none", chosen_versions(pair("en", "nn", "1.0a1", NIGHTLY), "en", "nn"), None)
check("other direction ignored", chosen_versions(SWEDISH, "sv", "en"), None)

if failures:
    print(f"FAIL: {len(failures)} of the checks above did not hold\n")
    for failure in failures:
        print(f"  {failure}\n")
    sys.exit(1)

print("ok: all model selection checks passed")
