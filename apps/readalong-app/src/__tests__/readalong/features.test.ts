import { beforeEach, describe, expect, it } from 'vitest';

import { isHiddenSetting } from '@/readalong/features';
import { getAvailableToolTypes, getToolbarToolTypes } from '@/utils/annotationToolbar';
import { isCustomizationAllowed, isCustomTTSAllowed, isTTSCacheAllowed } from '@/utils/access';
import { isLocalSendEnabled, setLocalSendEnabled } from '@/services/localsend/devicePrefs';
import { buildCommandRegistry, CommandRegistryOptions } from '@/services/commandRegistry';

// Readalong takes upstream extras out of its screens (readalong/features.ts)
// and, with no upstream store to buy a plan from, lets every "premium"
// feature work.

describe('Readalong without translation', () => {
  it('leaves Translate off the selection toolbar and out of the Available tray', () => {
    expect(getToolbarToolTypes(undefined, true)).not.toContain('translate');
    expect(getToolbarToolTypes(['copy', 'translate', 'highlight'], true)).toEqual([
      'copy',
      'highlight',
    ]);
    expect(getAvailableToolTypes(['copy'], true)).not.toContain('translate');
  });
});

describe('Readalong without upstream plans', () => {
  it('lets a reader with no account use every customisation', () => {
    expect(isCustomizationAllowed('free', false)).toBe(true);
    expect(isCustomTTSAllowed(null)).toBe(true);
    expect(isTTSCacheAllowed('free', false)).toBe(true);
  });
});

describe('Readalong without Nearby BookDrop', () => {
  beforeEach(() => localStorage.clear());

  it('never announces the phone on the local network', () => {
    expect(isLocalSendEnabled()).toBe(false);
    setLocalSendEnabled(true);
    expect(isLocalSendEnabled()).toBe(false);
  });
});

describe('Readalong settings search', () => {
  it('hides the settings its screens hide and keeps the rest', () => {
    for (const id of [
      'settings.language.translationEnabled',
      'settings.language.chineseConversion',
      'settings.font.cjkFont',
      'settings.layout.writingMode',
      'settings.control.einkMode',
      'settings.control.gamepadEnabled',
      'action.telemetry',
    ]) {
      expect(isHiddenSetting(id), id).toBe(true);
    }
    for (const id of [
      'settings.language.interfaceLanguage',
      'settings.language.dictionaries',
      'settings.font.defaultFontSize',
      'settings.control.screenWakeLock',
      'settings.tts.voices',
    ]) {
      expect(isHiddenSetting(id), id).toBe(false);
    }
  });

  it('leaves hidden settings out of the command palette', () => {
    const noop = () => {};
    const options = {
      _: (key: string) => key,
      openSettingsPanel: noop,
      toggleTheme: noop,
      toggleFullscreen: noop,
      toggleAlwaysOnTop: noop,
      toggleScreenWakeLock: noop,
      reloadPage: noop,
      toggleOpenLastBooks: noop,
      showAbout: noop,
      toggleTelemetry: noop,
      isDesktop: false,
    } as unknown as CommandRegistryOptions;
    const ids = buildCommandRegistry(options).map((item) => item.id);
    expect(ids).toContain('settings.font.defaultFontSize');
    expect(ids).toContain('settings.language.interfaceLanguage');
    expect(ids).not.toContain('settings.language.translationEnabled');
    expect(ids).not.toContain('settings.control.einkMode');
    expect(ids).not.toContain('action.telemetry');
  });
});

describe('Readalong narration and Auto Scroll pacing', () => {
  it('pauses whichever pacer was running when the other starts', async () => {
    const { pacerToPause } = await import('@/readalong/narrationPacing');
    expect(pacerToPause('narration', { narrationPlaying: false, autoScrollRunning: true })).toBe(
      'autoscroll',
    );
    expect(pacerToPause('autoscroll', { narrationPlaying: true, autoScrollRunning: false })).toBe(
      'narration',
    );
    expect(pacerToPause('narration', { narrationPlaying: false, autoScrollRunning: false })).toBe(
      null,
    );
    expect(pacerToPause('autoscroll', { narrationPlaying: false, autoScrollRunning: true })).toBe(
      null,
    );
  });
});
