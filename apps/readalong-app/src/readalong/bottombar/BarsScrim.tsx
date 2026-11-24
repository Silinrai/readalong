// Readalong: while the reading bars show, a light shade on the page behind
// them (strongest at the top and bottom edges), so the lines they cover read
// as covered on purpose. Never takes a tap; e-ink gets none.
import clsx from 'clsx';

export const BarsScrim = ({ visible }: { visible: boolean }) => (
  <div
    aria-hidden='true'
    className={clsx(
      'ra-bars-scrim pointer-events-none absolute inset-0 z-[9] transition-opacity duration-300',
      'eink:hidden',
      visible ? 'opacity-100' : 'opacity-0',
    )}
  />
);
