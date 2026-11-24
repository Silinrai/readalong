import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import { currentTypeface, typefacePatch, TYPEFACES } from '@/readalong/visual/typeface';

describe('typeface (Visual Options)', () => {
  it('offers the bundled serif and sans fonts, not the non-free ones', () => {
    expect(TYPEFACES).toContain('Literata');
    expect(TYPEFACES).toContain('Roboto');
    expect(TYPEFACES).not.toContain('Georgia');
  });
  it('reads the font in use from the default family', () => {
    const vs = {
      defaultFont: 'Serif',
      serifFont: 'Bitter',
      sansSerifFont: 'Roboto',
    } as ViewSettings;
    expect(currentTypeface(vs)).toBe('Bitter');
    expect(currentTypeface({ ...vs, defaultFont: 'Sans-serif' } as ViewSettings)).toBe('Roboto');
  });
  it('picking a serif sets the serif font and switches to serif; a sans likewise', () => {
    expect(typefacePatch('Literata')).toEqual({ defaultFont: 'Serif', serifFont: 'Literata' });
    expect(typefacePatch('Open Sans')).toEqual({
      defaultFont: 'Sans-serif',
      sansSerifFont: 'Open Sans',
    });
  });
});
