"""Find the sentences in a chapter's XHTML and wrap each in <span id="sNNNN">.

The span ids are the anchors an EPUB 3 Media Overlay (SMIL) points at, so a
reader such as Readalong can highlight exactly the sentence being spoken.

How it works, per text block (<p>, <h2>, <li>, ...):
  1. Flatten the block into text segments, each remembering the inline
     elements (<em>, <abbr>, <a>, ...) it sits inside.
  2. Split the block's plain text into sentences.
  3. Rebuild the block: every sentence becomes one <span>, and the inline
     elements are re-created inside it. An inline element that crosses a
     sentence boundary is split into one copy per sentence (only the first
     copy keeps its id), so the markup stays valid and no text changes.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field

from lxml import etree

XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
EPUB_TYPE = f"{{{EPUB_NS}}}type"

# Elements that hold text as a block. A "leaf block" is one of these with no
# block descendants; leaf blocks are the units we split into sentences.
BLOCK_TAGS = {
    "address", "article", "aside", "blockquote", "body", "caption", "dd", "details",
    "div", "dl", "dt", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4",
    "h5", "h6", "header", "hgroup", "li", "main", "nav", "ol", "p", "pre", "section",
    "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
SKIP_TAGS = {"head", "script", "style", "svg", "math", "rp", "rt", "template"}
VOID_TAGS = {"br", "img", "wbr", "hr", "input"}
# Inline content that is shown but not read aloud (footnote markers, page numbers).
SILENT_TYPES = {"noteref", "pagebreak"}
SILENT_ROLES = {"doc-noteref", "doc-pagebreak"}


def local(tag) -> str:
    return etree.QName(tag).localname if isinstance(tag, str) else ""


@dataclass
class Sentence:
    id: str
    block: int            # index of the text block (paragraph) in the chapter
    text: str             # text as shown on the page
    tts_text: str         # text sent to the voice engine
    kind: str             # "heading" or "text"
    break_before: bool = False  # a scene break (<hr>) comes right before this block


@dataclass
class _Seg:
    text: str
    chain: tuple          # inline ancestors inside the block, outermost first
    void: etree._Element | None = None
    silent: bool = False


@dataclass
class WrapResult:
    xhtml: bytes
    sentences: list[Sentence] = field(default_factory=list)
    last_id: int = 0          # numeric part of the last sentence id used
    blocks: int = 0           # number of text blocks seen


# Words that end in a period without ending the sentence.
ABBREVIATIONS = {
    "mr", "mrs", "ms", "messrs", "mme", "mlle", "dr", "st", "jr", "sr", "rev", "hon", "esq",
    "col", "capt", "gen", "lt", "sgt", "maj", "adm", "gov", "pres", "prof", "sen", "rep",
    "no", "nos", "vol", "vols", "ch", "chap", "pp", "fig", "vs", "etc", "cf", "viz", "al",
    "inc", "ltd", "co", "corp", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
    "sept", "oct", "nov", "dec", "mt", "ft", "ave", "approx",
}
_OPEN = "\"'“‘(\\["
_CLOSE = "\"'”’)\\]​"  # ​ = a masked footnote marker
# Terminal punctuation (+ closing quotes) before a capitalised word; the caller
# also checks for whitespace or a <br> at the cut.
_BOUNDARY = re.compile(rf"[.!?…]+[{_CLOSE}]*(?=\s*[{_OPEN}—]*[A-Z0-9])")
_TOKEN_BEFORE = re.compile(rf"[{_OPEN}]*([\w.]+)$")


def split_sentences(text: str, lang: str = "en", breaks: frozenset = frozenset()) -> list[tuple[int, int]]:
    """Return (start, end) character ranges of the sentences in ``text``.

    Rule-based, tuned for fiction: a sentence ends at . ! ? or an ellipsis
    (plus any closing quotes) when the next word is capitalised, unless the
    word before the period is an abbreviation ("Mr.") or an initial ("J.").
    "“How so? how can it…” and "“Is he?” said she." stay whole because
    a lowercase word follows. ``breaks`` are offsets of <br> line breaks,
    which count as whitespace. Ranges exclude surrounding whitespace.
    """
    probe = text.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    cuts = []
    for m in _BOUNDARY.finditer(probe):
        if not (m.end() in breaks or probe[m.end():m.end() + 1].isspace()):
            continue
        if m.group().startswith(".") and not m.group().startswith(".."):
            tok = _TOKEN_BEFORE.search(probe[:m.start()])
            word = tok.group(1) if tok else ""
            if (word.lower().rstrip(".") in ABBREVIATIONS
                    or (len(word) == 1 and word.isupper() and word != "I")
                    or re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]", word)):
                continue
        cuts.append(m.end())
    ranges: list[tuple[int, int]] = []
    start = 0
    for end in cuts + [len(probe)]:
        chunk = probe[start:end]
        if chunk.strip():
            lead = len(chunk) - len(chunk.lstrip())
            ranges.append((start + lead, start + len(chunk.rstrip())))
        start = end
    return _merge_fragments(probe, ranges)


# Sentence fragments that should ride along with their neighbour rather than be
# narrated (and highlighted) alone, e.g. a lone closing quote.
_NO_WORDS = re.compile(r"^[\W_]*$")


def _merge_fragments(text: str, ranges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for start, end in ranges:
        if out and _NO_WORDS.match(text[start:end]):
            out[-1] = (out[-1][0], end)
        else:
            out.append((start, end))
    if len(out) > 1 and _NO_WORDS.match(text[out[0][0]:out[0][1]]):
        out[1] = (out[0][0], out[1][1])
        out.pop(0)
    return out


_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
_ONES = ("zero one two three four five six seven eight nine ten eleven twelve thirteen "
         "fourteen fifteen sixteen seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def roman_to_int(s: str) -> int | None:
    s = s.strip().upper()
    if not s or any(c not in _ROMAN for c in s):
        return None
    total = 0
    for i, c in enumerate(s):
        v = _ROMAN[c]
        total += -v if i + 1 < len(s) and _ROMAN[s[i + 1]] > v else v
    return total


def number_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        t, o = divmod(n, 10)
        return _TENS[t] + ("-" + _ONES[o] if o else "")
    if n < 1000:
        h, r = divmod(n, 100)
        return _ONES[h] + " hundred" + (" and " + number_words(r) if r else "")
    return str(n)


_QUOTE_MAP = str.maketrans({
    "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'",
    " ": " ", " ": " ", " ": " ", "⁠": "", "­": "",
})


def tts_normalize(text: str) -> str:
    """Plain text for the voice engine: straight quotes, single spaces."""
    text = text.translate(_QUOTE_MAP)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _types(el) -> set[str]:
    raw = el.get(EPUB_TYPE, "") or ""
    return {t.split(":")[-1] for t in raw.split()}


def _is_silent(el) -> bool:
    return bool(_types(el) & SILENT_TYPES) or el.get("role", "") in SILENT_ROLES


def _is_leaf_block(el) -> bool:
    if local(el.tag) not in BLOCK_TAGS:
        return False
    for d in el.iterdescendants():
        if local(d.tag) in BLOCK_TAGS:
            return False
    return True


def _flatten(block) -> list[_Seg]:
    segs: list[_Seg] = []

    def walk(el, chain, silent):
        if el.text:
            segs.append(_Seg(el.text, chain, silent=silent))
        for child in el:
            name = local(child.tag)
            if not name:  # comment / processing instruction: dropped
                if child.tail:
                    segs.append(_Seg(child.tail, chain, silent=silent))
                continue
            if name in VOID_TAGS:
                segs.append(_Seg("", chain, void=child, silent=silent))
            elif name in SKIP_TAGS:
                segs.append(_Seg("", chain, void=child, silent=True))
            else:
                walk(child, chain + (child,), silent or _is_silent(child))
            if child.tail:
                segs.append(_Seg(child.tail, chain, silent=silent))

    walk(block, (), False)
    return segs


class _Builder:
    """Re-creates inline structure while text is appended into a container."""

    def __init__(self, container, cloned_ids: set):
        self.container = container
        self.stack: list[tuple] = []  # (original, clone)
        self.cloned_ids = cloned_ids

    def _sync(self, chain):
        k = 0
        while k < len(self.stack) and k < len(chain) and self.stack[k][0] is chain[k]:
            k += 1
        del self.stack[k:]
        for orig in chain[k:]:
            parent = self.stack[-1][1] if self.stack else self.container
            clone = etree.SubElement(parent, orig.tag, dict(orig.attrib))
            oid = orig.get("id")
            if oid is not None:
                if oid in self.cloned_ids:
                    del clone.attrib["id"]
                else:
                    self.cloned_ids.add(oid)
            self.stack.append((orig, clone))

    def _parent(self):
        return self.stack[-1][1] if self.stack else self.container

    def add_text(self, chain, text):
        if not text:
            return
        self._sync(chain)
        parent = self._parent()
        if len(parent):
            last = parent[-1]
            last.tail = (last.tail or "") + text
        else:
            parent.text = (parent.text or "") + text

    def add_void(self, chain, el):
        self._sync(chain)
        c = copy.deepcopy(el)
        c.tail = None
        self._parent().append(c)


def wrap_chapter(xhtml: bytes, id_prefix: str = "s", lang: str | None = None,
                 start: int = 0, block_offset: int = 0) -> WrapResult:
    """Wrap every sentence of a chapter document in an id'd span.

    ``start``/``block_offset`` continue numbering when one chapter spans several
    documents (Calibre-split EPUBs), so ids and paragraph numbers stay unique.
    """
    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
    root = etree.fromstring(xhtml, parser)
    tree = root.getroottree()
    if lang is None:
        lang = root.get("{http://www.w3.org/XML/1998/namespace}lang") or root.get("lang") or "en"
    body = next((e for e in root.iter() if local(e.tag) == "body"), None)
    if body is None:
        return WrapResult(etree.tostring(tree, xml_declaration=True, encoding="utf-8"))

    existing_ids = {e.get("id") for e in root.iter() if isinstance(e.tag, str) and e.get("id")}
    blocks = []
    pending_break = False
    skip_until = None
    for el in body.iter():
        if not isinstance(el.tag, str):
            continue
        if skip_until is not None:
            if el in skip_until:
                continue
            skip_until = None
        name = local(el.tag)
        if name in SKIP_TAGS or _is_silent(el):
            skip_until = set(el.iterdescendants())
            continue
        if name == "hr":
            pending_break = True
            continue
        if _is_leaf_block(el):
            blocks.append((el, pending_break))
            pending_break = False
            skip_until = set(el.iterdescendants())

    result = WrapResult(b"")
    counter = start
    cloned_ids: set = set()
    for block_index, (block, break_before) in enumerate(blocks, block_offset):
        segs = _flatten(block)
        text = "".join(s.text for s in segs)
        if not text.strip():
            continue
        # Splitter input: silent text (footnote markers) masked, <br> positions noted.
        probe = "".join("​" * len(s.text) if s.silent else s.text for s in segs)
        breaks, off = set(), 0
        for s in segs:
            if s.void is not None and local(s.void.tag) == "br":
                breaks.add(off)
            off += len(s.text)
        ranges = split_sentences(probe, lang, frozenset(breaks))
        if not ranges:
            continue

        # Pieces cover the whole block: gaps (outside any span) and sentences.
        pieces: list[tuple[int, int, bool]] = []
        pos = 0
        for start, end in ranges:
            if start > pos:
                pieces.append((pos, start, False))
            pieces.append((start, end, True))
            pos = end
        if pos < len(text):
            pieces.append((pos, len(text), False))

        # Segment offsets.
        offsets = []
        off = 0
        for s in segs:
            offsets.append(off)
            off += len(s.text)

        tail = block.tail
        block.text = None
        for child in list(block):
            block.remove(child)
        block.tail = tail

        heading_like = (block_index - block_offset < 3
                        and re.fullmatch(r"\s*(?:\d{1,3}|[IVXLCDM]{1,7})\.?\s*", text) is not None)
        kind = "heading" if local(block.tag) in HEADING_TAGS or heading_like else "text"
        for pi, (pstart, pend, is_sentence) in enumerate(pieces):
            last_piece = pi == len(pieces) - 1
            if is_sentence:
                counter += 1
                sid = f"{id_prefix}{counter:04d}"
                while sid in existing_ids:
                    sid = "mo-" + sid
                container = etree.SubElement(block, f"{{{XHTML_NS}}}span", id=sid)
            else:
                container = block
            builder = _Builder(container, cloned_ids)
            shown, spoken = [], []
            for s, soff in zip(segs, offsets):
                if s.void is not None:
                    if pstart <= soff < pend or (last_piece and soff == pend):
                        builder.add_void(s.chain, s.void)
                    continue
                a, b = max(pstart, soff), min(pend, soff + len(s.text))
                if a >= b:
                    continue
                piece = s.text[a - soff:b - soff]
                # Whitespace between sentences needs no inline wrapper (avoids <em> </em>).
                builder.add_text(() if not is_sentence and piece.isspace() else s.chain, piece)
                shown.append(piece)
                if not s.silent:
                    spoken.append(piece)
            if is_sentence:
                shown_text = "".join(shown)
                tts = tts_normalize("".join(spoken))
                if kind == "heading":
                    tts = _speakable_heading(block, tts)
                first_in_block = not any(p[2] for p in pieces[:pi])
                result.sentences.append(Sentence(
                    id=container.get("id"), block=block_index, text=shown_text.strip(),
                    tts_text=tts, kind=kind, break_before=break_before and first_in_block,
                ))

    result.xhtml = etree.tostring(tree, xml_declaration=True, encoding="utf-8")
    result.last_id = counter
    result.blocks = len(blocks)
    # Drop sentences with nothing to say (e.g. only a footnote marker).
    result.sentences = [s for s in result.sentences if re.search(r"\w", s.tts_text)]
    return result


def _speakable_heading(block, tts: str) -> str:
    """'II' as a chapter heading reads better as 'Chapter two.'"""
    types = _types(block)
    n = roman_to_int(tts) if ("roman" in types or re.fullmatch(r"[IVXLCDM]+\.?", tts)) else None
    if n is None and re.fullmatch(r"\d{1,3}\.?", tts):
        n = int(tts.rstrip("."))
    if n is not None:
        return f"Chapter {number_words(n)}."
    if tts.isupper() and len(tts) > 3:  # "FANBOY" would be spelled out letter by letter
        tts = tts.title().replace("'S ", "'s ")
    if tts and tts[-1] not in ".!?":
        tts += "."
    return tts


def plain_text(xhtml: bytes) -> str:
    """All text of the body, for round-trip tests."""
    root = etree.fromstring(xhtml)
    body = next(e for e in root.iter() if local(e.tag) == "body")
    return "".join(body.itertext())
