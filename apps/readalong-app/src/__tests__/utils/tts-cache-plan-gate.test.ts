// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { TTS_CACHE_REQUIRES_PREMIUM, isTTSCacheAllowed, isTTSCacheInPlan } from '@/utils/access';

// These tests cover upstream features and paid-plan gates that Readalong
// hides or opens up (readalong/features.ts, readalong/upstream.ts); run them
// the upstream way.
vi.mock('@/readalong/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/readalong/features')>()),
  SHOW_TRANSLATION: true,
  SHOW_WEB_IMPORTS: true,
  SHOW_INTEGRATIONS: true,
  SHOW_DESKTOP_CONTROLS: true,
}));
vi.mock('@/readalong/upstream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/readalong/upstream')>()),
  UPSTREAM_ONLINE: true,
  UPSTREAM_TELEMETRY: true,
}));

describe('isTTSCacheInPlan', () => {
  test('any paid plan can use the offline TTS audio cache', () => {
    expect(isTTSCacheInPlan('plus', false)).toBe(true);
    expect(isTTSCacheInPlan('pro', false)).toBe(true);
    // A storage-only buyer reports `purchase` without being entitled.
    expect(isTTSCacheInPlan('purchase', false)).toBe(false);
  });

  test('free plan cannot', () => {
    expect(isTTSCacheInPlan('free', false)).toBe(false);
  });
});

describe('isTTSCacheAllowed (premium paywall)', () => {
  test('downloading TTS audio for offline playback requires a paid plan', () => {
    expect(TTS_CACHE_REQUIRES_PREMIUM).toBe(true);
    expect(isTTSCacheAllowed('free', false)).toBe(false);
    expect(isTTSCacheAllowed('plus', false)).toBe(true);
    expect(isTTSCacheAllowed('pro', false)).toBe(true);
    expect(isTTSCacheAllowed('purchase', false)).toBe(false);
  });
});

// Premium is now the plan OR an outright Full Customization purchase.
describe('isTTSCacheAllowed — customization unlock', () => {
  test('entitles a free user who bought Full Customization', () => {
    expect(isTTSCacheAllowed('free', true)).toBe(true);
  });

  test('entitles a grandfathered storage buyer, who carries the flag', () => {
    expect(isTTSCacheAllowed('purchase', true)).toBe(true);
  });

  test('does not entitle a storage-only buyer after the grace period', () => {
    expect(isTTSCacheAllowed('purchase', false)).toBe(false);
  });
});
