// Readalong: Android's home and app-switch gestures start on the bottom edge
// of the screen. A touch that starts there belongs to the system, so the
// reader must not also treat it as "swipe up for the bars" or as a narration
// drag (which re-hid the navigation bar and moved the voice).

/** Height of the bottom gesture strip, in CSS px (Android's is about 24-32dp;
 *  a little more absorbs a finger that starts just above it). */
export const SYSTEM_GESTURE_EDGE_PX = 40;

/** Did a touch with this screen Y start on the system's bottom gesture strip? */
export const startsOnSystemGestureEdge = (
  screenY: number,
  screenHeight = typeof window !== 'undefined' ? window.screen.height : 0,
): boolean => screenHeight > 0 && screenY >= screenHeight - SYSTEM_GESTURE_EDGE_PX;
