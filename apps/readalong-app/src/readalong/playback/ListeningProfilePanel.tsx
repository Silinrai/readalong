// Readalong: the player sheet's Speed page, extended into the book's
// listening profile. Speed presets (the ruler below stays for any other
// speed), then pitch for a synthetic voice or volume for a recorded
// narrator, and which of these are this book's own vs the default.
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { eventDispatcher } from '@/utils/event';
import type { ViewSettings } from '@/types/book';
import { SliderRow } from '../visual/SliderRow';
import SpeedPresets from './SpeedPresets';
import {
  PITCH_MAX,
  PITCH_MIN,
  PITCH_STEP,
  PROFILE_KEYS,
  VOLUME_MAX,
  VOLUME_MIN,
  effectiveNarrationVolume,
  effectivePitch,
  ownSettings,
} from './profile';

interface Props {
  bookKey: string;
  rate: number;
  onSelectRate: (rate: number) => void;
  isNarrating: boolean;
  /** Whether the current synthetic voice's engine takes a pitch. */
  pitchSupported: boolean;
}

const ListeningProfilePanel: React.FC<Props> = ({
  bookKey,
  rate,
  onSelectRate,
  isNarrating,
  pitchSupported,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { getViewSettings } = useReaderStore();
  const { settings } = useSettingsStore();
  const vs = getViewSettings(bookKey);
  const defaults = settings.globalViewSettings;
  const own = vs ? ownSettings(vs, defaults) : [];

  const saveForBook = async <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => {
    await saveViewSettings(envConfig, bookKey, key, value, true, false);
    eventDispatcher.dispatch('readalong-tts-profile', { bookKey });
  };

  const makeDefault = async () => {
    if (!vs) return;
    const { settings: current, setSettings, saveSettings } = useSettingsStore.getState();
    const next = { ...current.globalViewSettings };
    for (const key of PROFILE_KEYS) {
      if (vs[key] !== undefined) (next as Record<string, unknown>)[key] = structuredClone(vs[key]);
    }
    const updated = { ...current, globalViewSettings: next };
    setSettings(updated);
    await saveSettings(envConfig, updated);
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _("This book's voice, speed and highlight are now the default"),
      timeout: 3000,
    });
  };

  const applyDefaults = async () => {
    for (const key of PROFILE_KEYS) {
      const value = structuredClone(defaults[key]);
      await saveViewSettings(envConfig, bookKey, key, value as never, true, false);
    }
    onSelectRate(isNarrating ? (defaults.ttsNarrationRate ?? 1) : defaults.ttsRate);
    eventDispatcher.dispatch('readalong-tts-profile', { bookKey });
  };

  return (
    <div className='flex w-full flex-col gap-4'>
      <SpeedPresets rate={rate} onSelect={onSelectRate} />
      <div className='ra-options-card w-full'>
        {isNarrating ? (
          <SliderRow
            label={_('Volume')}
            value={Math.round(effectiveNarrationVolume(vs) * 100)}
            min={VOLUME_MIN * 100}
            max={VOLUME_MAX * 100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => void saveForBook('ttsNarrationVolume', v / 100)}
          />
        ) : (
          <SliderRow
            label={_('Pitch')}
            value={effectivePitch(vs)}
            min={PITCH_MIN}
            max={PITCH_MAX}
            step={PITCH_STEP}
            format={(v) => `${v.toFixed(2)}`}
            disabled={!pitchSupported}
            onChange={(v) => void saveForBook('ttsPitch', v)}
          />
        )}
        {!isNarrating && !pitchSupported && (
          <p className='text-base-content/60 px-1 pb-1 text-xs'>
            {_("This voice doesn't support changing the pitch.")}
          </p>
        )}
      </div>
      <div className='flex flex-col gap-2 px-1'>
        <p className='text-base-content/70 text-xs'>
          {own.length
            ? _('This book has its own voice and speed settings. Other books keep theirs.')
            : _('This book uses the default listening settings.')}
        </p>
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            className='btn btn-sm min-h-11'
            disabled={!own.length}
            onClick={() => void makeDefault()}
          >
            {_('Make These the Default')}
          </button>
          <button
            type='button'
            className='btn btn-sm btn-ghost min-h-11'
            disabled={!own.length}
            onClick={() => void applyDefaults()}
          >
            {_('Use the Defaults')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ListeningProfilePanel;
