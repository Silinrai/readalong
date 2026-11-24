// Readalong: wording for the audiobook queue screen. Measured progress and
// estimates are kept apart on purpose: a percentage is only shown when the PC
// counted it, and any time left is marked as an estimate.
import type { JobProgress, QueueJob, QueueJobState, QueueSummary } from './types';

type T = (key: string, options?: Record<string, string | number>) => string;

export const formatDuration = (_: T, seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return _('under a minute');
  const mins = Math.round(seconds / 60);
  if (mins < 60) return _('{{count}} min', { count: mins });
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 48)
    return rest ? _('{{h}} h {{m}} min', { h: hours, m: rest }) : _('{{h}} h', { h: hours });
  return _('{{d}} days', { d: Math.round(hours / 24) });
};

export const stateLabel = (_: T, state: QueueJobState): string =>
  ({
    pending: _('Pending'),
    uploading: _('Uploading'),
    uploaded: _('Uploaded'),
    waiting: _('Waiting in queue'),
    importing: _('Importing'),
    processing: _('Processing'),
    paused: _('Paused'),
    completed: _('Completed'),
    failed: _('Failed'),
    cancelled: _('Cancelled'),
  })[state] ?? state;

export type Tone = 'neutral' | 'active' | 'done' | 'warn' | 'error';

export const stateTone = (state: QueueJobState): Tone =>
  state === 'completed'
    ? 'done'
    : state === 'failed'
      ? 'error'
      : state === 'paused' || state === 'cancelled'
        ? 'warn'
        : state === 'processing' || state === 'importing' || state === 'uploading'
          ? 'active'
          : 'neutral';

/** "37% · chapter 12 of 54" — only what the PC actually counted. */
export const actualLine = (_: T, progress: JobProgress, state: QueueJobState): string => {
  const a = progress.actual;
  const parts: string[] = [];
  if (a.percent != null && state !== 'completed') parts.push(`${Math.floor(a.percent)}%`);
  if (a.chapters_total) {
    parts.push(
      state === 'completed'
        ? _('{{count}} chapters', { count: a.chapters_total })
        : _('chapter {{n}} of {{total}}', {
            n: Math.min(a.chapters_done + 1, a.chapters_total),
            total: a.chapters_total,
          }),
    );
  }
  if (a.audio_seconds > 0)
    parts.push(_('{{time}} of audio', { time: formatDuration(_, a.audio_seconds) }));
  return parts.join(' · ');
};

/** "about 3 h left (estimate)" or '' when the PC can't tell yet. */
export const estimateLine = (_: T, progress: JobProgress, state: QueueJobState): string => {
  if (state === 'completed' || state === 'failed' || state === 'cancelled') return '';
  const left = progress.estimated.seconds_left;
  if (left == null) return '';
  return _('about {{time}} left (estimate)', { time: formatDuration(_, left) });
};

export const elapsedLine = (_: T, job: QueueJob): string => {
  const s = job.progress.actual.elapsed_seconds;
  return s > 0 ? _('{{time}} spent', { time: formatDuration(_, s) }) : '';
};

export const summaryLine = (_: T, summary: QueueSummary): string => {
  const c = summary.counts;
  const parts = [_('{{count}} submitted', { count: c.submitted })];
  if (c.completed) parts.push(_('{{count}} done', { count: c.completed }));
  if (c.processing) parts.push(_('{{count}} processing', { count: c.processing }));
  if (c.waiting) parts.push(_('{{count}} waiting', { count: c.waiting }));
  if (c.paused) parts.push(_('{{count}} paused', { count: c.paused }));
  if (c.failed) parts.push(_('{{count}} failed', { count: c.failed }));
  return parts.join(' · ');
};

/** Overall: weighted by book size on the PC, never an average of percentages. */
export const overallLine = (_: T, summary: QueueSummary): string => {
  const pct = summary.actual.percent;
  const parts: string[] = [];
  if (pct != null) parts.push(_('{{pct}}% of the voicing done', { pct: Math.floor(pct) }));
  if (summary.estimated.seconds_left != null) {
    parts.push(
      _('about {{time}} left (estimate)', {
        time: formatDuration(_, summary.estimated.seconds_left),
      }),
    );
  }
  return parts.join(' · ');
};
