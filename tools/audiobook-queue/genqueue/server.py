"""The queue's HTTP API for the phone (home Wi-Fi or Tailscale).

Every call but /api/health needs the pairing token, as
``Authorization: Bearer <token>`` (or ``?token=`` on GET, for images and
downloads). The PC is the authority: the phone only asks and displays.
"""
from __future__ import annotations

import json
import mimetypes
import secrets
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import intake
from .progress import RATE_KEY, job_progress, queue_summary
from .store import FINISHED, PENDING_LIKE, Job, JobStore, StateError
from .worker import Settings, Worker

VERSION = "1"
MAX_UPLOAD = 300 * 1024 * 1024
PRIVATE = {"epub_path", "cover_path", "out_dir", "output_epub", "fresh_chars", "fresh_seconds"}


def get_token(store: JobStore) -> str:
    token = store.get_value("token")
    if not token:
        token = secrets.token_urlsafe(18)
        store.set_value("token", token)
    return token


def job_view(job: Job, rate: float | None, position: int | None) -> dict:
    d = {k: v for k, v in job.to_dict().items() if k not in PRIVATE}
    d["has_cover"] = bool(job.cover_path)
    d["has_output"] = bool(job.output_epub) and Path(job.output_epub).exists()
    d["queue_position"] = position
    d["progress"] = job_progress(job, rate)
    return d


class Api:
    """Everything the handler does, apart from HTTP, so tests can call it."""

    def __init__(self, store: JobStore, worker: Worker, data_dir: Path, backend=None):
        self.store, self.worker, self.data_dir, self.backend = store, worker, Path(data_dir), backend
        self.upload_lock = threading.Lock()

    def status(self) -> dict:
        jobs = self.store.all(include_hidden=False)
        rate = self.store.get_value(RATE_KEY)
        waiting = [j for j in jobs if j.state in PENDING_LIKE]
        pos = {j.id: i + 1 for i, j in enumerate(waiting)}
        return {
            "version": VERSION,
            "time": time.time(),
            "paused": self.worker.paused,
            "gate": self.worker.gate_reason,
            "current": self.worker.current,
            "summary": queue_summary(jobs, rate),
            "jobs": [job_view(j, rate, pos.get(j.id)) for j in jobs],
            "settings": Settings.load(self.store).__dict__,
        }

    def job(self, job_id: str) -> Job:
        job = self.store.get(job_id)
        if job is None:
            raise KeyError(job_id)
        return job

    def cancel(self, job_id: str) -> Job:
        job = self.job(job_id)
        if job.state in FINISHED:
            return job
        if job.id == self.worker.current:
            self.worker.cancel(job.id)
            return job
        return self.store.update(job.id, state="cancelled", stage_note="")

    def cancel_pending(self) -> int:
        n = 0
        for job in self.store.all(include_hidden=False):
            if job.state in PENDING_LIKE and job.id != self.worker.current:
                self.store.update(job.id, state="cancelled", stage_note="")
                n += 1
        return n

    def clear_finished(self) -> int:
        """Hide finished jobs from the list; their audiobooks stay on disk."""
        n = 0
        for job in self.store.all(include_hidden=False):
            if job.state in FINISHED:
                self.store.update(job.id, hidden=True)
                n += 1
        return n

    def reorder(self, ids: list[str]) -> None:
        """Pending jobs in this order (ids not listed keep their place after)."""
        known = {j.id: j for j in self.store.all()}
        for i, job_id in enumerate(ids):
            if job_id in known and known[job_id].state in PENDING_LIKE:
                self.store.update(job_id, position=float(i + 1))
        rest = [j for j in self.store.all() if j.id not in ids]
        for i, j in enumerate(rest):
            self.store.update(j.id, position=float(len(ids) + i + 1))

    def move(self, job_id: str, to: str) -> None:
        pending = [j for j in self.store.all(include_hidden=False) if j.state in PENDING_LIKE]
        ids = [j.id for j in pending if j.id != job_id]
        if job_id not in {j.id for j in pending}:
            raise StateError("Only queued books can be moved")
        idx = {"top": 0, "bottom": len(ids)}.get(to)
        if idx is None:
            cur = [j.id for j in pending].index(job_id)
            idx = max(0, cur - 1) if to == "up" else min(len(ids), cur + 1)
        ids.insert(idx, job_id)
        self.reorder(ids)

    def upload(self, filename: str, profile: str, priority: int, first_chapter: int,
               read_body, length: int) -> tuple[Job, bool]:
        if length <= 0 or length > MAX_UPLOAD:
            raise ValueError("Book missing or larger than 300 MB")
        job = self.store.create(checksum=f"upload:{secrets.token_hex(6)}", title=Path(filename).stem,
                                filename=filename, profile=profile, priority=priority, state="uploading")
        incoming = self.data_dir / "incoming"
        incoming.mkdir(parents=True, exist_ok=True)
        tmp = incoming / f"{job.id}.epub"
        try:
            remaining = length
            with open(tmp, "wb") as f:
                while remaining:
                    chunk = read_body(min(remaining, 1 << 20))
                    if not chunk:
                        raise ValueError("Upload cut off")
                    f.write(chunk)
                    remaining -= len(chunk)
            self.store.update(job.id, state="uploaded")
            result = intake.submit(self.store, self.data_dir, tmp, filename=filename, profile=profile,
                                   priority=priority, first_chapter=first_chapter, job=self.job(job.id))
        except Exception as e:
            cur = self.store.get(job.id)
            if cur and cur.state not in FINISHED:
                self.store.update(job.id, state="failed", error=str(e)[:300])
            raise
        finally:
            if tmp.exists():
                tmp.unlink()
        self.worker.nudge()
        return result

    def update_settings(self, changes: dict) -> dict:
        s = Settings.load(self.store)
        for k, v in changes.items():
            if k not in Settings.__dataclass_fields__:
                raise KeyError(k)
            if k == "max_concurrent":
                v = max(1, int(v))
            if k == "priority" and v not in {"low", "below_normal", "normal"}:
                raise ValueError("priority: low, below_normal or normal")
            if k == "windows":
                from .system import parse_window
                for w in v or []:
                    parse_window(w)
            setattr(s, k, v)
        s.save(self.store)
        self.worker.nudge()
        return s.__dict__


def make_handler(api: Api, token: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ReadalongQueue/" + VERSION

        def log_message(self, fmt, *args):  # quiet; errors still go to stderr
            pass

        # --- plumbing ------------------------------------------------------
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers",
                             "Authorization, Content-Type, X-Filename, X-Profile, X-Priority, X-First-Chapter")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")

        def _send(self, status: int, body: dict | list | None = None):
            data = json.dumps(body if body is not None else {}).encode()
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _file(self, path: Path, ctype: str | None = None, name: str | None = None):
            data = path.read_bytes()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", ctype or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            if name:
                self.send_header("Content-Disposition", f'attachment; filename="{name}"')
            self.end_headers()
            self.wfile.write(data)

        def _authorized(self, query: dict) -> bool:
            auth = self.headers.get("Authorization", "")
            given = auth[7:] if auth.startswith("Bearer ") else ""
            if not given and self.command == "GET":
                given = (query.get("token") or [""])[0]
            return secrets.compare_digest(given, token)

        def _json(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}") if n else {}

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            self._route("GET")

        def do_POST(self):
            self._route("POST")

        def do_PUT(self):
            self._route("PUT")

        def _route(self, method: str):
            url = urlparse(self.path)
            query = parse_qs(url.query)
            parts = [p for p in url.path.split("/") if p]
            try:
                if parts == ["api", "health"]:
                    return self._send(200, {"ok": True, "app": "readalong-queue", "version": VERSION,
                                            "voicestudio": api.worker.backend.ping()})
                if not self._authorized(query):
                    return self._send(401, {"error": "Pairing code missing or wrong"})
                return self._dispatch(method, parts, query)
            except KeyError as e:
                return self._send(404, {"error": f"Not found: {e}"})
            except (StateError, intake.IntakeError, ValueError) as e:
                return self._send(409 if isinstance(e, StateError) else 400, {"error": str(e)})
            except Exception as e:  # report, don't hang the phone
                return self._send(500, {"error": str(e)})

        def _dispatch(self, method, parts, query):
            if method == "GET" and parts == ["api", "status"]:
                return self._send(200, api.status())
            if method == "GET" and parts == ["api", "profiles"]:
                try:
                    return self._send(200, {"profiles": api.backend.profiles() if api.backend else []})
                except OSError as e:  # requests' ConnectionError/Timeout are OSErrors
                    return self._send(503, {"error": "VoiceStudio isn't running on the PC. Books can "
                                                     "still be queued with the default voice.",
                                            "detail": str(e)[:200]})
            if method == "GET" and parts[:2] == ["api", "profiles"] and len(parts) == 4 and parts[3] == "audio":
                data, ctype = api.backend.profile_audio(parts[2])
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            if method == "GET" and parts == ["api", "lookup"]:
                sha = (query.get("sha256") or [""])[0]
                profile = (query.get("profile") or [""])[0]
                job = api.store.find_by_checksum(sha, profile) if sha else None
                # A job removed from the list comes back when the book is sent
                # again, so the phone can import its audiobook.
                if job and job.hidden:
                    job = api.store.update(job.id, hidden=False)
                return self._send(200, {"job": job_view(job, None, None) if job else None})
            if method == "POST" and parts == ["api", "jobs"]:
                h = self.headers
                job, created = api.upload(
                    filename=unquote(h.get("X-Filename") or "book.epub"),
                    profile=unquote(h.get("X-Profile") or ""),
                    priority=int(h.get("X-Priority") or 0), first_chapter=int(h.get("X-First-Chapter") or 1),
                    read_body=self.rfile.read, length=int(h.get("Content-Length") or 0))
                return self._send(201 if created else 200, {"job": job_view(job, None, None), "created": created})
            if method == "POST" and parts == ["api", "jobs", "reorder"]:
                api.reorder(list(self._json().get("ids", [])))
                return self._send(200, api.status())
            if parts[:2] == ["api", "jobs"] and len(parts) >= 3:
                job = api.job(parts[2])
                action = parts[3] if len(parts) > 3 else ""
                if method == "GET" and action == "":
                    return self._send(200, {"job": job_view(job, api.store.get_value(RATE_KEY), None)})
                if method == "GET" and action == "cover" and job.cover_path:
                    return self._file(Path(job.cover_path))
                if method == "GET" and action == "download":
                    if not job.output_epub or not Path(job.output_epub).exists():
                        raise KeyError("no audiobook yet")
                    return self._file(Path(job.output_epub), "application/epub+zip",
                                      Path(job.output_epub).name)
                if method == "POST":
                    body = self._json()
                    if action == "cancel":
                        job = api.cancel(job.id)
                    elif action == "retry":
                        job = intake.retry(api.store, job.id, force=bool(body.get("force")))
                        api.worker.nudge()
                    elif action == "priority":
                        job = api.store.update(job.id, priority=int(body.get("priority", 0)))
                    elif action == "move":
                        api.move(job.id, str(body.get("to", "top")))
                    elif action == "hide":
                        if job.state not in FINISHED:
                            raise StateError("Only finished books can be removed from the list")
                        job = api.store.update(job.id, hidden=True)
                    else:
                        raise KeyError(action)
                    return self._send(200, api.status())
            if method == "POST" and parts[:2] == ["api", "queue"] and len(parts) == 3:
                {"pause": api.worker.pause, "resume": api.worker.resume,
                 "cancel-pending": api.cancel_pending, "clear-finished": api.clear_finished}[parts[2]]()
                return self._send(200, api.status())
            if parts == ["api", "settings"]:
                if method == "PUT":
                    return self._send(200, {"settings": api.update_settings(self._json())})
                return self._send(200, {"settings": Settings.load(api.store).__dict__})
            raise KeyError("/".join(parts))

    return Handler


def serve(api: Api, host: str, port: int) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((host, port), make_handler(api, get_token(api.store)))
    httpd.daemon_threads = True
    return httpd
