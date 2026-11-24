import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest
from lxml import etree

POC = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POC))

import render_chapter  # noqa: E402
from epub_extract import Epub  # noqa: E402
from media_overlay import write_narrated_epub  # noqa: E402
from tts import CachedTTS  # noqa: E402

SAMPLE = POC / "samples" / "pride-and-prejudice.epub"
pytestmark = pytest.mark.skipif(not SAMPLE.exists(), reason="sample EPUB not downloaded")


class FakeTTS(CachedTTS):
    """Speech-shaped noise: 60 ms per character, with engine-style silent padding."""
    name = "fake"

    def identity(self):
        return {"backend": "fake"}

    def _synthesize(self, text, context):
        sr = 24000
        body = np.random.default_rng(len(text)).uniform(-0.3, 0.3, int(sr * 0.06 * len(text)))
        pad = np.zeros(int(sr * 0.2), np.float32)
        return np.concatenate([pad, body.astype(np.float32), pad]), sr


@pytest.fixture(scope="module")
def rendered(tmp_path_factory):
    out = tmp_path_factory.mktemp("render")
    cfg = render_chapter.load_config(POC / "config.toml", "sapi")
    book = Epub(str(SAMPLE))
    ch = book.chapters()[0]
    narration, timings = render_chapter.render(book, ch, FakeTTS(out / "cache"), cfg, out, log=lambda *a: None)
    assert len(narration.docs) == 1
    epub = out / "book.epub"
    write_narrated_epub(book, [narration], str(epub))
    return out, book, ch, timings, epub


def test_timings_are_contiguous_and_cover_the_audio(rendered):
    out, book, ch, t, _ = rendered
    s = t["sentences"]
    assert s[0]["start_ms"] > 0 and s[0]["kind"] == "heading"
    for a, b in zip(s, s[1:]):
        assert a["start_ms"] < a["speech_end_ms"] <= a["end_ms"] == b["start_ms"]
    assert s[-1]["end_ms"] == t["duration_ms"]
    # Engine padding was trimmed: speech length ~ 60 ms/char + trim margins.
    first_text = next(x for x in s if x["kind"] == "text")
    spoken = first_text["speech_end_ms"] - first_text["start_ms"]
    assert abs(spoken - 60 * len(first_text["tts_text"])) < 150
    # Paragraph gaps are longer than sentence gaps within a paragraph.
    gaps = {(a["para"] == b["para"]): b["start_ms"] - a["speech_end_ms"] for a, b in zip(s[1:], s[2:])}
    assert gaps[False] > gaps[True]
    assert json.loads((out / "ch01.timings.json").read_text(encoding="utf-8")) == t


def test_mp3_duration_matches(rendered):
    out, *_ , t, _ = rendered
    import soundfile as sf
    info = sf.info(str(out / "ch01.mp3"))
    assert abs(info.duration * 1000 - t["duration_ms"]) < 120  # MP3 frame padding


def test_narrated_epub_is_consistent(rendered):
    out, book, ch, t, epub = rendered
    z = zipfile.ZipFile(epub)
    assert z.namelist()[0] == "mimetype" and z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
    nb = Epub(str(epub))
    item = nb.manifest[ch.item.id]
    smil_id = nb.opf.find(f".//{{http://www.idpf.org/2007/opf}}item[@id='{ch.item.id}']").get("media-overlay")
    smil = nb.manifest[smil_id]
    assert smil.media_type == "application/smil+xml"
    doc = etree.fromstring(z.read(item.path))
    ids = {e.get("id") for e in doc.iter() if isinstance(e.tag, str)}
    pars = etree.fromstring(z.read(smil.path)).findall(".//{http://www.w3.org/ns/SMIL}par")
    assert len(pars) == len(t["sentences"])
    import posixpath
    smil_dir = posixpath.dirname(smil.path)
    for par, s in zip(pars, t["sentences"]):
        text = par.find("{http://www.w3.org/ns/SMIL}text").get("src")
        audio = par.find("{http://www.w3.org/ns/SMIL}audio")
        href, frag = text.split("#")
        assert posixpath.normpath(posixpath.join(smil_dir, href)) == item.path
        assert frag == s["id"] and frag in ids
        assert posixpath.normpath(posixpath.join(smil_dir, audio.get("src"))) in z.namelist()
    durations = [m.text for m in nb.opf.iter("{http://www.idpf.org/2007/opf}meta")
                 if m.get("property") == "media:duration"]
    assert len(durations) == 2


def test_edge_blip_is_dropped():
    sr = 24000
    rng = np.random.default_rng(0)
    silence = lambda ms: np.zeros(int(sr * ms / 1000), np.float32)
    blip = rng.uniform(-0.03, 0.03, int(sr * 0.08)).astype(np.float32)     # quiet, 80 ms
    speech = rng.uniform(-0.5, 0.5, int(sr * 1.0)).astype(np.float32)
    clip = np.concatenate([silence(100), blip, silence(90), speech, silence(200)])
    out = render_chapter.trim_silence(clip, sr, -42)
    assert abs(len(out) / sr - (1.0 + 0.03 + 0.06)) < 0.03   # speech + lead/tail margins only
    # A loud short first word followed by a pause is kept.
    word = rng.uniform(-0.5, 0.5, int(sr * 0.12)).astype(np.float32)
    clip2 = np.concatenate([silence(100), word, silence(90), speech])
    assert len(render_chapter.trim_silence(clip2, sr, -42)) / sr > 1.2


import os
# Any long EPUB of your own (not in the repository): set READALONG_TEST_BOOK.
LOCAL_BOOK = Path(os.environ.get("READALONG_TEST_BOOK", POC / "books" / "test-book.epub"))


@pytest.mark.skipif(not LOCAL_BOOK.exists(), reason="test book not present")
def test_split_chapter_renders_as_one(tmp_path):
    cfg = render_chapter.load_config(POC / "config.toml", "sapi")
    book = Epub(str(LOCAL_BOOK))
    ch = book.find(38)
    assert ch.number == 38 and len(ch.items) == 2
    narration, t = render_chapter.render(book, ch, FakeTTS(tmp_path / "cache"), cfg, tmp_path,
                                         log=lambda *a: None, max_sentences=5)
    assert [s["tts_text"] for s in t["sentences"][:2]] == ["Chapter thirty-eight.", "Fanboy."]
    assert t["sentences"][0]["doc"] != t["sentences"][1]["doc"]
    ids = [s["id"] for s in t["sentences"]]
    assert len(ids) == len(set(ids))
    epub = tmp_path / "b.epub"
    write_narrated_epub(book, [narration], str(epub))
    z = zipfile.ZipFile(epub)
    assert sum(n.endswith(".smil") for n in z.namelist()) == 2
