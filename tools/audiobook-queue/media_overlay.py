"""Write an EPUB 3 Media Overlay: SMIL sync file + narration audio inside the EPUB.

Readalong (and other EPUB 3 readers: Thorium, Apple Books) read this natively and
highlight each <par>'s text fragment while its audio clip plays. See
apps/readalong-app/src/services/tts/mediaOverlay/parseSmil.ts.
"""
from __future__ import annotations

import posixpath
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from xml.sax.saxutils import quoteattr

from lxml import etree

from epub_extract import OPF_NS, Epub, ManifestItem

ACTIVE_CLASS = "-epub-media-overlay-active"
ACTIVE_CSS = f".{ACTIVE_CLASS} {{ background-color: rgba(255, 213, 79, 0.45); border-radius: 0.15em; }}\n"


@dataclass
class NarratedDoc:
    item: ManifestItem
    xhtml: bytes                             # document with sentence spans
    clips: list[tuple[str, float, float]]    # (span id, clipBegin s, clipEnd s) in the chapter MP3


@dataclass
class Narration:
    stem: str                         # e.g. "ch38" -> audio/ch38.mp3
    audio: bytes                      # MP3 for the whole chapter
    duration: float                   # seconds
    docs: list[NarratedDoc]           # one SMIL each (a chapter may span several files)


def clock(seconds: float) -> str:
    """SMIL clock value hh:mm:ss.mmm"""
    ms = round(seconds * 1000)
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h}:{m:02d}:{s:02d}.{ms:03d}"


def build_smil(text_href: str, audio_href: str, clips) -> bytes:
    pars = "\n".join(
        f'      <par id="par-{sid}"><text src={quoteattr(text_href + "#" + sid)}/>'
        f'<audio src={quoteattr(audio_href)} clipBegin="{clock(b)}" clipEnd="{clock(e)}"/></par>'
        for sid, b, e in clips
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">\n'
        '  <body>\n'
        f'    <seq id="seq-1" epub:textref={quoteattr(text_href)} epub:type="bodymatter chapter">\n'
        f"{pars}\n"
        "    </seq>\n"
        "  </body>\n"
        "</smil>\n"
    ).encode("utf-8")


def _rel(target_zip_path: str, from_dir: str) -> str:
    return posixpath.relpath(target_zip_path, from_dir or ".")


def write_narrated_epub(book: Epub, narrations: list[Narration], out_path: str) -> None:
    opf = etree.fromstring(etree.tostring(book.opf))  # private copy
    manifest = opf.find(f"{{{OPF_NS}}}manifest")
    metadata = opf.find(f"{{{OPF_NS}}}metadata")
    replaced: dict[str, bytes] = {}
    added: dict[str, bytes] = {}
    ids = {it.get("id") for it in manifest}

    def add_item(item_id, zip_path, media_type):
        assert item_id not in ids, item_id
        ids.add(item_id)
        etree.SubElement(manifest, f"{{{OPF_NS}}}item", id=item_id,
                         href=_rel(zip_path, book.opf_dir), attrib={"media-type": media_type})

    def add_meta(prop, value, refines=None):
        attrs = {"property": prop}
        if refines:
            attrs["refines"] = refines
        m = etree.SubElement(metadata, f"{{{OPF_NS}}}meta", attrs)
        m.text = value

    css_path = posixpath.join(book.opf_dir, "css", "media-overlay.css")
    add_item("media-overlay-css", css_path, "text/css")
    added[css_path] = ACTIVE_CSS.encode()

    total = 0.0
    for n in narrations:
        audio_path = posixpath.join(book.opf_dir, "audio", f"{n.stem}.mp3")
        add_item(f"audio-{n.stem}", audio_path, "audio/mpeg")
        added[audio_path] = n.audio
        for d in n.docs:
            if not d.clips:
                continue
            stem = posixpath.splitext(posixpath.basename(d.item.path))[0]
            smil_path = posixpath.join(book.opf_dir, "smil", f"{stem}.smil")
            smil_id = f"mo-{stem}"
            smil_dir = posixpath.dirname(smil_path)
            added[smil_path] = build_smil(_rel(d.item.path, smil_dir), _rel(audio_path, smil_dir), d.clips)
            add_item(smil_id, smil_path, "application/smil+xml")
            for it in manifest:
                if it.get("id") == d.item.id:
                    it.set("media-overlay", smil_id)
            doc_seconds = sum(e - b for _, b, e in d.clips)
            add_meta("media:duration", clock(doc_seconds), refines=f"#{smil_id}")
            total += doc_seconds
            replaced[d.item.path] = _link_css(d.xhtml, _rel(css_path, posixpath.dirname(d.item.path)))

    add_meta("media:duration", clock(total))
    add_meta("media:active-class", ACTIVE_CLASS)
    for m in metadata.iter(f"{{{OPF_NS}}}meta"):
        if m.get("property") == "dcterms:modified":
            m.text = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    replaced[book.opf_path] = etree.tostring(opf, xml_declaration=True, encoding="utf-8")

    with zipfile.ZipFile(out_path, "w") as out:
        out.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for info in book.zip.infolist():
            if info.filename == "mimetype" or info.filename in added:
                continue
            data = replaced.get(info.filename, None)
            if data is None:
                data = book.zip.read(info.filename)
            out.writestr(info.filename, data, compress_type=zipfile.ZIP_DEFLATED)
        for path, data in added.items():
            kind = zipfile.ZIP_STORED if path.endswith(".mp3") else zipfile.ZIP_DEFLATED
            out.writestr(path, data, compress_type=kind)


def _link_css(xhtml: bytes, href: str) -> bytes:
    root = etree.fromstring(xhtml)
    head = next((e for e in root if etree.QName(e).localname == "head"), None)
    if head is not None:
        ns = etree.QName(head).namespace
        etree.SubElement(head, f"{{{ns}}}link" if ns else "link",
                         href=href, rel="stylesheet", type="text/css")
    return etree.tostring(root.getroottree(), xml_declaration=True, encoding="utf-8")
