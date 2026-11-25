// Readalong: apply several view settings as one change. Readalong's
// saveViewSettings restyles the book and writes settings to disk for every
// key, so a saved look (about twenty keys) meant twenty relayouts and forty
// file writes in a row. This is the same work done once.
import type { ViewSettings } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import type { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useCustomFontStore } from '@/store/customFontStore';
import { getStyles } from '@/utils/style';

/** The entries of `patch` that differ from `current`. A key the patch sets
 *  to undefined clears it (a reset to a default that is unset). */
export const changedEntries = (
  current: Partial<ViewSettings>,
  patch: Partial<ViewSettings>,
): [keyof ViewSettings, unknown][] =>
  (Object.entries(patch) as [keyof ViewSettings, unknown][]).filter(
    ([key, value]) => current[key] !== value,
  );

export const applyViewSettingsPatch = async (
  envConfig: EnvConfigType,
  bookKey: string,
  patch: Partial<ViewSettings>,
): Promise<boolean> => {
  const { settings, setSettings, saveSettings } = useSettingsStore.getState();
  const { bookKeys, getView, getViewState, getViewSettings, setViewSettings } =
    useReaderStore.getState();
  const { getConfig, saveConfig } = useBookDataStore.getState();

  const current = getViewSettings(bookKey);
  if (!current || !changedEntries(current, patch).length) return false;
  const isGlobal = current.isGlobal ?? true;

  const applyTo = async (key: string) => {
    const viewSettings = getViewSettings(key);
    if (!viewSettings) return;
    const changes = changedEntries(viewSettings, patch);
    if (!changes.length) return;
    for (const [name, value] of changes) {
      (viewSettings as unknown as Record<string, unknown>)[name] = value;
    }
    setViewSettings(key, viewSettings);
    getView(key)?.renderer.setStyles?.(
      getStyles(viewSettings, undefined, useCustomFontStore.getState().getLoadedFonts()),
    );
    const config = getConfig(key);
    if (getViewState(key)?.isPrimary && config) {
      // The settings now in effect (see helpers/settings.ts).
      await saveConfig(envConfig, key, config, useSettingsStore.getState().settings);
    }
  };

  if (isGlobal) {
    // A new settings object, as saveViewSettings does, so the replica-sync
    // subscriber sees the change.
    const nextSettings: SystemSettings = {
      ...settings,
      globalViewSettings: { ...settings.globalViewSettings, ...patch },
    };
    setSettings(nextSettings);
    for (const key of bookKeys) await applyTo(key);
    await saveSettings(envConfig, nextSettings);
  } else {
    await applyTo(bookKey);
  }
  return true;
};
