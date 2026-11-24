// Readalong: which table-of-contents entries lead to a chapter with the book's
// own narration (EPUB 3 Media Overlays), for the headphone marks in the TOC.
import type { BookDoc, TOCItem } from '@/libs/document';

/**
 * The hrefs of TOC entries whose section is narrated. Null when there is
 * nothing worth marking: a book without narration, or one where every entry is
 * narrated (a mark on every row tells the reader nothing).
 */
export const getNarratedTocHrefs = (book: BookDoc | null | undefined): Set<string> | null => {
  if (!book?.toc?.length || !book.sections?.length) return null;
  const narratedIds = new Set(
    book.sections.filter((section) => section.mediaOverlay?.href).map((section) => section.id),
  );
  if (!narratedIds.size) return null;

  const narrated = new Set<string>();
  let total = 0;
  const visit = (items: TOCItem[]) => {
    for (const item of items) {
      if (item.href) {
        total++;
        const [sectionId] = book.splitTOCHref(item.href);
        if (typeof sectionId === 'string' && narratedIds.has(sectionId)) narrated.add(item.href);
      }
      if (item.subitems?.length) visit(item.subitems);
    }
  };
  visit(book.toc);
  if (!narrated.size || narrated.size === total) return null;
  return narrated;
};
