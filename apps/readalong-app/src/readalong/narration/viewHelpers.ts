// Readalong: small view checks shared by the narration hooks. Mirrors the
// private helpers of the same names in useTTSControl.

/** A note editor has focus; the view must not move under it (#6837). */
export const isTypingNote = () => !!document.activeElement?.hasAttribute('data-note-editor');

/** The range has a box on the page (hidden text is read aloud but not shown). */
export const isRendered = (range: Range) =>
  Array.from(range.getClientRects()).some(
    (r) => r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0,
  );

/** Some page document has a live text selection. */
export const hasTextSelection = (contents: { doc: Document }[]) =>
  contents.some(({ doc }) => (doc.getSelection()?.toString().length ?? 0) > 0);
