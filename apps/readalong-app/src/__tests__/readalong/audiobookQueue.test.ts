import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueClient, normalizeQueueUrl, sha256Hex } from '@/readalong/audiobookQueue/client';
import {
  actualLine,
  estimateLine,
  formatDuration,
  overallLine,
} from '@/readalong/audiobookQueue/format';
import { jobsToImport, useAudiobookQueueStore } from '@/readalong/audiobookQueue/queueStore';
import type { JobProgress, QueueJob, QueueStatus } from '@/readalong/audiobookQueue/types';

const t = (key: string, o?: Record<string, string | number>) =>
  key.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o?.[k] ?? ''));

const progress = (
  over: Partial<JobProgress['actual']> = {},
  est: Partial<JobProgress['estimated']> = {},
): JobProgress => ({
  actual: {
    percent: null,
    chapters_done: 0,
    chapters_total: 0,
    sentences_done: 0,
    sentences_total: 0,
    chars_done: 0,
    chars_total: 0,
    audio_seconds: 0,
    elapsed_seconds: 0,
    ...over,
  },
  estimated: { seconds_left: null, chars_per_second: null, basis: null, ...est },
});

const job = (over: Partial<QueueJob> = {}): QueueJob => ({
  id: 'j1',
  checksum: 'abc',
  title: 'Book',
  author: '',
  filename: 'book.epub',
  profile: 'Voice',
  priority: 0,
  position: 1,
  state: 'waiting',
  stage_note: '',
  error: '',
  failed_chapters: [],
  attempts: 0,
  hidden: false,
  created_at: 0,
  updated_at: 0,
  started_at: 0,
  finished_at: 0,
  has_cover: false,
  has_output: false,
  queue_position: 1,
  progress: progress(),
  ...over,
});

const status = (jobs: QueueJob[]): QueueStatus => ({
  version: '1',
  time: 0,
  paused: false,
  gate: '',
  current: null,
  summary: {
    counts: {
      submitted: jobs.length,
      completed: 0,
      processing: 0,
      waiting: 0,
      paused: 0,
      failed: 0,
      cancelled: 0,
    },
    actual: { percent: null, chars_done: 0, chars_total: 0, unsized: 0 },
    estimated: { seconds_left: null, complete: false },
  },
  jobs,
  settings: {
    max_concurrent: 1,
    priority: 'below_normal',
    windows: [],
    pause_when_in_use: false,
    idle_minutes: 5,
  },
});

describe('audiobook queue wording', () => {
  it('shows a percentage only when the PC counted it, and marks time left as an estimate', () => {
    const p = progress(
      { percent: 37.6, chapters_done: 11, chapters_total: 54 },
      { seconds_left: 3 * 3600 + 20 * 60 },
    );
    expect(actualLine(t, p, 'processing')).toBe('37% · chapter 12 of 54');
    expect(estimateLine(t, p, 'processing')).toBe('about 3 h 20 min left (estimate)');
    // Not read in yet: no made-up percentage, no time left.
    expect(actualLine(t, progress(), 'waiting')).toBe('');
    expect(estimateLine(t, progress(), 'waiting')).toBe('');
    // Finished books don't show a time left.
    expect(estimateLine(t, p, 'completed')).toBe('');
  });

  it('formats long waits in days and short ones in minutes', () => {
    expect(formatDuration(t, 30)).toBe('under a minute');
    expect(formatDuration(t, 25 * 60)).toBe('25 min');
    expect(formatDuration(t, 72 * 3600)).toBe('3 days');
  });

  it('overall line uses the PC weighted percentage', () => {
    const s = status([]).summary;
    s.actual.percent = 10;
    s.estimated.seconds_left = 7200;
    expect(overallLine(t, s)).toBe('10% of the voicing done · about 2 h left (estimate)');
  });
});

describe('QueueClient', () => {
  it('normalizes the PC address and adds the default port', () => {
    expect(normalizeQueueUrl('192.168.0.9')).toBe('http://192.168.0.9:3910');
    expect(normalizeQueueUrl('http://pc.tail1234.ts.net:4000/')).toBe(
      'http://pc.tail1234.ts.net:4000',
    );
    expect(normalizeQueueUrl('  ')).toBe('');
  });

  it("doesn't upload a book the PC already has with that voice", async () => {
    const data = new TextEncoder().encode('epub bytes').buffer;
    const sha = await sha256Hex(data);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/lookup')) {
        expect(url).toContain(`sha256=${sha}`);
        return new Response(JSON.stringify({ job: job({ state: 'processing' }) }));
      }
      throw new Error(`unexpected ${init?.method} ${url}`);
    });
    const client = new QueueClient('http://pc:3910', 'code', fetcher as unknown as typeof fetch);
    const result = await client.submit(data, 'b.epub', 'Voice');
    expect(result.created).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sends the pairing code and reports the PC error message', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer code');
      return new Response(JSON.stringify({ error: 'Pairing code missing or wrong' }), {
        status: 401,
      });
    });
    const client = new QueueClient('http://pc:3910', 'code', fetcher as unknown as typeof fetch);
    await expect(client.status()).rejects.toThrow('Pairing code missing or wrong');
  });
});

describe('queue store', () => {
  beforeEach(() => useAudiobookQueueStore.getState().reset());

  it('keeps each upload independent: one failure does not stop the others', async () => {
    const submitted: string[] = [];
    const client = {
      submit: vi.fn(async (_d: ArrayBuffer, filename: string) => {
        if (filename === 'bad.epub') throw new Error('Not a readable EPUB');
        submitted.push(filename);
        return { job: job({ filename }), created: filename !== 'dup.epub' };
      }),
      status: vi.fn(async () => status([])),
    } as unknown as QueueClient;
    const book = (filename: string) => ({
      title: filename,
      filename,
      read: async () => new ArrayBuffer(4),
    });
    const result = await useAudiobookQueueStore
      .getState()
      .submit(client, [book('a.epub'), book('bad.epub'), book('dup.epub')], 'Voice', 0);
    expect(result).toEqual({ created: 1, existing: 1, failed: 1 });
    expect(submitted).toEqual(['a.epub', 'dup.epub']);
    const uploads = useAudiobookQueueStore.getState().uploads;
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      title: 'bad.epub',
      state: 'failed',
      error: 'Not a readable EPUB',
    });
  });

  it('imports each finished audiobook once, even after it leaves the queue list', () => {
    const jobs = [
      job({ id: 'a', state: 'completed', has_output: true }),
      job({ id: 'b', state: 'completed', has_output: true }),
      job({ id: 'c', state: 'processing' }),
      job({ id: 'd', state: 'failed', has_output: true }),
    ];
    expect(jobsToImport(jobs, { a: 'hash' }).map((j) => j.id)).toEqual(['b']);
  });
});
