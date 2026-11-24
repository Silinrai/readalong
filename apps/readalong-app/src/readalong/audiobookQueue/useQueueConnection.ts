// Readalong: the saved PC address and pairing code as a ready client, and
// the background job that brings finished audiobooks into the library.
import { useEffect, useMemo, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { saveSysSettings } from '@/helpers/settings';
import type { SelectedFile } from '@/hooks/useFileSelector';
import { QueueClient, normalizeQueueUrl } from './client';
import { jobsToImport, useAudiobookQueueStore } from './queueStore';

export const useQueueClient = (): QueueClient | null => {
  const { settings } = useSettingsStore();
  const url = normalizeQueueUrl(settings.audiobookQueueUrl ?? '');
  const token = settings.audiobookQueueToken ?? '';
  return useMemo(() => (url && token ? new QueueClient(url, token) : null), [url, token]);
};

type ImportBooks = (
  files: SelectedFile[],
  groupId?: string,
  options?: { silent?: boolean },
) => Promise<{ importedCount: number; failedPaths: string[] }>;

const IMPORT_EVERY_MS = 2 * 60 * 1000;

/** While the library is open: every two minutes, ask the PC for finished
 *  audiobooks and import the new ones. Each is recorded by job id once
 *  imported, so a book is never brought in twice; removing the job from the
 *  queue list doesn't touch the book. */
export const useAudiobookAutoImport = (libraryLoaded: boolean, importBooks: ImportBooks) => {
  const client = useQueueClient();
  const { envConfig } = useEnv();
  const importRef = useRef(importBooks);
  importRef.current = importBooks;
  const running = useRef(false);

  useEffect(() => {
    if (!client || !libraryLoaded) return;
    let stopped = false;
    const tick = async () => {
      if (running.current || stopped) return;
      running.current = true;
      try {
        await useAudiobookQueueStore.getState().refresh(client);
        const status = useAudiobookQueueStore.getState().status;
        if (!status) return;
        const imported = { ...(useSettingsStore.getState().settings.audiobookQueueImported ?? {}) };
        for (const job of jobsToImport(status.jobs, imported)) {
          const data = await client.download(job.id);
          const name = `${job.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Audiobook'} (narrated).epub`;
          const result = await importRef.current(
            [{ file: new File([data], name, { type: 'application/epub+zip' }) }],
            undefined,
            { silent: true },
          );
          if (result.importedCount > 0 || result.failedPaths.length === 0) {
            imported[job.id] = job.checksum;
            await saveSysSettings(envConfig, 'audiobookQueueImported', imported);
          }
        }
      } catch {
        // The PC is off or away: try again next time.
      } finally {
        running.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), IMPORT_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [client, libraryLoaded, envConfig]);
};
