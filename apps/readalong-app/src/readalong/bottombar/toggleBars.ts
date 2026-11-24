// Readalong: a tap in the middle of the page shows or hides the reader's bars.
//
// - Hiding also closes the panel that was open (colours, Visual Options, page
//   jump), in the same step, so one tap does both.
// - On Android with a page-turn animation (curl, slide...), a finger landing
//   on the page starts the native turn layer, which hides the bars for its
//   page snapshot and puts them back when the touch was not a turn
//   (useCapturedTurn). A tap in the middle then saw the bars "hidden", showed
//   them, and the turn layer restored them too: one tap only closed the panel.
//   So a turn's temporary hide counts as visible here, and a tap that hides
//   the bars during a turn tells the turn layer not to restore them.
// - A repeat within BAR_TOGGLE_REPEAT_MS is the same tap delivered twice.
import { useReaderStore } from '@/store/readerStore';
import { diag } from '../diagnostics';

export const BAR_TOGGLE_REPEAT_MS = 400;

let lastToggleAt = Number.NEGATIVE_INFINITY;
// Books whose bars the turn layer has hidden for its snapshot only.
const hiddenForTurn = new Set<string>();
// Books whose bars a tap hid while hidden for a turn: the turn must not
// bring them back.
const tapHidDuringTurn = new Set<string>();

/** The turn layer is about to hide the bars for its page snapshot. */
export const markBarsHiddenForTurn = (bookKey: string) => {
  diag('turn: hides bars for snapshot');
  hiddenForTurn.add(bookKey);
};

/** Whether the bars are hidden only for a turn's snapshot. */
export const isBarsHiddenForTurn = (bookKey?: string) =>
  bookKey ? hiddenForTurn.has(bookKey) : hiddenForTurn.size > 0;

/**
 * The turn ended without turning. True when a tap hid the bars meanwhile (the
 * turn must leave them hidden); false when they should come back.
 */
export const takeTapHidBarsDuringTurn = (bookKey: string): boolean => {
  const tapHid = tapHidDuringTurn.has(bookKey);
  diag(`turn: cancelled, tapHid=${tapHid} (restore=${!tapHid})`);
  tapHidDuringTurn.delete(bookKey);
  hiddenForTurn.delete(bookKey);
  return tapHid;
};

/** The turn finished (or was torn down): its temporary hide is over. */
export const endBarsHiddenForTurn = (bookKey: string) => {
  diag('turn: finished');
  hiddenForTurn.delete(bookKey);
  tapHidDuringTurn.delete(bookKey);
};

/** Forget the last toggle (tests that tap several times in a row). */
export const resetBarToggle = () => {
  lastToggleAt = Number.NEGATIVE_INFINITY;
  hiddenForTurn.clear();
  tapHidDuringTurn.clear();
};

/** Show or hide the bars for `bookKey`. False when ignored as a duplicate. */
export const toggleBarsFromTap = (bookKey: string, now = Date.now()): boolean => {
  if (now - lastToggleAt < BAR_TOGGLE_REPEAT_MS) {
    diag('toggle: ignored as repeat');
    return false;
  }
  lastToggleAt = now;
  const { hoveredBookKey, setHoveredBookKey, bottomBarTab, setBottomBarTab } =
    useReaderStore.getState();
  const visible = !!hoveredBookKey || hiddenForTurn.has(bookKey);
  diag(
    `toggle: hovered=${hoveredBookKey} hiddenForTurn=${hiddenForTurn.has(bookKey)} -> ${visible ? 'hide' : 'show'}`,
  );
  if (visible) {
    if (bottomBarTab) setBottomBarTab('');
    if (hiddenForTurn.has(bookKey)) tapHidDuringTurn.add(bookKey);
    setHoveredBookKey(null);
  } else {
    setHoveredBookKey(bookKey);
  }
  return true;
};
