"""Getting books into the queue, whatever brings them: the phone over HTTP
today, a shared folder later. Both call ``submit``; nothing here knows about
HTTP.

The same file (SHA-256) with the same voice profile is the same job: sending
it twice returns the job already there instead of voicing the book again.
"""
from __future__ import annotations

import hashlib
import posixpath
import shutil
import zipfile
from pathlib import Path

from lxml import etree

from .store import FINISHED, Job, JobStore

OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"


class IntakeError(ValueError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_metadata(epub: Path) -> dict:
    """Title, author and the cover image's bytes; raises IntakeError if this
    isn't a readable EPUB."""
    try:
        z = zipfile.ZipFile(epub)
        container = etree.fromstring(z.read("META-INF/container.xml"))
        rootfile = container.find(".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile")
        opf_path = rootfile.get("full-path")
        opf = etree.fromstring(z.read(opf_path))
    except Exception as e:  # zipfile.BadZipFile, KeyError, XMLSyntaxError...
        raise IntakeError(f"Not a readable EPUB: {e}") from e
    text = lambda tag: next((t.text.strip() for t in opf.iter(f"{{{DC_NS}}}{tag}") if t.text), "")
    cover = None
    items = {it.get("id"): it for it in opf.iter(f"{{{OPF_NS}}}item")}
    cover_item = next((it for it in items.values() if "cover-image" in (it.get("properties") or "")), None)
    if cover_item is None:
        meta = next((m for m in opf.iter(f"{{{OPF_NS}}}meta") if m.get("name") == "cover"), None)
        cover_item = items.get(meta.get("content")) if meta is not None else None
    if cover_item is not None and (cover_item.get("media-type") or "").startswith("image/"):
        path = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), cover_item.get("href")))
        try:
            cover = (z.read(path), cover_item.get("media-type"))
        except KeyError:
            cover = None
    # Text characters across the spine: a rough size for the time estimate.
    chars = 0
    spine = [it.get("idref") for it in opf.iter(f"{{{OPF_NS}}}itemref")]
    base = posixpath.dirname(opf_path)
    for idref in spine:
        item = items.get(idref)
        if item is None:
            continue
        try:
            doc = etree.fromstring(z.read(posixpath.normpath(posixpath.join(base, item.get("href")))),
                                   etree.XMLParser(recover=True))
            if doc is not None:
                chars += sum(len(t.strip()) for t in doc.itertext())
        except Exception:
            continue
    return {"title": text("title"), "author": text("creator"), "cover": cover, "chars": chars}


def submit(store: JobStore, data_dir: Path, epub: Path, *, filename: str = "", profile: str = "",
           priority: int = 0, first_chapter: int = 1, out_dir: Path | None = None,
           job: Job | None = None) -> tuple[Job, bool]:
    """Queue a book. Returns (job, created). ``epub`` is moved into the
    queue's own folder when new; a duplicate leaves it where it is.

    ``job`` is a job created earlier in the 'uploading' state (the phone's
    upload): it's filled in here instead of creating a new one.
    """
    checksum = sha256_file(epub)
    existing = store.find_by_checksum(checksum, profile)
    if existing and existing.id != (job.id if job else None):
        if job:
            store.update(job.id, state="cancelled", error="Duplicate of a book already queued",
                         hidden=True)
        if existing.hidden:
            existing = store.update(existing.id, hidden=False)
        if existing.state in {"failed", "cancelled"}:
            existing = retry(store, existing.id)
        return existing, False
    meta = read_metadata(epub)
    books = data_dir / "books"
    books.mkdir(parents=True, exist_ok=True)
    stored = books / f"{checksum}.epub"
    if not stored.exists():
        shutil.move(str(epub), stored) if epub.parent == data_dir / "incoming" else shutil.copy(epub, stored)
    cover_path = ""
    if meta["cover"]:
        data, media = meta["cover"]
        ext = {"image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(media, ".jpg")
        cover = data_dir / "covers" / f"{checksum}{ext}"
        cover.parent.mkdir(parents=True, exist_ok=True)
        cover.write_bytes(data)
        cover_path = str(cover)
    fields = dict(checksum=checksum, title=meta["title"] or Path(filename or epub.name).stem,
                  author=meta["author"], filename=filename or epub.name, epub_path=str(stored),
                  cover_path=cover_path, profile=profile, priority=priority, chars_estimate=meta["chars"],
                  first_chapter=first_chapter, out_dir=str(out_dir) if out_dir else "")
    if job:
        job = store.update(job.id, **fields)
        job = store.update(job.id, state="uploaded") if job.state != "uploaded" else job
    else:
        job = store.create(state="uploaded", **fields)
    return store.update(job.id, state="waiting"), True


def retry(store: JobStore, job_id: str, force: bool = False) -> Job:
    """Put a failed or cancelled job back in the queue. Sentences already
    voiced come from the cache, so nothing finished is voiced twice. A
    completed job only goes back with ``force``."""
    job = store.get(job_id)
    if job is None:
        raise KeyError(job_id)
    if job.state == "completed" and not force:
        raise IntakeError("Already completed; nothing to retry")
    if job.state not in FINISHED:
        raise IntakeError(f"Can't retry a job that is {job.state}")
    return store.update(job_id, state="waiting", error="", failed_chapters=[], hidden=False,
                        stage_note="Queued again")
