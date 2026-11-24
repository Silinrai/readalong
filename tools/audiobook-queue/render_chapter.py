"""One EPUB chapter in -> narration audio + sentence timestamps out.

    python render_chapter.py samples/pride-and-prejudice.epub --chapter 1
    python render_chapter.py book.epub --list
    python render_chapter.py book.epub --chapter 1 2 3 --backend sapi

Outputs (in --out, default out/<book>/):
    chNN.mp3              narration
    chNN.timings.json     sentence start/end times (ms) + text
    chNN.check.html       open in a browser: plays the audio and highlights along
    <book>.narrated.epub  the book with an EPUB 3 Media Overlay for the rendered
                          chapters - open it in Readalong and press play
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import tomllib
from pathlib import Path

import lameenc
import numpy as np
from lxml import etree

from epub_extract import Epub, safe_name
from media_overlay import NarratedDoc, Narration, write_narrated_epub
from sentence_wrap import Sentence, wrap_chapter
from tts import TTSError, VoiceStudioTTS, make_tts

HERE = Path(__file__).resolve().parent


def load_config(path: Path, backend: str | None) -> dict:
    cfg = tomllib.loads(path.read_text(encoding="utf-8"))
    if backend:
        cfg["backend"] = backend
    vs = cfg.setdefault("voicestudio", {})
    if vs.get("voice_wav"):
        vs["voice_wav"] = str((path.parent / vs["voice_wav"]).resolve())
    return cfg


# --- audio helpers --------------------------------------------------------

def trim_silence(audio: np.ndarray, sr: int, db: float, lead_ms=30, tail_ms=60) -> np.ndarray:
    if audio.size == 0:
        return audio
    hop = max(1, sr // 100)  # 10 ms frames
    n = len(audio) // hop
    if n == 0:
        return audio
    rms = np.sqrt(np.mean(audio[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    thresh = rms.max() * (10 ** (db / 20))
    loud = np.nonzero(rms > thresh)[0]
    if loud.size == 0:
        return audio[:0]
    first, last = _drop_edge_blips(loud, rms)
    a = max(0, first * hop - sr * lead_ms // 1000)
    b = min(len(audio), (last + 1) * hop + sr * tail_ms // 1000)
    return audio[a:b]


def _drop_edge_blips(loud: np.ndarray, rms: np.ndarray, max_blip=15, min_gap=4,
                     quieter_db=10) -> tuple[int, int]:
    """OmniVoice often emits a short voiced blip (~60-150 ms) and a little
    silence before the first word: heard as a "wah" at each paragraph start.
    Skip a short burst at either edge when a gap (>= 40 ms) separates it from
    the speech. Frame units are 10 ms."""
    runs = np.split(loud, np.nonzero(np.diff(loud) > min_gap)[0] + 1)
    quiet = rms.max() * 10 ** (-quieter_db / 20)

    def blip(run, max_len):
        return run[-1] - run[0] + 1 <= max_len and rms[run[0]:run[-1] + 1].max() < quiet

    while len(runs) > 1 and blip(runs[0], max_blip):
        runs.pop(0)
    while len(runs) > 1 and blip(runs[-1], max_blip // 2):
        runs.pop()
    return int(runs[0][0]), int(runs[-1][-1])


def resample(audio: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst or audio.size == 0:
        return audio
    n = int(round(len(audio) * dst / src))
    return np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)


def encode_mp3(audio: np.ndarray, sr: int, kbps: int) -> bytes:
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm.tobytes()) + enc.flush())


def expression_context(engine: str | None, s: Sentence, cfg: dict) -> dict:
    """Per-sentence delivery hints for engines that take them."""
    ex = cfg.get("expression", {})
    if engine == "indextts2" and ex.get("emotion_from_text") and s.kind == "text":
        return {"emo_text": s.tts_text[:500], "emo_alpha": ex.get("emo_alpha", 0.6)}
    return {}


def gap_before(prev: Sentence | None, cur: Sentence, gaps: dict) -> int:
    if prev is None:
        return gaps["lead_in"]
    if cur.break_before:
        return gaps["scene_break"]
    if prev.kind == "heading":
        return gaps["after_heading"]
    if cur.block != prev.block:
        return gaps["paragraph"]
    return gaps["sentence"]


# --- rendering -------------------------------------------------------------

def render(book: Epub, chapter, tts, cfg, out_dir: Path, log=print, max_sentences=None):
    # Wrap every document of the chapter, numbering ids/paragraphs continuously.
    docs = []  # (item, wrapped xhtml, sentences)
    last_id = blocks = 0
    for item in chapter.items:
        w = wrap_chapter(book.read(item.path), lang=book.language, start=last_id, block_offset=blocks)
        last_id, blocks = w.last_id, blocks + w.blocks
        docs.append((item, w.xhtml, w.sentences))
    plan = [(item, s) for item, _, sents in docs for s in sents]
    if max_sentences:
        plan = plan[:max_sentences]
    gaps, acfg = cfg["gaps"], cfg["audio"]
    engine = getattr(tts, "engine", None)
    log(f"Chapter {chapter.key} ({chapter.title}): {len(plan)} sentences in {len(docs)} file(s), "
        f"{sum(len(s.tts_text) for _, s in plan)} characters")

    clips: list[np.ndarray] = []
    rows = []
    sr = None
    cursor = 0  # samples
    t0 = time.time()
    prev = None
    for i, (item, s) in enumerate(plan):
        audio, asr = tts.synthesize(s.tts_text, expression_context(engine, s, cfg))
        if sr is None:
            sr = asr
        audio = trim_silence(resample(audio, asr, sr), sr, acfg["trim_db"])
        if audio.size == 0:
            log(f"  ! {s.id}: engine returned silence for {s.tts_text!r}")
        gap = int(sr * gap_before(prev, s, gaps) / 1000)
        clips.append(np.zeros(gap, np.float32))
        cursor += gap
        start = cursor
        clips.append(audio.astype(np.float32))
        cursor += len(audio)
        rows.append({"id": s.id, "doc": item.path, "block": s.block, "kind": s.kind, "text": s.text,
                     "tts_text": s.tts_text, "start": start, "speech_end": cursor})
        prev = s
        done = i + 1
        if done % 25 == 0 or done == len(plan):
            el = time.time() - t0
            log(f"  {done}/{len(plan)} sentences, {cursor / sr / 60:.1f} min audio in {el / 60:.1f} min")
    tail = int(sr * gaps["tail"] / 1000)
    clips.append(np.zeros(tail, np.float32))
    total = cursor + tail
    audio = np.concatenate(clips) if clips else np.zeros(0, np.float32)
    peak = float(np.abs(audio).max()) if audio.size else 0
    if peak > 0.99:
        audio = audio * (0.99 / peak)

    # Each sentence's clip runs until the next one starts, so the pause after a
    # sentence belongs to it: players that step clip by clip keep the pauses,
    # and the highlight stays on a sentence until the next begins.
    ms = lambda samples: round(samples * 1000 / sr)
    for j, r in enumerate(rows):
        r["end"] = rows[j + 1]["start"] if j + 1 < len(rows) else total
    stem = f"ch{chapter.key:02d}"
    timings = {
        "version": 2,
        "book": book.title,
        "chapter": chapter.key,
        "title": chapter.title,
        "docs": [item.path for item, _, _ in docs],
        "audio": f"{stem}.mp3",
        "sample_rate": sr,
        "duration_ms": ms(total),
        "tts": tts.identity(),
        "sentences": [{
            "id": r["id"], "doc": r["doc"], "para": r["block"], "kind": r["kind"], "text": r["text"],
            "tts_text": r["tts_text"], "start_ms": ms(r["start"]), "end_ms": ms(r["end"]),
            "speech_end_ms": ms(r["speech_end"]),
        } for r in rows],
    }
    mp3 = encode_mp3(audio, sr, acfg["mp3_kbps"])
    (out_dir / f"{stem}.mp3").write_bytes(mp3)
    if acfg.get("keep_wav"):
        import soundfile as sf
        sf.write(out_dir / f"{stem}.wav", audio, sr, subtype="PCM_16")
    (out_dir / f"{stem}.timings.json").write_text(json.dumps(timings, indent=1, ensure_ascii=False),
                                                 encoding="utf-8")
    write_check_page(out_dir / f"{stem}.check.html", [x for _, x, _ in docs], timings)
    elapsed = time.time() - t0
    log(f"  -> {stem}.mp3  {total / sr / 60:.1f} min audio, rendered in {elapsed / 60:.1f} min "
        f"({(total / sr) / max(elapsed, 1e-6):.2f}x real time)")
    doc_parts = []
    for item, xhtml, _ in docs:
        clips_ = [(t["id"], t["start_ms"] / 1000, t["end_ms"] / 1000)
                  for t in timings["sentences"] if t["doc"] == item.path]
        doc_parts.append(NarratedDoc(item, xhtml, clips_))
    return Narration(stem, mp3, total / sr, doc_parts), timings


def write_check_page(path: Path, xhtmls: list[bytes], timings: dict):
    """Tiny stand-in for the app: plays the MP3, highlights the current sentence,
    click a sentence to jump there, pausing scrolls to where it stopped."""
    inner = ""
    for xhtml in xhtmls:
        root = etree.fromstring(xhtml)
        body = next(e for e in root.iter() if isinstance(e.tag, str) and etree.QName(e).localname == "body")
        inner += "".join(etree.tostring(c, encoding="unicode", method="html") for c in body)
    data = json.dumps([[s["id"], s["start_ms"], s["end_ms"]] for s in timings["sentences"]])
    title = f'{timings["book"]} - {timings["title"]}'
    path.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sync check</title>
<style>
:root {{ --bg:#faf7f0; --fg:#222; --hl:#ffe08a; --muted:#777; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#1b1b1b; --fg:#e6e6e6; --hl:#6b5514; --muted:#999; }} }}
body {{ background:var(--bg); color:var(--fg); font:18px/1.6 Georgia, serif; margin:0; }}
main {{ max-width:38em; margin:0 auto; padding:5.5em 16px 40vh; }}
header {{ position:fixed; top:0; left:0; right:0; background:var(--bg); padding:10px 16px;
  border-bottom:1px solid #8884; display:flex; gap:12px; align-items:center; font:14px system-ui, sans-serif; z-index:1 }}
header audio {{ flex:1; min-width:0 }}
#now {{ color:var(--muted); white-space:nowrap }}
span[id^="s"] {{ cursor:pointer; border-radius:3px; transition:background .12s }}
span.active {{ background:var(--hl) }}
abbr {{ text-decoration:none }}
</style></head><body>
<header><strong>{title}</strong><audio id="a" controls preload="auto" src="{timings['audio']}"></audio><span id="now"></span></header>
<main>{inner}</main>
<script>
const T = {data}; const a = document.getElementById('a'); const now = document.getElementById('now');
let cur = -1;
// Load the audio as a blob so seeking works even on servers without Range support.
fetch(a.getAttribute('src')).then(r => r.ok ? r.blob() : null).then(b => {{ if (b) a.src = URL.createObjectURL(b); }}).catch(() => {{}});
function find(ms) {{ let lo = 0, hi = T.length - 1, r = -1;
  while (lo <= hi) {{ const m = (lo + hi) >> 1; if (T[m][1] <= ms) {{ r = m; lo = m + 1; }} else hi = m - 1; }} return r; }}
function show(i, scroll) {{ if (i === cur) return; if (cur >= 0) document.getElementById(T[cur][0])?.classList.remove('active');
  cur = i; if (i < 0) return; const el = document.getElementById(T[i][0]); el?.classList.add('active');
  now.textContent = T[i][0]; if (scroll && el) el.scrollIntoView({{block: 'center', behavior: 'smooth'}}); }}
function tick() {{ show(find(a.currentTime * 1000), true); if (!a.paused) requestAnimationFrame(tick); }}
a.addEventListener('play', tick); a.addEventListener('seeked', () => show(find(a.currentTime * 1000), true));
a.addEventListener('pause', () => document.getElementById(T[cur]?.[0])?.scrollIntoView({{block: 'center'}}));
document.querySelector('main').addEventListener('click', e => {{ const s = e.target.closest('span[id^="s"]');
  if (!s) return; const i = T.findIndex(t => t[0] === s.id); if (i >= 0) {{ a.currentTime = T[i][1] / 1000 + 0.001; a.play(); }} }});
</script></body></html>
""", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("epub")
    ap.add_argument("--chapter", type=int, nargs="+", default=[1],
                    help="chapter number(s) as numbered in the book (see --list)")
    ap.add_argument("--list", action="store_true", help="list detected chapters and exit")
    ap.add_argument("--config", default=str(HERE / "config.toml"))
    ap.add_argument("--backend", choices=["voicestudio", "sapi"])
    ap.add_argument("--engine", help="override the VoiceStudio engine")
    ap.add_argument("--profile", help="VoiceStudio voice profile name (overrides config)")
    ap.add_argument("--out")
    ap.add_argument("--max-sentences", type=int, help="only render the first N sentences (quick tests)")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    book = Epub(args.epub)
    chapters = book.chapters()
    if args.list:
        for c in chapters:
            print(f"{c.key:4d}  {c.title}  ({', '.join(i.path for i in c.items)})")
        return
    cfg = load_config(Path(args.config), args.backend)
    if args.engine:
        cfg["voicestudio"]["engine"] = args.engine
    if args.profile:
        cfg["voicestudio"]["profile_name"] = args.profile
        cfg["voicestudio"]["profile_id"] = ""
    out_dir = Path(args.out) if args.out else HERE / "out" / safe_name(Path(args.epub).stem)
    out_dir.mkdir(parents=True, exist_ok=True)
    tts = make_tts(cfg, HERE / "cache")
    if isinstance(tts, VoiceStudioTTS):
        if not tts.ping():
            sys.exit(f"VoiceStudio is not answering at {tts.url}. Start it, or use --backend sapi.")
        if tts.voice_bytes and not tts.ref_text and tts.ref_short_enough():
            try:
                tts.ref_text = tts.transcribe_reference()
                print(f"Reference transcript: {tts.ref_text!r} (save it as ref_text in config.toml)")
            except Exception as e:
                print(f"(could not transcribe the reference clip, cloning without ref_text: {e})")

    epub_out = out_dir / f"{safe_name(Path(args.epub).stem)}.narrated.epub"
    narrations, failed = [], []
    for n in args.chapter:
        chapter = book.find(n)
        if chapter is None:
            sys.exit(f"No chapter {n}; see --list.")
        try:
            narration, _ = render(book, chapter, tts, cfg, out_dir, max_sentences=args.max_sentences)
        except TTSError as e:
            print(f"  ! chapter {n} failed, skipping: {e}")
            failed.append(n)
            continue
        narrations.append(narration)
        # Rewrite the narrated EPUB after every chapter so finished chapters are usable now.
        tmp = epub_out.with_suffix(".tmp")
        write_narrated_epub(book, narrations, str(tmp))
        tmp.replace(epub_out)
        print(f"  narrated EPUB updated ({len(narrations)} chapter(s))", flush=True)
    if failed:
        print(f"Failed chapters (rerun them; finished sentences are cached): {failed}")
    print(f"Narrated EPUB: {epub_out}")


if __name__ == "__main__":
    main()
