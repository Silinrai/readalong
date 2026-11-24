// Readalong: the reader's bottom bar on phones and the unfolded Fold. Two rows,
// like Moon+ Reader's: where you are in the book (previous chapter, slider,
// percentage, next chapter), then one row of tools. The percentage opens
// Readalong's page panel (page jump, back and forward); nothing it offered is
// lost.
import clsx from 'clsx';
import React from 'react';
import { IoIosList as TOCIcon } from 'react-icons/io';
import { MdOutlineHeadphones, MdMoreHoriz, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import { PiSun, PiCircleHalfFill, PiBookOpen, PiFile } from 'react-icons/pi';
import { RiFontSize } from 'react-icons/ri';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useDuoPose } from '@/hooks/useDuoPose';
import { saveViewSettings } from '@/helpers/settings';
import type { NavigationHandlers } from '@/app/reader/components/footerbar/types';
import type { Insets } from '@/types/misc';

/** Height of the two rows (h-12 + h-14), without the safe-area inset below. */
export const READALONG_BAR_HEIGHT_PX = 104;

/**
 * The bar's measured height (rows plus the safe-area padding under them) as a
 * CSS variable, so the panels that open above it sit exactly on it. A guessed
 * height left a strip of book text showing between panel and bar on Android.
 */
export const BOTTOM_BAR_HEIGHT_VAR = '--ra-bottom-bar-height';

type Props = {
  bookKey: string;
  actionTab: string;
  gridInsets: Insets;
  progressFraction: number;
  progressValid: boolean;
  navigationHandlers: NavigationHandlers;
  insetStyle?: React.CSSProperties;
  onSetActionTab: (tab: string) => void;
};

const ToolButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type='button'
    aria-label={label}
    aria-pressed={active}
    title={label}
    onClick={onClick}
    className={clsx(
      'flex h-12 min-w-11 flex-1 items-center justify-center rounded-xl',
      'focus-visible:ring-base-content/20 outline-none focus-visible:ring-2',
      'eink:focus-visible:outline eink:focus-visible:outline-2',
      active
        ? 'text-primary eink:text-base-content eink:bg-base-300'
        : 'text-base-content/80 hover:bg-base-content/5',
    )}
  >
    {children}
  </button>
);

export const ReadalongBottomBar: React.FC<Props> = ({
  bookKey,
  actionTab,
  gridInsets,
  progressFraction,
  progressValid,
  navigationHandlers,
  insetStyle,
  onSetActionTab,
}) => {
  const _ = useTranslation();
  const { appService, envConfig } = useEnv();
  // Primitive selectors: they re-run on store changes but only re-render
  // when the value itself changes.
  const ttsEnabled = useReaderStore((s) => !!s.getViewState(bookKey)?.ttsEnabled);
  const rtl = useReaderStore((s) => !!s.getViewSettings(bookKey)?.rtl);
  const bookMode = useReaderStore((s) => s.getViewSettings(bookKey)?.duoBookMode ?? true);
  const setHoveredBookKey = useReaderStore((s) => s.setHoveredBookKey);
  // Selectors, not whole stores: the bar must not re-render on every reader
  // change while it is hidden (page turns, progress saves).
  const isSideBarVisible = useSidebarStore((s) => s.isSideBarVisible);
  const isSideBarPinned = useSidebarStore((s) => s.isSideBarPinned);
  const setSettingsDialogBookKey = useSettingsStore((s) => s.setSettingsDialogBookKey);
  const setSettingsDialogOpen = useSettingsStore((s) => s.setSettingsDialogOpen);
  const isDarkMode = useThemeStore((s) => s.isDarkMode);
  const setThemeMode = useThemeStore((s) => s.setThemeMode);
  const pose = useDuoPose();
  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const publish = () => {
      // Hidden bars (display: none on wide screens) measure 0: keep the last.
      if (bar.offsetHeight > 0) {
        document.documentElement.style.setProperty(BOTTOM_BAR_HEIGHT_VAR, `${bar.offsetHeight}px`);
      }
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const percent = dragValue ?? (progressValid ? progressFraction * 100 : 0);

  const openSettings = () => {
    setHoveredBookKey('');
    setSettingsDialogBookKey(bookKey);
    setSettingsDialogOpen(true);
  };

  return (
    <div
      ref={barRef}
      className={clsx(
        'not-eink:bg-base-200 eink:bg-base-100 eink:border-base-content eink:border-t',
        'z-30 mt-auto flex w-full flex-col px-2',
      )}
      style={{
        paddingBottom: appService?.isAndroidApp
          ? 'env(safe-area-inset-bottom)'
          : `${gridInsets.bottom * 0.33}px`,
        ...insetStyle,
      }}
    >
      {/* Where you are: chapter back, the book as a slider, chapter on. */}
      <div className='flex h-12 items-center gap-1'>
        <button
          type='button'
          className='text-base-content/70 flex h-11 w-11 shrink-0 items-center justify-center rounded-full'
          aria-label={_('Previous Section')}
          onClick={rtl ? navigationHandlers.onNextSection : navigationHandlers.onPrevSection}
        >
          <MdChevronLeft size={24} aria-hidden='true' />
        </button>
        <input
          type='range'
          className='ra-slider min-w-0 flex-1'
          min={0}
          max={100}
          step={0.1}
          value={percent}
          aria-label={_('Reading Progress')}
          aria-valuetext={`${Math.round(percent)}%`}
          style={{ '--ra-fill': `${percent}%` } as React.CSSProperties}
          onChange={(e) => {
            const value = Number(e.target.value);
            setDragValue(value);
            navigationHandlers.onProgressChange(value);
          }}
          onPointerUp={() => setDragValue(null)}
          onBlur={() => setDragValue(null)}
        />
        <button
          type='button'
          className={clsx(
            'h-11 min-w-14 shrink-0 rounded-full px-2 text-sm tabular-nums',
            actionTab === 'progress' ? 'text-primary' : 'text-base-content/80',
          )}
          aria-label={_('Go to Page')}
          aria-pressed={actionTab === 'progress'}
          onClick={() => onSetActionTab('progress')}
        >
          {progressValid ? `${(Math.round(percent * 10) / 10).toFixed(1)}%` : '–'}
        </button>
        <button
          type='button'
          className='text-base-content/70 flex h-11 w-11 shrink-0 items-center justify-center rounded-full'
          aria-label={_('Next Section')}
          onClick={rtl ? navigationHandlers.onPrevSection : navigationHandlers.onNextSection}
        >
          <MdChevronRight size={24} aria-hidden='true' />
        </button>
      </div>

      {/* Tools. */}
      <div className='flex h-14 items-center justify-between gap-1'>
        {isSideBarVisible && isSideBarPinned ? null : (
          <ToolButton label={_('Table of Contents')} onClick={() => onSetActionTab('toc')}>
            <TOCIcon size={24} aria-hidden='true' />
          </ToolButton>
        )}
        <ToolButton label={_('Speak')} active={ttsEnabled} onClick={() => onSetActionTab('tts')}>
          <MdOutlineHeadphones size={23} aria-hidden='true' />
        </ToolButton>
        <ToolButton
          label={isDarkMode ? _('Light Mode') : _('Dark Mode')}
          onClick={() => setThemeMode(isDarkMode ? 'light' : 'dark')}
        >
          <PiCircleHalfFill size={23} aria-hidden='true' />
        </ToolButton>
        <ToolButton
          label={_('Color')}
          active={actionTab === 'color'}
          onClick={() => onSetActionTab('color')}
        >
          <PiSun size={24} aria-hidden='true' />
        </ToolButton>
        <ToolButton
          label={_('Visual Options')}
          active={actionTab === 'font'}
          onClick={() => onSetActionTab('font')}
        >
          <RiFontSize size={22} aria-hidden='true' />
        </ToolButton>
        {pose === 'inner-landscape' && (
          <ToolButton
            label={bookMode ? _('Show One Page') : _('Show Two Pages')}
            onClick={() =>
              void saveViewSettings(envConfig, bookKey, 'duoBookMode', !bookMode, false, false)
            }
          >
            {bookMode ? (
              <PiBookOpen size={23} aria-hidden='true' />
            ) : (
              <PiFile size={22} aria-hidden='true' />
            )}
          </ToolButton>
        )}
        <ToolButton label={_('More Settings')} onClick={openSettings}>
          <MdMoreHoriz size={26} aria-hidden='true' />
        </ToolButton>
      </div>
    </div>
  );
};
