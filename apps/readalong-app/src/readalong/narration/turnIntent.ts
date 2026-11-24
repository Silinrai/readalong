// Readalong: who moved the page, recorded where it happens so the narration
// follow policy can tell a page turn from a relayout.
//
// Turns are recorded per view (viewPagination knows the view, not the book),
// relayouts globally (a style or window change re-lays out every open book).

const userTurns = new WeakMap<object, number>();
const swipeOffs = new WeakMap<object, number>();
let relayoutAt = 0;

/** The reader turned the page by hand: tap zone, key, volume or page button. */
export const markUserPageTurn = (view: object | null | undefined) => {
  if (view) userTurns.set(view, Date.now());
};

/** A sideways swipe turned narration off; the turn it makes is not a cue. */
export const markSwipeOff = (view: object | null | undefined) => {
  if (view) swipeOffs.set(view, Date.now());
};

/** The book is being re-laid out (styles, margins, window size, pose). */
export const markRelayout = () => {
  relayoutAt = Date.now();
};

export const readTurnIntent = (view: object | null | undefined) => ({
  userTurnAt: (view && userTurns.get(view)) || 0,
  swipeOffAt: (view && swipeOffs.get(view)) || 0,
  relayoutAt,
});

/** Forget a hand turn once it has been acted on. */
export const consumeUserPageTurn = (view: object | null | undefined) => {
  if (view) userTurns.delete(view);
};
