// Readalong: one-time changes to settings saved by Readalong or by an older
// Readalong, applied once when settings load.
import type { SystemSettings } from '@/types/settings';

export const READALONG_DEFAULT_TTS_COLOR = '#808080';
export const READALONG_TTS_COLOR = '#3b82f6';

// Bump when adding a step below.
export const READALONG_SETTINGS_VERSION = 2;

/** The migrated settings, or null when there is nothing to change. */
export const migrateReadalongSettings = (settings: SystemSettings): SystemSettings | null => {
  const version = settings.readalongSettingsVersion ?? 0;
  if (version >= READALONG_SETTINGS_VERSION) return null;
  let globalViewSettings = settings.globalViewSettings;
  // v1: Readalong's grey narration highlight becomes Readalong's blue, once, so
  // a reader who picks grey later keeps it.
  const highlight = globalViewSettings?.ttsHighlightOptions;
  if (version < 1 && highlight?.color?.toLowerCase() === READALONG_DEFAULT_TTS_COLOR) {
    globalViewSettings = {
      ...globalViewSettings,
      ttsHighlightOptions: { ...highlight, color: READALONG_TTS_COLOR },
    };
  }
  // v2: the footer shows "12 min left in chapter" (Readalong's showRemainingTime),
  // so the page says where you are with the bars hidden. Switchable after.
  if (version < 2 && globalViewSettings) {
    globalViewSettings = { ...globalViewSettings, showRemainingTime: true };
  }
  return { ...settings, globalViewSettings, readalongSettingsVersion: READALONG_SETTINGS_VERSION };
};
