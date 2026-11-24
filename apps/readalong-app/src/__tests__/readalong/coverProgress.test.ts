import { describe, expect, it } from 'vitest';
import type { Book } from '@/types/book';
import { coverProgressPercent } from '@/readalong/library/CoverProgress';

const book = (progress?: [number, number], readingStatus?: Book['readingStatus']) =>
  ({ hash: 'h', title: 't', progress, readingStatus }) as unknown as Book;

describe('coverProgressPercent (shelf progress line)', () => {
  it('shows progress for a book in progress', () => {
    expect(coverProgressPercent(book([560, 1008]))).toBe(56);
  });
  it('shows nothing for an unstarted, finished or unread book', () => {
    expect(coverProgressPercent(book())).toBeNull();
    expect(coverProgressPercent(book([0, 1008]))).toBeNull();
    expect(coverProgressPercent(book([1008, 1008]))).toBeNull();
    expect(coverProgressPercent(book([500, 1008], 'finished'))).toBeNull();
  });
});
