// Readalong: "Continue" at the top of the library: the book read most
// recently, its cover, how far in, and one tap back into it. Opening goes
// through Readalong's useOpenBook (downloads a synced book first).
import { useMemo } from 'react';
import { MdPlayArrow } from 'react-icons/md';
import type { Book } from '@/types/book';
import BookCover from '@/components/BookCover';
import { useTranslation } from '@/hooks/useTranslation';
import { useOpenBook } from '@/app/library/hooks/useOpenBook';
import { coverProgressPercent } from './CoverProgress';
import { continueReadingBook } from './continueReading';

type Props = {
  books: Book[];
  handleBookDownload: (
    book: Book,
    options?: { redownload?: boolean; queued?: boolean },
  ) => Promise<boolean>;
};

const noop = () => {};

export const ContinueCard = ({ books, handleBookDownload }: Props) => {
  const _ = useTranslation();
  const book = useMemo(() => continueReadingBook(books), [books]);
  const { openBook } = useOpenBook({ setLoading: noop, handleBookDownload });
  if (!book) return null;
  const percent = coverProgressPercent(book) ?? 0;
  return (
    <button
      type='button'
      className='ra-continue-card'
      aria-label={`${_('Continue')}: ${book.title}`}
      onClick={() => void openBook(book)}
    >
      <span className='ra-continue-cover'>
        <BookCover book={book} coverFit='crop' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col items-start gap-1 text-start'>
        <span className='text-base-content/60 text-xs font-medium'>{_('Continue')}</span>
        <span className='line-clamp-2 max-w-full text-sm font-semibold'>{book.title}</span>
        {book.author && (
          <span className='text-base-content/70 max-w-full truncate text-xs'>{book.author}</span>
        )}
        <span className='flex w-full max-w-56 items-center gap-2'>
          <span className='ra-continue-track' aria-hidden='true'>
            <span className='ra-continue-fill' style={{ width: `${percent}%` }} />
          </span>
          <span className='text-base-content/70 text-xs tabular-nums'>
            {_('{{percent}}% read', { percent })}
          </span>
        </span>
      </span>
      <span className='ra-continue-play' aria-hidden='true'>
        <MdPlayArrow size={26} />
      </span>
    </button>
  );
};
