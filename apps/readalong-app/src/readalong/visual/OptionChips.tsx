// Readalong: a row of choices in the Visual Options sheet (typeface,
// alignment, highlight style). One can be chosen; it reads as pressed.
import clsx from 'clsx';

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  /** Shown in the chip's own face, e.g. a font name in that font. */
  fontFamily?: string;
};

type Props<T extends string> = {
  label: string;
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
};

export const OptionChips = <T extends string>({ label, options, value, onChange }: Props<T>) => (
  <div className='flex flex-col gap-2 px-1 py-1.5' role='group' aria-label={label}>
    <span className='text-base-content/70 text-xs font-medium'>{label}</span>
    <div className='flex flex-wrap gap-2'>
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type='button'
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            style={option.fontFamily ? { fontFamily: option.fontFamily } : undefined}
            className={clsx(
              'min-h-10 rounded-full border px-3.5 text-sm',
              'focus-visible:ring-primary outline-none focus-visible:ring-2',
              pressed
                ? 'border-primary bg-primary/15 text-base-content eink:bg-base-content eink:text-base-100'
                : 'border-base-content/20 text-base-content/85 hover:bg-base-content/5',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);
