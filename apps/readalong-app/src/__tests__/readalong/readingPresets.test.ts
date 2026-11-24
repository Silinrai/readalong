import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESETS,
  capturePreset,
  PRESET_KEYS,
  presetChanges,
  presetMatches,
} from '@/readalong/readingPresets';
import {
  DEFAULT_BOOK_FONT,
  DEFAULT_BOOK_LAYOUT,
  DEFAULT_BOOK_STYLE,
  DEFAULT_VIEW_CONFIG,
} from '@/services/constants';
import type { ViewSettings } from '@/types/book';

const base = (over: Partial<ViewSettings> = {}) =>
  ({
    ...DEFAULT_BOOK_LAYOUT,
    ...DEFAULT_BOOK_STYLE,
    ...DEFAULT_BOOK_FONT,
    ...DEFAULT_VIEW_CONFIG,
    ...over,
  }) as ViewSettings;

describe('reading presets', () => {
  it('captures only the preset-able settings', () => {
    const values = capturePreset(base({ defaultFontSize: 21 }));
    expect(values.defaultFontSize).toBe(21);
    expect(Object.keys(values).every((k) => (PRESET_KEYS as readonly string[]).includes(k))).toBe(
      true,
    );
  });

  it('lists only what would change, and matches once applied', () => {
    const preset = BUILT_IN_PRESETS[0]!;
    const before = base({ defaultFontSize: 12 });
    const changes = presetChanges(preset, before);
    expect(changes).toContainEqual(['defaultFontSize', 18]);
    expect(presetMatches(preset, before)).toBe(false);
    const after = base({ ...before, ...preset.values });
    expect(presetChanges(preset, after)).toEqual([]);
    expect(presetMatches(preset, after)).toBe(true);
  });

  it('built-in looks set boldness and shadow explicitly', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.values.textStrokePx).toBeDefined();
      expect(preset.values.textShadowLevel).toBeDefined();
    }
  });
});
