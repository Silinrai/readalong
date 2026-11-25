// Readalong: a one-time guide to the narration gestures, shown the first time a
// book's own narration plays. Every gesture is invisible otherwise. Built like
// Readalong's PageTurnHint: an overlay sized to the reading area.
import clsx from 'clsx';
import { useEffect, useId, useRef, useState } from 'react';
import { MdChevronLeft, MdChevronRight, MdMenu, MdSwipe, MdSwipeVertical } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { useDeviceControlStore } from '@/store/deviceStore';
import { eventDispatcher } from '@/utils/event';
import { getOSPlatform } from '@/utils/misc';
import { getReadingAreaRect } from '@/app/reader/hooks/useAutoPageTurn';

export const NARRATION_TIPS_KEY = 'readalong-narration-tips-seen';

const readSeen = (): boolean => {
  try {
    return localStorage.getItem(NARRATION_TIPS_KEY) === '1';
  } catch {
    return false;
  }
};

const writeSeen = () => {
  try {
    localStorage.setItem(NARRATION_TIPS_KEY, '1');
  } catch {
    // Private mode or blocked storage: the tips may show again next time.
  }
};

type Props = {
  bookKey: string;
  /** Scrolled mode: swipes scroll the book, so only tapping is explained. */
  scrolled: boolean;
  /** Custom tap zones are set: the default zones are not drawn. */
  customZones?: boolean;
};

// Readalong's tap zones while narration plays (usePagination): the middle
// half shows the menu, the sides turn the page.
const SIDE_ZONE = '25%';
const MIDDLE_ZONE = '50%';

export const NarrationGestureTips = ({ bookKey, scrolled, customZones = false }: Props) => {
  const _ = useTranslation();
  const [open, setOpen] = useState(() => !readSeen());
  const [shown, setShown] = useState(false);
  const titleId = useId();
  const introId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Focus returns here on dismiss, so the book's keys keep working.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus();
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const dismiss = () => {
    writeSeen();
    setOpen(false);
    returnFocusRef.current?.focus?.();
  };
  // Android's Back closes the tips, not the book underneath. Registered
  // after the reader's own Back handler, so it is asked first.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!open || getOSPlatform() !== 'android') return;
    const onBack = (event: CustomEvent) => {
      if (event.detail?.keyName !== 'Back') return false;
      dismissRef.current();
      return true;
    };
    const { acquireBackKeyInterception, releaseBackKeyInterception } =
      useDeviceControlStore.getState();
    acquireBackKeyInterception();
    eventDispatcher.onSync('native-key-down', onBack);
    return () => {
      eventDispatcher.offSync('native-key-down', onBack);
      releaseBackKeyInterception();
    };
  }, [open]);

  if (!open) return null;

  const area = getReadingAreaRect(bookKey);
  const box = area
    ? { left: area.left, top: area.top, width: area.width, height: area.height }
    : { left: 0, top: 0, width: '100%', height: '100%' };

  const tips: Array<{ icon: React.ReactNode; text: string }> = [
    { icon: <MdMenu />, text: _('Tap the middle of the page to show the menu.') },
    ...(scrolled
      ? []
      : [
          {
            icon: <MdSwipeVertical />,
            text: _(
              'Drag up or down on either page: the outline follows your finger. Let go to listen from that line.',
            ),
          },
          {
            icon: <MdSwipe />,
            text: _('Swipe sideways to stop narration and read.'),
          },
        ]),
  ];

  return (
    <div
      // Not aria-modal: it covers the reading area only; the mini-player and
      // toolbars stay usable.
      role='dialog'
      aria-labelledby={titleId}
      // A tap on the tips must not start a page turn underneath (Android's
      // native turn layer checks for this; utils/readerOverlay.ts).
      data-capture-blocking-overlay='true'
      aria-describedby={scrolled ? undefined : introId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          dismiss();
        }
      }}
      className={clsx(
        'fixed z-[60] motion-safe:transition-opacity motion-safe:duration-200',
        shown ? 'opacity-100' : 'opacity-0',
      )}
      style={box}
    >
      {/* Solid: the page behind must not compete with the tips. */}
      <div className='bg-base-100 absolute inset-0' />
      <div className='absolute inset-0 flex items-center justify-center px-6'>
        <div className='text-base-content flex w-full max-w-sm flex-col gap-4'>
          <h2 id={titleId} className='text-base font-semibold'>
            {_('Listening tips')}
          </h2>
          {!scrolled && (
            <p id={introId} className='text-sm leading-snug'>
              {_('Tap the left or right side to turn the page. Narration follows.')}
            </p>
          )}
          {!customZones && (
            // Where the default tap zones are, in miniature. Physical left and
            // right on purpose: tap zones are screen positions, RTL too.
            <div
              aria-hidden='true'
              className='text-base-content/70 eink:text-base-content flex h-12 gap-1 text-xs'
            >
              {[
                { width: SIDE_ZONE, content: <MdChevronLeft size={20} /> },
                { width: MIDDLE_ZONE, content: _('Menu') },
                { width: SIDE_ZONE, content: <MdChevronRight size={20} /> },
              ].map((zone, i) => (
                <div
                  key={i}
                  style={{ width: zone.width }}
                  className={clsx(
                    'flex items-center justify-center rounded-lg border-2 border-dashed',
                    'border-base-content/30 eink:border-base-content',
                  )}
                >
                  {zone.content}
                </div>
              ))}
            </div>
          )}
          <ul className='flex flex-col gap-3'>
            {tips.map((tip) => (
              <li key={tip.text} className='flex items-start gap-2.5 text-sm leading-snug'>
                <span aria-hidden='true' className='text-base-content/70 mt-0.5 shrink-0 text-lg'>
                  {tip.icon}
                </span>
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
          <button
            ref={buttonRef}
            type='button'
            onClick={dismiss}
            className='btn btn-primary btn-sm eink-bordered mt-1 min-h-10 self-start rounded-full px-5'
          >
            {_('Got it')}
          </button>
        </div>
      </div>
    </div>
  );
};
