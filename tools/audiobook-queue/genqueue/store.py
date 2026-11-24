"""The queue's memory: one SQLite file that survives VoiceStudio closing, the
service restarting and the PC rebooting.

A job is one book to voice. Its state moves only along the transitions in
``TRANSITIONS``; anything else raises, so a bug can't put a job somewhere it
can't come back from.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Upload stages (uploading, uploaded) are the phone's; the rest are the PC's.
STATES = (
    "pending",      # created, nothing received yet
    "uploading",    # the book's bytes are arriving
    "uploaded",     # file stored, not checked yet
    "waiting",      # in the queue
    "importing",    # reading the book: chapters, sentences, characters
    "processing",   # VoiceStudio is voicing it
    "paused",       # was processing; the queue or the user paused it
    "completed",
    "failed",
    "cancelled",
)
ACTIVE = {"importing", "processing"}
FINISHED = {"completed", "failed", "cancelled"}
PENDING_LIKE = {"pending", "uploading", "uploaded", "waiting", "paused"}

TRANSITIONS: dict[str, set[str]] = {
    "pending": {"uploading", "uploaded", "waiting", "cancelled", "failed"},
    "uploading": {"uploaded", "failed", "cancelled"},
    "uploaded": {"waiting", "failed", "cancelled"},
    "waiting": {"importing", "paused", "cancelled"},
    "importing": {"processing", "waiting", "paused", "failed", "cancelled"},
    "processing": {"completed", "failed", "paused", "waiting", "cancelled"},
    "paused": {"waiting", "processing", "cancelled", "failed"},
    "completed": {"waiting"},           # re-voice on purpose (retry with force)
    "failed": {"waiting", "cancelled"},  # retry
    "cancelled": {"waiting"},           # retry
}


class StateError(ValueError):
    pass


@dataclass
class Job:
    id: str
    checksum: str
    title: str
    author: str = ""
    filename: str = ""
    epub_path: str = ""
    cover_path: str = ""
    out_dir: str = ""
    output_epub: str = ""
    profile: str = ""
    priority: int = 0            # higher first
    position: float = 0.0        # order within a priority (lower first)
    state: str = "pending"
    stage_note: str = ""         # e.g. "Chapter 12 of 54", "Waiting for VoiceStudio"
    error: str = ""
    failed_chapters: list[int] = field(default_factory=list)
    first_chapter: int = 1
    chapters_total: int = 0
    chapters_done: int = 0
    sentences_total: int = 0
    sentences_done: int = 0
    chars_total: int = 0
    # Rough size from the book's text at intake, before it's read in properly:
    # only for the time-left estimate, never for the done percentage.
    chars_estimate: int = 0
    chars_done: int = 0
    audio_seconds: float = 0.0
    # Work measured on this job: characters voiced fresh (not from the cache)
    # and the seconds spent on them. The ETA comes from these, never a timer.
    fresh_chars: int = 0
    fresh_seconds: float = 0.0
    elapsed_seconds: float = 0.0
    attempts: int = 0
    hidden: bool = False         # removed from the list; files kept
    created_at: float = 0.0
    updated_at: float = 0.0
    started_at: float = 0.0
    finished_at: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


_COLUMNS = [f for f in Job.__dataclass_fields__]


class JobStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=FULL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

    # --- jobs ------------------------------------------------------------
    def _row_to_job(self, data: str) -> Job:
        raw = json.loads(data)
        return Job(**{k: v for k, v in raw.items() if k in _COLUMNS})

    def _write(self, job: Job) -> None:
        self._db.execute("INSERT OR REPLACE INTO jobs (id, data) VALUES (?, ?)",
                         (job.id, json.dumps(job.to_dict())))

    def create(self, **fields) -> Job:
        with self._lock:
            now = time.time()
            last = max((j.position for j in self.all()), default=0.0)
            job = Job(id=fields.pop("id", None) or uuid.uuid4().hex[:12], checksum=fields.pop("checksum"),
                      title=fields.pop("title", "") or "Untitled", position=last + 1,
                      created_at=now, updated_at=now, **fields)
            self._write(job)
            return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            row = self._db.execute("SELECT data FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return self._row_to_job(row[0]) if row else None

    def all(self, include_hidden: bool = True) -> list[Job]:
        with self._lock:
            jobs = [self._row_to_job(r[0]) for r in self._db.execute("SELECT data FROM jobs")]
        if not include_hidden:
            jobs = [j for j in jobs if not j.hidden]
        return sorted(jobs, key=queue_order)

    def update(self, job_id: str, **changes) -> Job:
        with self._lock:
            job = self.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if "state" in changes and changes["state"] != job.state:
                to = changes["state"]
                if to not in TRANSITIONS.get(job.state, set()):
                    raise StateError(f"{job.title}: can't go from {job.state} to {to}")
            for k, v in changes.items():
                if k not in _COLUMNS:
                    raise KeyError(k)
                setattr(job, k, v)
            job.updated_at = time.time()
            self._write(job)
            return job

    def find_by_checksum(self, checksum: str, profile: str) -> Job | None:
        for job in self.all():
            if job.checksum == checksum and job.profile == profile:
                return job
        return None

    def next_waiting(self) -> Job | None:
        for job in self.all(include_hidden=False):
            if job.state == "waiting":
                return job
        return None

    # --- settings ----------------------------------------------------------
    def get_value(self, key: str, default=None):
        with self._lock:
            row = self._db.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set_value(self, key: str, value) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
                             (key, json.dumps(value)))

    def close(self) -> None:
        with self._lock:
            self._db.close()


def queue_order(job: Job) -> tuple:
    """Running first, then the queue by priority (high first) and position."""
    rank = 0 if job.state in ACTIVE else 1 if job.state not in FINISHED else 2
    return (rank, -job.priority, job.position, job.created_at)
