#!/bin/sh
# Fetch any missing language models, then serve.
#
# The fetch is deliberately non-fatal. A box that is offline, or whose models
# already downloaded, must still start and forward the library: translation
# being unavailable can never be allowed to make the Information Library
# unreachable.
set -u

python /app/fetch_models.py || echo "nomad-translate: model fetch failed, continuing" >&2

exec python /app/proxy.py
