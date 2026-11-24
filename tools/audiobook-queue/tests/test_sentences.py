import sys
from pathlib import Path

import pytest
from lxml import etree

POC = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POC))

from sentence_wrap import plain_text, split_sentences, wrap_chapter  # noqa: E402

SAMPLE = POC / "samples" / "pride-and-prejudice.epub"


def parts(text):
    return [text[a:b] for a, b in split_sentences(text)]


@pytest.mark.parametrize("text, expected", [
    ("Mr. Bennet replied that he had not. Then he left.",
     ["Mr. Bennet replied that he had not.", "Then he left."]),
    ("“Is he married?” said she. “I hope so.”",
     ["“Is he married?” said she.", "“I hope so.”"]),
    ("“How so? how can it affect them?”", ["“How so? how can it affect them?”"]),
    ("“My dear, you flatter me. I certainly have.”",
     ["“My dear, you flatter me.", "I certainly have.”"]),
    ("J. R. Smith came. It was I. Then I left.", ["J. R. Smith came.", "It was I.", "Then I left."]),
    ("Mr. Darcy—who was proud—frowned.", ["Mr. Darcy—who was proud—frowned."]),
    ("Wait… What? No.", ["Wait…", "What?", "No."]),
    ("Dr. Jones, i.e. the doctor, came. Good.", ["Dr. Jones, i.e. the doctor, came.", "Good."]),
])
def test_split(text, expected):
    assert parts(text) == expected


XHTML = b"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>t</title></head><body><section epub:type="chapter">
<h2 epub:type="z3998:roman">IV</h2>
<p>One <em id="e1">two. Three</em> four.<a href="#n1" epub:type="noteref">1</a> Five.</p>
<hr/>
<p>After <i>the</i> break.<br/>Line two.</p>
<p><img src="x.png" alt=""/></p>
</section></body></html>"""


def test_wrap_roundtrip_and_structure():
    r = wrap_chapter(XHTML)
    assert plain_text(r.xhtml) == plain_text(XHTML)
    root = etree.fromstring(r.xhtml)
    ids = [e.get("id") for e in root.iter() if isinstance(e.tag, str) and e.get("id")]
    assert len(ids) == len(set(ids)), "duplicate ids after splitting inline elements"
    assert [s.tts_text for s in r.sentences] == [
        "Chapter four.", "One two.", "Three four.", "Five.", "After the break.", "Line two."]
    # The <em> crossing a sentence boundary was split; only the first copy keeps its id.
    ems = [e for e in root.iter("{http://www.w3.org/1999/xhtml}em")]
    assert len(ems) == 2 and ems[0].get("id") == "e1" and ems[1].get("id") is None
    # Footnote marker is shown inside the sentence but not spoken.
    assert r.sentences[2].text.endswith("four.1")
    assert [s.break_before for s in r.sentences] == [False, False, False, False, True, False]
    for s in r.sentences:
        span = root.find(f".//*[@id='{s.id}']")
        assert span is not None and "".join(span.itertext()).strip() == s.text


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample EPUB not downloaded")
def test_real_book_roundtrip():
    from epub_extract import Epub
    book = Epub(str(SAMPLE))
    chapters = book.chapters()
    assert len(chapters) == 61
    for ch in chapters[:10]:
        x = book.read(ch.item.path)
        r = wrap_chapter(x)
        assert plain_text(r.xhtml) == plain_text(x)
        assert r.sentences and r.sentences[0].kind == "heading"
