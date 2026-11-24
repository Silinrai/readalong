import { describe, expect, it } from 'vitest';
import { activeTTSRate, playsNarration } from '@/readalong/narration/narrationRate';
import { MEDIA_OVERLAY_CLIENT_NAME } from '@/services/tts/mediaOverlay';

describe('activeTTSRate', () => {
  it('narration uses the book narration speed, voices the TTS speed', () => {
    const vs = { ttsRate: 1.3, ttsNarrationRate: 0.9 };
    expect(activeTTSRate(vs, true)).toBe(0.9);
    expect(activeTTSRate(vs, false)).toBe(1.3);
  });

  it('narration plays at 1x until a speed is chosen for the book', () => {
    expect(activeTTSRate({ ttsRate: 1.3 }, true)).toBe(1);
  });

  it('tells the narration client from a synthetic one', () => {
    expect(playsNarration({ ttsClient: { name: MEDIA_OVERLAY_CLIENT_NAME } })).toBe(true);
    expect(playsNarration({ ttsClient: { name: 'edge-tts' } })).toBe(false);
    expect(playsNarration({})).toBe(false);
  });
});
