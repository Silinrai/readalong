// Readalong: which margin setting a page uses for each side. Readalong keeps two
// sets: the full margins (while the header or footer shows) and the compact
// ones (when they are hidden); see getViewInsets in utils/insets.ts. The
// margin sliders change whichever set is in effect, so what you drag is what
// moves.
import type { ViewSettings } from '@/types/book';

export type MarginSide = 'top' | 'bottom' | 'left' | 'right';
export type MarginKey =
  | 'marginTopPx'
  | 'marginBottomPx'
  | 'marginLeftPx'
  | 'marginRightPx'
  | 'compactMarginTopPx'
  | 'compactMarginBottomPx'
  | 'compactMarginLeftPx'
  | 'compactMarginRightPx';

export const marginFields = (viewSettings: ViewSettings): Record<MarginSide, MarginKey> => {
  const vertical = !!viewSettings.vertical || !!viewSettings.writingMode?.includes('vertical');
  const header = !!viewSettings.showHeader;
  const footer = !!viewSettings.showFooter;
  return {
    top: header && !vertical ? 'marginTopPx' : 'compactMarginTopPx',
    bottom: footer && !vertical ? 'marginBottomPx' : 'compactMarginBottomPx',
    left: footer && vertical ? 'marginLeftPx' : 'compactMarginLeftPx',
    right: header && vertical ? 'marginRightPx' : 'compactMarginRightPx',
  };
};

const OPPOSITE: Record<MarginSide, MarginSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** The current value of a side, reading the old shared margin where it applies. */
export const marginValue = (viewSettings: ViewSettings, side: MarginSide): number => {
  const key = marginFields(viewSettings)[side];
  if (key === 'marginTopPx' && viewSettings.marginPx) return viewSettings.marginPx;
  if (key === 'compactMarginTopPx' && viewSettings.compactMarginPx) {
    return viewSettings.compactMarginPx;
  }
  return Number(viewSettings[key]) || 0;
};

/**
 * The settings to change for one side (and its opposite when `linked`). The
 * deprecated shared margin is cleared when the top margin it stood for changes.
 */
export const marginPatch = (
  viewSettings: ViewSettings,
  side: MarginSide,
  value: number,
  linked: boolean,
): Partial<ViewSettings> => {
  const fields = marginFields(viewSettings);
  const patch: Partial<ViewSettings> = { [fields[side]]: value };
  if (linked) patch[fields[OPPOSITE[side]]] = value;
  for (const key of Object.keys(patch)) {
    if (key === 'marginTopPx' && viewSettings.marginPx !== undefined) patch.marginPx = undefined;
    if (key === 'compactMarginTopPx' && viewSettings.compactMarginPx !== undefined) {
      patch.compactMarginPx = undefined;
    }
  }
  return patch;
};
