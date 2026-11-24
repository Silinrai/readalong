// Readalong: narration and Auto Scroll both move the page along on their own,
// at different paces, so they never run together. Whichever one the reader
// starts (or resumes) wins, and the other pauses: starting narration pauses
// Auto Scroll, and starting or resuming Auto Scroll pauses narration. Neither
// is stopped, so the reader can switch back where they left off.

export type Pacer = 'narration' | 'autoscroll';

export interface PacingState {
  /** Narration is playing (not paused or stopped). */
  narrationPlaying: boolean;
  /** An Auto Scroll session is running (not paused). */
  autoScrollRunning: boolean;
}

/** Which pacer has to pause when `starting` starts, if any. */
export const pacerToPause = (starting: Pacer, state: PacingState): Pacer | null => {
  if (starting === 'narration') return state.autoScrollRunning ? 'autoscroll' : null;
  return state.narrationPlaying ? 'narration' : null;
};
