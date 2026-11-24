// Readalong: live layout changes without losing the reader's place.
//
// Every font, spacing or margin change restyles the book and the page engine
// re-lays it out, then re-anchors to the text that was on screen. That works
// for one change at a time. A slider fires one change per pixel, and a new
// restyle arriving while the previous re-layout is still running makes the
// engine re-anchor to a half laid-out page, so the reading position drifts
// back a page or more (stock Readalong does the same).
//
// The queue runs one relayout at a time and keeps only the latest value per
// setting while one is running. It deliberately does not move the page
// itself: re-navigating to a position captured under the old layout lands on
// an earlier page (that position is a page start), which caused drift too.

export interface RelayoutQueueDeps {
  /** Resolves once the relayout started by the last task has finished. */
  settle: () => Promise<void>;
}

export type RelayoutTask = () => Promise<void> | void;

export interface RelayoutQueue {
  /** Run `task` for setting `key`; a newer task for the same key replaces it. */
  schedule: (key: string, task: RelayoutTask) => void;
  /** Resolves when nothing is queued or running. */
  idle: () => Promise<void>;
}

export const createRelayoutQueue = (deps: RelayoutQueueDeps): RelayoutQueue => {
  const pending = new Map<string, RelayoutTask>();
  let running: Promise<void> | null = null;

  const drain = async () => {
    try {
      // Let changes made in the same tick (a whole saved look) join this pass.
      await Promise.resolve();
      while (pending.size) {
        const tasks = [...pending.values()];
        pending.clear();
        for (const task of tasks) {
          try {
            await task();
          } catch (error) {
            console.warn('Readalong relayout task failed', error);
          }
        }
        await deps.settle();
      }
    } finally {
      running = null;
    }
  };

  return {
    schedule(key, task) {
      pending.set(key, task);
      if (!running) running = drain();
    },
    async idle() {
      while (running) await running;
    },
  };
};
