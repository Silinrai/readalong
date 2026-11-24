import { describe, expect, it } from 'vitest';
import {
  migrateReadalongSettings,
  READALONG_SETTINGS_VERSION,
  READALONG_TTS_COLOR,
} from '@/readalong/migrations';
import type { SystemSettings } from '@/types/settings';

const settings = (color: string, version?: number) =>
  ({
    globalViewSettings: { ttsHighlightOptions: { style: 'highlight', color } },
    readalongSettingsVersion: version,
  }) as unknown as SystemSettings;

describe('migrateReadalongSettings', () => {
  it("turns Readalong's grey narration highlight blue, once", () => {
    const next = migrateReadalongSettings(settings('#808080'))!;
    expect(next.globalViewSettings.ttsHighlightOptions.color).toBe(READALONG_TTS_COLOR);
    expect(next.readalongSettingsVersion).toBe(READALONG_SETTINGS_VERSION);
    // A reader who picks grey afterwards keeps it.
    expect(migrateReadalongSettings(settings('#808080', READALONG_SETTINGS_VERSION))).toBeNull();
  });

  it('leaves a chosen colour alone but records the version', () => {
    const next = migrateReadalongSettings(settings('#ff0000'))!;
    expect(next.globalViewSettings.ttsHighlightOptions.color).toBe('#ff0000');
    expect(next.readalongSettingsVersion).toBe(READALONG_SETTINGS_VERSION);
  });
});

describe('migrateReadalongSettings v2', () => {
  it('turns on the time left in chapter footer once', () => {
    const next = migrateReadalongSettings(settings('#ff0000', 1))!;
    expect(next.globalViewSettings.showRemainingTime).toBe(true);
    expect(next.readalongSettingsVersion).toBe(READALONG_SETTINGS_VERSION);
  });

  it('does not touch the highlight again for v1 settings', () => {
    const next = migrateReadalongSettings(settings('#808080', 1))!;
    expect(next.globalViewSettings.ttsHighlightOptions.color).toBe('#808080');
  });
});
