// Readalong: a passage remembered as its own words plus a little of what
// comes before and after (the W3C TextQuoteSelector), so it can be found again
// where a CFI no longer points: the narrated copy of the book (its sentences
// are wrapped in spans, which changes every CFI), another edition, or a
// printed book whose wording differs slightly.
import type { TextQuote } from '@/types/book';

export const QUOTE_CONTEXT = 32;

const squash = (s: string) => s.replace(/\s+/g, ' ');

/** The text before, inside and after a range, read from the text nodes
 *  themselves (Range.toString isn't reliable in every DOM). */
const splitText = (range: Range): [string, string, string] | null => {
  const doc = range.startContainer.ownerDocument;
  const root = doc?.body;
  if (!doc || !root) return null;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  // A boundary in an element points between its children: map it to text.
  const pos = (container: Node, offset: number): { node: Node | null; offset: number } => {
    if (container.nodeType === 3) return { node: container, offset };
    const child = container.childNodes[offset];
    return { node: child ?? null, offset: 0 };
  };
  const start = pos(range.startContainer, range.startOffset);
  const end = pos(range.endContainer, range.endOffset);
  let before = '';
  let inside = '';
  let after = '';
  let phase: 0 | 1 | 2 = 0;
  const reached = (node: Node, target: Node | null) =>
    !!target && (node === target || (target.nodeType !== 3 && target.contains(node)));
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (phase === 0 && reached(node, start.node)) {
      const cut = node === start.node ? start.offset : 0;
      before += text.slice(0, cut);
      phase = 1;
      if (reached(node, end.node) && node === end.node) {
        inside += text.slice(cut, end.offset);
        after += text.slice(end.offset);
        phase = 2;
        continue;
      }
      inside += text.slice(cut);
      continue;
    }
    if (phase === 1 && reached(node, end.node)) {
      const cut = node === end.node ? end.offset : 0;
      inside += text.slice(0, cut);
      after += text.slice(cut);
      phase = 2;
      continue;
    }
    if (phase === 0) before += text;
    else if (phase === 1) inside += text;
    else after += text;
  }
  return [before, inside, after];
};

/** Quote from a range: its text, with context from the same document. */
export const quoteFromRange = (range: Range, context = QUOTE_CONTEXT): TextQuote | null => {
  const parts = splitText(range);
  const exact = squash(parts ? parts[1] : range.toString()).trim();
  if (!exact) return null;
  if (!parts) return { exact, prefix: '', suffix: '' };
  return {
    exact,
    prefix: squash(parts[0]).slice(-context).trimStart(),
    suffix: squash(parts[2]).slice(0, context).trimEnd(),
  };
};

/** Words lower-cased, punctuation dropped: what's compared across editions. */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);

export interface QuoteMatch {
  /** Character offsets of the passage in `text`. */
  start: number;
  end: number;
  /** 1 = word for word with matching context; lower = a looser match. */
  score: number;
}

/**
 * Find a quote in a document's text. Exact matches are ranked by how well
 * their context agrees (the same sentence can occur twice). When the wording
 * differs a little (another edition), the window of the same number of words
 * sharing the most words is taken, if at least `minScore` of them agree.
 */
export const findQuote = (text: string, quote: TextQuote, minScore = 0.75): QuoteMatch | null => {
  const flat = squash(text);
  const candidates: QuoteMatch[] = [];
  for (let at = flat.indexOf(quote.exact); at >= 0; at = flat.indexOf(quote.exact, at + 1)) {
    // Context compared without the spaces at its edges: "in. " and "in." agree.
    const prefix = quote.prefix.trim();
    const suffix = quote.suffix.trim();
    const pre = flat.slice(Math.max(0, at - quote.prefix.length - 2), at).trimEnd();
    const post = flat
      .slice(at + quote.exact.length, at + quote.exact.length + quote.suffix.length + 2)
      .trimStart();
    const ctx =
      (prefix && pre.endsWith(prefix) ? 0.5 : 0) + (suffix && post.startsWith(suffix) ? 0.5 : 0);
    // Full marks when all the context there is agrees (a passage at the very
    // start or end of a document has context on one side only).
    const sides = (prefix ? 1 : 0) + (suffix ? 1 : 0);
    const score = sides ? 0.5 + (ctx * 2 * 0.5) / sides : 1;
    candidates.push({ start: at, end: at + quote.exact.length, score: Math.min(1, score) });
  }
  if (candidates.length) return candidates.sort((a, b) => b.score - a.score)[0]!;

  // Fuzzy: compare word windows.
  const want = words(quote.exact);
  if (!want.length) return null;
  const tokens = [...flat.matchAll(/[\p{L}\p{N}’']+/gu)];
  const wantSet = new Map<string, number>();
  for (const w of want) wantSet.set(w, (wantSet.get(w) ?? 0) + 1);
  let best: QuoteMatch | null = null;
  for (let i = 0; i + want.length <= tokens.length; i++) {
    const have = new Map(wantSet);
    let hits = 0;
    for (let j = 0; j < want.length; j++) {
      const w = tokens[i + j]![0].toLowerCase().replace(/’/g, "'");
      const n = have.get(w) ?? 0;
      if (n > 0) {
        hits += 1;
        have.set(w, n - 1);
      }
    }
    const score = (hits / want.length) * 0.9;
    if (score >= minScore * 0.9 && (!best || score > best.score)) {
      const first = tokens[i]!;
      const last = tokens[i + want.length - 1]!;
      best = { start: first.index!, end: last.index! + last[0].length, score };
    }
  }
  return best;
};
