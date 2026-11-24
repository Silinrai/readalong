// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalSendAlias,
  isLocalSendEnabled,
  setLocalSendAlias,
  setLocalSendEnabled,
} from '@/services/localsend/devicePrefs';

// These tests cover the upstream features Readalong hides from its screens
// (readalong/features.ts); run them with those features shown.
vi.mock('@/readalong/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/readalong/features')>()),
  SHOW_TRANSLATION: true,
  SHOW_WEB_IMPORTS: true,
  SHOW_INTEGRATIONS: true,
  SHOW_DESKTOP_CONTROLS: true,
}));

const ENABLED_KEY = 'readalong-localsend-enabled';

describe('Nearby BookDrop enable preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is on until the user turns it off', () => {
    expect(isLocalSendEnabled()).toBe(true);
  });

  it('only "false" turns it off', () => {
    localStorage.setItem(ENABLED_KEY, 'false');
    expect(isLocalSendEnabled()).toBe(false);
    localStorage.setItem(ENABLED_KEY, '');
    expect(isLocalSendEnabled()).toBe(true);
  });

  it('round-trips the toggle both ways', () => {
    setLocalSendEnabled(true);
    expect(localStorage.getItem(ENABLED_KEY)).toBe('true');
    expect(isLocalSendEnabled()).toBe(true);
    setLocalSendEnabled(false);
    expect(isLocalSendEnabled()).toBe(false);
  });

  it('leaves the alias empty until the user names the device', () => {
    expect(getLocalSendAlias()).toBe('');
    setLocalSendAlias('Study Mac');
    expect(getLocalSendAlias()).toBe('Study Mac');
  });
});
