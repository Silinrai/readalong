"""The audiobook queue, with a fake VoiceStudio: states, duplicates, real
progress, pause/cancel between sentences, failures, recovery, the API."""
from __future__ import annotations

import json
import sys
import threading
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from genqueue import intake  # noqa: E402
from genqueue.progress import RATE_KEY, job_progress, queue_summary  # noqa: E402
from genqueue.server import Api, get_token, serve  # noqa: E402
from genqueue.store import JobStore, StateError  # noqa: E402
from genqueue.worker import Settings, Worker  # noqa: E402


def make_epub(path: Path, title: str, extra: str = "") -> Path:
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml", """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""")
        z.writestr("OEBPS/content.opf", f"""<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>{title}</dc:title><dc:creator>Someone</dc:creator><meta name="cover" content="c"/></metadata>
<manifest><item id="c" href="cover.jpg" media-type="image/jpeg"/></manifest><spine/></package>""")
        z.writestr("OEBPS/cover.jpg", b"\xff\xd8fakejpeg" + extra.encode())
    return path


@dataclass
class Chapter:
    key: int
    title: str


@dataclass
class Narr:
    duration: float


class FakeTTS:
    """Each sentence takes `delay` s unless cached; cache = set of texts."""

    def __init__(self, cache: set, delay=0.0, fail_on: str | None = None):
        self.cache, self.delay, self.fail_on = cache, delay, fail_on
        self.cache_dir = None  # the Meter falls back to its own check below
        self.calls = []

    def is_cached(self, text):
        return text in self.cache

    def synthesize(self, text, context=None):
        self.calls.append(text)
        if self.fail_on and self.fail_on in text:
            raise RuntimeError("engine error")
        if text not in self.cache:
            time.sleep(self.delay)
            self.cache.add(text)
        return [0.0], 24000


class FakeBackend:
    def __init__(self, chapters: dict[int, list[str]], delay=0.0, fail_on=None):
        self.chapters = chapters
        self.cache: set = set()
        self.delay, self.fail_on = delay, fail_on
        self.up = True
        self.epubs_written = 0
        self.tts = None

    def ping(self):
        return self.up

    def open(self, job):
        self.tts = FakeTTS(self.cache, self.delay, self.fail_on)
        return object(), [Chapter(k, f"Chapter {k}") for k in sorted(self.chapters)], self.tts

    def plan(self, book, chapter):
        return [len(s) for s in self.chapters[chapter.key]]

    def render(self, book, chapter, tts, out_dir, log):
        for s in self.chapters[chapter.key]:
            if not self.up:
                raise ConnectionError("VoiceStudio gone")
            tts.synthesize(s, {})
        (out_dir / f"ch{chapter.key:02d}.mp3").write_bytes(b"mp3")
        return Narr(duration=len(self.chapters[chapter.key])), {}

    def write_epub(self, book, narrations, path):
        path.write_bytes(b"epub:" + str(len(narrations)).encode())
        self.epubs_written += 1

    def voicestudio_pids(self):
        return []


# The Meter asks the real client whether a sentence is cached by file; the
# fake keeps a set, so teach the Meter about it.
@pytest.fixture(autouse=True)
def fake_cache_check(monkeypatch):
    from genqueue import worker as w

    def cached(self, text, context):
        inner = self.inner
        return inner.is_cached(text) if hasattr(inner, "is_cached") else False
    monkeypatch.setattr(w.Meter, "_cached", cached)


@pytest.fixture
def env(tmp_path):
    store = JobStore(tmp_path / "q.db")
    yield store, tmp_path
    store.close()


def queued(store, tmp_path, title, backend=None, **kw):
    epub = make_epub(tmp_path / f"{title}.epub", title, extra=title)
    job, created = intake.submit(store, tmp_path, epub, out_dir=tmp_path / "out" / title, **kw)
    return job, created


def book(n_chapters=3, sentences=4, text="word " * 10):
    return {k: [f"{k}.{i} {text}" for i in range(sentences)] for k in range(1, n_chapters + 1)}


# --- store / intake -------------------------------------------------------------

def test_states_only_move_along_allowed_transitions(env):
    store, _ = env
    job = store.create(checksum="x", title="T", state="waiting")
    with pytest.raises(StateError):
        store.update(job.id, state="completed")
    store.update(job.id, state="importing")
    store.update(job.id, state="processing")
    assert store.update(job.id, state="completed").state == "completed"


def test_same_book_and_voice_is_not_queued_twice(env):
    store, tmp = env
    a, created_a = queued(store, tmp, "Book")
    epub2 = make_epub(tmp / "copy.epub", "Book", extra="Book")
    b, created_b = intake.submit(store, tmp, epub2)
    assert created_a and not created_b and a.id == b.id
    assert len(store.all()) == 1
    # A different voice is a different audiobook.
    c, created_c = intake.submit(store, tmp, make_epub(tmp / "c.epub", "Book", extra="Book"), profile="Other")
    assert created_c and c.id != a.id


def test_intake_reads_title_author_cover_and_rejects_non_epubs(env):
    store, tmp = env
    job, _ = queued(store, tmp, "Dune")
    assert job.title == "Dune" and job.author == "Someone" and Path(job.cover_path).exists()
    assert job.state == "waiting"
    bad = tmp / "bad.epub"
    bad.write_bytes(b"not a zip")
    with pytest.raises(intake.IntakeError):
        intake.submit(store, tmp, bad)


def test_resubmitting_a_failed_book_retries_it(env):
    store, tmp = env
    job, _ = queued(store, tmp, "B")
    store.update(job.id, state="cancelled")
    again, created = intake.submit(store, tmp, make_epub(tmp / "again.epub", "B", extra="B"))
    assert not created and again.id == job.id and again.state == "waiting"


# --- progress --------------------------------------------------------------------

def test_overall_progress_is_weighted_by_book_size_not_averaged(env):
    store, _ = env
    big = store.create(checksum="1", title="Big", state="waiting", chars_total=900_000, chars_done=0)
    small = store.create(checksum="2", title="Small", state="waiting", chars_total=100_000)
    store.update(small.id, state="importing")
    store.update(small.id, state="processing")
    store.update(small.id, state="completed", chars_done=100_000)
    summ = queue_summary(store.all(), rate=None)
    # Averaging percentages would say 50%; the work done is 10%.
    assert summ["actual"]["percent"] == 10.0
    assert summ["estimated"]["seconds_left"] is None  # no measured speed yet
    assert summ["counts"]["completed"] == 1 and summ["counts"]["waiting"] == 1
    assert big.id


def test_time_left_comes_from_measured_speed_and_is_labelled_estimated(env):
    store, _ = env
    job = store.create(checksum="1", title="B", state="waiting", chars_total=10_000, chars_done=4_000,
                       fresh_chars=4_000, fresh_seconds=100)
    p = job_progress(store.get(job.id), rate=None)
    assert p["actual"]["percent"] == 40.0
    assert p["estimated"]["seconds_left"] == 150  # 6000 chars at 40/s
    assert p["estimated"]["basis"] == "this book"


# --- worker ------------------------------------------------------------------------

def run_until(cond, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def test_worker_voices_books_one_after_another_and_counts_real_work(env):
    store, tmp = env
    backend = FakeBackend(book(2, 3))
    a, _ = queued(store, tmp, "A")
    b, _ = queued(store, tmp, "B")
    w = Worker(store, backend, tmp, poll=0.01)
    assert w.step() and w.step() and not w.step()
    for j in (store.get(a.id), store.get(b.id)):
        assert j.state == "completed"
        assert j.sentences_done == j.sentences_total == 6
        assert j.chars_done == j.chars_total > 0
        assert j.chapters_done == j.chapters_total == 2
        assert Path(j.output_epub).read_bytes() == b"epub:2"
    # B's sentences are the same text as A's, so B came from the cache:
    # counted as done, not as measured speed.
    assert store.get(b.id).fresh_chars == 0
    assert store.get(a.id).fresh_chars == store.get(a.id).chars_total


def test_higher_priority_and_reordering_decide_what_runs_next(env):
    store, tmp = env
    a, _ = queued(store, tmp, "A")
    b, _ = queued(store, tmp, "B")
    c, _ = queued(store, tmp, "C", priority=5)
    assert store.next_waiting().id == c.id
    store.update(c.id, priority=0)
    api = Api(store, Worker(store, FakeBackend(book()), tmp), tmp)
    api.move(b.id, "top")
    assert [j.id for j in store.all()][:3] == [b.id, a.id, c.id]


def test_pause_stops_between_sentences_and_resume_continues(env):
    store, tmp = env
    backend = FakeBackend(book(1, 30), delay=0.02)
    job, _ = queued(store, tmp, "A")
    w = Worker(store, backend, tmp, poll=0.01)
    t = threading.Thread(target=w.step)
    t.start()
    assert run_until(lambda: len(backend.tts.calls) >= 3 if backend.tts else False)
    w.pause()
    assert run_until(lambda: store.get(job.id).state == "paused")
    n = len(backend.tts.calls)
    time.sleep(0.2)
    assert len(backend.tts.calls) == n  # nothing voiced while paused
    w.resume()
    t.join(10)
    assert store.get(job.id).state == "completed"


def test_cancel_stops_the_running_book_and_the_next_one_runs(env):
    store, tmp = env
    backend = FakeBackend(book(1, 50), delay=0.02)
    a, _ = queued(store, tmp, "A")
    b, _ = queued(store, tmp, "B")
    w = Worker(store, backend, tmp, poll=0.01)
    t = threading.Thread(target=w.step)
    t.start()
    assert run_until(lambda: backend.tts is not None and len(backend.tts.calls) >= 2)
    Api(store, w, tmp).cancel(a.id)
    t.join(10)
    assert store.get(a.id).state == "cancelled"
    backend.delay = 0
    assert w.step() and store.get(b.id).state == "completed"


def test_a_failed_chapter_is_recorded_and_the_rest_of_the_book_and_queue_continue(env):
    store, tmp = env
    chapters = book(3, 2)
    backend = FakeBackend(chapters, fail_on="2.1")
    a, _ = queued(store, tmp, "A")
    b, _ = queued(store, tmp, "B")
    w = Worker(store, backend, tmp, poll=0.01)
    w.step()
    ja = store.get(a.id)
    assert ja.state == "failed" and ja.failed_chapters == [2]
    assert ja.chapters_done == 2 and "Retry" in ja.error
    assert Path(ja.output_epub).exists()  # the finished chapters are kept
    backend.fail_on = None
    w.step()
    assert store.get(b.id).state == "completed"
    # Retry voices only what's missing: chapter 1 and 3 come from the cache.
    intake.retry(store, a.id)
    calls_before = len(backend.cache)
    w.step()
    ja = store.get(a.id)
    assert ja.state == "completed" and ja.chapters_done == 3
    assert len(backend.cache) == calls_before  # chapter 2 was cached by B's run already
    assert ja.fresh_chars == 0 or ja.fresh_chars < ja.chars_total


def test_voicestudio_going_away_requeues_instead_of_failing(env):
    store, tmp = env
    backend = FakeBackend(book(1, 5))
    job, _ = queued(store, tmp, "A")
    w = Worker(store, backend, tmp, poll=0.01)

    orig = backend.render

    def render_then_drop(*a, **k):
        backend.up = False
        return orig(*a, **k)
    backend.render = render_then_drop
    w.step()
    j = store.get(job.id)
    assert j.state == "waiting" and "resume" in j.stage_note.lower()
    assert w.gate() == "Waiting for VoiceStudio (not answering)"
    assert not w.step()  # nothing runs while VoiceStudio is down
    backend.up = True
    backend.render = orig
    assert w.step() and store.get(job.id).state == "completed"


def test_restart_recovers_interrupted_and_half_uploaded_jobs(env):
    store, tmp = env
    running, _ = queued(store, tmp, "Running")
    store.update(running.id, state="importing")
    store.update(running.id, state="processing")
    upload = store.create(checksum="upload:1", title="Half", state="uploading")
    done, _ = queued(store, tmp, "Done")
    store.update(done.id, state="importing")
    store.update(done.id, state="processing")
    store.update(done.id, state="completed")
    store.close()
    store2 = JobStore(tmp / "q.db")  # "after the reboot"
    w = Worker(store2, FakeBackend(book()), tmp)
    w.recover()
    assert store2.get(running.id).state == "waiting"
    assert store2.get(upload.id).state == "failed"
    assert store2.get(done.id).state == "completed"
    store2.close()


def test_outside_processing_hours_nothing_starts(env, monkeypatch):
    store, tmp = env
    queued(store, tmp, "A")
    w = Worker(store, FakeBackend(book()), tmp)
    Settings(windows=["01:00-01:01"]).save(store)
    from genqueue import system
    monkeypatch.setattr(system, "in_windows", lambda windows, now=None: False)
    assert not w.step()
    assert w.gate_reason.startswith("Outside processing hours")


def test_removing_finished_jobs_keeps_their_audiobooks(env):
    store, tmp = env
    job, _ = queued(store, tmp, "A")
    w = Worker(store, FakeBackend(book(1, 2)), tmp, poll=0.01)
    w.step()
    out = Path(store.get(job.id).output_epub)
    api = Api(store, w, tmp)
    assert api.clear_finished() == 1
    assert store.all(include_hidden=False) == []
    assert out.exists()
    # Sending the same book again shows the finished job, it doesn't revoice it.
    again, created = intake.submit(store, tmp, make_epub(tmp / "x.epub", "A", extra="A"))
    assert not created and again.state == "completed" and not again.hidden


# --- HTTP API ----------------------------------------------------------------------

def test_http_api_needs_the_pairing_code_and_runs_the_queue(env):
    store, tmp = env
    backend = FakeBackend(book(1, 2))
    w = Worker(store, backend, tmp, poll=0.01)
    api = Api(store, w, tmp)
    httpd = serve(api, "127.0.0.1", 0)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    token = get_token(store)

    def call(path, method="GET", body=None, headers=None, auth=True):
        h = dict(headers or {})
        if auth:
            h["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(base + path, data=body, method=method, headers=h)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    try:
        assert json.loads(call("/api/health", auth=False)[1])["ok"]
        assert call("/api/status", auth=False)[0] == 401
        data = make_epub(tmp / "up.epub", "Uploaded", extra="u").read_bytes()
        status, body = call("/api/jobs", "POST", data, {"X-Filename": "up.epub",
                                                       "Content-Type": "application/epub+zip"})
        assert status == 201
        job_id = json.loads(body)["job"]["id"]
        status, body = call("/api/jobs", "POST", data, {"X-Filename": "up.epub"})
        assert status == 200 and json.loads(body)["job"]["id"] == job_id  # duplicate
        st = json.loads(call("/api/status")[1])
        assert [j["id"] for j in st["jobs"]] == [job_id]
        assert st["jobs"][0]["state"] == "waiting" and st["jobs"][0]["queue_position"] == 1
        assert call(f"/api/jobs/{job_id}/cover")[0] == 200
        assert call("/api/queue/pause", "POST")[0] == 200 and json.loads(call("/api/status")[1])["paused"]
        call("/api/queue/resume", "POST")
        store.update(job_id, out_dir=str(tmp / "out" / "up"))
        w.step()
        st = json.loads(call("/api/status")[1])
        assert st["jobs"][0]["state"] == "completed"
        assert st["jobs"][0]["progress"]["actual"]["percent"] == 100.0
        status, body = call(f"/api/jobs/{job_id}/download")
        assert status == 200 and body == b"epub:1"
        assert call(f"/api/jobs/{job_id}/retry", "POST", b"{}")[0] == 400  # completed: nothing to retry
        assert call("/api/settings", "PUT", json.dumps({"priority": "fast"}).encode())[0] == 400
    finally:
        httpd.shutdown()


def test_voicestudio_is_not_pinged_before_every_sentence(env):
    # A ping costs VoiceStudio ~2 s; a sentence that just voiced proves it's up.
    store, tmp = env
    backend = FakeBackend(book(1, 20))
    pings = []
    orig_ping = backend.ping
    backend.ping = lambda: pings.append(1) or orig_ping()
    queued(store, tmp, "A")
    Worker(store, backend, tmp, poll=0.01).step()
    assert len(pings) <= 3


def test_unread_books_get_a_size_estimate_for_time_left_only(env):
    store, tmp = env
    job = store.create(checksum="1", title="B", state="waiting", chars_estimate=40_000)
    p = job_progress(store.get(job.id), rate=20.0)
    assert p["actual"]["percent"] is None           # nothing measured yet
    assert p["estimated"]["seconds_left"] == 2000   # 40 000 chars at 20/s
    assert p["estimated"]["size_estimated"] is True


def test_passage_profile_is_reused_across_restarts(tmp_path, monkeypatch):
    """profiles() hides passage profiles from the phone; the lookup must not,
    or every service start makes a new copy and misses the whole clip cache."""
    from genqueue import backend as b

    listed = [{"id": "orig1", "name": "Voice"},
              {"id": "pp-old", "name": "Voice (v2 passage, Readalong)", "created_at": 1},
              {"id": "pp-new", "name": "Voice (v2 passage, Readalong)", "created_at": 2}]
    posts = []

    class R:
        def __init__(self, data): self.data = data
        def raise_for_status(self): pass
        def json(self): return self.data

    monkeypatch.setattr(b.requests, "get", lambda *a, **k: R(listed))
    monkeypatch.setattr(b.requests, "post", lambda *a, **k: posts.append(a) or R({"id": "made"}))
    be = b.RenderBackend()
    monkeypatch.setattr(be, "voices_dir", lambda: tmp_path)
    wav = tmp_path / "v.wav"
    wav.write_bytes(b"")
    prof = {"id": "orig1", "name": "Voice", "language": "en"}
    # Stored id still exists: kept.
    assert be._ensure_passage_profile({"wav": str(wav), "ref_text": "x", "passage_profile_id": "pp-new", "version": 2},
                                      prof)["passage_profile_id"] == "pp-new"
    # No stored id: the oldest existing copy, nothing uploaded.
    assert be._ensure_passage_profile({"wav": str(wav), "ref_text": "x", "version": 2}, prof)["passage_profile_id"] == "pp-old"
    assert posts == []


def test_voice_reference_starts_and_ends_on_a_pause():
    """A reference cut mid-word made OmniVoice say the cut word ("much.")
    before every sentence of book 6."""
    import numpy as np
    from genqueue.backend import RenderBackend
    sr = 24000
    rng = np.random.default_rng(1)
    talk = lambda s: rng.uniform(-0.4, 0.4, int(sr * s)).astype(np.float32)
    hush = lambda s: np.zeros(int(sr * s), np.float32)
    # Sentences of 4.4, 4.6, 3.5, 5.9, 4.0 s, with pauses between, as in the real clip.
    audio = np.concatenate([talk(4.4), hush(0.35), talk(4.6), hush(0.45), talk(3.5), hush(0.4),
                            talk(5.9), hush(0.6), talk(4.0), hush(0.3), talk(9.0)])
    wins = RenderBackend.pause_windows(audio, sr)
    assert wins
    for a, b in wins:
        assert RenderBackend.MIN_S <= (b - a) / sr <= RenderBackend.MAX_S
        for edge in (audio[max(a - 1, 0):a + 240], audio[b - 240:b]):   # 10 ms at each cut
            assert np.abs(edge).max() < 1e-6, "cut lands in speech"
    # The old fixed 15 s cut at 15.0 s falls inside the fourth sentence.
    assert np.abs(audio[int(15.0 * sr) - 240:int(15.0 * sr)]).max() > 0.1


def test_old_clipped_reference_is_replaced(tmp_path, monkeypatch):
    from genqueue import backend as b
    listed = [{"id": "old", "name": "Voice (15 s passage, Readalong)", "created_at": 1}]
    posts = []

    class R:
        def __init__(self, data): self.data = data
        def raise_for_status(self): pass
        def json(self): return self.data

    monkeypatch.setattr(b.requests, "get", lambda *a, **k: R(listed))
    monkeypatch.setattr(b.requests, "post", lambda *a, **k: posts.append(a) or R({"id": "new"}))
    be = b.RenderBackend()
    monkeypatch.setattr(be, "voices_dir", lambda: tmp_path)
    wav = tmp_path / "v.wav"
    wav.write_bytes(b"")
    # A rebuilt (version 2) reference: the old mid-word "15 s passage" copy is not reused.
    meta = be._ensure_passage_profile({"wav": str(wav), "ref_text": "x", "version": 2},
                                      {"id": "orig", "name": "Voice", "language": "en"})
    assert meta["passage_profile_id"] == "new" and len(posts) == 1


def test_drop_folder_queues_settled_epubs_and_delivers_finished_ones(env):
    from genqueue.inbox import Inbox
    store, tmp = env
    nudged = []
    box = Inbox(store, tmp, tmp / "Inbox", settle=10, nudge=lambda: nudged.append(1), log=lambda m: None)
    book = make_epub(tmp / "Inbox" / "dropped.epub", "Dropped Book")
    (tmp / "Inbox" / "notes.epub").write_text("not a zip")

    assert box.scan(now=100) == []                # first sight: maybe still copying
    assert box.scan(now=105) == []                # not settled for 10 s yet
    notes = box.scan(now=111)
    assert "queued: Dropped Book" in notes
    job = next(j for j in store.all() if j.title == "Dropped Book")
    assert job.state == "waiting" and job.profile == "" and nudged
    assert not book.exists() and (tmp / "Inbox" / "Added" / "dropped.epub").exists()
    assert (tmp / "Inbox" / "Problems" / "notes.epub").exists()
    assert (tmp / "Inbox" / "Problems" / "notes.txt").exists()

    # Dropping the same book again doesn't queue it twice.
    make_epub(tmp / "Inbox" / "again.epub", "Dropped Book")
    box.scan(now=200)
    assert box.scan(now=220) == ["already queued: Dropped Book"]
    assert sum(j.title == "Dropped Book" for j in store.all()) == 1

    # A file still growing is left alone.
    growing = tmp / "Inbox" / "big.epub"
    growing.write_bytes(b"PK" * 10)
    box.scan(now=300)
    growing.write_bytes(b"PK" * 20)
    assert box.scan(now=320) == [] and growing.exists()

    out = tmp / "out" / "dropped.narrated.epub"
    out.parent.mkdir()
    out.write_bytes(b"narrated")
    for state in ("importing", "processing", "completed"):
        store.update(job.id, state=state)
    store.update(job.id, output_epub=str(out))
    assert box.deliver() == ["finished: Dropped Book (narrated).epub"]
    assert (tmp / "Inbox" / "Finished" / "Dropped Book (narrated).epub").read_bytes() == b"narrated"
    assert box.deliver() == []                    # unchanged: not copied again
