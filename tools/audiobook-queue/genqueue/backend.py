"""The real voicing pipeline for the worker: render_chapter.py + tts.py +
media_overlay.py, the same code that voiced book 5."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

POC = Path(__file__).resolve().parent.parent
if str(POC) not in sys.path:
    sys.path.insert(0, str(POC))

from epub_extract import Epub  # noqa: E402
from media_overlay import write_narrated_epub  # noqa: E402
from render_chapter import load_config, render  # noqa: E402
from sentence_wrap import wrap_chapter  # noqa: E402
from tts import make_tts  # noqa: E402

from .worker import Backend  # noqa: E402


class RenderBackend(Backend):
    def __init__(self, config_path: Path = POC / "config.toml", cache_dir: Path = POC / "cache"):
        # A fresh checkout has only the example until the user makes their own.
        config_path = Path(config_path)
        if not config_path.exists() and config_path.with_name("config.example.toml").exists():
            config_path = config_path.with_name("config.example.toml")
        self.config_path = config_path
        self.cache_dir = Path(cache_dir)
        self.cfg = load_config(self.config_path, None)
        self.url = self.cfg.get("voicestudio", {}).get("url", "http://127.0.0.1:3900").rstrip("/")

    def ping(self) -> bool:
        try:
            # /health answers in ~1 ms; /engines/tts takes ~2 s.
            r = requests.get(f"{self.url}/health", timeout=5)
            return r.ok and r.json().get("status") == "ok"
        except Exception:
            return False

    def profiles(self) -> list[dict]:
        """VoiceStudio's saved voices (desktop generation only: the phone's
        live voices are a different list)."""
        r = requests.get(f"{self.url}/profiles", timeout=15)
        r.raise_for_status()
        data = r.json()
        items = data if isinstance(data, list) else data.get("profiles", [])
        default = self.cfg.get("voicestudio", {}).get("profile_name", "")
        return [{"id": p.get("id"), "name": p.get("name", ""), "kind": p.get("kind", ""),
                 "language": p.get("language", ""), "description": p.get("description", ""),
                 "default": p.get("name", "").strip().lower() == default.strip().lower()}
                for p in items if not p.get("is_demo") and self.PASSAGE_TAG not in p.get("name", "")]

    def profile_audio(self, profile_id: str) -> tuple[bytes, str]:
        r = requests.get(f"{self.url}/profiles/{profile_id}/audio", timeout=30)
        r.raise_for_status()
        return r.content, r.headers.get("content-type", "audio/wav")

    # --- a fixed reference per profile ------------------------------------
    # OmniVoice clones from at most 20 s. Given a longer clip and no
    # transcript, VoiceStudio picks a 15 s window and transcribes it on every
    # request, and when the GPU is full that runs Whisper on the CPU: about
    # 50 s per sentence instead of 2 s. So, once per profile, we do the same
    # pick it does (15 s windows, the one with the most spoken characters),
    # transcribe it once, and send that clip + transcript with each request.
    #
    # The clip must start and end on a pause. A 15 s window cut mid-word made
    # OmniVoice continue the reference: book 6 has "much." (the cut transcript's
    # last word) before most sentences. So windows are snapped to pauses and
    # hold whole sentences; PASSAGE_VERSION rebuilds references made before.
    WINDOW_S = 15.0
    MAX_WINDOWS = 5
    MIN_S, MAX_S = 8.0, 20.0   # OmniVoice: at most 20 s of reference
    PAUSE_S = 0.25             # silence this long counts as a sentence break
    PASSAGE_VERSION = 2
    PASSAGE_TAG = "passage, Readalong)"   # every passage profile's name ends so

    @classmethod
    def pause_windows(cls, audio, sr) -> list[tuple[int, int]]:
        """(start, end) sample ranges of MIN_S..MAX_S that begin and end
        inside a pause, one per WINDOW_S step, longest first within each step."""
        import numpy as np
        hop = max(1, int(sr * 0.01))
        n = len(audio) // hop
        if n == 0:
            return []
        rms = np.sqrt(np.mean(audio[:n * hop].reshape(n, hop).astype("float64") ** 2, axis=1))
        db = 20 * np.log10(rms + 1e-9)
        quiet = db < np.percentile(db, 95) - 35
        pauses, start = [], None   # (first quiet frame, last quiet frame + 1)
        for i, q in enumerate(list(quiet) + [False]):
            if q and start is None:
                start = i
            elif not q and start is not None:
                if i - start >= cls.PAUSE_S * 100 or start == 0 or i == n:
                    pauses.append((start, i))
                start = None
        # Cut 120 ms into a pause, so each end keeps a little silence.
        marks = [(min(a + 12, b), max(b - 12, a)) for a, b in pauses]   # (end here, start here)
        out = []
        for step in range(cls.MAX_WINDOWS):
            lo = step * cls.WINDOW_S * 100
            starts = [s0 for _, s0 in marks if lo <= s0 < lo + cls.WINDOW_S * 100]
            if not starts and step == 0:
                starts = [0]
            best = None
            for s0 in starts:
                ends = [e for e, _ in marks if cls.MIN_S * 100 <= e - s0 <= cls.MAX_S * 100]
                # Closest to WINDOW_S: long enough to clone, short enough to stay fast.
                for e in ends:
                    if best is None or abs((e - s0) - cls.WINDOW_S * 100) < abs((best[1] - best[0]) - cls.WINDOW_S * 100):
                        best = (s0, e)
            if best and best not in out:
                out.append(best)
        return [(a * hop, b * hop) for a, b in out]

    def voices_dir(self) -> Path:
        d = POC / "queue_data" / "voices"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def resolve_profile(self, name: str) -> dict | None:
        """{'wav', 'ref_text', 'profile_id'} for a profile whose clip is long,
        or None to use the profile as is (short clip or no such profile)."""
        import numpy as np
        import soundfile as sf

        prof = next((p for p in self.profiles() if p["name"].strip().lower() == name.strip().lower()), None)
        if prof is None:
            return None
        meta_path = self.voices_dir() / f"{prof['id']}.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("version") == self.PASSAGE_VERSION and Path(meta["wav"]).exists():
                return self._ensure_passage_profile(meta, prof)
        data, _ = self.profile_audio(prof["id"])
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(data)
        audio, sr = sf.read(f.name, dtype="float32", always_2d=True)
        Path(f.name).unlink(missing_ok=True)
        audio = audio.mean(axis=1)
        if len(audio) <= 20 * sr:
            return None
        best = None
        for i, (a, b) in enumerate(self.pause_windows(audio, sr)):
            chunk = audio[a:b]
            text = self._transcribe(chunk, sr)
            score = len(re.sub(r"[^\w]+", "", text))
            energy = float(np.square(chunk.astype("float64")).sum())
            if score and (best is None or (score, energy) > (best[0], best[1])):
                best = (score, energy, i, chunk, text)
        if best is None:
            return None
        wav = self.voices_dir() / f"{prof['id']}.wav"
        sf.write(wav, best[3], sr, subtype="PCM_16")
        meta = {"profile_id": prof["id"], "name": prof["name"], "wav": str(wav), "ref_text": best[4],
                "window": best[2], "window_seconds": round(len(best[3]) / sr, 2),
                "version": self.PASSAGE_VERSION}
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        return self._ensure_passage_profile(meta, prof)

    def _ensure_passage_profile(self, meta: dict, prof: dict) -> dict:
        """The passage as a VoiceStudio profile of its own. Uploading the clip
        with each request gives VoiceStudio a new temp file every time, which
        misses its voice-prompt cache (keyed by file path) and re-encodes and
        re-transcribes per sentence; a saved profile is encoded once."""
        name = f"{prof['name']} (v{self.PASSAGE_VERSION} {self.PASSAGE_TAG}"
        # The raw list: profiles() hides passage profiles from the phone, so
        # checking against it never found one and made a new copy on every
        # start. A new id is a new cache key, which re-voiced whole books.
        r = requests.get(f"{self.url}/profiles", timeout=15)
        r.raise_for_status()
        data = r.json()
        raw = data if isinstance(data, list) else data.get("profiles", [])
        ids = {p.get("id") for p in raw}
        pid = meta.get("passage_profile_id")
        if pid and pid in ids and meta.get("version") == self.PASSAGE_VERSION:
            return meta
        same = sorted((p for p in raw if p.get("name") == name), key=lambda p: p.get("created_at") or 0)
        if same:
            pid = same[0]["id"]  # oldest copy: the one earlier renders were cached under
        else:
            with open(meta["wav"], "rb") as f:
                r = requests.post(f"{self.url}/profiles", data={
                    "name": name, "ref_text": meta["ref_text"], "language": prof.get("language") or "Auto",
                    "kind": "clone"}, files={"ref_audio": ("passage.wav", f.read(), "audio/wav")}, timeout=60)
            r.raise_for_status()
            pid = r.json().get("id")
        meta["passage_profile_id"] = pid
        (self.voices_dir() / f"{prof['id']}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        return meta

    def _transcribe(self, chunk, sr) -> str:
        import io

        import soundfile as sf
        buf = io.BytesIO()
        sf.write(buf, chunk, sr, format="WAV", subtype="PCM_16")
        r = requests.post(f"{self.url}/v1/audio/transcriptions",
                          files={"file": ("window.wav", buf.getvalue(), "audio/wav")},
                          data={"response_format": "json"}, timeout=900)
        r.raise_for_status()
        return (r.json().get("text") or "").strip()

    def open(self, job):
        cfg = load_config(self.config_path, None)
        vs = cfg["voicestudio"]
        name = job.profile or vs.get("profile_name", "")
        if job.profile:
            vs["profile_name"], vs["profile_id"] = job.profile, ""
        fixed = self.resolve_profile(name) if name else None
        if fixed and fixed.get("passage_profile_id"):
            vs["profile_name"], vs["profile_id"] = "", fixed["passage_profile_id"]
            vs["voice_wav"], vs["ref_text"] = "", ""
        self.cfg = cfg
        book = Epub(job.epub_path)
        return book, book.chapters(), make_tts(cfg, self.cache_dir)

    def plan(self, book, chapter) -> list[int]:
        # The same wrapping render() does, so the counts match what it voices.
        sizes, last_id, blocks = [], 0, 0
        for item in chapter.items:
            w = wrap_chapter(book.read(item.path), lang=book.language, start=last_id, block_offset=blocks)
            last_id, blocks = w.last_id, blocks + w.blocks
            sizes.extend(len(s.tts_text) for s in w.sentences)
        return sizes

    def render(self, book, chapter, tts, out_dir: Path, log):
        return render(book, chapter, tts, self.cfg, out_dir, log=log)

    def write_epub(self, book, narrations, path: Path) -> None:
        write_narrated_epub(book, narrations, str(path))

    def voicestudio_pids(self) -> list[int]:
        """The process serving VoiceStudio's port (the one doing the work)."""
        if sys.platform != "win32":
            return []
        port = urlparse(self.url).port or 80
        out = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True,
                             creationflags=0x08000000).stdout
        pids = set()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[3] == "LISTENING" and parts[1].endswith(f":{port}"):
                pids.add(int(parts[4]))
        return sorted(pids)
