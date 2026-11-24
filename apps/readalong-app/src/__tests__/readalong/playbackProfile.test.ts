import { describe, expect, it } from 'vitest';
import {
  SPEED_PRESETS,
  clampPitch,
  clampSpeed,
  effectiveNarrationVolume,
  effectivePitch,
  isPresetSpeed,
  ownSettings,
  profileOf,
} from '@/readalong/playback/profile';
import type { ViewSettings } from '@/types/book';

describe('listening profile', () => {
  it('offers the asked-for speed presets, custom speeds stay possible', () => {
    expect([...SPEED_PRESETS]).toEqual([0.75, 0.85, 1.0, 1.1, 1.2, 1.25, 1.5, 1.75, 2.0]);
    expect(isPresetSpeed(1.25)).toBe(true);
    expect(isPresetSpeed(1.35)).toBe(false);
    expect(clampSpeed(9)).toBe(3);
    expect(clampSpeed(1.234)).toBe(1.23);
  });

  it('lists only the settings where a book differs from the default', () => {
    const defaults = {
      ttsRate: 1,
      ttsVoice: 'aria',
      ttsHighlightOptions: { style: 'highlight', color: '#3b82f6' },
    } as Partial<ViewSettings>;
    const book = {
      ...defaults,
      ttsRate: 1.25,
      ttsHighlightOptions: { style: 'underline', color: '#3b82f6' },
    } as Partial<ViewSettings>;
    expect(ownSettings(book, defaults)).toEqual(['ttsRate', 'ttsHighlightOptions']);
    expect(ownSettings(defaults, defaults)).toEqual([]);
  });

  it('keeps two books apart: each profile is a copy, not shared state', () => {
    const a = {
      ttsRate: 1.5,
      ttsVoice: 'guy',
      ttsHighlightOptions: { style: 'highlight', color: 'red' },
    } as Partial<ViewSettings>;
    const copy = profileOf(a);
    (copy.ttsHighlightOptions as { color: string }).color = 'blue';
    expect(a.ttsHighlightOptions?.color).toBe('red');
    expect(copy).toMatchObject({ ttsRate: 1.5, ttsVoice: 'guy' });
  });

  it('falls back to the voice pitch and full volume, within safe limits', () => {
    expect(effectivePitch(undefined)).toBe(1);
    expect(effectivePitch({ ttsPitch: 4 } as Partial<ViewSettings>)).toBe(1.5);
    expect(clampPitch(0.1)).toBe(0.5);
    expect(effectiveNarrationVolume({} as Partial<ViewSettings>)).toBe(1);
    expect(effectiveNarrationVolume({ ttsNarrationVolume: 0 } as Partial<ViewSettings>)).toBe(0.2);
  });
});
