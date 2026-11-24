"""A drop folder for the queue: put an EPUB in it and it gets voiced.

    <INBOX>/                book.epub dropped here is queued (default voice)
    <INBOX>/Added/          the original, once queued (or a duplicate of one)
    <INBOX>/Problems/       a file that couldn't be queued, with a .txt saying why
    <INBOX>/Finished/       every finished audiobook EPUB, "<title> (narrated).epub"

The folder is `[queue] inbox` in config.toml (default: "Audiobook Inbox"
next to this tool). Runs inside `genqueue serve`, so it works whenever the service does, without
Claude. A file is taken only once its size has stopped changing, so a copy
still in progress isn't read half-written.
"""
from __future__ import annotations

import re
import shutil
import threading
import time
import traceback
from pathlib import Path

from . import intake
from .store import JobStore

TOOL = Path(__file__).resolve().parent.parent


def inbox_dir(config_path: Path = TOOL / "config.toml") -> Path:
    """[queue] inbox in config.toml, or "Audiobook Inbox" next to this tool."""
    import tomllib
    for path in (config_path, config_path.with_name("config.example.toml")):
        if path.exists():
            folder = tomllib.loads(path.read_text(encoding="utf-8")).get("queue", {}).get("inbox", "")
            if folder:
                return Path(folder).expanduser()
            break
    return TOOL / "Audiobook Inbox"


def finished_name(title: str) -> str:
    return f"{re.sub(r'[\\/:*?\"<>|]+', ' ', title).strip() or 'Audiobook'} (narrated).epub"


def _unique(path: Path) -> Path:
    n, out = 2, path
    while out.exists():
        out = path.with_name(f"{path.stem} ({n}){path.suffix}")
        n += 1
    return out


class Inbox:
    def __init__(self, store: JobStore, data_dir: Path, root: Path | None = None, *,
                 settle: float = 10.0, every: float = 15.0, nudge=lambda: None, log=print):
        self.store, self.data_dir = store, data_dir
        self.root = Path(root) if root else inbox_dir()
        self.settle, self.every, self.nudge, self.log = settle, every, nudge, log
        self._seen: dict[Path, tuple[int, float, float]] = {}   # size, mtime, first seen
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        for sub in ("", "Added", "Problems", "Finished"):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    # --- intake ---------------------------------------------------------------
    def scan(self, now: float | None = None) -> list[str]:
        """Queue every settled EPUB in the folder. Returns what was done."""
        now = time.time() if now is None else now
        notes = []
        present = set()
        for f in sorted(self.root.glob("*.epub")):
            present.add(f)
            try:
                st = f.stat()
            except OSError:
                continue
            prev = self._seen.get(f)
            if prev is None or prev[:2] != (st.st_size, st.st_mtime):
                self._seen[f] = (st.st_size, st.st_mtime, now)
                continue
            if now - prev[2] < self.settle:
                continue
            notes.append(self._take(f))
            self._seen.pop(f, None)
        for f in set(self._seen) - present:
            self._seen.pop(f, None)
        return notes

    def _take(self, f: Path) -> str:
        try:
            job, created = intake.submit(self.store, self.data_dir, f, filename=f.name)
        except Exception as e:  # not an EPUB, locked, unreadable...
            dest = _unique(self.root / "Problems" / f.name)
            try:
                shutil.move(str(f), dest)
                dest.with_suffix(".txt").write_text(f"Couldn't queue {f.name}:\n{e}\n", encoding="utf-8")
            except OSError:
                pass  # still locked: try again next scan
            return f"problem: {f.name}: {e}"
        shutil.move(str(f), _unique(self.root / "Added" / f.name))
        if created:
            self.nudge()
        return f"{'queued' if created else 'already queued'}: {job.title}"

    # --- output ---------------------------------------------------------------
    def deliver(self) -> list[str]:
        """Copy each finished audiobook into Finished/ (again when re-voiced)."""
        notes = []
        for job in self.store.all():
            if job.state != "completed" or not job.output_epub:
                continue
            src = Path(job.output_epub)
            if not src.is_absolute():
                src = self.data_dir.parent / src
            if not src.exists():
                continue
            dest = self.root / "Finished" / finished_name(job.title)
            s = src.stat()
            if dest.exists() and dest.stat().st_size == s.st_size and dest.stat().st_mtime >= s.st_mtime:
                continue
            tmp = dest.with_name(dest.name + ".part")
            shutil.copyfile(src, tmp)
            tmp.replace(dest)
            notes.append(f"finished: {dest.name}")
        return notes

    # --- thread ---------------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="inbox", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                for note in self.scan() + self.deliver():
                    self.log(f"inbox: {note}")
            except Exception:
                self.log("inbox error:\n" + traceback.format_exc())
            self._stop.wait(self.every)
