"""Readalong's audiobook queue on the PC.

    python -m genqueue serve            # run the queue + API (port 3910)
    python -m genqueue code             # show the pairing code for the phone
    python -m genqueue submit book.epub [--profile NAME] [--priority N] [--out DIR]
    python -m genqueue status

The queue lives in poc/queue_data/queue.db and survives restarts; books,
covers and the database stay there. Audiobooks are written to poc/out/<book>/.
"""
from __future__ import annotations

import argparse
import socket
import sys
import time
from pathlib import Path

from . import intake
from .progress import RATE_KEY, queue_summary
from .store import JobStore
from .worker import Worker

POC = Path(__file__).resolve().parent.parent
DATA = POC / "queue_data"


def local_addresses() -> list[str]:
    names = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            names.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in names if not a.startswith("127."))


def fmt_seconds(s) -> str:
    if s is None:
        return "unknown"
    h, m = divmod(int(s) // 60, 60)
    return f"{h} h {m} min" if h else f"{m} min"


def main(argv=None) -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(prog="genqueue", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=3910)
    sub.add_parser("code")
    sub.add_parser("status")
    p = sub.add_parser("submit")
    p.add_argument("epub", nargs="+")
    p.add_argument("--profile", default="")
    p.add_argument("--priority", type=int, default=0)
    p.add_argument("--out", help="output folder (default out/<file name>)")
    args = ap.parse_args(argv)

    store = JobStore(DATA / "queue.db")
    if args.cmd == "code":
        from .server import get_token
        print(get_token(store))
        return
    if args.cmd == "submit":
        for path in args.epub:
            out = Path(args.out) if args.out and len(args.epub) == 1 else None
            job, created = intake.submit(store, DATA, Path(path), profile=args.profile,
                                         priority=args.priority, out_dir=out)
            print(f"{'queued' if created else 'already queued'}: {job.title} [{job.id}] {job.state}")
        print("The running service picks these up within a few seconds.")
        return
    if args.cmd == "status":
        jobs = store.all(include_hidden=False)
        rate = store.get_value(RATE_KEY)
        for j in jobs:
            pct = f"{100 * j.chars_done / j.chars_total:.1f}%" if j.chars_total else "-"
            print(f"{j.state:10} {pct:>6}  ch {j.chapters_done}/{j.chapters_total}  {j.title}  {j.stage_note or j.error}")
        summ = queue_summary(jobs, rate)
        print(f"overall {summ['actual']['percent']}% (actual), about "
              f"{fmt_seconds(summ['estimated']['seconds_left'])} left (estimated)")
        return

    from .backend import RenderBackend
    from .server import Api, get_token, serve
    backend = RenderBackend()
    worker = Worker(store, backend, DATA)
    for note in worker.recover():
        print("recovered:", note)
    worker.start()
    api = Api(store, worker, DATA, backend)
    httpd = serve(api, args.host, args.port)
    print(f"Readalong queue on port {args.port}. Pairing code: {get_token(store)}")
    for addr in local_addresses():
        print(f"  http://{addr}:{args.port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.shutdown()
        worker.stop()
        time.sleep(0.2)
        store.close()


if __name__ == "__main__":
    main()
