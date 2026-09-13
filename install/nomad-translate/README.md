# nomad-translate

Offline machine translation for the Information Library, shipped as a Supply
Depot app. Issue [#1272](https://github.com/Crosstalk-Solutions/project-nomad/issues/1272).

A path-preserving reverse proxy in front of `kiwix-serve`. Everything is
forwarded byte for byte on the paths Kiwix already uses; only `text/html` under
`/content/` is rewritten.

## Why a proxy and not our own reader

`viewer.js` keeps the content iframe in sync with `location.hash` by comparing
`contentWindow.location.pathname`. Point the iframe anywhere else and you start
the ping-pong its own comment warns about, and you are now patching Kiwix's
JavaScript and re-verifying it on every Kiwix bump.

Because the path never moves, **no Kiwix JS is modified**, and Kiwix's header,
search, library and random keep working because they are Kiwix. Language is a
cookie, so links inside the ZIM need no rewriting either.

Verified transparent during the spike: `/viewer`, `/skin/viewer.js` and
`/catalog/v2/entries` return byte-identical, and a malformed `/search`
reproduces Kiwix's own `400` with the same body length.

Reimplementing or wrapping the Kiwix reading view is explicitly out of scope.

## Layout

| File | Purpose |
|---|---|
| `proxy.py` | The proxy, the language control, and the rewrite step |
| `blocks.py` | Finds translatable blocks; decides HTML mode versus plain text |
| `fetch_models.py` | Pulls models from Firefox Remote Settings on first start |
| `test_blocks.py` | Tests for the block planner. No Bergamot, no network |
| `entrypoint.sh` | Fetch models, then serve. Fetch failure is non-fatal |

Run the tests with `python3 install/nomad-translate/test_blocks.py`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `KIWIX` | `http://nomad_kiwix_server:8080` | Upstream library |
| `MODELS` | `/models` | Where models are stored |
| `TRANSLATE_LANGS` | `fr,es,de` | Languages to fetch, paired with English both ways |
| `WORKERS` | `8` | Bergamot worker threads |
| `PORT` | `8391` | Listen port inside the container |
| `MAX_TRANSLATE_BYTES` | `4194304` | Pages larger than this are forwarded untranslated |

## Models

From **Firefox Remote Settings**, the endpoint Firefox itself uses, not the
`mozilla/firefox-translations-models` GitHub repo, which was archived on
2026-08-21. MPL-2.0.

About 37 MB per direction, 74 MB for a language in both directions. 84 pairs
across roughly 44 languages. **No Chinese, Japanese, Korean, Arabic or Thai** in
the tiny model set.

Fetching is skipped entirely when every requested pair is already on disk, so a
restart on a genuinely offline box does not fail. A failed fetch is non-fatal:
the proxy still starts and still forwards the library, untranslated. Translation
being unavailable must never make the Information Library unreachable.

## amd64 only

Not just packaging. Bergamot's `intgemm` backend is x86 specific and there is no
aarch64 wheel; ARM would need marian's `ruy` path. The build workflow pins
`linux/amd64` so this fails at build time rather than producing an image that
pulls cleanly on ARM and dies at start.

## Known gaps

- **Tables are not translated.** Excluded wholesale to avoid a nesting problem,
  so infobox rows stay in the source language.
- **`<title>` is not translated**, so the browser tab and Kiwix's book button
  stay in the original language.
- **Kiwix's search results page is not translated** (it is not under
  `/content/`), and search still matches original-language index terms.
- **No caching.** Every page view re-translates, roughly 1 s for a long article.
- **A block whose inner tag is never closed is dropped**, not translated. See
  the test for why: the parser never claims a span, so the balance check never
  runs. Safe, but silent.
- **Two language controls.** Kiwix's toolbar has a globe that changes the
  interface language; ours changes the article. Ours is labelled "Translate this
  page" rather than with a globe or a language name, which is the cheapest
  available mitigation, but we do not own the other button.

## Runtime

The PyPI `bergamot` wheel is from 2022-06-21 and
`browsermt/bergamot-translator`'s last real commit was 2024-05. The maintained
successor is `mozilla/translations` (`inference/`). Building from there instead
is worthwhile follow-up work and would remove the pin in the Dockerfile.
