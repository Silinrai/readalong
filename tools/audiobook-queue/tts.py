"""Voice engines behind one interface: synthesize(text, context) -> (float32 mono, sample_rate).

- VoiceStudioTTS: the expressive engine (IndexTTS 2 / CosyVoice 3 / OmniVoice ...) via
  VoiceStudio's local HTTP API, cloning the voice from a reference clip.
- SapiTTS: Windows' built-in voice. Robotic, but always there - used to test the
  pipeline and the read-along sync without VoiceStudio.

Every clip is cached on disk, keyed by engine + voice + settings + text, so a
re-render after a crash (or after changing gaps) costs nothing.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import time
from pathlib import Path

import numpy as np
import soundfile as sf


class TTSError(RuntimeError):
    pass


class CachedTTS:
    name = "base"

    def __init__(self, cache_dir: str | Path):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def cache_key(self, text: str, context: dict) -> str:
        blob = json.dumps({"engine": self.identity(), "text": text, "ctx": context},
                          sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:24]

    def identity(self) -> dict:
        raise NotImplementedError

    def _synthesize(self, text: str, context: dict) -> tuple[np.ndarray, int]:
        raise NotImplementedError

    def synthesize(self, text: str, context: dict | None = None) -> tuple[np.ndarray, int]:
        context = context or {}
        path = self.cache_dir / f"{self.cache_key(text, context)}.wav"
        if path.exists():
            audio, sr = sf.read(path, dtype="float32", always_2d=True)
            return audio.mean(axis=1), sr
        audio, sr = self._synthesize(text, context)
        sf.write(path, audio, sr, subtype="PCM_16")
        return audio, sr


def _to_mono_float(data: bytes) -> tuple[np.ndarray, int]:
    audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return audio.mean(axis=1), sr


class VoiceStudioTTS(CachedTTS):
    """Client for VoiceStudio's POST /generate (backend/api/routers/generation.py)."""

    name = "voicestudio"

    def __init__(self, cache_dir, url: str, engine: str | None, voice_wav: str | None,
                 ref_text: str | None = None, profile_id: str | None = None,
                 options: dict | None = None, timeout: float = 600, api_key: str | None = None):
        super().__init__(cache_dir)
        import requests
        self.http = requests.Session()
        key = api_key or os.environ.get("OMNIVOICE_API_KEY")
        if key:
            self.http.headers["Authorization"] = f"Bearer {key}"
        self.url = url.rstrip("/")
        self.engine = engine
        self.voice_wav = voice_wav
        self.voice_bytes = Path(voice_wav).read_bytes() if voice_wav else None
        self.voice_hash = hashlib.sha256(self.voice_bytes).hexdigest()[:16] if self.voice_bytes else None
        self.voice_seconds = None
        if self.voice_bytes:
            info = sf.info(io.BytesIO(self.voice_bytes))
            self.voice_seconds = info.frames / info.samplerate
        # VoiceStudio rejects a transcript for references over 20 s; without one it
        # picks the best window of a long clip and transcribes it itself.
        self.ref_text = ref_text if self.ref_short_enough() else None
        self.profile_id = profile_id
        self.options = dict(options or {})
        self.timeout = timeout

    def identity(self):
        return {"backend": self.name, "engine": self.engine, "voice": self.voice_hash,
                "ref_text": self.ref_text, "profile": self.profile_id, "options": self.options}

    def ref_short_enough(self) -> bool:
        return self.voice_seconds is None or self.voice_seconds <= 20

    # --- discovery -------------------------------------------------------
    def engines(self) -> list[dict]:
        r = self.http.get(f"{self.url}/engines/tts", timeout=30)
        r.raise_for_status()
        data = r.json()
        return data.get("backends", []) if isinstance(data, dict) else data

    def ping(self) -> bool:
        try:
            return self.http.get(f"{self.url}/engines/tts", timeout=5).ok
        except Exception:
            return False

    def transcribe_reference(self) -> str:
        """Transcript of the reference clip (helps cloning) via the OpenAI-style ASR route."""
        r = self.http.post(f"{self.url}/v1/audio/transcriptions",
                           files={"file": ("voice.wav", self.voice_bytes, "audio/wav")},
                           data={"response_format": "json"}, timeout=self.timeout)
        if not r.ok:
            try:
                msg = r.json()["error"]["message"]
            except Exception:
                msg = r.text[:200]
            raise TTSError(msg)
        return (r.json().get("text") or "").strip()

    # --- synthesis -------------------------------------------------------
    def _synthesize(self, text, context):
        data = {"text": text}
        if self.engine:
            data["engine"] = self.engine
        if self.profile_id:
            data["profile_id"] = self.profile_id
        if self.ref_text:
            data["ref_text"] = self.ref_text
        for k, v in {**self.options, **context}.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                v = json.dumps(v)
            elif isinstance(v, bool):
                v = str(v).lower()
            data[k] = str(v)
        files = None
        if self.voice_bytes and not self.profile_id:
            files = {"ref_audio": ("voice.wav", self.voice_bytes, "audio/wav")}
        last = None
        for attempt in range(4):
            try:
                r = self.http.post(f"{self.url}/generate", data=data, files=files, timeout=self.timeout)
            except Exception as e:  # connection reset while a model loads, etc.
                last = e
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code in (429, 503) or r.headers.get("X-OmniVoice-Retryable") == "true":
                last = TTSError(f"{r.status_code}: {r.text[:300]}")
                time.sleep(float(r.headers.get("Retry-After", 10)))
                continue
            if r.status_code == 403 and "model_licence_required" in r.text:
                models = [m.get("repo_id") for m in r.json()["detail"].get("models", [])]
                raise TTSError(f"VoiceStudio needs the licence accepted for {', '.join(models)}: "
                               "open VoiceStudio > Model Catalogue, review and accept it, then rerun.")
            if not r.ok:
                raise TTSError(f"/generate failed {r.status_code}: {r.text[:500]}")
            if r.headers.get("X-OmniVoice-Dropped-Chunks"):
                raise TTSError(f"engine dropped text: {r.headers.get('X-OmniVoice-Dropped-Text')!r}")
            return _to_mono_float(r.content)
        raise TTSError(f"/generate kept failing: {last}")


class SapiTTS(CachedTTS):
    """Windows SAPI 5 (David/Zira). For pipeline tests only."""

    name = "sapi"

    def __init__(self, cache_dir, voice: str | None = None, rate: int = 0):
        super().__init__(cache_dir)
        import comtypes.client as cc
        self._cc = cc
        self.sp = cc.CreateObject("SAPI.SpVoice")
        from comtypes.gen import SpeechLib
        self._lib = SpeechLib
        self.voice = voice
        if voice:
            voices = self.sp.GetVoices()
            for i in range(voices.Count):
                if voice.lower() in voices.Item(i).GetDescription().lower():
                    self.sp.Voice = voices.Item(i)
        self.sp.Rate = rate
        self.rate = rate

    def identity(self):
        return {"backend": self.name, "voice": self.voice, "rate": self.rate}

    def _synthesize(self, text, context):
        stream = self._cc.CreateObject("SAPI.SpMemoryStream")
        stream.Format.Type = self._lib.SAFT24kHz16BitMono
        self.sp.AudioOutputStream = stream
        self.sp.Speak(text, self._lib.SVSFPurgeBeforeSpeak | self._lib.SVSFIsNotXML)
        pcm = np.frombuffer(bytes(stream.GetData()), dtype="<i2")
        return pcm.astype(np.float32) / 32768.0, 24000


def make_tts(cfg: dict, cache_dir: str | Path, engine_override: str | None = None) -> CachedTTS:
    backend = cfg.get("backend", "voicestudio")
    if backend == "sapi":
        s = cfg.get("sapi", {})
        return SapiTTS(cache_dir, voice=s.get("voice"), rate=s.get("rate", 0))
    vs = cfg.get("voicestudio", {})
    engine = engine_override or vs.get("engine")
    options = dict(vs.get("options", {}))
    options.update(vs.get("engine_options", {}).get(engine or "", {}))
    url = vs.get("url", "http://127.0.0.1:3900")
    profile_id = vs.get("profile_id") or None
    if not profile_id and vs.get("profile_name"):
        profile_id = find_profile(url, vs["profile_name"])
    return VoiceStudioTTS(
        cache_dir, url=url, engine=engine,
        voice_wav=None if profile_id else vs.get("voice_wav"),
        ref_text=vs.get("ref_text") or None,
        profile_id=profile_id, options=options,
        timeout=vs.get("timeout_s", 600),
    )


def find_profile(url: str, name: str) -> str:
    """Id of the VoiceStudio voice profile called ``name``."""
    import requests
    r = requests.get(f"{url.rstrip('/')}/profiles", timeout=15)
    r.raise_for_status()
    data = r.json()
    profiles = data if isinstance(data, list) else data.get("profiles", [])
    for p in profiles:
        if p.get("name", "").strip().lower() == name.strip().lower():
            return p["id"]
    names = ", ".join(p.get("name", "?") for p in profiles)
    raise TTSError(f"No VoiceStudio voice profile named {name!r} (have: {names})")
