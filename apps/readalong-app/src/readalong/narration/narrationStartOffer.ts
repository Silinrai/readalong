// Readalong: a narrated book opened on pages without narration (cover, title
// page, front matter) offers, once, to start the narration where it begins:
// "Narration starts at 38. Inevitability" with a Start button. Nothing moves
// until it is tapped.
import type { BookDoc, TOCItem } from '@/libs/document';

export interface NarrationStartOffer {
  /** Section index where the narration starts. */
  target: number;
  /** That chapter's name from the contents, when it has one. */
  label: string | null;
}

const tocLabelFor = (book: BookDoc, sectionId: string): string | null => {
  const visit = (items: TOCItem[]): string | null => {
    for (const item of items) {
      if (item.href && book.splitTOCHref(item.href)[0] === sectionId)
        return item.label?.trim() || null;
      const found = item.subitems?.length ? visit(item.subitems) : null;
      if (found) return found;
    }
    return null;
  };
  return visit(book.toc ?? []);
};

export const narrationStartOffer = (
  book: BookDoc | null | undefined,
  currentIndex: number,
): NarrationStartOffer | null => {
  const sections = book?.sections ?? [];
  const narrated = (i: number) => !!sections[i]?.mediaOverlay?.href;
  if (!book || narrated(currentIndex)) return null;
  for (let i = currentIndex + 1; i < sections.length; i++) {
    if (narrated(i)) return { target: i, label: tocLabelFor(book, sections[i]!.id) };
  }
  return null;
};
