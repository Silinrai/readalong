// Readalong: the page in a printed copy of the book. Editions differ in
// pagination, so a page number is either typed by the reader (exact) or
// estimated from how far into the book the passage is, and shown as such.

/** The printed edition the reader owns, kept with the book. */
export interface PrintEdition {
  /** Pages of story in the printed book: first and last page number. */
  firstPage: number;
  lastPage: number;
  publisher?: string;
  isbn?: string;
}

/**
 * Estimated printed page for a passage `fraction` (0..1) of the way through
 * the ebook. Only an estimate: front matter, illustrations and chapter breaks
 * differ between editions.
 */
export const estimatePrintedPage = (fraction: number, edition: PrintEdition): number | null => {
  const { firstPage, lastPage } = edition;
  if (!Number.isFinite(fraction) || lastPage <= firstPage) return null;
  const f = Math.min(1, Math.max(0, fraction));
  return Math.round(firstPage + f * (lastPage - firstPage));
};

/** "p. 212" or "~p. 212" for an estimate. */
export const printedPageLabel = (page: number | null | undefined, estimated?: boolean): string =>
  page == null ? '' : `${estimated ? '~' : ''}p. ${page}`;

/** A typed page number: digits only, or null to clear. */
export const parsePrintedPage = (input: string): number | null | undefined => {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d{1,5}$/.test(s)) return undefined; // invalid: keep what was there
  return parseInt(s, 10);
};
