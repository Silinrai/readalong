"""Read an EPUB: container -> OPF -> manifest/spine -> chapters."""
from __future__ import annotations

import posixpath
import re
import zipfile
from dataclasses import dataclass
from urllib.parse import unquote

from lxml import etree

from sentence_wrap import EPUB_TYPE, HEADING_TAGS, local

OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"
CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"

# Spine documents that are not story text.
NON_CHAPTER_TYPES = {
    "cover", "titlepage", "halftitlepage", "toc", "copyright-page", "imprint", "colophon",
    "dedication", "epigraph", "loi", "lot", "index", "endnotes", "footnotes", "acknowledgments",
    "frontmatter", "backmatter", "uncopyright",
}


@dataclass
class ManifestItem:
    id: str
    href: str          # relative to the OPF, as written
    path: str          # zip path
    media_type: str
    properties: str


@dataclass
class Chapter:
    index: int                     # 1-based position among detected chapters
    number: int | None             # the book's own chapter number ("38. Fanboy" -> 38)
    items: list[ManifestItem]      # spine documents, in order (Calibre splits chapters)
    title: str

    @property
    def item(self) -> ManifestItem:
        return self.items[0]

    @property
    def key(self) -> int:
        return self.number if self.number is not None else self.index


class Epub:
    def __init__(self, path: str):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        container = etree.fromstring(self.zip.read("META-INF/container.xml"))
        rootfile = container.find(f".//{{{CONTAINER_NS}}}rootfile")
        self.opf_path = rootfile.get("full-path")
        self.opf_dir = posixpath.dirname(self.opf_path)
        self.opf = etree.fromstring(self.zip.read(self.opf_path))
        self.manifest: dict[str, ManifestItem] = {}
        for it in self.opf.iter(f"{{{OPF_NS}}}item"):
            href = it.get("href")
            self.manifest[it.get("id")] = ManifestItem(
                id=it.get("id"), href=href,
                path=posixpath.normpath(posixpath.join(self.opf_dir, unquote(href))),
                media_type=it.get("media-type", ""), properties=it.get("properties", ""),
            )
        self.spine = [ir.get("idref") for ir in self.opf.iter(f"{{{OPF_NS}}}itemref")]
        title = self.opf.find(f".//{{{DC_NS}}}title")
        self.title = title.text.strip() if title is not None and title.text else posixpath.basename(path)
        lang = self.opf.find(f".//{{{DC_NS}}}language")
        self.language = lang.text.strip() if lang is not None and lang.text else "en"

    def read(self, zip_path: str) -> bytes:
        return self.zip.read(zip_path)

    def toc(self) -> list[tuple[str, str]]:
        """(title, zip path) of table-of-contents entries, in order (NCX or EPUB 3 nav)."""
        entries: list[tuple[str, str]] = []
        nav = next((i for i in self.manifest.values() if "nav" in i.properties.split()), None)
        if nav is not None:
            root = etree.fromstring(self.read(nav.path))
            for n in root.iter():
                if isinstance(n.tag, str) and local(n.tag) == "nav" and "toc" in (n.get(EPUB_TYPE) or ""):
                    for a in n.iter():
                        if isinstance(a.tag, str) and local(a.tag) == "a" and a.get("href"):
                            entries.append((" ".join("".join(a.itertext()).split()),
                                            self._resolve(nav.path, a.get("href"))))
                    break
        if not entries:
            ncx = next((i for i in self.manifest.values() if i.media_type == "application/x-dtbncx+xml"), None)
            if ncx is not None:
                root = etree.fromstring(self.read(ncx.path))
                for pt in root.iter():
                    if isinstance(pt.tag, str) and local(pt.tag) == "navPoint":
                        label = next((e for e in pt.iter() if isinstance(e.tag, str) and local(e.tag) == "text"), None)
                        content = next((e for e in pt if isinstance(e.tag, str) and local(e.tag) == "content"), None)
                        if content is not None:
                            title = " ".join((label.text or "").split()) if label is not None else ""
                            entries.append((title, self._resolve(ncx.path, content.get("src"))))
        return entries

    def _resolve(self, base_path: str, href: str) -> str:
        return posixpath.normpath(posixpath.join(posixpath.dirname(base_path), unquote(href.split("#")[0])))

    def chapters(self) -> list[Chapter]:
        """Chapters from the table of contents (each runs until the next entry's
        document), falling back to one chapter per spine document."""
        spine_items = [self.manifest[i] for i in self.spine if i in self.manifest]
        pos = {it.path: k for k, it in enumerate(spine_items)}
        starts = []
        for title, path in self.toc():
            if path in pos and (not starts or pos[path] > starts[-1][0]):
                starts.append((pos[path], title))
        chapters: list[Chapter] = []
        for j, (k, title) in enumerate(starts):
            end = starts[j + 1][0] if j + 1 < len(starts) else len(spine_items)
            items = [it for it in spine_items[k:end] if "html" in it.media_type]
            words = sum(len(" ".join(etree.fromstring(self.read(it.path)).itertext()).split()) for it in items)
            if words < 300 or title.strip().lower() in NON_CHAPTER_TITLES:
                continue
            chapters.append(Chapter(0, _title_number(title), items, title))
        if len(chapters) < 2:
            chapters = self._chapters_by_document()
        for n, ch in enumerate(chapters, 1):
            ch.index = n
        return chapters

    def find(self, key: int) -> Chapter | None:
        """Chapter by the book's own number, else by position."""
        chs = self.chapters()
        return next((c for c in chs if c.number == key), None) or next((c for c in chs if c.index == key), None)

    def _chapters_by_document(self) -> list[Chapter]:
        found: list[Chapter] = []
        fallback: list[Chapter] = []
        for si, idref in enumerate(self.spine):
            item = self.manifest.get(idref)
            if item is None or "html" not in item.media_type:
                continue
            root = etree.fromstring(self.read(item.path))
            types: set[str] = set()
            roles: set[str] = set()
            for el in root.iter():
                if not isinstance(el.tag, str):
                    continue
                if local(el.tag) in ("body", "section", "article", "div"):
                    types |= {t.split(":")[-1] for t in (el.get(EPUB_TYPE) or "").split()}
                    if el.get("role"):
                        roles.add(el.get("role"))
            text = " ".join("".join(root.itertext()).split())
            title = _title(root) or item.id
            ch = Chapter(0, None, [item], title)
            if "chapter" in types or "doc-chapter" in roles:
                found.append(ch)
            elif not (types & NON_CHAPTER_TYPES) and len(text.split()) > 300:
                fallback.append(ch)
        return found or fallback


def _title(root) -> str:
    for el in root.iter():
        if isinstance(el.tag, str) and local(el.tag) in HEADING_TAGS:
            t = " ".join("".join(el.itertext()).split())
            if t:
                return t
    for el in root.iter():
        if isinstance(el.tag, str) and local(el.tag) == "title" and el.text:
            return el.text.strip()
    return ""


NON_CHAPTER_TITLES = {"copyright", "contents", "table of contents", "cover", "title page",
                      "dedication", "also in series", "also by the author", "about the author",
                      "uncopyright", "colophon", "imprint"}


def _title_number(title: str) -> int | None:
    """'38. Fanboy' / 'Chapter 38: Fanboy' / 'Chapter IV' / 'XXXVIII' -> the number."""
    from sentence_wrap import roman_to_int
    m = re.match(r"\s*(?:chapter\s+)?(\d{1,4})\b", title, re.I)
    if m:
        return int(m.group(1))
    m = re.match(r"\s*(?:chapter\s+)?([IVXLCDM]+)\s*(?:$|[.:])", title, re.I)
    return roman_to_int(m.group(1).upper()) if m else None


def safe_name(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", s).strip("-").lower() or "book"
