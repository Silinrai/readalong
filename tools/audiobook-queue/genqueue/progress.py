"""Progress figures for one job and for the whole queue.

Everything here comes from work actually done: characters voiced, chapters
written, seconds the renderer spent. Two kinds of numbers come out, and they
are labelled so the app can tell them apart:

- actual: counts (chapters, sentences, characters done / total) and the
  percentage made from them.
- estimated: time left, from the voicing speed measured on this PC. Books
  differ a lot in length, so the overall figure is weighted by characters,
  never an average of percentages.
"""
from __future__ import annotations

from .store import ACTIVE, FINISHED, Job

# Characters per second of render time, measured; None until something ran.
RATE_KEY = "measured_chars_per_second"


def job_rate(job: Job, fallback: float | None) -> float | None:
    """This book's own measured speed once it has enough of it, else the PC's."""
    if job.fresh_seconds >= 60 and job.fresh_chars > 0:
        return job.fresh_chars / job.fresh_seconds
    return fallback


def job_progress(job: Job, rate: float | None) -> dict:
    total = job.chars_total
    done = min(job.chars_done, total) if total else 0
    percent = round(100 * done / total, 1) if total else None
    if job.state == "completed":
        percent = 100.0
    r = job_rate(job, rate)
    remaining = None
    size = total or job.chars_estimate
    if job.state not in FINISHED and size and r:
        remaining = max(0, size - done) / r
    return {
        "actual": {
            "percent": percent,  # None until the book has been read in
            "chapters_done": job.chapters_done,
            "chapters_total": job.chapters_total,
            "sentences_done": job.sentences_done,
            "sentences_total": job.sentences_total,
            "chars_done": done,
            "chars_total": total,
            "audio_seconds": round(job.audio_seconds, 1),
            "elapsed_seconds": round(job.elapsed_seconds, 1),
        },
        "estimated": {
            "seconds_left": round(remaining) if remaining is not None else None,
            "chars_per_second": round(r, 2) if r else None,
            "basis": "this book" if r and job.fresh_seconds >= 60 else "this PC" if r else None,
            # True while the book's size is itself a guess from its text.
            "size_estimated": not total and bool(job.chars_estimate),
        },
    }


def queue_summary(jobs: list[Job], rate: float | None) -> dict:
    visible = [j for j in jobs if not j.hidden]
    counts = {
        "submitted": len(visible),
        "completed": sum(j.state == "completed" for j in visible),
        "processing": sum(j.state in ACTIVE for j in visible),
        "waiting": sum(j.state in {"waiting", "uploaded", "uploading", "pending"} for j in visible),
        "paused": sum(j.state == "paused" for j in visible),
        "failed": sum(j.state == "failed" for j in visible),
        "cancelled": sum(j.state == "cancelled" for j in visible),
    }
    # Weighted by characters. A book not read in yet has no size: it's left out
    # of the percentage and counted in `unsized`, so the app can say so.
    live = [j for j in visible if j.state not in {"cancelled", "failed"}]
    sized = [j for j in live if j.chars_total]
    total = sum(j.chars_total for j in sized)
    done = sum(j.chars_total if j.state == "completed" else min(j.chars_done, j.chars_total)
               for j in sized)
    seconds_left = 0.0
    eta_known = True
    for j in live:
        if j.state == "completed":
            continue
        p = job_progress(j, rate)["estimated"]["seconds_left"]
        if p is None:
            eta_known = False
        else:
            seconds_left += p
    return {
        "counts": counts,
        "actual": {
            "percent": round(100 * done / total, 1) if total else None,
            "chars_done": done,
            "chars_total": total,
            "unsized": len(live) - len(sized),
        },
        "estimated": {
            # Sequential processing: the queue's time left is the sum.
            "seconds_left": round(seconds_left) if eta_known and rate else None,
            "complete": eta_known,
        },
    }
