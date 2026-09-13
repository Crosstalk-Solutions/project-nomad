#!/usr/bin/env python3
"""Fetch Bergamot translation models from Firefox Remote Settings.

Deliberately NOT `mozilla/firefox-translations-models` on GitHub: that repo was
archived on 2026-08-21 and its README now points elsewhere. Remote Settings is
the endpoint Firefox itself uses, so it stays current.

Each language pair needs three attachments (model, lex, vocab) plus a small
marian config that we write ourselves. Models are MPL-2.0.

Roughly 37 MB per direction. Coverage is 84 pairs across about 44 languages,
strong on European plus Hindi, Bengali, Tamil, Telugu, Vietnamese and
Indonesian. There is no Chinese, Japanese, Korean, Arabic or Thai in the tiny
model set, so those languages cannot be offered.
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
  - vocab.{pair}.spm
  - vocab.{pair}.spm
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


def newest(entries: list[dict]) -> dict | None:
    """Highest version wins. Remote Settings keeps older revisions around."""
    if not entries:
        return None
    return sorted(entries, key=lambda r: float(r.get("version", 0)))[-1]


def fetch_pair(data: list[dict], src: str, dst: str, out_root: Path) -> bool:
    """Download one direction. Returns False if the pair is not published."""
    pair = f"{src}{dst}"
    target = out_root / pair

    wanted = {}
    for kind in ("model", "lex", "vocab"):
        matches = [
            r
            for r in data
            if r.get("fileType") == kind
            and r.get("fromLang") == src
            and r.get("toLang") == dst
            # The "tiny" variants are the ones sized for on-device use.
            and "base" not in r.get("name", "")
        ]
        chosen = newest(matches)
        if chosen is None:
            print(f"  {pair}: no {kind} published, skipping pair", flush=True)
            return False
        wanted[kind] = chosen

    target.mkdir(parents=True, exist_ok=True)
    suffix = {"model": "bin", "lex": "bin", "vocab": "spm"}

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

    (target / "config.yml").write_text(CONFIG.format(pair=pair))
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
        fetch_pair(data, "en", code, out_root)
        fetch_pair(data, code, "en", out_root)

    return 0


if __name__ == "__main__":
    sys.exit(main())
