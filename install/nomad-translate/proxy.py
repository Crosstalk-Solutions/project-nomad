#!/usr/bin/env python3
"""Path-preserving translating proxy in front of kiwix-serve.

Everything is forwarded byte for byte on the SAME paths Kiwix uses, so /viewer,
/skin/*, /search, /random and /catalog/* are genuinely Kiwix's own shell running
Kiwix's own JavaScript. Only `text/html` under /content/ is rewritten, and only
its text.

Preserving the path is the whole design. viewer.js keeps the content iframe in
sync with location.hash by comparing `contentWindow.location.pathname`, so
pointing the iframe anywhere else starts the ping-pong its own comment warns
about, and we would be patching Kiwix's JavaScript and re-verifying it on every
Kiwix bump. Because the path never moves, no Kiwix JS is modified at all, and
Kiwix's header, search, library and random keep working because they ARE Kiwix.

Language lives in a cookie set by a control injected into the translated page,
so links inside the ZIM need no rewriting either.
"""

import http.cookies
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import blocks

UPSTREAM = os.environ.get("KIWIX", "http://localhost:8090").rstrip("/")
MODELS = Path(os.environ.get("MODELS", "/models"))
WORKERS = int(os.environ.get("WORKERS", "8"))
PORT = int(os.environ.get("PORT", "8391"))
# Pages larger than this are forwarded untranslated. A pathological article
# should not be able to tie up every worker or exhaust memory.
MAX_TRANSLATE_BYTES = int(os.environ.get("MAX_TRANSLATE_BYTES", str(4 * 1024 * 1024)))

COOKIE = "nomadlang"

# Display names for the languages Bergamot's tiny model set covers. A language
# only appears in the control if its model is actually on disk.
LANG_NAMES = {
    "bg": "Bulgarian", "bn": "Bengali", "cs": "Czech", "da": "Danish",
    "de": "German", "el": "Greek", "es": "Spanish", "et": "Estonian",
    "fa": "Persian", "fi": "Finnish", "fr": "French", "he": "Hebrew",
    "hi": "Hindi", "hu": "Hungarian", "id": "Indonesian", "is": "Icelandic",
    "it": "Italian", "lt": "Lithuanian", "lv": "Latvian", "nb": "Norwegian",
    "nl": "Dutch", "pl": "Polish", "pt": "Portuguese", "ro": "Romanian",
    "ru": "Russian", "sk": "Slovak", "sl": "Slovenian", "sr": "Serbian",
    "sv": "Swedish", "ta": "Tamil", "te": "Telugu", "tr": "Turkish",
    "uk": "Ukrainian", "vi": "Vietnamese",
}

# Hop-by-hop headers must not be forwarded. Content-Length and Content-Encoding
# are dropped too because the body length changes when a page is translated.
HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
    "content-encoding",
}


def available_languages() -> dict[str, str]:
    """Languages with an en->xx model present on disk, in display order."""
    found = {}
    if MODELS.is_dir():
        for entry in sorted(MODELS.iterdir()):
            if not (entry / "config.yml").is_file():
                continue
            pair = entry.name
            if len(pair) == 4 and pair.startswith("en"):
                code = pair[2:]
                found[code] = LANG_NAMES.get(code, code.upper())
    return found


LANGS = available_languages()

# Bergamot is imported lazily so the proxy can still boot, and still forward
# Kiwix untouched, on a box where the models never downloaded.
_service = None
_models: dict[str, object] = {}


def _bergamot():
    global _service
    if _service is None:
        from bergamot import Service, ServiceConfig

        _service = Service(ServiceConfig(numWorkers=WORKERS, logLevel="off"))
    return _service


def model(pair: str):
    if pair not in _models:
        _models[pair] = _bergamot().modelFromConfigPath(str(MODELS / pair / "config.yml"))
    return _models[pair]


def translate_blocks(pair: str, jobs: list[str]) -> list[str]:
    from bergamot import ResponseOptions, VectorString

    options = ResponseOptions(HTML=True)
    responses = _bergamot().translate(model(pair), VectorString(jobs), options)
    return [r.target.text for r in responses]


BAR_CSS = """
#nomad-tr{position:sticky;top:0;z-index:2147483000;display:flex;align-items:center;
 flex-wrap:wrap;gap:9px;padding:7px 14px;background:#36361A;color:#F1E6C8;
 font:13px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
#nomad-tr .t{opacity:.75}
#nomad-tr button{font:inherit;font-size:12.5px;color:#F1E6C8;background:transparent;
 border:1px solid #66663F;border-radius:999px;padding:3px 11px;cursor:pointer}
#nomad-tr button:hover{background:#66663F}
#nomad-tr button.on{background:#F1E6C8;color:#36361A;border-color:#F1E6C8;font-weight:600}
#nomad-tr .g{flex:1}
#nomad-tr .s{opacity:.6;font-size:11.5px;font-variant-numeric:tabular-nums}
"""

# Set the cookie client side and reload, so the control works from inside the
# Kiwix content iframe without navigating the outer frame.
BAR_JS = """
function nomadSetLang(c){
  document.cookie='%s='+c+';path=/;max-age=31536000';
  location.reload();
}
""" % COOKIE


def build_bar(lang: str, status: str) -> str:
    """The in-page language control.

    Labelled "Translate this page" rather than with a globe or a bare language
    name, deliberately: Kiwix's own toolbar already has a globe that switches
    the INTERFACE language, and the two sit close together with no visual
    relationship. Naming ours after what it acts on is the cheapest way to stop
    a user reaching for the wrong one and concluding the feature is broken.
    """
    buttons = []
    for code, name in [("", "Original")] + sorted(LANGS.items(), key=lambda kv: kv[1]):
        classes = "on" if code == lang else ""
        label = name
        buttons.append(
            f'<button class="{classes}" onclick="nomadSetLang(\'{code}\')">{label}</button>'
        )
    return (
        f'<div id="nomad-tr"><span class="t">Translate this page</span>{"".join(buttons)}'
        f'<span class="g"></span><span class="s">{status}</span></div>'
        f"<style>{BAR_CSS}</style><script>{BAR_JS}</script>"
    )


def rewrite(body: str, lang: str) -> str:
    """Translate block text in place and inject the control."""
    status = "not translated"

    if lang:
        started = time.time()
        jobs, kinds, spans = blocks.plan(body)
        if jobs:
            import html as html_mod

            words = sum(len(blocks.plain(job).split()) for job in jobs)
            done = translate_blocks("en" + lang, jobs)
            out = [
                blocks.FONTS.sub("", text) if kind == "html" else html_mod.escape(text)
                for kind, text in zip(kinds, done)
            ]
            body = blocks.splice(body, spans, out)
            elapsed = round((time.time() - started) * 1000)
            status = f"{words:,} words · {len(jobs)} blocks · {elapsed:,} ms"
        else:
            status = "nothing to translate"

    bar = build_bar(lang, status)
    if re.search(r"(?i)<body[^>]*>", body):
        return re.sub(r"(?i)(<body[^>]*>)", lambda m: m.group(1) + bar, body, count=1)
    return bar + body


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "nomad-translate-proxy"

    def log_message(self, *args):
        # The upstream Kiwix container already logs requests.
        pass

    def _lang(self) -> str:
        raw = self.headers.get("Cookie", "")
        try:
            jar = http.cookies.SimpleCookie(raw)
        except Exception:
            return ""
        value = jar[COOKIE].value if COOKIE in jar else ""
        return value if value in LANGS else ""

    def do_GET(self, body_only: bool = False):
        # Setting the language via a URL makes a given language linkable and
        # bookmarkable rather than only reachable by clicking the control.
        if self.path.startswith("/nomad-lang"):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code = query.get("set", [""])[0]
            code = code if code in LANGS else ""
            target = query.get("to", ["/viewer"])[0]
            # Only same-origin paths. Without this the proxy is an open
            # redirector that any page could bounce a user through.
            if not target.startswith("/") or target.startswith("//"):
                target = "/viewer"
            self.send_response(302)
            self.send_header("Set-Cookie", f"{COOKIE}={code}; Path=/; Max-Age=31536000; SameSite=Lax")
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        request = urllib.request.Request(UPSTREAM + self.path, method="GET")
        for header in ("Range", "If-None-Match", "If-Modified-Since", "User-Agent", "Accept"):
            if self.headers.get(header):
                request.add_header(header, self.headers[header])
        # Accept-Encoding is deliberately not forwarded: we want plain bytes so
        # HTML can be rewritten without decompressing first.

        try:
            response = urllib.request.urlopen(request, timeout=120)
            status, headers, data = response.status, response.headers, response.read()
        except urllib.error.HTTPError as exc:
            # Forwarded as-is, which is how Kiwix's own 404 and 400 pages keep
            # coming back byte for byte.
            status, headers, data = exc.code, exc.headers, exc.read()
        except Exception as exc:
            message = f"Translation proxy could not reach the library: {exc}".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
            return

        content_type = headers.get("Content-Type", "")
        translatable = (
            self.path.startswith("/content/")
            and "text/html" in content_type.lower()
            and status == 200
            and len(data) <= MAX_TRANSLATE_BYTES
        )

        if translatable:
            try:
                data = rewrite(data.decode("utf-8", "ignore"), self._lang()).encode("utf-8")
            except Exception as exc:
                # Never take the page down over a translation failure. The
                # reader gets the original article and a comment explaining why.
                data = data + f"<!-- nomad-translate failed: {exc} -->".encode()

        self.send_response(status)
        for key, value in headers.items():
            if key.lower() in HOP:
                continue
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not body_only:
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_HEAD(self):
        self.do_GET(body_only=True)


if __name__ == "__main__":
    if LANGS:
        print(
            f"nomad-translate: {len(LANGS)} languages available "
            f"({', '.join(sorted(LANGS))})",
            flush=True,
        )
    else:
        print(
            "nomad-translate: no models found, forwarding the library untranslated",
            file=sys.stderr,
            flush=True,
        )

    print(f"nomad-translate: listening on 0.0.0.0:{PORT} -> {UPSTREAM}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
