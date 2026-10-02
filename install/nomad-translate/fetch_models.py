#!/usr/bin/env python3
"""Fetch Bergamot translation models from Firefox Remote Settings.

Deliberately NOT `mozilla/firefox-translations-models` on GitHub: that repo was
archived on 2026-08-21 and its README now points elsewhere. Remote Settings is
the endpoint Firefox itself uses, so it stays current.

Each language pair needs its attachments (model, lex, and one shared vocab or a
separate source and target vocab) plus a small marian config that we write
ourselves. Models are MPL-2.0.

Only releases desktop Firefox would use are taken: pre-releases ("1.0a1") are
gated to Nightly, and some models are Android-only. As of 2026-10 that leaves
50 languages with a release in both directions, from about 45 MB (Swedish) to
about 140 MB (Korean) per language. Chinese is published under region codes
(zh-Hans, zh-Hant) that the proxy's two-letter language codes cannot carry yet.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

RECORDS_URL = (
    "https://firefox.settings.services.mozilla.com/v1/buckets/main"
    "/collections/translations-models/records"
)
ATTACHMENT_BASE = "https://firefox-settings-attachments.cdn.mozilla.net/"

# Written next to the model files. Bergamot reads this, not the records.
CONFIG = """\
relative-paths: true
models:
  - model.{pair}.bin
vocabs:
  - {src_vocab}
  - {trg_vocab}
shortlist:
  - lex.{pair}.bin
  - false
beam-size: 1
normalize: 1.0
word-penalty: 0
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
skip-cost: true
cpu-threads: 0
quiet: true
quiet-translation: true
gemm-precision: int8shiftAlphaAll
alignment: soft
"""


def records() -> list[dict]:
    with urllib.request.urlopen(RECORDS_URL, timeout=60) as response:
        return json.load(response)["data"]


# A record is for us only if desktop Firefox on the release channel would use
# it. The rest are pre-releases ("1.0a1") gated to Nightly, or Android builds.
# Picking them up is how a pre-release version string once crashed the fetch.
RELEASE_FILTERS = {"", "env.appinfo.OS != 'Android' || env.channel != 'release'"}


def release_version(record: dict) -> tuple[int, ...] | None:
    """The record's version as a sortable tuple, or None if it is not for us."""
    if (record.get("filter_expression") or "").strip() not in RELEASE_FILTERS:
        return None
    parts = str(record.get("version", "")).split(".")
    if not all(part.isdigit() for part in parts):
        return None
    return tuple(int(part) for part in parts)


def choose_files(data: list[dict], src: str, dst: str) -> dict[str, dict] | None:
    """The newest release whose files are all published, as {fileType: record}.

    The files of one version belong together. Taking the newest model and the
    newest vocab independently could mix two versions that were never trained
    together. Most pairs share one vocab between both sides; some (Japanese,
    Chinese) publish a separate source and target vocab instead.
    """
    by_version: dict[tuple[int, ...], dict[str, dict]] = {}
    for record in data:
        if record.get("fromLang") != src or record.get("toLang") != dst:
            continue
        version = release_version(record)
        if version is not None:
            by_version.setdefault(version, {})[record.get("fileType")] = record

    for version in sorted(by_version, reverse=True):
        files = by_version[version]
        if "model" not in files or "lex" not in files:
            continue
        if "vocab" in files:
            return {kind: files[kind] for kind in ("model", "lex", "vocab")}
        if "srcvocab" in files and "trgvocab" in files:
            return {kind: files[kind] for kind in ("model", "lex", "srcvocab", "trgvocab")}
    return None


def fetch_pair(data: list[dict], src: str, dst: str, out_root: Path) -> bool:
    """Download one direction. Returns False if the pair is not published."""
    pair = f"{src}{dst}"
    target = out_root / pair

    wanted = choose_files(data, src, dst)
    if wanted is None:
        print(f"  {pair}: no released model published, skipping pair", flush=True)
        return False

    target.mkdir(parents=True, exist_ok=True)
    suffix = {"model": "bin", "lex": "bin", "vocab": "spm", "srcvocab": "spm", "trgvocab": "spm"}

    for kind, record in wanted.items():
        dest = target / f"{kind}.{pair}.{suffix[kind]}"
        expected = record["attachment"]["size"]
        # Resume is not worth the complexity here: a partial file is simply
        # re-fetched. What matters is never leaving a truncated model in place
        # that would fail cryptically at translation time.
        if dest.exists() and dest.stat().st_size == expected:
            continue
        url = ATTACHMENT_BASE + record["attachment"]["location"]
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url, timeout=300) as response:
            tmp.write_bytes(response.read())
        if tmp.stat().st_size != expected:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(
                f"{pair}/{kind}: expected {expected} bytes, got a short read"
            )
        tmp.rename(dest)

    if "vocab" in wanted:
        src_vocab = trg_vocab = f"vocab.{pair}.spm"
    else:
        src_vocab, trg_vocab = f"srcvocab.{pair}.spm", f"trgvocab.{pair}.spm"
    (target / "config.yml").write_text(
        CONFIG.format(pair=pair, src_vocab=src_vocab, trg_vocab=trg_vocab)
    )
    size = sum(f.stat().st_size for f in target.iterdir()) / 1_000_000
    print(f"  {pair}: ready ({size:.0f} MB)", flush=True)
    return True


def main() -> int:
    out_root = Path(os.environ.get("MODELS", "/models"))
    # Comma-separated language codes to pair with English, both directions.
    langs = [
        code.strip().lower()
        for code in os.environ.get("TRANSLATE_LANGS", "fr,es,de").split(",")
        if code.strip()
    ]

    if not langs:
        print("No TRANSLATE_LANGS configured, nothing to fetch.", flush=True)
        return 0

    out_root.mkdir(parents=True, exist_ok=True)

    # Skip the network entirely when every requested pair is already present,
    # so a restart on a genuinely offline box does not fail.
    missing = [
        code
        for code in langs
        if not (out_root / f"en{code}" / "config.yml").exists()
        or not (out_root / f"{code}en" / "config.yml").exists()
    ]
    if not missing:
        print(f"All {len(langs)} language pairs already present.", flush=True)
        return 0

    print(f"Fetching translation models for: {', '.join(missing)}", flush=True)
    try:
        data = records()
    except Exception as exc:
        # An offline box with some pairs already downloaded should still start
        # and serve those, rather than refusing to boot.
        print(f"Could not reach Firefox Remote Settings: {exc}", flush=True)
        return 0

    for code in missing:
        # One language failing must not stop the ones after it from loading.
        try:
            fetch_pair(data, "en", code, out_root)
            fetch_pair(data, code, "en", out_root)
        except Exception as exc:
            print(f"  {code}: download failed, skipping: {exc}", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
