"""Locate the translatable block elements in a ZIM article's HTML.

Bergamot's HTML mode re-places inline tags onto the translated tokens using
alignment rather than translating fragments separately, which is what makes
`<a href="Water">water</a>` come back as `<a href="Water">l'eau</a>` with the
link on the correct word even when the target language reorders the sentence.

That mode REQUIRES balanced markup and raises "Not all tags were closed"
otherwise, so blocks are located with a real parser. Regex cannot do this: a
non-greedy `<li>...</li>` happily stops at a nested list's closing tag. Anything
that still fails the balance check is translated as plain text instead, losing
its inline markup but not its content.
"""

import html
import re
from html.parser import HTMLParser

# Elements whose text is translated. Deliberately the outermost balanced block:
# translating a whole <p> at once is what gives the aligner enough context to
# place the inline tags sensibly.
BLOCK_TAGS = {
    "p", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "dt", "dd", "caption", "figcaption", "th", "td",
}

# Never descend into these. `table` is here because its nesting defeated the
# balance check in the prototype, which is why infobox rows stay untranslated.
OPAQUE = {"script", "style", "code", "pre", "math", "svg", "table"}

# `div` is not a semantic text element, but real prose lives in one often enough
# that leaving it out loses whole pages. Sotoki-generated StackExchange ZIMs put
# every question excerpt in `<div class="...excerpt">`, so the titles translated
# and the descriptions underneath them did not. Claimed only as a leaf: see
# BlockFinder.handle_starttag.
CLAIMABLE = BLOCK_TAGS | {"div"}

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

# Bergamot emits <font> wrappers in HTML mode; they are not in the source and
# are stripped back out.
FONTS = re.compile(r"(?is)</?font[^>]*>")
TAGS = re.compile(r"(?is)<[^>]+>")

# Two consecutive letters. Filters out blocks that are only punctuation, digits
# or whitespace, which are not worth a translation round trip.
HAS_TEXT = re.compile(r"[A-Za-z]{2}")


class BlockFinder(HTMLParser):
    """Yield (inner_start, inner_end) offsets for the outermost balanced blocks.

    Only the outermost block is claimed: once inside one, nested blocks are
    ignored until it closes, so a `<li>` containing a `<p>` is translated once
    rather than twice with overlapping spans.
    """

    def __init__(self, src: str):
        super().__init__(convert_charrefs=False)
        self.src = src
        # Byte offset of the start of each line, so getpos() can be converted
        # into an absolute offset into the source.
        self.lines = [0]
        for line in src.splitlines(keepends=True):
            self.lines.append(self.lines[-1] + len(line))
        self.spans: list[tuple[int, int]] = []
        self.claim: tuple[str, int, int] | None = None
        self.depth = 0
        self.opaque = 0

    def _off(self) -> int:
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        if tag in OPAQUE:
            self.opaque += 1
        self.depth += 1

        # A `div` is claimable only when it turns out to be a text leaf. Claim it
        # speculatively, then abandon that claim the moment anything block-level
        # opens inside it, so the inner block is translated rather than the
        # layout wrapper that happens to contain it. Without this, `div` could
        # not be in the set at all: the outermost-block rule would claim a
        # top-level wrapper and swallow the whole page in one job.
        if self.claim and self.claim[0] == "div" and tag in CLAIMABLE:
            self.claim = None

        if self.claim is None and not self.opaque and tag in CLAIMABLE:
            end = self.src.find(">", self._off())
            self.claim = (tag, self.depth, end + 1)

    def handle_startendtag(self, tag, attrs):
        # Self-closing: no depth change, nothing to claim.
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.claim and tag == self.claim[0] and self.depth == self.claim[1]:
            self.spans.append((self.claim[2], self._off()))
            self.claim = None
        self.depth = max(0, self.depth - 1)
        if tag in OPAQUE:
            self.opaque = max(0, self.opaque - 1)


def find_blocks(body: str) -> list[tuple[int, int]]:
    """Block spans for `body`, or an empty list if it will not parse."""
    try:
        finder = BlockFinder(body)
        finder.feed(body)
        return finder.spans
    except Exception:
        return []


def balanced(frag: str) -> bool:
    """Cheap well-formedness check for what is handed to Bergamot's HTML mode.

    Bergamot raises rather than degrading on unbalanced input, so this is the
    gate that decides HTML mode versus the plain-text fallback.
    """
    stack: list[str] = []
    for m in re.finditer(r"(?is)<\s*(/?)\s*([a-z0-9]+)[^>]*?(/?)\s*>", frag):
        closing, tag, self_close = m.group(1), m.group(2).lower(), m.group(3)
        if tag in VOID or self_close:
            continue
        if closing:
            if not stack or stack.pop() != tag:
                return False
        else:
            stack.append(tag)
    return not stack


def plain(frag: str) -> str:
    """Tag-stripped, entity-decoded text of a fragment."""
    return html.unescape(TAGS.sub("", frag))


def plan(body: str) -> tuple[list[str], list[str], list[tuple[int, int]]]:
    """Decide what to translate and how.

    Returns (jobs, kinds, spans) where kinds[i] is "html" or "text" and spans[i]
    is where jobs[i] came from. Blocks with no real text are dropped entirely.
    """
    jobs: list[str] = []
    kinds: list[str] = []
    spans: list[tuple[int, int]] = []

    for start, end in find_blocks(body):
        frag = body[start:end]
        if not HAS_TEXT.search(plain(frag)):
            continue
        if balanced(frag):
            jobs.append(frag)
            kinds.append("html")
        else:
            text = plain(frag).strip()
            if not text:
                continue
            jobs.append(text)
            kinds.append("text")
        spans.append((start, end))

    return jobs, kinds, spans


def splice(body: str, spans: list[tuple[int, int]], replacements: list[str]) -> str:
    """Substitute translated blocks back into the page.

    Applied back to front so that earlier offsets stay valid as the string
    length changes underneath.
    """
    for (start, end), new in sorted(zip(spans, replacements), key=lambda x: -x[0][0]):
        body = body[:start] + new + body[end:]
    return body
