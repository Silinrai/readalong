// Readalong: the PC audiobook queue's API, as poc/genqueue/server.py sends it.
// The PC is the authority on every job; the phone only asks and displays.

export type QueueJobState =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'waiting'
  | 'importing'
  | 'processing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const FINISHED_STATES: QueueJobState[] = ['completed', 'failed', 'cancelled'];
export const QUEUED_STATES: QueueJobState[] = [
  'pending',
  'uploading',
  'uploaded',
  'waiting',
  'paused',
];

export interface JobProgress {
  /** Counted from work the PC really did. */
  actual: {
    percent: number | null;
    chapters_done: number;
    chapters_total: number;
    sentences_done: number;
    sentences_total: number;
    chars_done: number;
    chars_total: number;
    audio_seconds: number;
    elapsed_seconds: number;
  };
  /** From the voicing speed measured on the PC: an estimate. */
  estimated: {
    seconds_left: number | null;
    chars_per_second: number | null;
    basis: 'this book' | 'this PC' | null;
    size_estimated?: boolean;
  };
}

export interface QueueJob {
  id: string;
  checksum: string;
  title: string;
  author: string;
  filename: string;
  profile: string;
  priority: number;
  position: number;
  state: QueueJobState;
  stage_note: string;
  error: string;
  failed_chapters: number[];
  attempts: number;
  hidden: boolean;
  created_at: number;
  updated_at: number;
  started_at: number;
  finished_at: number;
  has_cover: boolean;
  has_output: boolean;
  queue_position: number | null;
  progress: JobProgress;
}

export interface QueueSummary {
  counts: {
    submitted: number;
    completed: number;
    processing: number;
    waiting: number;
    paused: number;
    failed: number;
    cancelled: number;
  };
  actual: { percent: number | null; chars_done: number; chars_total: number; unsized: number };
  estimated: { seconds_left: number | null; complete: boolean };
}

export interface QueueSettings {
  max_concurrent: number;
  priority: 'low' | 'below_normal' | 'normal';
  windows: string[];
  pause_when_in_use: boolean;
  idle_minutes: number;
}

export interface QueueStatus {
  version: string;
  time: number;
  paused: boolean;
  /** Why nothing is running right now ('' = running or idle). */
  gate: string;
  current: string | null;
  summary: QueueSummary;
  jobs: QueueJob[];
  settings: QueueSettings;
}

/** A VoiceStudio voice: for generating audiobooks on the PC only. The phone's
 *  live read-aloud voices are a different list. */
export interface VoiceProfile {
  id: string;
  name: string;
  kind: string;
  language: string;
  description: string;
  default: boolean;
}
