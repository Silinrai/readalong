// Readalong: the sleep timer on the narration mini-player. Readalong keeps it in
// the expanded player sheet only; listeners reach for it most at night, with
// the mini-player in front of them. Two kinds, told apart on the button itself:
// a countdown (fixed duration) or "Chapter end" (stops when the chapter does,
// TTS_STOP_AT_CHAPTER_END). The timer logic stays in useTTSControl.
import clsx from 'clsx';
import { useEffect, useId, useRef, useState } from 'react';
import { MdAlarmOn, MdCheck, MdOutlineAlarm } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { TTS_STOP_AT_CHAPTER_END } from '@/services/tts/TTSSessionManager';
import { getTTSTimeoutOptions } from '@/app/reader/components/tts/TTSPlayerSheet';

// The common choices; the full list stays in the player sheet.
const MENU_VALUES = [0, TTS_STOP_AT_CHAPTER_END, 600, 1200, 1800, 2700, 3600];

type Props = {
  timeoutOption: number;
  /** Live countdown of an armed duration timer ('' when none). */
  timerLabel: string;
  onSelect: (value: number) => void;
  /** False while the mini-player is faded out: the menu closes with it. */
  visible?: boolean;
};

export const SleepTimerControl = ({
  timeoutOption,
  timerLabel,
  onSelect,
  visible = true,
}: Props) => {
  const _ = useTranslation();
  const iconSize = useResponsiveSize(20);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const chapterEnd = timeoutOption === TTS_STOP_AT_CHAPTER_END;
  const running = !chapterEnd && timeoutOption > 0 && !!timerLabel;
  const active = chapterEnd || running;
  const state = chapterEnd ? _('End of Chapter') : running ? timerLabel : _('Off');
  // The sheet offers more durations; one set there stays listed (and checked).
  const options = getTTSTimeoutOptions(_).filter(
    (option) => MENU_VALUES.includes(option.value) || option.value === timeoutOption,
  );

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    // Focus the checked item so arrow keys start from the current choice.
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]');
    const checked = [...(items ?? [])].find((item) => item.getAttribute('aria-checked') === 'true');
    (checked ?? items?.[0])?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]') ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    // Not `relative`: the menu positions against the mini-player card, so it
    // opens fully on screen wherever the button sits in the row.
    <div ref={rootRef} className='shrink-0'>
      <button
        ref={buttonRef}
        type='button'
        aria-label={`${_('Sleep Timer')}: ${state}`}
        aria-haspopup='menu'
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          'flex h-10 min-w-10 items-center justify-center gap-1 rounded-full',
          'focus-visible:ring-base-content/15 outline-none focus-visible:ring-2',
          'eink:focus-visible:outline eink:focus-visible:outline-2',
          active
            ? 'bg-base-content/10 text-base-content eink-bordered px-2'
            : 'text-base-content/60 hover:text-base-content px-1',
        )}
      >
        {active ? (
          <MdAlarmOn size={iconSize} aria-hidden='true' />
        ) : (
          <MdOutlineAlarm size={iconSize} aria-hidden='true' />
        )}
        {running && (
          <span aria-hidden='true' className='text-xs font-medium tabular-nums'>
            {timerLabel}
          </span>
        )}
        {chapterEnd && (
          // Words only where they fit beside the book title; on a small phone
          // the filled pill and alarm-on glyph carry it (the name says it).
          <span aria-hidden='true' className='hidden text-xs font-medium min-[400px]:inline'>
            {/* Same words as the menu item. */}
            {_('End of Chapter')}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role='menu'
          aria-label={_('Sleep Timer')}
          onKeyDown={handleMenuKeyDown}
          className={clsx(
            'absolute bottom-full end-2 z-50 mb-2 w-52 py-1.5',
            'bg-base-200 text-base-content eink-bordered rounded-xl shadow-xl',
            'ring-base-content/10 ring-1',
          )}
        >
          {options.map((option, i) => {
            const checked = option.value === timeoutOption;
            return (
              <button
                key={option.value}
                type='button'
                role='menuitemradio'
                aria-checked={checked}
                onClick={() => {
                  onSelect(option.value);
                  close();
                }}
                className={clsx(
                  'flex min-h-10 w-full items-center gap-2 px-3 text-start text-sm',
                  'hover:bg-base-content/5 focus-visible:bg-base-content/10 outline-none',
                  'eink:focus-visible:outline eink:focus-visible:outline-2 eink:-outline-offset-2',
                  // A rule between "off / chapter end" and the durations.
                  i === 2 && 'border-base-content/10 mt-1 border-t pt-1',
                )}
              >
                <span className='flex w-4 shrink-0 justify-center'>
                  {checked && <MdCheck size={16} aria-hidden='true' />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
