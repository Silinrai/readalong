"""Check a rendered chapter by ear-proxy: transcribe every sentence's audio with
VoiceStudio's Whisper and compare it with the book text.

    python verify_chapter.py out/<book>/ch01.timings.json

Flags sentences whose words don't match (mispronounced, skipped or garbled),
extra words at the start/end (stray sounds the trim missed), and odd speaking
rates (rushed or stretched-out audio). Writes <stem>.verify.json next to it.
"""
from __future__ import annotations

import argparse
import difflib
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
import requests
import soundfile as sf


def words(s: str) -> list[str]:
    s = s.lower().replace("-", " ").replace("—", " ")
    return re.sub(r"[^a-z0-9' ]", "", s).split()


def transcribe(url: str, audio: np.ndarray, sr: int, tries: int = 3) -> str | None:
    """Whisper text, or None if the server keeps failing on this clip."""
    import time
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    for attempt in range(tries):
        try:
            r = requests.post(f"{url}/v1/audio/transcriptions",
                              files={"file": ("s.wav", buf.getvalue(), "audio/wav")},
                              data={"response_format": "json"}, timeout=300)
            r.raise_for_status()
            return (r.json().get("text") or "").strip()
        except requests.RequestException as e:
            print(f"    transcribe failed ({e.__class__.__name__}), attempt {attempt + 1}/{tries}")
            time.sleep(5 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("timings")
    ap.add_argument("--url", default="http://127.0.0.1:3900")
    ap.add_argument("--min-match", type=float, default=0.8)
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    tpath = Path(args.timings)
    t = json.loads(tpath.read_text(encoding="utf-8"))
    audio, sr = sf.read(tpath.parent / t["audio"], dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)

    results = []
    for i, s in enumerate(t["sentences"]):
        a = audio[int(s["start_ms"] * sr / 1000):int(s["speech_end_ms"] * sr / 1000)]
        heard = transcribe(args.url, a, sr)
        if heard is None:
            results.append({"id": s["id"], "match": None, "text": s["tts_text"], "heard": None,
                            "edge_extra": [], "chars_per_s": 0, "unchecked": True})
            continue
        want, got = words(s["tts_text"]), words(heard)
        sm = difflib.SequenceMatcher(None, want, got)
        ops = sm.get_opcodes()
        extra_edge = [got[j1:j2] for tag, i1, i2, j1, j2 in ops
                      if tag == "insert" and (j1 == 0 or j2 == len(got))]
        secs = (s["speech_end_ms"] - s["start_ms"]) / 1000
        results.append({"id": s["id"], "match": round(sm.ratio(), 3), "text": s["tts_text"], "heard": heard,
                        "edge_extra": [" ".join(x) for x in extra_edge],
                        "chars_per_s": round(len(s["tts_text"]) / secs, 1) if secs else 0})
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(t['sentences'])}")

    checked = [r for r in results if not r.get("unchecked")]
    rates = np.array([r["chars_per_s"] for r in checked if len(r["text"]) > 25])
    lo, hi = (np.percentile(rates, 2) * 0.75, np.percentile(rates, 98) * 1.3) if rates.size else (0, 1e9)
    for r in results:
        if r.get("unchecked"):
            r["flags"] = ["unchecked"]
            continue
        r["flags"] = [f for f, bad in [
            ("mismatch", r["match"] < args.min_match),
            ("edge_sound", bool(r["edge_extra"])),
            ("rate", len(r["text"]) > 25 and not lo <= r["chars_per_s"] <= hi),
        ] if bad]
    flagged = [r for r in results if r["flags"]]
    out = tpath.with_name(tpath.name.replace(".timings.json", ".verify.json"))
    mean = float(np.mean([r["match"] for r in checked])) if checked else 0.0
    out.write_text(json.dumps({"mean_match": mean, "unchecked": len(results) - len(checked),
                               "flagged": flagged, "all": results}, indent=1, ensure_ascii=False),
                   encoding="utf-8")
    print(f"{len(results)} sentences, mean word match {mean:.3f}, "
          f"{len(flagged)} flagged ({len(results) - len(checked)} unchecked) -> {out}")
    for r in sorted(flagged, key=lambda r: r["match"] if r["match"] is not None else -1)[:20]:
        print(f"  {r['id']} {r['flags']} match={r['match']}\n    text : {r['text']}\n    heard: {r['heard']}")


if __name__ == "__main__":
    main()
