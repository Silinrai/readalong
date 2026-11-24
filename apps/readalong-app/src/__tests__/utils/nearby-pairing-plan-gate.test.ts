// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
  NEARBY_PAIRING_REQUIRES_PREMIUM,
  isNearbyPairingAllowed,
  isNearbyPairingInPlan,
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

describe('isNearbyPairingInPlan', () => {
  test('any paid plan can pair Nearby BookDrop devices', () => {
    expect(isNearbyPairingInPlan('plus', false)).toBe(true);
    expect(isNearbyPairingInPlan('pro', false)).toBe(true);
    // A storage-only buyer reports `purchase` without being entitled.
    expect(isNearbyPairingInPlan('purchase', false)).toBe(false);
  });

  test('free plan cannot', () => {
    expect(isNearbyPairingInPlan('free', false)).toBe(false);
  });
});

describe('isNearbyPairingAllowed (premium paywall)', () => {
  test('pairing for confirmation-free drops requires a paid plan', () => {
    expect(NEARBY_PAIRING_REQUIRES_PREMIUM).toBe(true);
    expect(isNearbyPairingAllowed('free', false)).toBe(false);
    expect(isNearbyPairingAllowed('plus', false)).toBe(true);
    expect(isNearbyPairingAllowed('pro', false)).toBe(true);
    expect(isNearbyPairingAllowed('purchase', false)).toBe(false);
  });

  test('the Full Customization unlock entitles a free user', () => {
    expect(isNearbyPairingAllowed('free', true)).toBe(true);
    expect(isNearbyPairingAllowed('purchase', true)).toBe(true);
  });
});
