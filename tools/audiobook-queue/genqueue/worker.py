"""The worker: takes the next book in the queue and voices it with the same
code as ``render_chapter.py``, one sentence at a time through VoiceStudio.

Between sentences it checks whether to keep going: the queue paused, this job
cancelled, outside the allowed hours, the PC in use, VoiceStudio gone. So a
pause takes effect within one sentence, and nothing is ever cut mid-file.

Progress is counted from the sentences the renderer actually asks for.
Sentences already in the cache (a resumed or retried book) are counted as
done but not as measured speed, so the time-left estimate isn't flattered.
"""
from __future__ import annotations

import threading
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import system
from .progress import RATE_KEY
from .store import Job, JobStore

POC = Path(__file__).resolve().parent.parent


class JobCancelled(Exception):
    pass


class JobRequeued(Exception):
    """Stop this job for now and leave it waiting (VoiceStudio went away)."""


@dataclass
class Settings:
    max_concurrent: int = 1
    priority: str = "below_normal"   # VoiceStudio's process priority while voicing
    windows: list[str] | None = None  # allowed hours, e.g. ["22:00-08:00"]; empty = any time
    pause_when_in_use: bool = False
    idle_minutes: float = 5.0         # "in use" = input within this many minutes

    @classmethod
    def load(cls, store: JobStore) -> "Settings":
        raw = store.get_value("settings", {}) or {}
        s = cls(**{k: v for k, v in raw.items() if k in cls.__dataclass_fields__})
        s.windows = list(s.windows or [])
        # Only one book at a time: VoiceStudio runs one model on one GPU (8 GB),
        # and its /generate calls queue behind each other. Measured, not assumed:
        # see README. Stored values above 1 are kept but not used.
        return s

    def save(self, store: JobStore) -> None:
        store.set_value("settings", self.__dict__)


class Backend:
    """What the worker needs from the voicing pipeline. The real one wraps
    render_chapter.py and tts.py; tests pass a fake."""

    def ping(self) -> bool: ...
    def open(self, job: Job): ...           # -> (book, chapters list, tts)
    def plan(self, book, chapter) -> list[int]: ...  # tts_text length per sentence
    def render(self, book, chapter, tts, out_dir: Path, log: Callable[[str], None]): ...
    def write_epub(self, book, narrations: list, path: Path) -> None: ...
    def voicestudio_pids(self) -> list[int]: return []


class Worker:
    def __init__(self, store: JobStore, backend: Backend, data_dir: Path, poll: float = 2.0):
        self.store = store
        self.backend = backend
        self.data_dir = Path(data_dir)
        self.poll = poll
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._cancel: set[str] = set()
        self._lock = threading.Lock()
        self.current: str | None = None
        self.gate_reason = ""
        self.thread: threading.Thread | None = None
        # When VoiceStudio last proved it's up (a ping or a voiced sentence).
        # A ping costs it ~2 s, so while sentences keep coming we don't ask.
        self.alive_at = 0.0
        self.chapter_note = ""  # the running chapter's title, shown again after a pause

    # --- control (called from the HTTP side) ---------------------------------
    @property
    def paused(self) -> bool:
        return bool(self.store.get_value("paused", False))

    def pause(self) -> None:
        self.store.set_value("paused", True)
        self._wake.set()

    def resume(self) -> None:
        self.store.set_value("paused", False)
        self._wake.set()

    def cancel(self, job_id: str) -> None:
        with self._lock:
            self._cancel.add(job_id)
        self._wake.set()

    def nudge(self) -> None:
        self._wake.set()

    def start(self) -> None:
        self.recover()
        self.thread = threading.Thread(target=self.run, name="genqueue-worker", daemon=True)
        self.thread.start()

    def stop(self, timeout: float = 10) -> None:
        self._stop.set()
        self._wake.set()
        if self.thread:
            self.thread.join(timeout)

    # --- recovery ------------------------------------------------------------
    def recover(self) -> list[str]:
        """After a crash or reboot: a book that was being voiced goes back to
        the front of the queue and resumes from its cached sentences; an
        upload cut off halfway is failed (its bytes are incomplete)."""
        notes = []
        for job in self.store.all():
            if job.state in {"importing", "processing", "paused"}:
                self.store.update(job.id, state="waiting",
                                  stage_note="Interrupted; resumes where it stopped")
                notes.append(f"{job.title}: resumes")
            elif job.state in {"pending", "uploading"}:
                self.store.update(job.id, state="failed" if job.state == "uploading" else "cancelled",
                                  error="Upload was interrupted; send the book again")
                notes.append(f"{job.title}: upload incomplete")
            elif job.state == "uploaded":
                self.store.update(job.id, state="waiting")
        return notes

    # --- gate ----------------------------------------------------------------
    def gate(self) -> str:
        """Why the worker must wait right now ('' = go)."""
        if self.paused:
            return "Queue paused"
        s = Settings.load(self.store)
        if not system.in_windows(s.windows or []):
            return f"Outside processing hours ({', '.join(s.windows or [])})"
        if s.pause_when_in_use:
            idle = system.idle_seconds()
            if idle is not None and idle < s.idle_minutes * 60:
                return "Paused while the PC is in use"
        if time.time() - self.alive_at > 60:
            if not self.backend.ping():
                return "Waiting for VoiceStudio (not answering)"
            self.alive_at = time.time()
        return ""

    def _wait_gate(self, job: Job | None) -> None:
        """Block until the gate opens; the job shows as paused meanwhile."""
        reason = self.gate()
        if not reason:
            return
        if job:
            self.store.update(job.id, state="paused", stage_note=reason)
        while reason and not self._stop.is_set():
            self.gate_reason = reason
            self._check_cancel(job)
            self._wake.wait(self.poll)
            self._wake.clear()
            reason = self.gate()
        self.gate_reason = ""
        if self._stop.is_set():
            raise JobRequeued("service stopping")
        if job:
            self.store.update(job.id, state="processing", stage_note=self.chapter_note)

    def _check_cancel(self, job: Job | None) -> None:
        if job is None:
            return
        with self._lock:
            if job.id in self._cancel:
                self._cancel.discard(job.id)
                raise JobCancelled()

    # --- main loop -----------------------------------------------------------
    def run(self) -> None:
        while not self._stop.is_set():
            try:
                self.step()
            except Exception:  # never let the thread die; the job got the error
                traceback.print_exc()
            self._wake.wait(self.poll)
            self._wake.clear()

    def step(self) -> bool:
        """Voice the next waiting book, if the gate allows. True if one ran."""
        reason = self.gate()
        self.gate_reason = reason
        if reason:
            return False
        job = self.store.next_waiting()
        if job is None:
            return False
        self.run_job(job)
        return True

    def run_job(self, job: Job) -> None:
        self.current = job.id
        started = time.time()
        base_elapsed = job.elapsed_seconds
        try:
            self._set_priority()
            job = self.store.update(job.id, state="importing", stage_note="Reading the book",
                                    attempts=job.attempts + 1, started_at=job.started_at or started)
            book, chapters, tts = self.backend.open(job)
            chapters = [c for c in chapters if c.key >= job.first_chapter]
            sizes = {c.key: self.backend.plan(book, c) for c in chapters}
            job = self.store.update(
                job.id, state="processing", stage_note="", chapters_total=len(chapters),
                chapters_done=0, sentences_total=sum(len(v) for v in sizes.values()),
                sentences_done=0, chars_total=sum(sum(v) for v in sizes.values()), chars_done=0,
                audio_seconds=0.0)
            out_dir = Path(job.out_dir) if job.out_dir else self._default_out(job)
            out_dir.mkdir(parents=True, exist_ok=True)
            epub_out = out_dir / f"{out_dir.name}.narrated.epub"
            self.store.update(job.id, out_dir=str(out_dir))
            narrations, failed = [], []
            meter = Meter(self, job.id, tts, started, base_elapsed)
            for n, chapter in enumerate(chapters, 1):
                # The title only: the phone shows "chapter n of N" from the counts.
                self.chapter_note = chapter.title
                self.store.update(job.id, stage_note=chapter.title)
                try:
                    narration, timings = self.backend.render(book, chapter, meter, out_dir, log=lambda _m: None)
                except (JobCancelled, JobRequeued):
                    raise
                except Exception as e:  # one chapter failed: record it, keep going
                    self.alive_at = 0.0
                    if not self.backend.ping():
                        raise JobRequeued("VoiceStudio stopped answering") from e
                    failed.append(chapter.key)
                    self.store.update(job.id, error=f"Chapter {chapter.key}: {e}"[:500],
                                      failed_chapters=list(failed))
                    meter.next_chapter()
                    continue
                narrations.append(narration)
                tmp = epub_out.with_suffix(".tmp")
                self.backend.write_epub(book, narrations, tmp)
                tmp.replace(epub_out)
                cur = self.store.get(job.id)
                self.store.update(job.id, chapters_done=cur.chapters_done + 1,
                                  audio_seconds=cur.audio_seconds + narration.duration,
                                  output_epub=str(epub_out))
                meter.next_chapter()
            final = dict(elapsed_seconds=base_elapsed + time.time() - started, finished_at=time.time())
            if failed:
                self.store.update(job.id, state="failed", stage_note="",
                                  error=f"{len(failed)} chapter(s) failed: {failed}. "
                                        "Retry voices only what's missing.", **final)
            else:
                self.store.update(job.id, state="completed", stage_note="", error="", **final)
        except JobCancelled:
            self.store.update(job.id, state="cancelled", stage_note="",
                              elapsed_seconds=base_elapsed + time.time() - started)
        except JobRequeued as e:
            self.store.update(job.id, state="waiting", stage_note=f"Will resume: {e}",
                              elapsed_seconds=base_elapsed + time.time() - started)
        except Exception as e:
            cur = self.store.get(job.id)
            if cur and cur.state not in {"failed", "completed", "cancelled"}:
                self.store.update(job.id, state="failed", stage_note="", error=str(e)[:500],
                                  elapsed_seconds=base_elapsed + time.time() - started)
        finally:
            self.current = None
            # A cancel that arrived before the job's first check would
            # otherwise cancel a later retry of it.
            self._cancel.discard(job.id)

    def _default_out(self, job: Job) -> Path:
        from epub_extract import safe_name  # noqa: PLC0415 (poc module on sys.path)
        base = POC / "out" / safe_name(Path(job.filename or job.title).stem)
        # Another book, or the same book in another voice, already writes
        # there: keep them apart. (A bare checksum is the older marker.)
        key = f"{job.checksum}:{job.profile}" if job.profile else job.checksum
        marker = base / ".genqueue-checksum"
        if base.exists() and marker.exists() and marker.read_text().strip() not in {key, job.checksum}:
            suffix = f"-{job.checksum[:8]}"
            if job.profile:
                suffix += f"-{safe_name(job.profile)[:16]}"
            base = base.with_name(f"{base.name}{suffix}")
        base.mkdir(parents=True, exist_ok=True)
        (base / ".genqueue-checksum").write_text(key)
        return base

    def _set_priority(self) -> None:
        s = Settings.load(self.store)
        system.set_priority(self.backend.voicestudio_pids(), s.priority)


class Meter:
    """Stands in for the TTS client during a render: counts every sentence,
    measures fresh ones, and gives the worker its between-sentence checkpoint."""

    def __init__(self, worker: Worker, job_id: str, inner, started: float, base_elapsed: float):
        self.w, self.job_id, self.inner = worker, job_id, inner
        self.started, self.base_elapsed = started, base_elapsed
        self.chapter_chars = self.chapter_sentences = 0
        self._pending_chars = self._pending_sentences = 0
        self._fresh_chars, self._fresh_seconds = 0, 0.0
        self._last_flush = 0.0

    def __getattr__(self, name):  # engine, identity, cache_key ... from the real client
        return getattr(self.inner, name)

    def synthesize(self, text: str, context: dict | None = None):
        job = self.w.store.get(self.job_id)
        self.w._check_cancel(job)
        self.w._wait_gate(job)
        hit = self._cached(text, context or {})
        t0 = time.time()
        result = self.inner.synthesize(text, context)
        self.w.alive_at = time.time()
        if not hit:
            self._fresh_chars += len(text)
            self._fresh_seconds += time.time() - t0
        self.chapter_chars += len(text)
        self.chapter_sentences += 1
        self._pending_chars += len(text)
        self._pending_sentences += 1
        if time.time() - self._last_flush > 2:
            self.flush()
        return result

    def _cached(self, text: str, context: dict) -> bool:
        cache_dir = getattr(self.inner, "cache_dir", None)
        key = getattr(self.inner, "cache_key", None)
        if cache_dir is None or key is None:
            return False
        return (Path(cache_dir) / f"{key(text, context)}.wav").exists()

    def flush(self) -> None:
        job = self.w.store.get(self.job_id)
        self.w.store.update(
            self.job_id,
            chars_done=job.chars_done + self._pending_chars,
            sentences_done=job.sentences_done + self._pending_sentences,
            fresh_chars=job.fresh_chars + self._fresh_chars,
            fresh_seconds=job.fresh_seconds + self._fresh_seconds,
            elapsed_seconds=self.base_elapsed + time.time() - self.started)
        if self._fresh_seconds > 0:
            rate = self.w.store.get_value(RATE_KEY)
            fresh = self._fresh_chars / self._fresh_seconds
            # Smooth the PC-wide figure so one odd chapter doesn't swing it.
            self.w.store.set_value(RATE_KEY, fresh if rate is None else 0.8 * rate + 0.2 * fresh)
        self._pending_chars = self._pending_sentences = 0
        self._fresh_chars, self._fresh_seconds = 0, 0.0
        self._last_flush = time.time()

    def next_chapter(self) -> None:
        self.flush()
        self.chapter_chars = self.chapter_sentences = 0
