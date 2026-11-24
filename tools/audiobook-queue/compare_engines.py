"""Render the same passage with several VoiceStudio engines, cloning voice.wav,
so you can pick the most expressive one by ear.

    python compare_engines.py                       # default engines, default passage
    python compare_engines.py --engines indextts2 cosyvoice omnivoice voxcpm2
    python compare_engines.py --list                # engines the server knows about

Writes out/compare/<engine>.mp3 (plus .timings.json) and prints render speed.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from render_chapter import (HERE, encode_mp3, expression_context, gap_before, load_config, resample,
                            trim_silence)
from sentence_wrap import Sentence, split_sentences, tts_normalize
from tts import TTSError, make_tts

# Narration + dialogue with emotional range, from Pride and Prejudice ch. 1.
PASSAGE = [
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, "
    "must be in want of a wife.",
    "“My dear Mr. Bennet,” said his lady to him one day, “have you heard that "
    "Netherfield Park is let at last?”",
    "Mr. Bennet replied that he had not.",
    "“Oh! single, my dear, to be sure! A single man of large fortune; four or five thousand a "
    "year. What a fine thing for our girls!”",
    "“Mr. Bennet, how can you abuse your own children in such a way? You take delight in "
    "vexing me. You have no compassion on my poor nerves.”",
    "“You mistake me, my dear. I have a high respect for your nerves. They are my old friends. "
    "I have heard you mention them with consideration these twenty years at least.”",
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engines", nargs="+", default=["indextts2", "omnivoice", "voxcpm2", "cosyvoice"])
    ap.add_argument("--config", default=str(HERE / "config.toml"))
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cfg = load_config(Path(args.config), "voicestudio")
    probe = make_tts(cfg, HERE / "cache")
    if not probe.ping():
        sys.exit(f"VoiceStudio is not answering at {probe.url}.")
    engines = {e["id"]: e for e in probe.engines()}
    if args.list:
        for e in engines.values():
            print(f'{e["id"]:22} available={e.get("available")!s:5} cloning={e.get("supports_cloning")!s:5} '
                  f'emotion={e.get("supports_emotion")!s:5} {(e.get("reason") or "")[:60]}')
        return
    ref_text = cfg["voicestudio"].get("ref_text")
    if not ref_text and probe.voice_bytes and probe.ref_short_enough():
        try:
            ref_text = probe.transcribe_reference()
            print(f"Reference transcript: {ref_text!r}")
        except Exception as e:
            print(f"(no reference transcript: {e})")
    cfg["voicestudio"]["ref_text"] = ref_text or ""

    sentences: list[Sentence] = []
    for p, para in enumerate(PASSAGE):
        for a, b in split_sentences(para):
            sentences.append(Sentence(id=f"s{len(sentences) + 1:04d}", block=p, text=para[a:b],
                                      tts_text=tts_normalize(para[a:b]), kind="text"))
    out_dir = HERE / "out" / "compare"
    out_dir.mkdir(parents=True, exist_ok=True)
    import numpy as np
    for engine in args.engines:
        info = engines.get(engine)
        if not info or not info.get("available"):
            why = (info or {}).get("reason") or "unknown engine"
            print(f"== {engine}: skipped, not available ({why.splitlines()[0][:100]})")
            continue
        tts = make_tts(cfg, HERE / "cache", engine_override=engine)
        print(f"== {engine}")
        t0 = time.time()
        parts, sr, prev = [], None, None
        try:
            for s in sentences:
                audio, asr = tts.synthesize(s.tts_text, expression_context(engine, s, cfg))
                sr = sr or asr
                audio = trim_silence(resample(audio, asr, sr), sr, cfg["audio"]["trim_db"])
                parts += [np.zeros(int(sr * gap_before(prev, s, cfg["gaps"]) / 1000), np.float32), audio]
                prev = s
        except TTSError as e:
            print(f"   failed: {e}")
            continue
        audio = np.concatenate(parts)
        (out_dir / f"{engine}.mp3").write_bytes(encode_mp3(audio, sr, cfg["audio"]["mp3_kbps"]))
        el = time.time() - t0
        print(f"   {len(audio) / sr:.1f}s audio in {el:.1f}s ({len(audio) / sr / el:.2f}x real time) "
              f"-> {out_dir / (engine + '.mp3')}")


if __name__ == "__main__":
    main()
