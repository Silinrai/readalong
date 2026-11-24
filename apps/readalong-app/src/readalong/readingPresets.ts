// Readalong: saved "looks" for the page, like Moon+ Reader's visual options.
// A preset is a named set of view settings; applying it writes each one.
import type { ViewSettings } from '@/types/book';
import type { ReadingPreset } from '@/types/readalong';
import { stubTranslation as _ } from '@/utils/misc';

export const PRESET_KEYS = [
  'defaultFont',
  'defaultFontSize',
  'fontWeight',
  'textStrokePx',
  'textShadowLevel',
  'lineHeight',
  'paragraphMargin',
  'textIndent',
  'wordSpacing',
  'letterSpacing',
  'fullJustification',
  'hyphenation',
  'marginTopPx',
  'marginBottomPx',
  'marginLeftPx',
  'marginRightPx',
  'gapPercent',
  'backgroundTextureId',
  'backgroundTextureIdDark',
  'backgroundOpacity',
  'animated',
  'pageTurnStyle',
] as const satisfies readonly (keyof ViewSettings)[];

export type PresetKey = (typeof PRESET_KEYS)[number];
export type PresetValues = Partial<Pick<ViewSettings, PresetKey>>;

export type { ReadingPreset };

export const BUILT_IN_PRESETS: ReadingPreset[] = [
  {
    id: 'ra-old-paper',
    name: _('Old Paper'),
    builtIn: true,
    values: {
      defaultFont: 'Serif',
      defaultFontSize: 18,
      fontWeight: 400,
      lineHeight: 1.7,
      textStrokePx: 0,
      textShadowLevel: 0,
      backgroundTextureId: 'ra-old-paper',
      backgroundTextureIdDark: 'ra-night-paper',
      backgroundOpacity: 0.8,
      animated: true,
      pageTurnStyle: 'curl',
    },
  },
  {
    id: 'ra-night-leather',
    name: _('Night Leather'),
    builtIn: true,
    values: {
      defaultFont: 'Serif',
      defaultFontSize: 18,
      fontWeight: 400,
      lineHeight: 1.7,
      textStrokePx: 0,
      textShadowLevel: 1,
      backgroundTextureId: 'ra-linen',
      backgroundTextureIdDark: 'ra-leather',
      backgroundOpacity: 0.7,
      animated: true,
      pageTurnStyle: 'slide',
    },
  },
  {
    id: 'ra-large-print',
    name: _('Large Print'),
    builtIn: true,
    values: {
      defaultFont: 'Sans-serif',
      defaultFontSize: 24,
      fontWeight: 500,
      textStrokePx: 0.2,
      textShadowLevel: 0,
      lineHeight: 1.8,
      animated: true,
      pageTurnStyle: 'push',
    },
  },
];

/** The preset-able part of the current settings. */
export const capturePreset = (viewSettings: ViewSettings): PresetValues => {
  const values: Record<string, unknown> = {};
  for (const key of PRESET_KEYS) {
    if (viewSettings[key] !== undefined) values[key] = viewSettings[key];
  }
  return values as PresetValues;
};

/** The settings a preset would change, as [key, value] pairs. */
export const presetChanges = (
  preset: ReadingPreset,
  viewSettings: ViewSettings,
): [PresetKey, PresetValues[PresetKey]][] =>
  PRESET_KEYS.filter(
    (key) => preset.values[key] !== undefined && preset.values[key] !== viewSettings[key],
  ).map((key) => [key, preset.values[key]]);

/** Is this preset what the page looks like now? */
export const presetMatches = (preset: ReadingPreset, viewSettings: ViewSettings): boolean =>
  presetChanges(preset, viewSettings).length === 0;
