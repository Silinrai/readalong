// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
  ABS_OFFLINE_REQUIRES_PREMIUM,
  isAbsOfflineAllowed,
  isAbsOfflineInPlan,
} from '@/utils/access';

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

describe('isAbsOfflineInPlan', () => {
  test('any paid plan can download Audiobookshelf books for offline use', () => {
    expect(isAbsOfflineInPlan('plus', false)).toBe(true);
    expect(isAbsOfflineInPlan('pro', false)).toBe(true);
    // A storage-only buyer reports `purchase` without being entitled.
    expect(isAbsOfflineInPlan('purchase', false)).toBe(false);
  });

  test('free plan cannot', () => {
    expect(isAbsOfflineInPlan('free', false)).toBe(false);
  });
});

describe('isAbsOfflineAllowed (premium paywall)', () => {
  test('offline Audiobookshelf downloads require a paid plan', () => {
    expect(ABS_OFFLINE_REQUIRES_PREMIUM).toBe(true);
    expect(isAbsOfflineAllowed('free', false)).toBe(false);
    expect(isAbsOfflineAllowed('plus', false)).toBe(true);
    expect(isAbsOfflineAllowed('pro', false)).toBe(true);
    expect(isAbsOfflineAllowed('purchase', false)).toBe(false);
  });

  test('entitles a free user who bought Full Customization', () => {
    expect(isAbsOfflineAllowed('free', true)).toBe(true);
  });
});
