// Readalong: the reader's Visual Options sheet (the "Aa" button on the bottom
// bar), laid out like Moon+ Reader's: cards of slider rows (name, value,
// slider, - and +), each card with its own Reset, then the page turn and
// saved looks. Changes show on the page as you drag; one relayout runs at a
// time so the reader keeps their place (useLiveRelayout).
import clsx from 'clsx';
import { useState } from 'react';
import { MdChevronLeft } from 'react-icons/md';
import { PiGear, PiSun } from 'react-icons/pi';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useDuoPose } from '@/hooks/useDuoPose';
import { saveViewSettings } from '@/helpers/settings';
import type { ViewSettings } from '@/types/book';
import { FineTuneSection } from '@/app/reader/components/footerbar/FineTuneSection';
import { useLiveRelayout } from '../useLiveRelayout';
import { MarginsCard } from './MarginsCard';
import { OptionChips } from './OptionChips';
import { currentTypeface, typefacePatch, TYPEFACES } from './typeface';
import type { TTSHighlightStyle } from '@/components/settings/theme/TTSHighlightStyleEditor';
import { OptionsCard, SliderRow } from './SliderRow';

type Props = {
  bookKey: string;
  open: boolean;
  bottomOffset: string;
  forceMobileLayout: boolean;
  insetStyle?: React.CSSProperties;
  onClose: () => void;
  /** Switch to the colours and brightness panel. */
  onOpenColors?: () => void;
};

type NumericKey =
  | 'defaultFontSize'
  | 'textStrokePx'
  | 'textShadowLevel'
  | 'paragraphMargin'
  | 'lineHeight'
  | 'letterSpacing'
  | 'wordSpacing';

const TEXT_KEYS: NumericKey[] = ['defaultFontSize', 'textStrokePx', 'textShadowLevel'];
const SPACING_KEYS: NumericKey[] = [
  'paragraphMargin',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
];

export const VisualOptionsSheet = ({
  bookKey,
  open,
  bottomOffset,
  forceMobileLayout,
  insetStyle,
  onClose,
  onOpenColors,
}: Props) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const getViewSettings = useReaderStore((s) => s.getViewSettings);
  const getView = useReaderStore((s) => s.getView);
  const setHoveredBookKey = useReaderStore((s) => s.setHoveredBookKey);
  const setSettingsDialogBookKey = useSettingsStore((s) => s.setSettingsDialogBookKey);
  const setSettingsDialogOpen = useSettingsStore((s) => s.setSettingsDialogOpen);
  const setRequestedPanel = useSettingsStore((s) => s.setRequestedPanel);
  const relayout = useLiveRelayout(bookKey);
  const pose = useDuoPose();
  // Bumped when several values change at once (reset, a saved look), so the
  // rows show the new values.
  const [version, setVersion] = useState(0);
  const viewSettings = getViewSettings(bookKey);
  if (!viewSettings) return null;

  const twoPages = pose === 'inner-landscape' || (getView(bookKey)?.renderer.columnCount ?? 1) > 1;

  const saveLive = (key: NumericKey, value: number) => {
    if (getViewSettings(bookKey)?.[key] === value) return;
    relayout.schedule(key, () => saveViewSettings(envConfig, bookKey, key, value));
  };

  const resetKeys = (keys: NumericKey[]) => {
    const defaults = appService?.getDefaultViewSettings();
    if (!defaults) return;
    relayout.schedule(`reset-${keys[0]}`, async () => {
      for (const key of keys) {
        const value = defaults[key] as ViewSettings[NumericKey];
        if (getViewSettings(bookKey)?.[key] !== value) {
          await saveViewSettings(envConfig, bookKey, key, value);
        }
      }
      setVersion((v) => v + 1);
    });
  };

  const openSettings = () => {
    setHoveredBookKey('');
    setSettingsDialogBookKey(bookKey);
    setRequestedPanel('Font');
    setSettingsDialogOpen(true);
  };

  const fixed = (digits: number) => (value: number) => value.toFixed(digits);

  // Several settings in one change, restyled once.
  const savePatch = (key: string, patch: Partial<ViewSettings>) => {
    relayout.schedule(key, async () => {
      for (const [name, value] of Object.entries(patch) as [
        keyof ViewSettings,
        ViewSettings[keyof ViewSettings],
      ][]) {
        if (getViewSettings(bookKey)?.[name] !== value) {
          await saveViewSettings(envConfig, bookKey, name, value);
        }
      }
      setVersion((v) => v + 1);
    });
  };

  const highlightStyle = viewSettings.ttsHighlightOptions?.style ?? 'highlight';
  const setHighlightStyle = (style: TTSHighlightStyle) => {
    const current = getViewSettings(bookKey)?.ttsHighlightOptions;
    void saveViewSettings(envConfig, bookKey, 'ttsHighlightOptions', {
      color: current?.color ?? '#3b82f6',
      ...current,
      style,
    }).then(() => setVersion((v) => v + 1));
  };

  return (
    <div
      role='dialog'
      aria-label={_('Visual Options')}
      aria-hidden={!open}
      // Closed: out of the tab order and the accessibility tree.
      inert={!open}
      className={clsx(
        // footerbar-font-mobile: the mini-player measures this panel to stay above it.
        'footerbar-font-mobile absolute z-20 flex flex-col',
        // Two pages: over the right page, so the left one shows each change.
        twoPages ? 'end-0 w-1/2 max-w-none' : 'inset-x-0 mx-auto w-full max-w-2xl',
        'not-eink:bg-base-200 eink:bg-base-100 eink:border-base-content eink:border-t',
        'rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.25)] transition-all',
        !forceMobileLayout && 'sm:hidden',
        open
          ? 'pointer-events-auto translate-y-0 ease-out'
          : 'pointer-events-none invisible translate-y-full overflow-hidden ease-in',
      )}
      style={{ bottom: bottomOffset, ...insetStyle }}
    >
      <div className='flex h-14 shrink-0 items-center gap-2 px-2'>
        <button
          type='button'
          className='btn btn-ghost btn-circle h-11 min-h-11 w-11'
          aria-label={_('Close')}
          onClick={onClose}
        >
          <MdChevronLeft size={28} aria-hidden='true' />
        </button>
        <h2 className='text-lg font-medium'>{_('Visual Options')}</h2>
      </div>
      <div
        className={clsx(
          'flex flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-4',
          twoPages ? 'max-h-[min(75vh,52rem)]' : 'max-h-[min(60vh,40rem)]',
        )}
        key={version}
      >
        <OptionsCard title={_('Text')} onReset={() => resetKeys(TEXT_KEYS)}>
          <OptionChips
            label={_('Font')}
            options={TYPEFACES.map((font) => ({ value: font, label: font, fontFamily: font }))}
            value={currentTypeface(viewSettings)}
            onChange={(font) => savePatch('typeface', typefacePatch(font))}
          />
          <OptionChips
            label={_('Alignment')}
            options={[
              { value: 'justify', label: _('Justified') },
              { value: 'left', label: _('Left') },
            ]}
            value={viewSettings.fullJustification ? 'justify' : 'left'}
            onChange={(v) => savePatch('alignment', { fullJustification: v === 'justify' })}
          />
          <OptionChips
            label={_('Hyphenation')}
            options={[
              { value: 'on', label: _('On') },
              { value: 'off', label: _('Off') },
            ]}
            value={viewSettings.hyphenation ? 'on' : 'off'}
            onChange={(v) => savePatch('hyphenation', { hyphenation: v === 'on' })}
          />
          <SliderRow
            label={_('Font Size')}
            value={viewSettings.defaultFontSize}
            min={8}
            max={48}
            step={1}
            onChange={(v) => saveLive('defaultFontSize', v)}
          />
          <SliderRow
            label={_('Boldness')}
            value={Math.round((viewSettings.textStrokePx ?? 0) * 10)}
            min={0}
            max={6}
            step={1}
            onChange={(v) => saveLive('textStrokePx', v / 10)}
          />
          <SliderRow
            label={_('Text Shadow')}
            value={viewSettings.textShadowLevel ?? 0}
            min={0}
            max={3}
            step={1}
            onChange={(v) => saveLive('textShadowLevel', v)}
          />
        </OptionsCard>

        <OptionsCard title={_('Spacing')} onReset={() => resetKeys(SPACING_KEYS)}>
          <SliderRow
            label={_('Paragraph Spacing')}
            value={viewSettings.paragraphMargin}
            min={0}
            max={4}
            step={0.1}
            format={fixed(1)}
            onChange={(v) => saveLive('paragraphMargin', v)}
          />
          <SliderRow
            label={_('Line Spacing')}
            value={viewSettings.lineHeight}
            min={1}
            max={3}
            step={0.1}
            format={fixed(1)}
            onChange={(v) => saveLive('lineHeight', v)}
          />
          <SliderRow
            label={_('Letter Spacing')}
            value={viewSettings.letterSpacing}
            min={-2}
            max={4}
            step={0.5}
            format={fixed(1)}
            onChange={(v) => saveLive('letterSpacing', v)}
          />
          <SliderRow
            label={_('Word Spacing')}
            value={viewSettings.wordSpacing}
            min={-4}
            max={8}
            step={0.5}
            format={fixed(1)}
            onChange={(v) => saveLive('wordSpacing', v)}
          />
        </OptionsCard>

        <MarginsCard bookKey={bookKey} showInnerGap={twoPages} />

        <OptionsCard title={_('Narration')}>
          <OptionChips<TTSHighlightStyle>
            label={_('Highlight Style')}
            options={[
              { value: 'highlight', label: _('Highlight') },
              { value: 'underline', label: _('Underline') },
              { value: 'outline', label: _('Outline') },
              { value: 'squiggly', label: _('Wavy') },
            ]}
            value={highlightStyle}
            onChange={setHighlightStyle}
          />
        </OptionsCard>

        {onOpenColors && (
          <button
            type='button'
            className='btn btn-ghost btn-sm text-base-content/80 h-11 min-h-11 gap-1.5 self-start px-3 font-normal'
            onClick={onOpenColors}
          >
            <PiSun size={16} aria-hidden='true' />
            {_('Colors and Brightness')}
          </button>
        )}

        <section className='ra-options-card'>
          <FineTuneSection
            bookKey={bookKey}
            hideTextSliders
            onApplied={() => setVersion((v) => v + 1)}
          />
        </section>

        <button
          type='button'
          className='btn btn-ghost btn-sm text-base-content/70 h-11 min-h-11 gap-1.5 self-end px-3 font-normal'
          onClick={openSettings}
        >
          <PiGear size={16} aria-hidden='true' />
          {_('More Settings')}
        </button>
      </div>
    </div>
  );
};
