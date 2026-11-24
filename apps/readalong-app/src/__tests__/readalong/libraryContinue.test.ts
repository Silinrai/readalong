import { describe, expect, it } from 'vitest';
import type { Book } from '@/types/book';
import { continueReadingBook, readalongAutoColumns } from '@/readalong/library/continueReading';

const book = (hash: string, updatedAt: number, progress: [number, number] | null, extra = {}) =>
  ({ hash, title: hash, author: '', updatedAt, createdAt: 0, progress, ...extra }) as Book;

describe('continueReadingBook', () => {
  it('is the most recently read book still in progress', () => {
    const books = [
      book('old', 1, [10, 100]),
      book('new', 3, [40, 100]),
      book('finished', 5, [100, 100], { readingStatus: 'finished' }),
      book('unstarted', 6, null),
      book('deleted', 7, [5, 100], { deletedAt: 8 }),
    ];
    expect(continueReadingBook(books)?.hash).toBe('new');
  });

  it('is none when nothing is in progress', () => {
    expect(continueReadingBook([book('a', 1, null)])).toBeNull();
  });
});

describe('readalongAutoColumns', () => {
  it('gives the unfolded Fold (about 880 px) fewer, larger covers', () => {
    expect(readalongAutoColumns(884, 6)).toBe(5);
    expect(readalongAutoColumns(770, 6)).toBe(4);
  });

  it('never gives more columns than Readalong would', () => {
    expect(readalongAutoColumns(375, 3)).toBe(3);
    expect(readalongAutoColumns(1200, 6)).toBe(6);
    expect(readalongAutoColumns(1600, 12)).toBe(9);
  });
});
