// Readalong: the typeface choice in Visual Options. Readalong keeps a serif and a
// sans-serif font plus which of the two is the default; picking one here sets
// the matching font and makes its family the default. The full font list
// (system and custom fonts) stays in Settings > Font.
import type { ViewSettings } from '@/types/book';
import { NON_FREE_FONTS, SANS_SERIF_FONTS, SERIF_FONTS } from '@/services/constants';

const SERIF = SERIF_FONTS.filter((font) => !NON_FREE_FONTS.includes(font));
const SANS = SANS_SERIF_FONTS.filter((font) => font !== 'Helvetica');

export const TYPEFACES: string[] = [...SERIF, ...SANS];

export const currentTypeface = (viewSettings: ViewSettings): string =>
  viewSettings.defaultFont === 'Sans-serif' ? viewSettings.sansSerifFont : viewSettings.serifFont;

export const typefacePatch = (font: string): Partial<ViewSettings> =>
  SERIF.includes(font)
    ? { defaultFont: 'Serif', serifFont: font }
    : { defaultFont: 'Sans-serif', sansSerifFont: font };
