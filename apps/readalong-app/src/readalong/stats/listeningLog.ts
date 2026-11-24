// Readalong: how much of each day's reading time was listening. Readalong
// records listening as reading on purpose (the same KOReader page rows, so the
// stats sync stays compatible); this keeps a separate per-day tally of the
// listened seconds on this device, so the stats can say "34 min read, 52 min
// listened". Stored in localStorage: a convenience, not synced.
import { toDateKey } from '@/services/statistics/readingStats';

const KEY = 'readalong-listening-log';

const load = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
};

/** Add listening events (start in epoch seconds, duration in seconds). */
export const recordListening = (events: { startTime: number; duration: number }[]): void => {
  if (!events.length) return;
  const log = load();
  for (const { startTime, duration } of events) {
    if (!(duration > 0)) continue;
    const day = toDateKey(new Date(startTime * 1000));
    log[day] = (log[day] ?? 0) + duration;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Storage full or blocked: the tally is a convenience.
  }
};

export const getListeningSeconds = (): Map<string, number> => new Map(Object.entries(load()));

export interface ReadListenedDay {
  date: string;
  read: number;
  listened: number;
}

/** The last `count` days, newest first: reading time less listening, and listening. */
export const readAndListenedDays = (
  daily: Map<string, number>,
  listened: Map<string, number>,
  count = 7,
  today = new Date(),
): ReadListenedDay[] =>
  Array.from({ length: count }, (_, i) => {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const date = toDateKey(day);
    const heard = listened.get(date) ?? 0;
    return { date, read: Math.max(0, (daily.get(date) ?? 0) - heard), listened: heard };
  });
