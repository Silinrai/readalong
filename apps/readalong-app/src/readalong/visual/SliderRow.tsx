// Readalong: one row of the Visual Options sheet, laid out like Moon+ Reader's:
// the setting's name, its value, a slider, and − / + buttons for exact steps.
import clsx from 'clsx';
import { useEffect, useId, useState } from 'react';
import { MdAdd, MdRemove } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** How the value is shown (defaults to the number itself). */
  format?: (value: number) => string;
  disabled?: boolean;
};

const roundTo = (value: number, step: number) => {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(value.toFixed(decimals));
};

export const SliderRow = ({ label, value, min, max, step, onChange, format, disabled }: Props) => {
  const _ = useTranslation();
  const id = useId();
  // Follows the slider while dragging; the setting catches up through the
  // caller's relayout queue.
  const [shown, setShown] = useState(value);
  useEffect(() => setShown(value), [value]);

  const set = (next: number) => {
    const clamped = roundTo(Math.min(max, Math.max(min, next)), step);
    setShown(clamped);
    onChange(clamped);
  };
  const fill = max > min ? ((shown - min) / (max - min)) * 100 : 0;
  const text = format ? format(shown) : String(shown);

  return (
    <div className='ra-slider-row'>
      <label htmlFor={id} className='ra-slider-label'>
        {label}
      </label>
      <span className='ra-slider-value' aria-hidden='true'>
        {text}
      </span>
      <input
        id={id}
        type='range'
        className='ra-slider'
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-valuetext={text}
        style={{ '--ra-fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => set(Number(e.target.value))}
      />
      <div className='flex shrink-0 items-center'>
        <button
          type='button'
          className={clsx('ra-step-button', shown <= min && 'opacity-40')}
          aria-label={`${_('Decrease')} ${label}`}
          disabled={disabled || shown <= min}
          onClick={() => set(shown - step)}
        >
          <MdRemove size={22} aria-hidden='true' />
        </button>
        <button
          type='button'
          className={clsx('ra-step-button', shown >= max && 'opacity-40')}
          aria-label={`${_('Increase')} ${label}`}
          disabled={disabled || shown >= max}
          onClick={() => set(shown + step)}
        >
          <MdAdd size={22} aria-hidden='true' />
        </button>
      </div>
    </div>
  );
};

/** A group of rows on its own card, with a Reset for just that group. */
export const OptionsCard = ({
  title,
  onReset,
  children,
}: {
  title?: string;
  onReset?: () => void;
  children: React.ReactNode;
}) => {
  const _ = useTranslation();
  return (
    <section className='ra-options-card' aria-label={title}>
      {title && <h3 className='ra-options-card-title'>{title}</h3>}
      <div className='flex flex-col gap-1'>{children}</div>
      {onReset && (
        <div className='flex justify-end'>
          <button type='button' className='ra-reset-button' onClick={onReset}>
            {_('Reset')}
            <svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'>
              <path fill='currentColor' d='M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z' />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
};
