// Readalong: what narration does when the page under it changes.
//
// The page moves for different reasons, and only one of them should move the
// voice: the reader turning the page by hand (tap zone, key, volume button).
// A relayout (font size, margins, folding the phone) moves the page under the
// voice, so the voice stays and its sentence is brought back into view. A
// sideways swipe has just turned narration off. Anything else (the table of
// contents, the progress bar) is the reader looking around; Readalong's
// "back to narration" button covers that.

/** How long after each signal a page change is still attributed to it. */
// A hand turn is matched to the page change it causes, which arrives only once
// the turn animation (curl by default) and its relocations finish: 2.3 s in the
// web build, longer on a phone. The mark is consumed when acted on, so the long
// window cannot claim a later move.
export const FOLLOW_WINDOWS_MS = {
  userTurn: 6000,
  swipeOff: 2500,
  relayout: 2500,
} as const;

export type FollowDecision = 'ignore' | 'reshowVoice' | 'narrateFromTop' | 'showBackButton';

export interface FollowSignals {
  now: number;
  playing: boolean;
  /** A note editor has focus: the view must hold still. */
  typing: boolean;
  userTurnAt: number;
  swipeOffAt: number;
  relayoutAt: number;
}

/**
 * A hand turn has not been acted on yet. The voice's next sentence mark can
 * come before the page change it caused is handled; while this is true the
 * mark must not navigate the view back to the voice (decideOnPageChange will
 * decide what the voice does instead).
 */
export const isHandTurnPending = ({ now, userTurnAt }: { now: number; userTurnAt: number }) =>
  userTurnAt > 0 && now - userTurnAt < FOLLOW_WINDOWS_MS.userTurn;

/** Called when the page changed and the sounding sentence is not on it. */
export const decideOnPageChange = (s: FollowSignals): FollowDecision => {
  const within = (at: number, ms: number) => at > 0 && s.now - at < ms;
  if (within(s.swipeOffAt, FOLLOW_WINDOWS_MS.swipeOff)) return 'ignore';
  if (within(s.relayoutAt, FOLLOW_WINDOWS_MS.relayout)) {
    return s.playing && !s.typing ? 'reshowVoice' : 'ignore';
  }
  if (s.playing && !s.typing && within(s.userTurnAt, FOLLOW_WINDOWS_MS.userTurn)) {
    return 'narrateFromTop';
  }
  return 'showBackButton';
};
