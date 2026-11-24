import { describe, expect, it, vi } from 'vitest';
import { getDevicePose, getFoldablePose, getRendererLayout } from '@/utils/duo';
import { DEFAULT_BOOK_LAYOUT, DEFAULT_VIEW_CONFIG } from '@/services/constants';

const DEFAULT_VIEW_CONFIG_FOR_GAP = {
  ...DEFAULT_VIEW_CONFIG,
  ...DEFAULT_BOOK_LAYOUT,
  duoBookMode: true,
};

// Readalong: Galaxy Z Fold 7 sizes in CSS px (about 2.6 device px per px).
const FOLD7_INNER = { width: 750, height: 832 };
const FOLD7_COVER = { width: 412, height: 960 };

describe('getFoldablePose', () => {
  it('treats the unfolded inner screen as the two-page book pose, either way up', () => {
    expect(getFoldablePose(FOLD7_INNER.width, FOLD7_INNER.height)).toBe('inner-landscape');
    expect(getFoldablePose(FOLD7_INNER.height, FOLD7_INNER.width)).toBe('inner-landscape');
  });

  it('leaves the cover screen and ordinary phones alone', () => {
    expect(getFoldablePose(FOLD7_COVER.width, FOLD7_COVER.height)).toBe('off');
    expect(getFoldablePose(FOLD7_COVER.height, FOLD7_COVER.width)).toBe('off');
  });

  it('leaves small square windows alone', () => {
    expect(getFoldablePose(500, 520)).toBe('off');
  });
});

describe('getDevicePose', () => {
  it('only applies the foldable rule on Android', () => {
    expect(getDevicePose(false, true, FOLD7_INNER.width, FOLD7_INNER.height)).toBe(
      'inner-landscape',
    );
    expect(getDevicePose(false, false, FOLD7_INNER.width, FOLD7_INNER.height)).toBe('off');
  });

  it('keeps the iPhone Duo rules for the iPhone Duo', () => {
    expect(getDevicePose(true, false, 669, 951)).toBe('inner-portrait');
  });
});

describe('Inner Screen gap on an Android foldable', () => {
  const settings = (columnGapPx: number) =>
    ({
      ...DEFAULT_VIEW_CONFIG_FOR_GAP,
      columnGapPx,
    }) as unknown as Parameters<typeof getRendererLayout>[0];

  it('keeps room for the crease by default and uses the reader’s own gap when set', () => {
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 16)');
    try {
      expect(getRendererLayout(settings(0), 'inner-landscape', 760, null).columnGapPx).toBe(48);
      expect(getRendererLayout(settings(12), 'inner-landscape', 760, null).columnGapPx).toBe(12);
      expect(getRendererLayout(settings(120), 'inner-landscape', 760, null).columnGapPx).toBe(120);
    } finally {
      ua.mockRestore();
    }
  });
});
