// Readalong: gestures that steer narration while it runs.
//
// - Drag up or down on a page: an outline sits on the narrated line under the
//   finger and follows it, on whichever page of a spread was touched; letting
//   go plays from that line.
// - Swipe sideways: narration off; the page turns as usual.
// Taps are not narration gestures: the middle of the page shows the menu and
// the sides turn the page (Readalong's zones, or the custom tap zones).

// A vertical swipe must travel at least this far, and mostly vertically.
export const NARRATION_SWIPE_MIN_PX = 40;
const NARRATION_SWIPE_DOMINANCE = 1.5;

export type NarrationSwipe = 'next' | 'prev' | 'turn' | null;

// Classify a finished one-finger swipe. 'turn' is a horizontal swipe, which the
// paginator turns the page for on its own; it is reported so narration can
// follow it to the new page.
export const classifyNarrationSwipe = (deltaX: number, deltaY: number): NarrationSwipe => {
  const ax = Math.abs(deltaX);
  const ay = Math.abs(deltaY);
  if (ay >= NARRATION_SWIPE_MIN_PX && ay > ax * NARRATION_SWIPE_DOMINANCE) {
    return deltaY < 0 ? 'next' : 'prev';
  }
  if (ax >= NARRATION_SWIPE_MIN_PX && ax > ay * NARRATION_SWIPE_DOMINANCE) return 'turn';
  return null;
};

// A touch becomes a line drag once it has moved this far, mostly vertically.
export const NARRATION_DRAG_START_PX = 20;

/** Whether a touch that moved (deltaX, deltaY) so far is a vertical line drag. */
export const isNarrationDrag = (deltaX: number, deltaY: number): boolean => {
  const ay = Math.abs(deltaY);
  return ay >= NARRATION_DRAG_START_PX && ay > Math.abs(deltaX) * NARRATION_SWIPE_DOMINANCE;
};

interface RenderedContent {
  doc: Document;
  index?: number;
}

// Is the point on a laid-out line of the text node, not in the gap beside or
// below it?
const pointOnText = (node: Node, x: number, y: number): boolean => {
  const doc = node.ownerDocument;
  if (!doc) return false;
  const range = doc.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects()).some(
    (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
  );
};

const caretRangeAt = (doc: Document, x: number, y: number): Range | null => {
  const withPosition = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (withPosition.caretPositionFromPoint) {
    const position = withPosition.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = doc.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return doc.caretRangeFromPoint?.(x, y) ?? null;
};

// The text position under a point given in top-window coordinates, in
// whichever rendered section document is under it. Null over margins, images
// and the space between lines.
export const textRangeAtWindowPoint = (
  contents: RenderedContent[],
  windowX: number,
  windowY: number,
): { range: Range; index: number } | null => {
  for (const { doc, index } of contents) {
    const frame = doc.defaultView?.frameElement;
    if (!frame || index === undefined) continue;
    const rect = frame.getBoundingClientRect();
    if (
      windowX < rect.left ||
      windowX > rect.right ||
      windowY < rect.top ||
      windowY > rect.bottom
    ) {
      continue;
    }
    const { clientWidth, clientHeight } = doc.documentElement;
    const scaleX = clientWidth ? rect.width / clientWidth : 1;
    const scaleY = clientHeight ? rect.height / clientHeight : 1;
    const x = (windowX - rect.left) / (scaleX || 1);
    const y = (windowY - rect.top) / (scaleY || 1);
    const range = caretRangeAt(doc, x, y);
    const node = range?.startContainer;
    if (!range || !node || node.nodeType !== Node.TEXT_NODE) return null;
    if (!node.textContent?.trim() || !pointOnText(node, x, y)) return null;
    return { range, index };
  }
  return null;
};

// Like textRangeAtWindowPoint, but in the gap between lines or beside a line
// it takes the nearest text position, so a drag never loses the line it is on.
export const textRangeNearWindowPoint = (
  contents: RenderedContent[],
  windowX: number,
  windowY: number,
): { range: Range; index: number } | null => {
  for (const { doc, index } of contents) {
    const frame = doc.defaultView?.frameElement;
    if (!frame || index === undefined) continue;
    const rect = frame.getBoundingClientRect();
    if (
      windowX < rect.left ||
      windowX > rect.right ||
      windowY < rect.top ||
      windowY > rect.bottom
    ) {
      continue;
    }
    const { clientWidth, clientHeight } = doc.documentElement;
    const scaleX = clientWidth ? rect.width / clientWidth : 1;
    const scaleY = clientHeight ? rect.height / clientHeight : 1;
    const x = (windowX - rect.left) / (scaleX || 1);
    const y = (windowY - rect.top) / (scaleY || 1);
    const range = caretRangeAt(doc, x, y);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    return { range, index };
  }
  return null;
};

/**
 * The narrated sentence at a text position: the one containing it, else the
 * next one after it, else the last before it. `sentences` must be in text
 * order. Null when none share the position's document.
 */
export const narratedRangeAt = (sentences: Range[], point: Range): Range | null => {
  let before: Range | null = null;
  for (const sentence of sentences) {
    try {
      // -1: the point is before this sentence, 0: inside it, 1: after it.
      if (sentence.comparePoint(point.startContainer, point.startOffset) <= 0) return sentence;
      before = sentence;
    } catch {
      // WrongDocumentError: another document.
    }
  }
  return before;
};

// The earliest of `ranges` (in text order) that begins inside `visible`, or
// null. Ranges in another document than `visible` never match.
export const firstRangeStartingIn = (ranges: Range[], visible: Range): Range | null => {
  let first: Range | null = null;
  for (const range of ranges) {
    try {
      if (visible.comparePoint(range.startContainer, range.startOffset) !== 0) continue;
      if (!first || range.compareBoundaryPoints(Range.START_TO_START, first) < 0) first = range;
    } catch {
      // WrongDocumentError: not on this page.
    }
  }
  return first;
};
