import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import { marginFields, marginPatch } from '@/readalong/visual/marginFields';

const vs = (over: Partial<ViewSettings>) =>
  ({
    showHeader: true,
    showFooter: true,
    vertical: false,
    writingMode: 'horizontal-tb',
    ...over,
  }) as ViewSettings;

describe('marginFields (which margin setting is in effect)', () => {
  it('uses the full top/bottom margins while the header and footer show', () => {
    expect(marginFields(vs({}))).toEqual({
      top: 'marginTopPx',
      bottom: 'marginBottomPx',
      left: 'compactMarginLeftPx',
      right: 'compactMarginRightPx',
    });
  });
  it('uses the compact ones when the header and footer are hidden', () => {
    expect(marginFields(vs({ showHeader: false, showFooter: false }))).toMatchObject({
      top: 'compactMarginTopPx',
      bottom: 'compactMarginBottomPx',
    });
  });
});

describe('marginPatch', () => {
  it('sets one side, or both sides when linked, and drops the old shared margin', () => {
    const settings = vs({ marginPx: 30 });
    expect(marginPatch(settings, 'top', 40, false)).toEqual({
      marginTopPx: 40,
      marginPx: undefined,
    });
    expect(marginPatch(settings, 'left', 12, true)).toEqual({
      compactMarginLeftPx: 12,
      compactMarginRightPx: 12,
    });
  });
});
