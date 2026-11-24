"""What the PC is doing: is someone using it, is now inside an allowed time
window, and how hard the voicing may push. Windows-only parts degrade to
"unknown" elsewhere rather than guessing.
"""
from __future__ import annotations

import ctypes
import subprocess
import sys
from datetime import datetime, time as dtime

PRIORITIES = {
    # name: Windows priority class
    "low": 0x00000040,           # IDLE_PRIORITY_CLASS
    "below_normal": 0x00004000,  # BELOW_NORMAL_PRIORITY_CLASS
    "normal": 0x00000020,        # NORMAL_PRIORITY_CLASS
}


def idle_seconds() -> float | None:
    """Seconds since the last keyboard or mouse input, or None if unknown."""
    if sys.platform != "win32":
        return None

    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(info)
    if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
        return None
    now = ctypes.windll.kernel32.GetTickCount() & 0xFFFFFFFF
    return ((now - info.dwTime) & 0xFFFFFFFF) / 1000.0


def parse_window(text: str) -> tuple[dtime, dtime]:
    """'22:00-07:30' -> (22:00, 07:30). A window may cross midnight."""
    a, b = (part.strip() for part in text.split("-", 1))
    return dtime.fromisoformat(a), dtime.fromisoformat(b)


def in_windows(windows: list[str], now: datetime | None = None) -> bool:
    """True when there are no windows (always allowed) or now is in one."""
    if not windows:
        return True
    t = (now or datetime.now()).time()
    for w in windows:
        start, end = parse_window(w)
        if start <= end:
            if start <= t < end:
                return True
        elif t >= start or t < end:
            return True
    return False


def find_pids(image_name: str) -> list[int]:
    if sys.platform != "win32":
        return []
    out = subprocess.run(["tasklist", "/fo", "csv", "/nh", "/fi", f"imagename eq {image_name}"],
                         capture_output=True, text=True, creationflags=0x08000000).stdout
    pids = []
    for line in out.splitlines():
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) > 1 and parts[1].isdigit():
            pids.append(int(parts[1]))
    return pids


def set_priority(pids: list[int], name: str) -> int:
    """Set the priority class of these processes; returns how many changed."""
    if sys.platform != "win32" or name not in PRIORITIES:
        return 0
    changed = 0
    k32 = ctypes.windll.kernel32
    for pid in pids:
        h = k32.OpenProcess(0x0200 | 0x0400, False, pid)  # SET_INFORMATION | QUERY_INFORMATION
        if h:
            if k32.SetPriorityClass(h, PRIORITIES[name]):
                changed += 1
            k32.CloseHandle(h)
    return changed
