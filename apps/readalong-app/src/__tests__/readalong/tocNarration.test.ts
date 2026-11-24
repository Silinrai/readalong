import { describe, expect, it } from 'vitest';
import type { BookDoc, TOCItem } from '@/libs/document';
import { getNarratedTocHrefs } from '@/readalong/narration/tocNarration';

const toc = (hrefs: string[], subitems?: TOCItem[]): TOCItem[] =>
  hrefs.map((href, id) => ({
    id,
    label: href,
    href,
    index: 0,
    subitems: id === 0 ? subitems : undefined,
  }));

const book = (sections: Array<[string, boolean]>, items: TOCItem[]): BookDoc =>
  ({
    sections: sections.map(([id, narrated]) => ({
      id,
      mediaOverlay: narrated ? { href: `${id}.smil` } : undefined,
    })),
    toc: items,
    splitTOCHref: (href: string) => href.split('#'),
  }) as unknown as BookDoc;

describe('getNarratedTocHrefs (TOC narration marks)', () => {
  it('marks the narrated chapters of a partly narrated book', () => {
    const items = toc(['c1.xhtml', 'c2.xhtml#start', 'c3.xhtml']);
    const result = getNarratedTocHrefs(
      book(
        [
          ['c1.xhtml', false],
          ['c2.xhtml', true],
          ['c3.xhtml', true],
        ],
        items,
      ),
    );
    expect(result && [...result]).toEqual(['c2.xhtml#start', 'c3.xhtml']);
  });

  it('includes nested entries', () => {
    const nested = toc(['c3.xhtml'])[0]!;
    const items = toc(['c1.xhtml', 'c2.xhtml'], [nested]);
    const result = getNarratedTocHrefs(
      book(
        [
          ['c1.xhtml', false],
          ['c2.xhtml', false],
          ['c3.xhtml', true],
        ],
        items,
      ),
    );
    expect(result && [...result]).toEqual(['c3.xhtml']);
  });

  it('shows no marks when every chapter is narrated (they would be noise)', () => {
    const items = toc(['c1.xhtml', 'c2.xhtml']);
    expect(
      getNarratedTocHrefs(
        book(
          [
            ['c1.xhtml', true],
            ['c2.xhtml', true],
          ],
          items,
        ),
      ),
    ).toBeNull();
  });

  it('shows no marks for a book without narration', () => {
    const items = toc(['c1.xhtml']);
    expect(getNarratedTocHrefs(book([['c1.xhtml', false]], items))).toBeNull();
  });
});
