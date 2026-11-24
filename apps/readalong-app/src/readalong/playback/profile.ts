// Readalong: a book's listening profile — its voice, speeds, pitch, narration
// volume and highlight — kept with the book, over a default for all books.
//
// Readalong already stores view settings per book; what was missing is that
// changing the speed also rewrote the default for every book, and nothing
// showed which of a book's settings were its own. Here the book's values are
// its own until the reader explicitly makes them the default, and "Use the
// defaults" brings a book back in line.
import type { ViewSettings } from '@/types/book';

export const SPEED_PRESETS = [0.75, 0.85, 1.0, 1.1, 1.2, 1.25, 1.5, 1.75, 2.0] as const;
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3.0;

export const PITCH_MIN = 0.5;
export const PITCH_MAX = 1.5;
export const PITCH_STEP = 0.05;

export const VOLUME_MIN = 0.2;
export const VOLUME_MAX = 1.0;

/** The view settings that make up a listening profile. */
export const PROFILE_KEYS = [
  'ttsVoice',
  'ttsUseNarration',
  'ttsRate',
  'ttsNarrationRate',
  'ttsPitch',
  'ttsNarrationVolume',
  'ttsHighlightOptions',
] as const satisfies readonly (keyof ViewSettings)[];

export type ProfileKey = (typeof PROFILE_KEYS)[number];
export type PlaybackProfile = Pick<ViewSettings, ProfileKey>;

export const isPresetSpeed = (rate: number): boolean =>
  SPEED_PRESETS.some((p) => Math.abs(p - rate) < 0.001);

export const clampSpeed = (rate: number): number =>
  Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate)) * 100) / 100;

export const clampPitch = (pitch: number): number =>
  Math.round(Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch)) * 100) / 100;

export const clampVolume = (volume: number): number =>
  Math.round(Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, volume)) * 100) / 100;

export const profileOf = (vs: Partial<ViewSettings>): Partial<PlaybackProfile> => {
  const out: Partial<PlaybackProfile> = {};
  for (const key of PROFILE_KEYS) {
    if (vs[key] !== undefined) (out as Record<string, unknown>)[key] = structuredClone(vs[key]);
  }
  return out;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The profile settings where this book differs from the default. */
export const ownSettings = (
  book: Partial<ViewSettings>,
  defaults: Partial<ViewSettings>,
): ProfileKey[] =>
  PROFILE_KEYS.filter((key) => book[key] !== undefined && !same(book[key], defaults[key]));

export const effectivePitch = (vs: Partial<ViewSettings> | null | undefined): number =>
  clampPitch(vs?.ttsPitch ?? 1);

export const effectiveNarrationVolume = (vs: Partial<ViewSettings> | null | undefined): number =>
  clampVolume(vs?.ttsNarrationVolume ?? 1);
