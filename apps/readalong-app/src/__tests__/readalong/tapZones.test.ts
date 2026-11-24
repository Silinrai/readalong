import { describe, expect, it } from 'vitest';
import { DEFAULT_TAP_ZONES, tapZoneActionAt, tapZoneIndex } from '@/readalong/tapZones';
import { getTextEffectStyles } from '@/utils/style';

const rect = { left: 0, top: 0, width: 300, height: 600 };

describe('tap zones', () => {
  it('maps a point to its 3x3 cell, row by row', () => {
    expect(tapZoneIndex(10, 10, rect)).toBe(0);
    expect(tapZoneIndex(150, 300, rect)).toBe(4);
    expect(tapZoneIndex(299, 599, rect)).toBe(8);
    expect(tapZoneIndex(-5, 10, rect)).toBe(-1);
  });

  it('is off unless a full grid is set', () => {
    expect(tapZoneActionAt(null, 10, 10, rect)).toBeNull();
    expect(tapZoneActionAt(['next'], 10, 10, rect)).toBeNull();
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 10, 10, rect)).toBe('prev');
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 150, 590, rect)).toBe('playPause');
  });
});

describe('tap zones on a two-page spread', () => {
  const spread = { left: 0, top: 0, width: 800, height: 600 };
  const right = [...DEFAULT_TAP_ZONES];
  right[4] = 'bookmark';

  it('gives each page its own 3x3 grid', () => {
    // The middle of the LEFT page is its menu cell, not the spread's gutter.
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 200, 300, spread, { columns: 2 })).toBe('menu');
    // The left edge of the right page is that page's "previous" column.
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 420, 300, spread, { columns: 2 })).toBe('prev');
  });

  it('uses the right-page grid on the right page when one is set', () => {
    const opts = { columns: 2, rightZones: right };
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 600, 300, spread, opts)).toBe('bookmark');
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 200, 300, spread, opts)).toBe('menu');
  });

  it('ignores the right-page grid on a single page', () => {
    const opts = { columns: 1, rightZones: right };
    expect(tapZoneActionAt(DEFAULT_TAP_ZONES, 400, 300, spread, opts)).toBe('menu');
  });
});

describe('text effects', () => {
  it('adds nothing when off', () => {
    expect(getTextEffectStyles(0, 0)).toBe('');
  });

  it('adds a shadow and a stroke within their limits', () => {
    const css = getTextEffectStyles(9, 2);
    expect(css).toContain('text-shadow: 0 0 1.8px');
    expect(css).toContain('-webkit-text-stroke: 0.6px');
  });
});
