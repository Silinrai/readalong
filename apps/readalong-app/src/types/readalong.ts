// Readalong: types for the fork's own settings, kept out of Readalong's files.
import type { ViewSettings } from './book';

/** What tapping one cell of the 3x3 tap-zone grid does. */
export type TapZoneAction =
  | 'none'
  | 'prev'
  | 'next'
  | 'menu'
  | 'playPause'
  | 'prevLine'
  | 'nextLine'
  | 'bookmark';

/** A saved page look (Moon+ Reader's "visual options"). */
export interface ReadingPreset {
  id: string;
  name: string;
  builtIn?: boolean;
  values: Partial<ViewSettings>;
}

/** The library's look: wooden bookshelf, cozy reading room, or Readalong's own. */
export type LibraryLook = 'shelf' | 'cozy' | 'plain';
export const DEFAULT_LIBRARY_LOOK: LibraryLook = 'shelf';
