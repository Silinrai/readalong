// Readalong: save the sentence being spoken as a bookmark, and go back to
// one: open its page, or resume listening at that sentence.
import type { EnvConfigType } from '@/services/environment';
import type { TTSController } from '@/services/tts/TTSController';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { BookNote } from '@/types/book';
import { eventDispatcher } from '@/utils/event';
import { makeChapterBookmark, makeSentenceBookmark } from './listeningBookmark';
import { estimatePrintedPage } from './printedPage';
import { quoteFromRange } from './textQuote';

const saveNotes = async (envConfig: EnvConfigType, bookKey: string, notes: BookNote[]) => {
  const { updateBooknotes, saveConfig } = useBookDataStore.getState();
  const config = updateBooknotes(bookKey, notes);
  if (config) await saveConfig(envConfig, bookKey, config, useSettingsStore.getState().settings);
};

/** Returns the new bookmark, or null when nothing is being spoken. */
export const bookmarkSpokenSentence = async (
  envConfig: EnvConfigType,
  bookKey: string,
  controller: TTSController | null,
): Promise<BookNote | null> => {
  const snap = controller?.listeningSnapshot();
  const view = useReaderStore.getState().getView(bookKey);
  const config = useBookDataStore.getState().getConfig(bookKey);
  if (!snap || !view || !config) return null;
  const progress = useReaderStore.getState().getProgress(bookKey);
  const cfi = view.getCFI(snap.sectionIndex, snap.range);
  const fraction = progress?.fraction;
  const printed =
    config.printEdition && typeof fraction === 'number'
      ? estimatePrintedPage(fraction, config.printEdition)
      : null;
  const notes = config.booknotes ?? [];
  // The same sentence twice is one bookmark: refresh it instead.
  const existing = notes.find(
    (n) => n.type === 'bookmark' && n.bookmarkKind === 'sentence' && n.cfi === cfi && !n.deletedAt,
  );
  const bookmark = makeSentenceBookmark({
    cfi,
    quote: quoteFromRange(snap.range),
    chapterLabel: progress?.sectionLabel,
    page: progress?.page,
    printedPage: printed,
    listening: {
      sectionIndex: snap.sectionIndex,
      voice: snap.voice,
      narrated: snap.narrated,
      audioHref: snap.audioHref,
      seconds: snap.seconds,
    },
  });
  if (existing) {
    Object.assign(existing, {
      ...bookmark,
      id: existing.id,
      createdAt: existing.createdAt,
      note: existing.note,
    });
  } else {
    notes.push(bookmark);
  }
  await saveNotes(envConfig, bookKey, notes);
  return existing ?? bookmark;
};

/** Bookmark the start of the chapter now shown. */
export const bookmarkCurrentChapter = async (
  envConfig: EnvConfigType,
  bookKey: string,
): Promise<BookNote | null> => {
  const { getView, getProgress } = useReaderStore.getState();
  const view = getView(bookKey);
  const progress = getProgress(bookKey);
  const config = useBookDataStore.getState().getConfig(bookKey);
  if (!view || !progress || !config) return null;
  const index = progress.index ?? view.renderer.primaryIndex;
  const doc = view.renderer.getContents().find((c) => c.index === index)?.doc;
  if (!doc?.body) return null;
  const range = doc.createRange();
  range.setStart(doc.body, 0);
  range.collapse(true);
  const cfi = view.getCFI(index, range);
  const notes = config.booknotes ?? [];
  if (notes.some((n) => n.type === 'bookmark' && n.cfi === cfi && !n.deletedAt)) return null;
  const bookmark = makeChapterBookmark(cfi, progress.sectionLabel || '');
  notes.push(bookmark);
  await saveNotes(envConfig, bookKey, notes);
  return bookmark;
};

/** Open the bookmark's page and start listening at its sentence. */
export const resumeListeningAt = async (bookKey: string, note: BookNote): Promise<boolean> => {
  const { getView, getViewState } = useReaderStore.getState();
  const view = getView(bookKey);
  if (!view) return false;
  if (getViewState(bookKey)?.ttsEnabled) {
    eventDispatcher.dispatch('tts-stop', { bookKey });
    await new Promise((r) => setTimeout(r, 300));
  }
  await view.goTo(note.cfi);
  // Let the page render, then find the sentence in it.
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const { index, anchor } = view.resolveCFI(note.cfi);
      const doc = view.renderer.getContents().find((c) => c.index === index)?.doc;
      if (!doc) continue;
      const range = anchor(doc) as Range;
      eventDispatcher.dispatch('tts-speak', { bookKey, range, index, oneTime: false });
      return true;
    } catch {
      // not rendered yet
    }
  }
  return false;
};
