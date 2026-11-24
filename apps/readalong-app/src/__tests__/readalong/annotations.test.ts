// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  canResumeListening,
  listeningLabel,
  makeChapterBookmark,
  makeSentenceBookmark,
} from '@/readalong/annotations/listeningBookmark';
import { filterBookmarks, sortByDate } from '@/readalong/annotations/listing';
import {
  estimatePrintedPage,
  parsePrintedPage,
  printedPageLabel,
} from '@/readalong/annotations/printedPage';
import { findQuote, quoteFromRange } from '@/readalong/annotations/textQuote';
import type { BookConfig, BookNote, BookSearchConfig, ViewSettings } from '@/types/book';
import { deserializeConfig, serializeConfig } from '@/utils/serializer';

// happy-dom's Range moves its start when the end is set in the same text
// node, so tests describe ranges directly: quoteFromRange only reads the
// boundaries, as a browser Range provides them.
const rangeOf = (node: Node, start: number, end: number) =>
  ({
    startContainer: node,
    startOffset: start,
    endContainer: node,
    endOffset: end,
    toString: () => (node.textContent ?? '').slice(start, end),
  }) as unknown as Range;

const doc = (html: string) => {
  const d = document.implementation.createHTMLDocument('t');
  d.body.innerHTML = html;
  return d;
};

describe('text quote anchors', () => {
  it('records the passage with context, and finds the right one of two identical sentences', () => {
    const d = doc(
      '<p>He smiled. It was over.</p><p>Later, he smiled. It was over. Or so he thought.</p>',
    );
    const second = d.querySelectorAll('p')[1]!.firstChild!;
    const text = second.textContent!;
    const at = text.indexOf('It was over.');
    const range = rangeOf(second, at, at + 'It was over.'.length);
    const quote = quoteFromRange(range)!;
    expect(quote.exact).toBe('It was over.');
    expect(quote.suffix.startsWith(' Or so')).toBe(true);
    const flat = d.body.textContent!;
    const match = findQuote(flat, quote)!;
    expect(flat.slice(match.start, match.end)).toBe('It was over.');
    expect(match.start).toBe(flat.lastIndexOf('It was over.'));
  });

  it('finds a passage in the narrated copy, where every sentence is wrapped in a span', () => {
    const original = doc('<p>Jason walked in. The lobby was vast.</p>');
    const narrated = doc(
      '<p><span id="s0001">Jason walked in.</span> <span id="s0002">The lobby was vast.</span></p>',
    );
    const t = original.body.querySelector('p')!.firstChild!;
    const range = rangeOf(t, 17, t.textContent!.length);
    const quote = quoteFromRange(range)!;
    const match = findQuote(narrated.body.textContent!, quote)!;
    expect(narrated.body.textContent!.slice(match.start, match.end)).toBe('The lobby was vast.');
    expect(match.score).toBe(1);
  });

  it('finds a passage in another edition with slightly different wording, and not a different one', () => {
    const quote = {
      exact: 'The young man bowed and led Jason across the lobby',
      prefix: '',
      suffix: '',
    };
    const otherEdition =
      'Earlier text. The young man bowed, then led Jason across the busy lobby. More.';
    const match = findQuote(otherEdition, quote)!;
    expect(match).not.toBeNull();
    expect(otherEdition.slice(match.start, match.end)).toContain('young man bowed');
    expect(findQuote('Nothing like it here at all, not one bit of it.', quote)).toBeNull();
  });
});

describe('printed pages', () => {
  it('estimates from how far into the book, and labels estimates', () => {
    const edition = { firstPage: 1, lastPage: 401 };
    expect(estimatePrintedPage(0.5, edition)).toBe(201);
    expect(estimatePrintedPage(1.4, edition)).toBe(401);
    expect(estimatePrintedPage(0.5, { firstPage: 10, lastPage: 5 })).toBeNull();
    expect(printedPageLabel(201, true)).toBe('~p. 201');
    expect(printedPageLabel(201, false)).toBe('p. 201');
  });

  it('accepts a typed page, clears on empty, ignores nonsense', () => {
    expect(parsePrintedPage('212')).toBe(212);
    expect(parsePrintedPage('  ')).toBeNull();
    expect(parsePrintedPage('p12')).toBeUndefined();
  });
});

const listening = {
  sectionIndex: 4,
  voice: 'media-overlay',
  narrated: true,
  audioHref: 'audio/ch38.mp3',
  seconds: 754.2,
};

describe('bookmarks made while listening', () => {
  it('keep the sentence, chapter, audio position and an estimated printed page', () => {
    const b = makeSentenceBookmark(
      {
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        quote: { exact: 'The lobby was vast.', prefix: 'Jason walked in. ', suffix: '' },
        chapterLabel: '38. Fanboy',
        page: 812,
        listening,
        printedPage: 233,
      },
      1000,
    );
    expect(b).toMatchObject({
      type: 'bookmark',
      bookmarkKind: 'sentence',
      text: 'The lobby was vast.',
      chapterLabel: '38. Fanboy',
      printedPage: 233,
      printedPageEstimated: true,
      createdAt: 1000,
    });
    expect(canResumeListening(b)).toBe(true);
    expect(listeningLabel(listening)).toBe('12:34');
    expect(canResumeListening(makeChapterBookmark('epubcfi(/6/10!/4)', '38. Fanboy'))).toBe(false);
  });

  it('are still there, with everything, after the book is saved and reopened', () => {
    const b = makeSentenceBookmark({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      quote: { exact: 'The lobby was vast.', prefix: '', suffix: '' },
      chapterLabel: '38. Fanboy',
      listening,
    });
    const config: BookConfig = {
      updatedAt: 1,
      booknotes: [b],
      printEdition: { firstPage: 1, lastPage: 401 },
    };
    const global = {} as ViewSettings;
    const search = {} as BookSearchConfig;
    const reopened = deserializeConfig(serializeConfig(config, global, search), global, search);
    expect(reopened.booknotes?.[0]).toEqual(b);
    expect(reopened.printEdition).toEqual({ firstPage: 1, lastPage: 401 });
  });
});

describe('annotation lists', () => {
  const note = (id: string, createdAt: number, kind?: BookNote['bookmarkKind']): BookNote => ({
    id,
    type: 'bookmark',
    cfi: id,
    note: '',
    createdAt,
    updatedAt: createdAt,
    ...(kind ? { bookmarkKind: kind } : {}),
  });

  it('filters bookmarks by kind (old bookmarks count as pages)', () => {
    const notes = [note('a', 1), note('b', 2, 'sentence'), note('c', 3, 'chapter')];
    expect(filterBookmarks(notes, 'page').map((n) => n.id)).toEqual(['a']);
    expect(filterBookmarks(notes, 'sentence').map((n) => n.id)).toEqual(['b']);
    expect(filterBookmarks(notes, 'all')).toHaveLength(3);
  });

  it('sorts by date either way', () => {
    const notes = [note('a', 2), note('b', 3), note('c', 1)];
    expect(sortByDate(notes, 'newest').map((n) => n.id)).toEqual(['b', 'a', 'c']);
    expect(sortByDate(notes, 'oldest').map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });
});
