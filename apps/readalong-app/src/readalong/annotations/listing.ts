// Readalong: how the bookmarks and annotations lists can be narrowed and
// ordered. In book order they stay grouped by chapter (Readalong's view);
// by date they're one list, newest or oldest first.
import type { BookNote } from '@/types/book';

export type NoteSort = 'position' | 'newest' | 'oldest';
export type BookmarkKindFilter = 'all' | 'page' | 'chapter' | 'sentence';

export const bookmarkKindOf = (note: BookNote): Exclude<BookmarkKindFilter, 'all'> =>
  note.bookmarkKind ?? 'page';

export const filterBookmarks = (notes: BookNote[], kind: BookmarkKindFilter): BookNote[] =>
  kind === 'all' ? notes : notes.filter((n) => bookmarkKindOf(n) === kind);

/** Notes by date; ties (same millisecond) keep their original order. */
export const sortByDate = (notes: BookNote[], sort: Exclude<NoteSort, 'position'>): BookNote[] =>
  notes
    .map((note, i) => ({ note, i }))
    .sort((a, b) =>
      a.note.createdAt === b.note.createdAt
        ? a.i - b.i
        : sort === 'newest'
          ? b.note.createdAt - a.note.createdAt
          : a.note.createdAt - b.note.createdAt,
    )
    .map(({ note }) => note);
