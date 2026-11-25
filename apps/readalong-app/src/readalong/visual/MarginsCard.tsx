// Readalong: page margins, each side on its own slider, with toggles that move
// left and right (or top and bottom) together, and the inner-screen gap: the
// space between the two pages of an unfolded foldable. Used in the reader's
// Visual Options sheet and in Settings > Miscellaneous.
import { useState } from 'react';
import { MdLink, MdLinkOff } from 'react-icons/md';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import type { ViewSettings } from '@/types/book';
import { useLiveRelayout } from '../useLiveRelayout';
import { marginFields, marginPatch, marginValue, type MarginSide } from './marginFields';
import { applyViewSettingsPatch } from '@/readalong/settingsPatch';
import { OptionsCard, SliderRow } from './SliderRow';

const MAX_MARGIN_PX = 120;
const MAX_INNER_GAP_PX = 200;

type Props = {
  bookKey: string;
  /** Show the inner-screen gap (two pages on screen, or always in Settings). */
  showInnerGap: boolean;
};

export const MarginsCard = ({ bookKey, showInnerGap }: Props) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const getViewSettings = useReaderStore((s) => s.getViewSettings);
  const getView = useReaderStore((s) => s.getView);
  const relayout = useLiveRelayout(bookKey);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const viewSettings = getViewSettings(bookKey);
  if (!viewSettings) return null;

  const linkedLR = !!viewSettings.linkLeftRightMargins;
  const linkedTB = !!viewSettings.linkTopBottomMargins;

  // One change for a linked pair (and the old single-margin keys it
  // clears): one inset change and one save, not one per key.
  const savePatch = async (patch: Partial<ViewSettings>) => {
    await applyViewSettingsPatch(envConfig, bookKey, patch);
  };

  const setSide = (side: MarginSide, value: number) => {
    const current = getViewSettings(bookKey);
    if (!current || marginValue(current, side) === value) return;
    const linked = side === 'left' || side === 'right' ? linkedLR : linkedTB;
    relayout.schedule(`margin-${side}`, async () => {
      const fresh = getViewSettings(bookKey);
      if (fresh) await savePatch(marginPatch(fresh, side, value, linked));
      refresh();
    });
  };

  const setInnerGap = (value: number) => {
    relayout.schedule('inner-gap', async () => {
      await saveViewSettings(envConfig, bookKey, 'columnGapPx', value, false, false);
      const view = getView(bookKey);
      if (value > 0) view?.renderer.setAttribute('column-gap', `${value}px`);
      else view?.renderer.removeAttribute('column-gap');
      refresh();
    });
  };

  const toggleLink = (key: 'linkLeftRightMargins' | 'linkTopBottomMargins') => {
    const next = !getViewSettings(bookKey)?.[key];
    void saveViewSettings(envConfig, bookKey, key, next, false, false).then(() => {
      // Linking evens the pair out to the first side's value.
      const fresh = getViewSettings(bookKey);
      if (next && fresh) {
        const side: MarginSide = key === 'linkLeftRightMargins' ? 'left' : 'top';
        relayout.schedule(`link-${side}`, () =>
          savePatch(marginPatch(fresh, side, marginValue(fresh, side), true)),
        );
      }
      refresh();
    });
  };

  const reset = () => {
    const defaults = appService?.getDefaultViewSettings();
    if (!defaults) return;
    const fields = Object.values(marginFields(viewSettings));
    relayout.schedule('margins-reset', async () => {
      const patch: Partial<ViewSettings> = { columnGapPx: defaults.columnGapPx };
      for (const key of fields) patch[key] = defaults[key];
      await savePatch(patch);
      const view = getView(bookKey);
      if (defaults.columnGapPx > 0) {
        view?.renderer.setAttribute('column-gap', `${defaults.columnGapPx}px`);
      } else {
        view?.renderer.removeAttribute('column-gap');
      }
      refresh();
    });
  };

  const px = (value: number) => String(Math.round(value));
  const link = (
    key: 'linkLeftRightMargins' | 'linkTopBottomMargins',
    on: boolean,
    label: string,
  ) => (
    <button
      type='button'
      className='ra-link-toggle'
      aria-pressed={on}
      onClick={() => toggleLink(key)}
    >
      {on ? <MdLink size={18} aria-hidden='true' /> : <MdLinkOff size={18} aria-hidden='true' />}
      {label}
    </button>
  );
  const row = (side: MarginSide, label: string) => (
    <SliderRow
      key={side}
      label={label}
      value={marginValue(viewSettings, side)}
      min={0}
      max={MAX_MARGIN_PX}
      step={1}
      format={px}
      onChange={(value) => setSide(side, value)}
    />
  );

  return (
    <OptionsCard title={_('Margins')} onReset={reset}>
      <div className='flex flex-wrap gap-2 px-1 pb-1'>
        {link('linkLeftRightMargins', linkedLR, _('Left and right together'))}
        {link('linkTopBottomMargins', linkedTB, _('Top and bottom together'))}
      </div>
      {row('left', _('Left Margin'))}
      {row('right', _('Right Margin'))}
      {row('top', _('Top Margin'))}
      {row('bottom', _('Bottom Margin'))}
      {showInnerGap && (
        <SliderRow
          label={_('Inner Screen')}
          value={viewSettings.columnGapPx ?? 0}
          min={0}
          max={MAX_INNER_GAP_PX}
          step={2}
          format={(value) => (value > 0 ? px(value) : _('Auto'))}
          onChange={setInnerGap}
        />
      )}
      {showInnerGap && (
        <p className='text-base-content/60 px-1 pb-1 text-xs'>
          {_('Inner Screen: the space between the two pages when the screen is unfolded.')}
        </p>
      )}
    </OptionsCard>
  );
};
