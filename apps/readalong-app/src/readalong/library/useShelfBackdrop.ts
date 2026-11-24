// Readalong: the Bookshelf look draws a bookcase behind the library: a plank
// under every row of books, and below the last book empty shelves at the row
// spacing down to the bottom of the screen.
//
// Each row draws its own plank (readalong-library.css), because the list also
// holds items that are not rows (the search header, an empty-state line, group
// headers): a backdrop repeating from the first row would cross them. Only the
// empty shelves are a repeating backdrop, and it starts where the list ends.
//
// This measures the row height, where the covers end inside a row, and where
// the list ends, and hands them to readalong-library.css as variables.
import { useEffect } from 'react';
import type { LibraryLook } from '@/types/readalong';

const SCROLLER = '[data-virtuoso-scroller]';
const GRID_ROW = '.bookshelf-items[data-shelf-layout="grid"]';
const VARS = ['--ra-shelf-pitch', '--ra-shelf-plank-y', '--ra-shelf-tail'] as const;

export interface ShelfMetrics {
  pitch: number;
  plankY: number;
  /** Where the empty shelves start (content px), or null: the list goes on. */
  tail: number | null;
}

/** The shelf geometry from measured rects (pure, for tests). */
export const computeShelfMetrics = ({
  scrollerTop,
  scrollTop,
  rowTops,
  rowHeight,
  coverBottom,
  listEnd,
}: {
  scrollerTop: number;
  scrollTop: number;
  rowTops: number[];
  rowHeight: number;
  coverBottom: number | null;
  /** Bottom of the list's last item when it is rendered, else null. */
  listEnd: number | null;
}): ShelfMetrics | null => {
  if (!rowTops.length) return null;
  const pitch = rowTops.length > 1 ? rowTops[1]! - rowTops[0]! : rowHeight;
  if (!(pitch > 0)) return null;
  const plankY = coverBottom === null ? pitch - 24 : coverBottom - rowTops[0]!;
  const tail = listEnd === null ? null : listEnd - scrollerTop + scrollTop;
  return { pitch, plankY, tail };
};

/** The bottom of the list's last item, if it is rendered (virtualised list). */
const listEndOf = (scroller: HTMLElement): number | null => {
  const items = scroller.querySelectorAll<HTMLElement>('[data-index]');
  const last = items[items.length - 1];
  const list = last?.parentElement;
  if (!last || !list) return null;
  // Virtuoso pads the list for the items it has not rendered below.
  if (last.nextElementSibling || (parseFloat(list.style.paddingBottom) || 0) > 0) return null;
  return last.getBoundingClientRect().bottom;
};

export const useShelfBackdrop = (
  pageRef: React.RefObject<HTMLElement | null>,
  look: LibraryLook,
) => {
  useEffect(() => {
    const page = pageRef.current;
    if (!page || look !== 'shelf') return;
    let frame = 0;
    let scroller: HTMLElement | null = null;

    const clear = () => {
      if (!scroller) return;
      for (const name of VARS) scroller.style.removeProperty(name);
      delete scroller.dataset['raShelf'];
    };

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = page.querySelector<HTMLElement>(SCROLLER);
        if (next !== scroller) clear();
        scroller = next;
        if (!scroller) return;
        const rows = [...page.querySelectorAll<HTMLElement>(GRID_ROW)];
        const rects = rows.map((row) => row.getBoundingClientRect());
        const cover = rows[0]?.querySelector('.bookitem-main')?.getBoundingClientRect();
        const metrics = computeShelfMetrics({
          scrollerTop: scroller.getBoundingClientRect().top,
          scrollTop: scroller.scrollTop,
          rowTops: rects.map((r) => r.top),
          rowHeight: rects[0]?.height ?? 0,
          coverBottom: cover ? cover.bottom : null,
          listEnd: listEndOf(scroller),
        });
        if (!metrics) return clear();
        scroller.style.setProperty('--ra-shelf-pitch', `${metrics.pitch}px`);
        scroller.style.setProperty('--ra-shelf-plank-y', `${metrics.plankY}px`);
        // Past the end of the content when the list goes on: no empty shelves.
        scroller.style.setProperty(
          '--ra-shelf-tail',
          metrics.tail === null ? '100%' : `${metrics.tail}px`,
        );
        scroller.dataset['raShelf'] = 'on';
      });
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(page);
    // Rows mount and unmount as the list virtualises, covers load, books
    // are added: re-measure (once per frame at most).
    const mutations = new MutationObserver(measure);
    mutations.observe(page, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      clear();
    };
  }, [pageRef, look]);
};
