// Readalong: the sleep timer lowers the narration over its last 30 seconds
// instead of cutting it off mid-word.
export const SLEEP_FADE_MS = 30_000;
export const SLEEP_FADE_STEP_MS = 1_000;

/** Volume (0..1) with `msLeft` until the timer fires. */
export const sleepFadeVolume = (msLeft: number, fadeMs = SLEEP_FADE_MS): number =>
  Math.min(1, Math.max(0, msLeft / fadeMs));
