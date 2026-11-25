// Readalong: is any of a range on the page now showing? `visible` is the
// reader's visible range (progress.range). Missing or cross-document ranges
// count as not visible, so the reader moves to the range as before.
export const isOnVisiblePage = (range: Range, visible: Range | undefined): boolean => {
  if (!visible) return false;
  try {
    const ahead = range.compareBoundaryPoints(Range.END_TO_START, visible) > 0;
    const behind = range.compareBoundaryPoints(Range.START_TO_END, visible) < 0;
    return !ahead && !behind;
  } catch {
    return false;
  }
};
