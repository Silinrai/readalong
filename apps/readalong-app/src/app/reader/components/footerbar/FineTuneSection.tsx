import clsx from 'clsx';
import React, { useState } from 'react';
import { PiPlus, PiX } from 'react-icons/pi';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { applyPageTurnAttributes } from '../../hooks/useCapturedTurn';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveSysSettings, saveViewSettings } from '@/helpers/settings';
import { applyViewSettingsPatch } from '@/readalong/settingsPatch';
import { useLiveRelayout } from '@/readalong/useLiveRelayout';
import Slider from '@/components/Slider';
import type { PageTurnStyle, ViewSettings } from '@/types/book';
import { stubTranslation as _ } from '@/utils/misc';
import {
  BUILT_IN_PRESETS,
  capturePreset,
  presetMatches,
  ReadingPreset,
} from '@/readalong/readingPresets';

interface FineTuneSectionProps {
  bookKey: string;
  // Bumped after a preset is applied, so the panel's sliders re-read values.
  onApplied: () => void;
  /** The Visual Options sheet has its own boldness and shadow rows. */
  hideTextSliders?: boolean;
}

const TURN_OPTIONS: { value: PageTurnStyle | 'off'; label: string }[] = [
  { value: 'off', label: _('Off') },
  { value: 'push', label: _('Push') },
  { value: 'slide', label: _('Slide') },
  { value: 'curl', label: _('Curl') },
  { value: 'flip', label: _('Flip') },
];

const chip = (active: boolean) =>
  clsx(
    'btn btn-xs h-7 min-h-7 shrink-0 rounded-full px-3 font-normal',
    active ? 'btn-primary' : 'btn-ghost bg-base-100',
  );

/**
 * Readalong: Moon+ Reader style fine-tuning inside the reader's quick "A"
 * panel: boldness and text shadow, the page-turn animation, and saved looks.
 */
export const FineTuneSection: React.FC<FineTuneSectionProps> = ({
  bookKey,
  onApplied,
  hideTextSliders = false,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  // Selectors, not the whole store: this panel must not re-render on every
  // reader change (progress, hover, ...).
  const getView = useReaderStore((s) => s.getView);
  const getViewSettings = useReaderStore((s) => s.getViewSettings);
  const userPresets = useSettingsStore((s) => s.settings.readingPresets) ?? [];
  const relayout = useLiveRelayout(bookKey);
  const viewSettings = getViewSettings(bookKey);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  if (!viewSettings) return null;
  const presets = [...BUILT_IN_PRESETS, ...userPresets];
  const turnValue = viewSettings.animated ? viewSettings.pageTurnStyle : 'off';

  // A live slider value: queued (one relayout at a time) and skipped when
  // the setting already has it, which most slider ticks do.
  const saveLive = <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => {
    if (getViewSettings(bookKey)?.[key] === value) return;
    relayout.schedule(key, () => saveViewSettings(envConfig, bookKey, key, value));
  };
  // The animation is a renderer attribute; it needs no restyle.
  const saveTurn = async (animated: boolean, style?: PageTurnStyle) => {
    await saveViewSettings(envConfig, bookKey, 'animated', animated, false, false);
    if (style) await saveViewSettings(envConfig, bookKey, 'pageTurnStyle', style, false, false);
    applyTurn();
    refresh();
  };

  // The page turner reads its animation from renderer attributes; push the
  // saved choice through now rather than on the next book open.
  const applyTurn = () => {
    const view = getView(bookKey);
    const fresh = getViewSettings(bookKey);
    if (!view || !fresh) return;
    view.renderer.toggleAttribute('animated', fresh.animated && !fresh.isEink);
    const isFixedLayout = !!useBookDataStore.getState().getBookData(bookKey)?.isFixedLayout;
    applyPageTurnAttributes(view, fresh, isFixedLayout);
  };

  // A whole look in one change: one restyle, one save (not one per key).
  const applyPreset = (preset: ReadingPreset) => {
    relayout.schedule('preset', async () => {
      await applyViewSettingsPatch(envConfig, bookKey, preset.values);
      const updated = getViewSettings(bookKey);
      if (updated) getView(bookKey)?.renderer.setAttribute('gap', `${updated.gapPercent}%`);
      applyTurn();
      onApplied();
      refresh();
    });
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const current = getViewSettings(bookKey);
    if (!current) return;
    const preset: ReadingPreset = {
      id: `user-${Date.now().toString(36)}`,
      name,
      values: capturePreset(current),
    };
    void saveSysSettings(envConfig, 'readingPresets', [...userPresets, preset]);
    setNaming(false);
    setPresetName('');
  };

  const deletePreset = (id: string) => {
    void saveSysSettings(
      envConfig,
      'readingPresets',
      userPresets.filter((p) => p.id !== id),
    );
  };

  return (
    <div className='flex w-full flex-col gap-y-6'>
      <div
        className={clsx(
          'flex w-full items-center justify-between gap-x-6',
          hideTextSliders && 'hidden',
        )}
      >
        <Slider
          label={_('Boldness')}
          initialValue={Math.round((viewSettings.textStrokePx ?? 0) * 10)}
          bubbleLabel={_('Bold')}
          minLabel={_('Off')}
          maxLabel={_('Max')}
          min={0}
          max={6}
          onChange={(value) => saveLive('textStrokePx', value / 10)}
        />
        <Slider
          label={_('Text Shadow')}
          initialValue={viewSettings.textShadowLevel ?? 0}
          bubbleLabel={_('Shadow')}
          minLabel={_('Off')}
          maxLabel={_('Max')}
          min={0}
          max={3}
          onChange={(value) => saveLive('textShadowLevel', value)}
        />
      </div>

      <div className='flex w-full flex-col gap-2'>
        <span className='text-base-content/70 text-xs'>{_('Page Turn')}</span>
        <div className='flex gap-2 overflow-x-auto pb-1'>
          {TURN_OPTIONS.map(({ value, label }) => (
            <button
              type='button'
              key={value}
              className={chip(turnValue === value)}
              onClick={() => void (value === 'off' ? saveTurn(false) : saveTurn(true, value))}
            >
              {_(label)}
            </button>
          ))}
        </div>
      </div>

      <div className='flex w-full flex-col gap-2'>
        <span className='text-base-content/70 text-xs'>{_('Saved Looks')}</span>
        <div className='flex items-center gap-2 overflow-x-auto pb-1'>
          {presets.map((preset) => (
            <span key={preset.id} className='flex shrink-0 items-center'>
              <button
                type='button'
                className={chip(presetMatches(preset, viewSettings))}
                onClick={() => applyPreset(preset)}
              >
                {preset.builtIn ? _(preset.name) : preset.name}
              </button>
              {!preset.builtIn && (
                <button
                  type='button'
                  aria-label={_('Delete {{name}}', { name: preset.name })}
                  className='btn btn-ghost btn-xs btn-circle -ms-1 h-6 min-h-6 w-6'
                  onClick={() => deletePreset(preset.id)}
                >
                  <PiX size={12} />
                </button>
              )}
            </span>
          ))}
          {naming ? (
            <span className='flex shrink-0 items-center gap-1'>
              <input
                autoFocus
                className='input input-xs input-bordered h-7 w-28'
                placeholder={_('Name')}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePreset();
                  if (e.key === 'Escape') setNaming(false);
                }}
              />
              <button type='button' className={chip(false)} onClick={savePreset}>
                {_('Save')}
              </button>
            </span>
          ) : (
            <button
              type='button'
              className={clsx(chip(false), 'gap-1')}
              onClick={() => setNaming(true)}
            >
              <PiPlus size={12} />
              {_('Save Look')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
