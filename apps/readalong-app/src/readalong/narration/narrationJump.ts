// Readalong: offering a jump to the next narrated chapter from a page (or
// chapter) that has no narration. Nothing navigates on its own: the reader taps
// the toast's action, so a hand page turn never moves them somewhere else.
import { useReaderStore } from '@/store/readerStore';
import { useReaderProgressStore } from '@/store/readerProgressStore';

export interface UnnarratedNotice {
  message: string;
  actionLabel?: string;
  target?: number;
}

/**
 * What the "no narration" toast says, given the next narrated section (-1:
 * none). `message` is the already-translated text for where the reader is.
 * The translate function is named `_` so the i18n scanner finds the keys.
 */
export const unnarratedPageNotice = (
  _: (text: string) => string,
  nextNarrated: number,
  message = _('No narration on this page'),
): UnnarratedNotice =>
  nextNarrated >= 0
    ? { message, actionLabel: _('Next narrated chapter'), target: nextNarrated }
    : { message: _('No narration in the rest of this book') };

const SETTLE_TIMEOUT_MS = 4000;

/**
 * Open section `index` at its start and resolve once the reader reports it
 * (true), or false when it did not get there in time.
 */
export const goToSection = (bookKey: string, index: number): Promise<boolean> => {
  const { getView, getProgress } = useReaderStore.getState();
  const view = getView(bookKey);
  if (!view) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    };
    const check = () => {
      if (getProgress(bookKey)?.index === index) finish(true);
    };
    // Progress lives in its own store (readerProgressStore).
    const unsubscribe = useReaderProgressStore.subscribe(check);
    const timer = setTimeout(() => finish(false), SETTLE_TIMEOUT_MS);
    void Promise.resolve(view.goTo(index))
      .then(check)
      .catch(() => finish(false));
  });
};
