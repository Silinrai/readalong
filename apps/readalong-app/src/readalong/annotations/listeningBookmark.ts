// Readalong: a bookmark on the sentence being spoken. It keeps the book's
// usual CFI (to open the page), the sentence as a text quote (stable across
// the narrated copy and other editions), the chapter, and where the
// narration was (voice, and for a recorded narrator the audio file and
// second), so it can reopen the page or resume listening right there.
import type { BookNote, ListeningMark, TextQuote } from '@/types/book';
import { uniqueId } from '@/utils/misc';

export interface ListeningSnapshotInput {
  cfi: string;
  quote: TextQuote | null;
  chapterLabel?: string;
  page?: number;
  listening: ListeningMark;
  printedPage?: number | null;
}

const TEXT_MAX = 160;

export const makeSentenceBookmark = (input: ListeningSnapshotInput, now = Date.now()): BookNote => {
  const exact = input.quote?.exact ?? '';
  return {
    id: uniqueId(),
    type: 'bookmark',
    bookmarkKind: 'sentence',
    cfi: input.cfi,
    text: exact.length > TEXT_MAX ? `${exact.slice(0, TEXT_MAX)}…` : exact,
    quote: input.quote,
    chapterLabel: input.chapterLabel,
    listening: input.listening,
    page: input.page,
    printedPage: input.printedPage ?? null,
    printedPageEstimated: input.printedPage != null,
    note: '',
    createdAt: now,
    updatedAt: now,
  };
};

export const makeChapterBookmark = (
  cfi: string,
  chapterLabel: string,
  now = Date.now(),
): BookNote => ({
  id: uniqueId(),
  type: 'bookmark',
  bookmarkKind: 'chapter',
  cfi,
  text: chapterLabel,
  chapterLabel,
  note: '',
  createdAt: now,
  updatedAt: now,
});

/** Can this bookmark resume the narration? (one made while listening) */
export const canResumeListening = (note: BookNote): boolean =>
  note.type === 'bookmark' && note.bookmarkKind === 'sentence' && !!note.listening;

/** A spoken position as words: "Narrator · 12:34" or the voice id. */
export const listeningLabel = (mark: ListeningMark): string => {
  if (mark.narrated && mark.seconds != null) {
    const s = Math.floor(mark.seconds);
    const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return clock;
  }
  return '';
};
