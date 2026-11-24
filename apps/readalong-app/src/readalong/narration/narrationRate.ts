// Readalong: a book's own narration keeps its own speed, remembered per book
// (`ttsNarrationRate`), apart from the synthetic voices' speed (`ttsRate`,
// global as in Readalong). A narrator at 1.0x and a TTS voice at 1.3x is the
// usual pair, and changing one no longer changes the other.
import type { ViewSettings } from '@/types/book';
import { MEDIA_OVERLAY_CLIENT_NAME } from '@/services/tts/mediaOverlay';

type RateSettings = Pick<ViewSettings, 'ttsRate'> & { ttsNarrationRate?: number };

export const activeTTSRate = (
  viewSettings: Partial<RateSettings> | null | undefined,
  narrating: boolean,
): number => (narrating ? (viewSettings?.ttsNarrationRate ?? 1) : (viewSettings?.ttsRate ?? 1));

/** Whether a controller is playing the book's recorded narration. */
export const playsNarration = (controller: { ttsClient?: { name: string } }): boolean =>
  controller.ttsClient?.name === MEDIA_OVERLAY_CLIENT_NAME;
