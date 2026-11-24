// Readalong: the last week in the Reading Statistics dialog, each day split
// into minutes read and minutes listened (listeningLog.ts).
import { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { BoxedList, SettingsRow } from '@/components/settings/primitives';
import { formatDuration } from '@/utils/duration';
import { getLocale } from '@/utils/misc';
import { getListeningSeconds, readAndListenedDays } from './listeningLog';

export const ReadListenedSummary = ({ daily }: { daily: Map<string, number> }) => {
  const _ = useTranslation();
  const rows = useMemo(() => readAndListenedDays(daily, getListeningSeconds()), [daily]);
  const time = (seconds: number) => formatDuration(Math.floor(seconds / 60), _);
  const dayName = (date: string, i: number) => {
    if (i === 0) return _('Today');
    if (i === 1) return _('Yesterday');
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString(getLocale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };
  return (
    <BoxedList title={_('Read and Listened')}>
      {rows.map((row, i) => (
        <SettingsRow key={row.date} label={dayName(row.date, i)}>
          <span className='text-base-content/80 text-end text-sm tabular-nums'>
            {_('{{read}} read · {{listened}} listened', {
              read: time(row.read),
              listened: time(row.listened),
            })}
          </span>
        </SettingsRow>
      ))}
    </BoxedList>
  );
};
