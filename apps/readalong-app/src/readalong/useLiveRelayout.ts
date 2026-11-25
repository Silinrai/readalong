// Readalong: the relayout queue (relayoutQueue.ts) bound to a book's view.
// Panels that change layout live (font size, spacing, margins, boldness,
// saved looks) schedule their change here instead of applying it directly.
import { useReaderStore } from '@/store/readerStore';
import type { FoliateView } from '@/types/view';
import { createRelayoutQueue, type RelayoutQueue } from './relayoutQueue';
import { markRelayout } from './narration/turnIntent';

// A restyle relocates the page more than once (straight away, then again
// when fonts are ready, ~0.5 s later). The relayout counts as finished once
// relocations have been quiet this long, or after the cap. Timers only:
// animation frames stop while the app is in the background, and the queue
// must never hang waiting for one.
const SETTLE_QUIET_MS = 150;
const SETTLE_MIN_MS = 120;
const SETTLE_MAX_MS = 1200;

/** Resolves once the view's relocations have gone quiet (or the cap). */
export const waitForRelayout = (view: FoliateView | null | undefined) =>
  new Promise<void>((resolve) => {
    if (!view) return resolve();
    const started = Date.now();
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(quiet);
      clearTimeout(cap);
      view.removeEventListener('relocate', onRelocate);
      resolve();
    };
    const armQuiet = () => {
      clearTimeout(quiet);
      const minLeft = Math.max(0, SETTLE_MIN_MS - (Date.now() - started));
      quiet = setTimeout(finish, Math.max(SETTLE_QUIET_MS, minLeft));
    };
    // Fonts settle later than the first relocation; wait for the second too.
    const onRelocate = () => {
      clearTimeout(quiet);
      quiet = setTimeout(finish, Math.max(SETTLE_QUIET_MS, 600 - (Date.now() - started)));
    };
    const cap = setTimeout(finish, SETTLE_MAX_MS);
    view.addEventListener('relocate', onRelocate);
    armQuiet();
  });

// One queue per book, shared by every panel: the sheet, its margins card and
// its fine-tune section each made their own, so their restyles overlapped
// and the page drifted (and a remount of a panel started a fresh queue in
// the middle of another's relayout).
const queues = new Map<string, RelayoutQueue>();

/** The book's relayout queue (shared by every panel that changes layout). */
export const getRelayoutQueue = (bookKey: string): RelayoutQueue => {
  let queue = queues.get(bookKey);
  if (!queue) {
    const getView = () => useReaderStore.getState().getView(bookKey);
    // The page engine keeps the reader's place across one restyle; the queue
    // only makes sure restyles never overlap.
    queue = createRelayoutQueue({
      settle: async () => {
        // Narration must read this as a relayout, not a page turn.
        markRelayout();
        await waitForRelayout(getView());
        markRelayout();
      },
    });
    queues.set(bookKey, queue);
  }
  return queue;
};

export const useLiveRelayout = (bookKey: string): RelayoutQueue => getRelayoutQueue(bookKey);
