// Readalong: a slim reading-progress line along the bottom of a started book's
// cover. The shelf look shows covers only (no title, no percentage), so this is
// how a reader sees which books they are in the middle of. Hidden by CSS in
// the other looks, which already print the percentage under the cover.
import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { getProgressPercentage } from '@/app/library/utils/libraryUtils';

/** Percent read for a book in progress; null when unstarted or finished. */
export const coverProgressPercent = (book: Book): number | null => {
  if (book.readingStatus === 'finished' || book.readingStatus === 'unread') return null;
  const percent = getProgressPercentage(book);
  if (percent === null || Number.isNaN(percent) || percent <= 0 || percent >= 100) return null;
  return percent;
};

export const CoverProgress = ({ book }: { book: Book }) => {
  const _ = useTranslation();
  const percent = coverProgressPercent(book);
  if (percent === null) return null;
  return (
    <div
      className='ra-cover-progress'
      role='progressbar'
      aria-label={_('{{percent}}% read', { percent })}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className='ra-cover-progress-fill' style={{ width: `${percent}%` }} />
    </div>
  );
};
