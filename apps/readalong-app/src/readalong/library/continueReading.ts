// Readalong: the library on a big screen. Covers stay at least ~170 px wide
// (Readalong's auto grid gives the unfolded Fold six small ones), and a
// "Continue" card at the top resumes the book read most recently.
import type { Book } from '@/types/book';
import { coverProgressPercent } from './CoverProgress';

const MIN_COVER_PX = 170;

/** Auto column count: Readalong's, or fewer when covers would get small. */
export const readalongAutoColumns = (width: number, readalongColumns: number): number =>
  Math.max(3, Math.min(readalongColumns, Math.floor(width / MIN_COVER_PX)));

/** The book read most recently that is started and not finished. */
export const continueReadingBook = (books: Book[]): Book | null =>
  books
    .filter((b) => !b.deletedAt && coverProgressPercent(b) !== null)
    .reduce<Book | null>((best, b) => (!best || b.updatedAt > best.updatedAt ? b : best), null);
