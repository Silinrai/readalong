// Readalong: Settings > Miscellaneous. Settings of the fork's own that don't
// belong to one of Readalong's tabs: tap zones (one grid per page when the
// unfolded screen shows two) and the page margins with the inner-screen gap.
import { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResetViewSettings } from '@/hooks/useResetSettings';
import { saveSysSettings, saveViewSettings } from '@/helpers/settings';
import type { SettingsPanelPanelProp } from '@/components/settings/SettingsDialog';
import TapZoneEditor from '@/components/settings/TapZoneEditor';
import { BoxedList, SettingsSwitchRow } from '@/components/settings/primitives';
import { MarginsCard } from '../visual/MarginsCard';

const ReadalongMiscPanel: React.FC<SettingsPanelPanelProp> = ({ bookKey, onRegisterReset }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const { getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey) || settings.globalViewSettings;
  const resetToDefaults = useResetViewSettings();

  const [tapZones, setTapZones] = useState(viewSettings.tapZones ?? null);
  const [tapZonesRight, setTapZonesRight] = useState(viewSettings.tapZonesRight ?? null);
  const [hideStatusBar, setHideStatusBar] = useState(!!settings.hideStatusBarWhileReading);

  useEffect(() => {
    onRegisterReset(() =>
      resetToDefaults({ tapZones: setTapZones, tapZonesRight: setTapZonesRight }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((viewSettings.tapZones ?? null) === tapZones) return;
    void saveViewSettings(envConfig, bookKey, 'tapZones', tapZones, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapZones]);

  useEffect(() => {
    if ((viewSettings.tapZonesRight ?? null) === tapZonesRight) return;
    void saveViewSettings(envConfig, bookKey, 'tapZonesRight', tapZonesRight, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapZonesRight]);

  return (
    <div className='my-4 w-full space-y-6'>
      <BoxedList title={_('Reading')} data-setting-id='settings.misc.reading'>
        <SettingsSwitchRow
          label={_('Hide the Status Bar While Reading')}
          description={_('The clock and battery stay hidden when the reading bars show.')}
          checked={hideStatusBar}
          onChange={() => {
            const next = !hideStatusBar;
            setHideStatusBar(next);
            void saveSysSettings(envConfig, 'hideStatusBarWhileReading', next);
          }}
          data-setting-id='settings.misc.hideStatusBar'
        />
      </BoxedList>
      <BoxedList
        title={_('Tap Zones')}
        description={_('What tapping each part of the page does.')}
        data-setting-id='settings.misc.tapZones'
      >
        <TapZoneEditor
          zones={tapZones}
          rightZones={tapZonesRight}
          onChange={setTapZones}
          onChangeRight={setTapZonesRight}
          disabled={viewSettings.disableClick}
        />
      </BoxedList>
      {getViewSettings(bookKey) ? (
        <div data-setting-id='settings.misc.margins'>
          <MarginsCard bookKey={bookKey} showInnerGap />
        </div>
      ) : (
        <p className='text-base-content/60 px-4 text-sm'>
          {_('Open a book to change its margins.')}
        </p>
      )}
    </div>
  );
};

export default ReadalongMiscPanel;
