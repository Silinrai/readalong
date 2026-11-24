// Readalong: Moon+ Reader style tap zones. The page is split into a 3x3 grid
// and each cell runs an action. `null` (the default) keeps Readalong's own
// zones: left and right halves turn the page, the middle toggles the menu.

import type { TapZoneAction } from '@/types/readalong';

export type { TapZoneAction };

export const TAP_ZONE_ACTIONS: TapZoneAction[] = [
  'none',
  'prev',
  'next',
  'menu',
  'playPause',
  'prevLine',
  'nextLine',
  'bookmark',
];

// What the editor offers. No "previous/next line": during narration lines are
// reached by dragging, and a tap that moved the voice was too easy to hit by
// accident. Grids saved with those actions still work.
export const TAP_ZONE_EDITOR_ACTIONS: TapZoneAction[] = [
  'none',
  'prev',
  'next',
  'menu',
  'playPause',
  'bookmark',
];

// Row by row, top-left first. The starting grid of the editor.
export const DEFAULT_TAP_ZONES: TapZoneAction[] = [
  'prev',
  'menu',
  'next',
  'prev',
  'menu',
  'next',
  'prev',
  'playPause',
  'next',
];

export const isTapZoneGrid = (zones: unknown): zones is TapZoneAction[] =>
  Array.isArray(zones) &&
  zones.length === 9 &&
  zones.every((zone) => TAP_ZONE_ACTIONS.includes(zone as TapZoneAction));

/** The grid cell (0..8, row by row) under a point, or -1 outside the rect. */
export const tapZoneIndex = (
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): number => {
  if (rect.width <= 0 || rect.height <= 0) return -1;
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return -1;
  const column = Math.min(2, Math.floor(fx * 3));
  const row = Math.min(2, Math.floor(fy * 3));
  return row * 3 + column;
};

/**
 * The rect of the page under `x`: the whole rect for one page, or the left or
 * right half of a two-page spread, so each page gets its own 3x3 grid.
 */
export const tapZonePage = (
  x: number,
  rect: { left: number; top: number; width: number; height: number },
  columns = 1,
): { page: 0 | 1; rect: { left: number; top: number; width: number; height: number } } => {
  if (columns < 2) return { page: 0, rect };
  const half = rect.width / 2;
  const page = x < rect.left + half ? 0 : 1;
  return { page, rect: { ...rect, left: rect.left + page * half, width: half } };
};

/**
 * The action for a point, or null when custom zones are off. On a two-page
 * spread (`columns` 2) each page has its own grid: `rightZones` on the right
 * page when set, otherwise the same grid as the left.
 */
export const tapZoneActionAt = (
  zones: unknown,
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  { columns = 1, rightZones }: { columns?: number; rightZones?: unknown } = {},
): TapZoneAction | null => {
  if (!isTapZoneGrid(zones)) return null;
  const { page, rect: pageRect } = tapZonePage(x, rect, columns);
  const grid = page === 1 && isTapZoneGrid(rightZones) ? rightZones : zones;
  const index = tapZoneIndex(x, y, pageRect);
  return index < 0 ? null : grid[index]!;
};
