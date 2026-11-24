// Readalong: when an Android foldable's resize should keep the current pose.
// The soft keyboard changes only the window's height, so while a text field has
// focus a height-only resize keeps the pose. Folding or unfolding changes the
// width and always re-reads the pose, keyboard or not (QA S-4).
export const shouldHoldPose = ({
  editing,
  lastWidth,
  width,
}: {
  editing: boolean;
  lastWidth: number;
  width: number;
}): boolean => editing && width === lastWidth;

/** Whether a text field has focus (the soft keyboard is likely up). */
export const isEditingText = (): boolean => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};
