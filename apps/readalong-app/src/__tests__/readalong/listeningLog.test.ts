import { beforeEach, describe, expect, it } from 'vitest';
import {
  getListeningSeconds,
  readAndListenedDays,
  recordListening,
} from '@/readalong/stats/listeningLog';
import { toDateKey } from '@/services/statistics/readingStats';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime() / 1000;

describe('listening log', () => {
  beforeEach(() => localStorage.clear());

  it('adds up listened seconds per local day', () => {
    recordListening([
      { startTime: at(2026, 11, 22), duration: 60 },
      { startTime: at(2026, 11, 23, 9), duration: 90 },
      { startTime: at(2026, 11, 23, 21), duration: 30 },
    ]);
    const log = getListeningSeconds();
    expect(log.get('2026-11-22')).toBe(60);
    expect(log.get('2026-11-23')).toBe(120);
  });

  it('splits each day into read and listened time, newest first', () => {
    const today = new Date(2026, 10, 23, 12);
    const daily = new Map([
      [toDateKey(today), 600],
      ['2026-11-22', 300],
    ]);
    const listened = new Map([
      [toDateKey(today), 240],
      ['2026-11-22', 400],
    ]);
    const rows = readAndListenedDays(daily, listened, 3, today);
    expect(rows).toEqual([
      { date: '2026-11-23', read: 360, listened: 240 },
      // Listening recorded before the totals caught up never reads negative.
      { date: '2026-11-22', read: 0, listened: 400 },
      { date: '2026-11-21', read: 0, listened: 0 },
    ]);
  });
});
