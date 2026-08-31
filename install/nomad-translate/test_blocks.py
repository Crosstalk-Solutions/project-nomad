#!/usr/bin/env python3
"""Tests for the block planner.

Pure functions only, no Bergamot and no network, so this runs anywhere:

    python3 install/nomad-translate/test_blocks.py

Each case here is a failure the prototype actually hit. HTML mode raises
"Not all tags were closed" rather than degrading, so anything that gets the
balance check wrong takes the whole article down.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import blocks  # noqa: E402

failures: list[str] = []


def check(name: str, got, want):
    if got != want:
        failures.append(f"{name}\n    expected: {want!r}\n    got:      {got!r}")


def check_true(name: str, got):
    check(name, bool(got), True)


def check_false(name: str, got):
    check(name, bool(got), False)


# --- balance check -----------------------------------------------------------

check_true("balanced: plain text", blocks.balanced("just words"))
check_true("balanced: matched inline tags", blocks.balanced('<a href="X">water</a>'))
check_true("balanced: nested inline tags", blocks.balanced("<b><i>x</i></b>"))
check_true("balanced: void tag needs no close", blocks.balanced("a<br>b"))
check_true("balanced: self-closing", blocks.balanced('<img src="x"/>'))
check_false("balanced: unclosed tag", blocks.balanced("<b>x"))
check_false("balanced: stray close", blocks.balanced("x</b>"))
check_false("balanced: crossed tags", blocks.balanced("<b><i>x</b></i>"))

# --- block finding -----------------------------------------------------------

# The nesting case regex cannot handle: a non-greedy <li>...</li> stops at the
# INNER list's closing tag, silently truncating the block.
NESTED = "<ul><li>outer <ul><li>inner</li></ul> tail</li></ul>"
jobs, kinds, spans = blocks.plan(NESTED)
check("nested li: one outermost block claimed", len(jobs), 1)
check_true("nested li: keeps the whole outer li", "tail" in jobs[0])
check_true("nested li: contains the inner list", "inner" in jobs[0])

# Opaque elements must never be descended into.
check("script is opaque", blocks.plan("<script><p>var x</p></script>")[0], [])
check("style is opaque", blocks.plan("<style><p>a{}</p></style>")[0], [])
check("pre is opaque", blocks.plan("<pre><p>code</p></pre>")[0], [])
# Tables are excluded wholesale to dodge the nesting problem, which is why
# infobox rows stay in the source language.
check("table is opaque", blocks.plan("<table><tr><td>cell text</td></tr></table>")[0], [])

# Blocks with no real text are not worth a round trip.
check("digits only are skipped", blocks.plan("<p>12345</p>")[0], [])
check("punctuation only is skipped", blocks.plan("<p>--- .</p>")[0], [])
check("single letter is skipped", blocks.plan("<p>a</p>")[0], [])
check("two letters count as text", blocks.plan("<p>ok</p>")[0], ["ok"])

# Crossed inline markup inside a block that DOES close: the span is found, the
# balance check rejects it, and it falls back to plain text. Losing the inline
# tags is the price of not having Bergamot raise on the whole article.
jobs, kinds, _ = blocks.plan("<p><b><i>hello</b></i></p>")
check("crossed inline markup falls back to text", kinds, ["text"])
check("fallback strips the tags", jobs, ["hello"])

# A block whose own closing tag is unreachable because an inner tag was never
# closed is DROPPED, not translated. handle_endtag sees the wrong depth, so no
# span is ever claimed and the balance check is never consulted.
#
# This is safe (the reader gets the original) but silent: that paragraph simply
# stays in the source language with nothing to indicate why. Worth knowing when
# a page comes back partly translated.
check("block with an unclosed inner tag is dropped", blocks.plan("<p>see <b>this</p>")[0], [])

# Balanced markup goes through HTML mode so the aligner can place inline tags.
jobs, kinds, _ = blocks.plan('<p>drink <a href="Water">water</a></p>')
check("balanced block uses html mode", kinds, ["html"])
check_true("html mode keeps the anchor", "<a href=" in jobs[0])

# --- splice ------------------------------------------------------------------

body = "<p>one</p><p>two</p>"
jobs, kinds, spans = blocks.plan(body)
check("two paragraphs found", jobs, ["one", "two"])
# Back-to-front application is what keeps the earlier offsets valid.
check(
    "splice replaces both, longer than the source",
    blocks.splice(body, spans, ["un ONE", "deux TWO"]),
    "<p>un ONE</p><p>deux TWO</p>",
)

# --- plain -------------------------------------------------------------------

check("plain strips tags", blocks.plain("<b>hi</b> there"), "hi there")
check("plain decodes entities", blocks.plain("caf&eacute;"), "café")

# --- malformed input ---------------------------------------------------------

# A page that will not parse must yield no work rather than raising: the reader
# gets the untranslated article instead of an error.
check("garbage yields no blocks", blocks.plan("<<<>>><p")[0], [])
check("empty document yields no blocks", blocks.plan("")[0], [])


if failures:
    print(f"FAIL: {len(failures)} of the checks above did not hold\n")
    for failure in failures:
        print(f"  {failure}\n")
    sys.exit(1)

print("ok: all block planner checks passed")
