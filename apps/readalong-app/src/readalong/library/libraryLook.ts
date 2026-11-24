import type { SystemSettings } from '@/types/settings';
import { DEFAULT_LIBRARY_LOOK, type LibraryLook } from '@/types/readalong';

/** The library look the reader chose, or Readalong's default (Bookshelf). */
export const getLibraryLook = (settings: Partial<SystemSettings>): LibraryLook =>
  settings.libraryLook ?? DEFAULT_LIBRARY_LOOK;
