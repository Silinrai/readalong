import { describe, expect, it } from 'vitest';
import { showSystemStatusBar } from '@/readalong/statusBar';

describe('showSystemStatusBar', () => {
  it('shows with the reader bars by default (Readalong)', () => {
    expect(showSystemStatusBar({ barsVisible: true, alwaysShow: false, hideWithBars: false })).toBe(
      true,
    );
    expect(
      showSystemStatusBar({ barsVisible: false, alwaysShow: false, hideWithBars: false }),
    ).toBe(false);
  });
  it('stays hidden while reading when the reader asks for it', () => {
    expect(showSystemStatusBar({ barsVisible: true, alwaysShow: false, hideWithBars: true })).toBe(
      false,
    );
  });
  it('"always show" still wins', () => {
    expect(showSystemStatusBar({ barsVisible: false, alwaysShow: true, hideWithBars: true })).toBe(
      true,
    );
  });
});
