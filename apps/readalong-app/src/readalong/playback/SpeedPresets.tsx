// Readalong: one-tap listening speeds above Readalong's speed ruler (the ruler
// stays for any other speed, 0.5x to 3x in 0.05 steps).
import clsx from 'clsx';
import { useTranslation } from '@/hooks/useTranslation';
import { SPEED_PRESETS } from './profile';

const label = (rate: number) => `${parseFloat(rate.toFixed(2))}×`;

const SpeedPresets: React.FC<{ rate: number; onSelect: (rate: number) => void }> = ({
  rate,
  onSelect,
}) => {
  const _ = useTranslation();
  return (
    <div
      role='radiogroup'
      aria-label={_('Speed')}
      className='flex flex-wrap justify-center gap-2 px-2'
    >
      {SPEED_PRESETS.map((p) => {
        const selected = Math.abs(p - rate) < 0.001;
        return (
          <button
            key={p}
            type='button'
            role='radio'
            aria-checked={selected}
            onClick={() => onSelect(p)}
            className={clsx(
              'min-h-11 min-w-14 rounded-full border px-3 text-sm tabular-nums',
              'focus-visible:ring-primary outline-none focus-visible:ring-2',
              selected
                ? 'border-primary bg-primary/15 text-base-content eink:bg-base-content eink:text-base-100'
                : 'border-base-content/20 text-base-content/85 hover:bg-base-content/5',
            )}
          >
            {label(p)}
          </button>
        );
      })}
    </div>
  );
};

export default SpeedPresets;
