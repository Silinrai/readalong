// Readalong: the phone's view of the PC audiobook queue. The PC is the
// authority: this only mirrors its last answer, plus the uploads still on
// their way (which the PC can't know about yet).
import { create } from 'zustand';
import { QueueClient, QueueError } from './client';
import type { QueueJob, QueueStatus, VoiceProfile } from './types';

export interface LocalUpload {
  key: string;
  title: string;
  state: 'uploading' | 'failed';
  error?: string;
}

export interface BookToSend {
  title: string;
  filename: string;
  /** Reads the file only when it's this book's turn to upload. */
  read: () => Promise<ArrayBuffer>;
}

interface QueueState {
  status: QueueStatus | null;
  profiles: VoiceProfile[];
  error: string;
  /** HTTP status of the last failed request (401: pairing code rejected). */
  errorStatus?: number;
  /** Finished audiobooks that couldn't be brought into the library, by job. */
  importErrors: Record<string, string>;
  setImportError: (jobId: string, message?: string) => void;
  dismissUpload: (key: string) => void;
  /** When the PC last answered (ms); the screen says how fresh the data is. */
  updatedAt: number;
  uploads: LocalUpload[];
  busy: boolean;
  refresh: (client: QueueClient) => Promise<void>;
  loadProfiles: (client: QueueClient) => Promise<void>;
  /** Run one queue action; the PC answers with the new status. */
  act: (client: QueueClient, action: () => Promise<QueueStatus | unknown>) => Promise<void>;
  submit: (
    client: QueueClient,
    books: BookToSend[],
    profile: string,
    priority: number,
  ) => Promise<{ created: number; existing: number; failed: number }>;
  reset: () => void;
}

const isStatus = (value: unknown): value is QueueStatus =>
  !!value && typeof value === 'object' && 'jobs' in value && 'summary' in value;

export const useAudiobookQueueStore = create<QueueState>((set, get) => ({
  status: null,
  profiles: [],
  error: '',
  errorStatus: undefined,
  importErrors: {},
  updatedAt: 0,
  uploads: [],
  busy: false,

  setImportError: (jobId, message) =>
    set((s) => {
      const importErrors = { ...s.importErrors };
      if (message) importErrors[jobId] = message;
      else delete importErrors[jobId];
      return { importErrors };
    }),

  dismissUpload: (key) => set((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) })),

  refresh: async (client) => {
    try {
      const status = await client.status();
      set({ status, error: '', errorStatus: undefined, updatedAt: Date.now() });
    } catch (e) {
      set({ error: (e as Error).message, errorStatus: (e as QueueError).status });
    }
  },

  loadProfiles: async (client) => {
    set({ error: '' });
    try {
      set({ profiles: await client.profiles() });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  act: async (client, action) => {
    set({ busy: true });
    try {
      const result = await action();
      if (isStatus(result)) {
        set({ status: result, error: '', errorStatus: undefined, updatedAt: Date.now() });
      } else await get().refresh(client);
    } catch (e) {
      set({
        error: e instanceof QueueError ? e.message : String(e),
        errorStatus: e instanceof QueueError ? e.status : undefined,
      });
    } finally {
      set({ busy: false });
    }
  },

  // One book at a time: phones have little memory to spare and the PC only
  // voices one at a time anyway. Each book keeps its own state, so one
  // failed upload doesn't stop the rest.
  submit: async (client, books, profile, priority) => {
    const result = { created: 0, existing: 0, failed: 0 };
    const keys = books.map((b, i) => `${Date.now()}-${i}-${b.filename}`);
    set((s) => ({
      uploads: [
        ...s.uploads,
        ...books.map((b, i) => ({ key: keys[i]!, title: b.title, state: 'uploading' as const })),
      ],
    }));
    for (const [i, book] of books.entries()) {
      const key = keys[i]!;
      try {
        const { created } = await client.submit(
          await book.read(),
          book.filename,
          profile,
          priority,
        );
        result[created ? 'created' : 'existing'] += 1;
        set((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) }));
      } catch (e) {
        result.failed += 1;
        set((s) => ({
          uploads: s.uploads.map((u) =>
            u.key === key ? { ...u, state: 'failed', error: (e as Error).message } : u,
          ),
        }));
      }
      await get().refresh(client);
    }
    return result;
  },

  reset: () =>
    set({
      status: null,
      profiles: [],
      error: '',
      errorStatus: undefined,
      importErrors: {},
      updatedAt: 0,
      uploads: [],
    }),
}));

/** Finished jobs with an audiobook the phone hasn't imported yet. */
export const jobsToImport = (
  jobs: QueueJob[],
  imported: Record<string, string> | undefined,
): QueueJob[] =>
  jobs.filter((j) => j.state === 'completed' && j.has_output && !(imported && imported[j.id]));

/** A job whose book never finished uploading to the PC: there is no file
 *  there to voice again, so it can only be sent again from the library. */
export const isUploadCutOff = (job: QueueJob): boolean => job.checksum.startsWith('upload:');

/** Finished jobs that can leave the list without losing anything: all but a
 *  completed audiobook the phone hasn't brought into the library yet. */
export const canHideJob = (job: QueueJob, imported: Record<string, string> | undefined): boolean =>
  ['completed', 'failed', 'cancelled'].includes(job.state) &&
  !(job.state === 'completed' && job.has_output && !imported?.[job.id]);
