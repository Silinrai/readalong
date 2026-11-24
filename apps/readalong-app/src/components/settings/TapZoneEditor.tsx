import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DEFAULT_TAP_ZONES,
  isTapZoneGrid,
  TAP_ZONE_EDITOR_ACTIONS,
  TapZoneAction,
} from '@/readalong/tapZones';
import { SettingsSwitchRow } from './primitives';

interface TapZoneEditorProps {
  zones: TapZoneAction[] | null | undefined;
  /** The right page's grid on a two-page spread; null: same as the left. */
  rightZones: TapZoneAction[] | null | undefined;
  onChange: (zones: TapZoneAction[] | null) => void;
  onChangeRight: (zones: TapZoneAction[] | null) => void;
  disabled?: boolean;
}

/**
 * Readalong: Moon+ Reader style tap zones. A switch turns custom zones on, and
 * a page-shaped 3x3 grid picks what tapping each part of a page does. When the
 * unfolded screen shows two pages, each page uses its own grid; the right page
 * can have a different one.
 */
const TapZoneEditor: React.FC<TapZoneEditorProps> = ({
  zones,
  rightZones,
  onChange,
  onChangeRight,
  disabled,
}) => {
  const _ = useTranslation();
  const enabled = isTapZoneGrid(zones);
  const separateRight = enabled && isTapZoneGrid(rightZones);
  const labels: Record<TapZoneAction, string> = {
    none: _('Nothing'),
    // Short: each name has a third of a page-shaped grid to fit in.
    prev: _('Previous'),
    next: _('Next'),
    menu: _('Menu'),
    playPause: _('Play / Pause'),
    prevLine: _('Previous Line'),
    nextLine: _('Next Line'),
    bookmark: _('Bookmark'),
  };

  const grid = (cells: TapZoneAction[], label: string, change: (next: TapZoneAction[]) => void) => (
    <div className='flex w-full min-w-0 max-w-64 flex-1 flex-col items-center gap-1.5'>
      <span className='text-base-content/70 text-xs font-medium'>{label}</span>
      <div
        role='group'
        aria-label={label}
        className='border-base-content/20 bg-base-200/50 grid aspect-[3/4] w-full grid-cols-3 grid-rows-3 gap-1 rounded-lg border p-1'
      >
        {cells.map((action, index) => (
          <label
            key={index}
            className='bg-base-100 flex min-w-0 items-center justify-center rounded-md p-0.5'
          >
            <span className='sr-only'>{_('Tap zone {{n}}', { n: index + 1 })}</span>
            <select
              className='w-full min-w-0 cursor-pointer bg-transparent text-center text-xs'
              value={action}
              disabled={disabled}
              onChange={(e) => {
                const next = [...cells];
                next[index] = e.target.value as TapZoneAction;
                change(next);
              }}
            >
              {/* A grid saved with an action no longer offered keeps it. */}
              {[
                ...TAP_ZONE_EDITOR_ACTIONS,
                ...(TAP_ZONE_EDITOR_ACTIONS.includes(action) ? [] : [action]),
              ].map((option) => (
                <option key={option} value={option}>
                  {labels[option]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <SettingsSwitchRow
        label={_('Custom Tap Zones')}
        checked={enabled}
        disabled={disabled}
        onChange={() => {
          onChange(enabled ? null : [...DEFAULT_TAP_ZONES]);
          if (enabled) onChangeRight(null);
        }}
        data-setting-id='settings.misc.customTapZones'
      />
      {enabled && (
        <SettingsSwitchRow
          label={_('Different Zones on the Right Page')}
          description={_('Used when the unfolded screen shows two pages.')}
          checked={separateRight}
          disabled={disabled}
          onChange={() => onChangeRight(separateRight ? null : [...zones])}
          data-setting-id='settings.misc.rightPageTapZones'
        />
      )}
      {enabled && (
        <div className='px-4 pb-3 pt-1'>
          {/* Side by side where there is room, one above the other on a phone. */}
          <div className='flex flex-col items-center gap-4 min-[480px]:flex-row min-[480px]:items-start'>
            {grid(zones, separateRight ? _('Left Page') : _('Each Page'), (next) => onChange(next))}
            {separateRight && grid(rightZones, _('Right Page'), (next) => onChangeRight(next))}
          </div>
          <p className='text-base-content/60 mt-2 text-center text-xs'>
            {_('During narration, drag up or down to choose a line.')}
          </p>
        </div>
      )}
    </>
  );
};

export default TapZoneEditor;
