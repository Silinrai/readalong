import { describe, expect, it } from 'vitest';
import type { BookDoc } from '@/libs/document';
import { narrationStartOffer } from '@/readalong/narration/narrationStartOffer';

const book = (narrated: boolean[]) =>
  ({
    sections: narrated.map((n, i) => ({
      id: `s${i}`,
      mediaOverlay: n ? { href: `s${i}.smil` } : undefined,
    })),
    toc: [
      { label: 'Cover', href: 's0' },
      { label: '38. Inevitability', href: 's2#top' },
      { label: '39. Next', href: 's3' },
    ],
    splitTOCHref: (href: string) => href.split('#'),
  }) as unknown as BookDoc;

describe('narrationStartOffer', () => {
  it('offers the first narrated chapter from unnarrated front matter, by name', () => {
    expect(narrationStartOffer(book([false, false, true, true]), 0)).toEqual({
      target: 2,
      label: '38. Inevitability',
    });
  });

  it('offers nothing where narration already plays, or in a book without it', () => {
    expect(narrationStartOffer(book([false, false, true, true]), 2)).toBeNull();
    expect(narrationStartOffer(book([false, false, false]), 0)).toBeNull();
  });

  it('offers nothing past the last narrated chapter', () => {
    expect(narrationStartOffer(book([true, false, false]), 1)).toBeNull();
  });

  it('falls back to no label when the chapter has no TOC entry', () => {
    expect(narrationStartOffer(book([false, true, false, false]), 0)).toEqual({
      target: 1,
      label: null,
    });
  });
});
