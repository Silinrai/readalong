import { beforeEach, describe, expect, it } from 'vitest';
import { useReaderStore } from '@/store/readerStore';
import {
  BAR_TOGGLE_REPEAT_MS,
  isBarsHiddenForTurn,
  markBarsHiddenForTurn,
  resetBarToggle,
  takeTapHidBarsDuringTurn,
  toggleBarsFromTap,
} from '@/readalong/bottombar/toggleBars';

const state = () => useReaderStore.getState();

describe('toggleBarsFromTap (middle-of-page tap)', () => {
  beforeEach(() => {
    resetBarToggle();
    state().setHoveredBookKey(null);
    state().setBottomBarTab('');
  });

  it('with a panel open, one tap closes the panel and hides the bars', () => {
    state().setHoveredBookKey('book');
    state().setBottomBarTab('color');
    toggleBarsFromTap('book', 10_000);
    expect(state().hoveredBookKey).toBeFalsy();
    expect(state().bottomBarTab).toBe('');
  });

  it('a duplicate of the same tap does not show the bars again', () => {
    state().setHoveredBookKey('book');
    state().setBottomBarTab('color');
    toggleBarsFromTap('book', 20_000);
    toggleBarsFromTap('book', 20_000 + 120);
    expect(state().hoveredBookKey).toBeFalsy();
  });

  it('a deliberate second tap still toggles', () => {
    toggleBarsFromTap('book', 30_000);
    expect(state().hoveredBookKey).toBe('book');
    toggleBarsFromTap('book', 30_000 + BAR_TOGGLE_REPEAT_MS + 50);
    expect(state().hoveredBookKey).toBeFalsy();
  });
});

describe('toggleBarsFromTap during a page-turn gesture (Android curl)', () => {
  // The native turn layer hides the bars when a finger lands (for its page
  // snapshot) and puts them back when the touch was not a turn.
  beforeEach(() => {
    resetBarToggle();
    state().setHoveredBookKey(null);
    state().setBottomBarTab('');
  });

  const turnHidesBars = () => {
    markBarsHiddenForTurn('book');
    state().setHoveredBookKey(null);
  };
  const turnCancelled = () => {
    if (takeTapHidBarsDuringTurn('book') === false) state().setHoveredBookKey('book');
  };

  it('tap lands while the turn has the bars hidden: one tap hides bars and panel', () => {
    state().setHoveredBookKey('book');
    state().setBottomBarTab('color');
    turnHidesBars();
    toggleBarsFromTap('book', 40_000);
    turnCancelled();
    expect(state().hoveredBookKey).toBeFalsy();
    expect(state().bottomBarTab).toBe('');
  });

  it('turn restores the bars before the tap lands: the tap still hides them', () => {
    state().setHoveredBookKey('book');
    turnHidesBars();
    turnCancelled();
    toggleBarsFromTap('book', 50_000);
    expect(state().hoveredBookKey).toBeFalsy();
  });

  it('a tap with the bars hidden still shows them', () => {
    toggleBarsFromTap('book', 60_000);
    turnCancelled();
    expect(state().hoveredBookKey).toBe('book');
  });

  it('the turn hiding the bars for a moment does not count as the bars hiding', () => {
    state().setHoveredBookKey('book');
    turnHidesBars();
    expect(isBarsHiddenForTurn('book')).toBe(true);
    turnCancelled();
    expect(isBarsHiddenForTurn('book')).toBe(false);
  });
});
