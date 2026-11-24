import { describe, expect, it } from 'vitest';
import {
  decideOnPageChange,
  FollowSignals,
  isHandTurnPending,
} from '@/readalong/narration/followPolicy';

describe('isHandTurnPending', () => {
  // The voice's next sentence mark can arrive before the page change from a
  // hand turn into another chapter is handled; the mark must not pull the
  // view back to the voice's chapter then.
  it('is true just after a hand turn, so the voice does not pull the view back', () => {
    expect(isHandTurnPending({ now: 100_000, userTurnAt: 100_000 - 200 })).toBe(true);
  });

  it('is false with no turn or an old one', () => {
    expect(isHandTurnPending({ now: 100_000, userTurnAt: 0 })).toBe(false);
    expect(isHandTurnPending({ now: 100_000, userTurnAt: 90_000 })).toBe(false);
  });
});

const at = (over: Partial<FollowSignals> = {}): FollowSignals => ({
  now: 100_000,
  playing: true,
  typing: false,
  userTurnAt: 0,
  swipeOffAt: 0,
  relayoutAt: 0,
  ...over,
});

describe('decideOnPageChange', () => {
  it('narrates from the new page top after a hand turn while playing', () => {
    expect(decideOnPageChange(at({ userTurnAt: 99_500 }))).toBe('narrateFromTop');
  });

  it('still narrates from the top when an animated turn lands the page late', () => {
    // Seen in the web build: the curl turn's page change arrived 2.3 s after
    // the tap; a phone is slower still.
    expect(decideOnPageChange(at({ userTurnAt: 100_000 - 2_300 }))).toBe('narrateFromTop');
    expect(decideOnPageChange(at({ userTurnAt: 100_000 - 4_000 }))).toBe('narrateFromTop');
  });

  it('keeps the voice and re-shows it after a relayout, even right after a turn', () => {
    expect(decideOnPageChange(at({ relayoutAt: 99_000 }))).toBe('reshowVoice');
    expect(decideOnPageChange(at({ relayoutAt: 99_000, userTurnAt: 99_900 }))).toBe('reshowVoice');
  });

  it('does nothing after a swipe turned narration off', () => {
    expect(decideOnPageChange(at({ swipeOffAt: 99_000, userTurnAt: 99_900 }))).toBe('ignore');
  });

  it('shows the back button for moves that are not hand turns (TOC, scrubber, old turns)', () => {
    expect(decideOnPageChange(at())).toBe('showBackButton');
    expect(decideOnPageChange(at({ userTurnAt: 90_000 }))).toBe('showBackButton');
  });

  it('never moves the voice while paused or while a note is being typed', () => {
    expect(decideOnPageChange(at({ playing: false, userTurnAt: 99_500 }))).toBe('showBackButton');
    expect(decideOnPageChange(at({ typing: true, userTurnAt: 99_500 }))).toBe('showBackButton');
    expect(decideOnPageChange(at({ playing: false, relayoutAt: 99_500 }))).toBe('ignore');
  });
});
