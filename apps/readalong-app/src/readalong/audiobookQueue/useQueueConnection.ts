// Readalong: the saved PC address and pairing code as a ready client, and
// the background job that brings finished audiobooks into the library.
import { useEffect, useMemo, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { saveSysSettings } from '@/helpers/settings';
import { isWebAppPlatform } from '@/services/environment';
import { tauriDownload } from '@/utils/transfer';
import { eventDispatcher } from '@/utils/event';
import type { SelectedFile } from '@/hooks/useFileSelector';
import { fetchQueueBook } from './fetchBook';
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

// One import run at a time across the whole app: the library page remounts
// (opening a book and coming back), and two runs would download the same
// book twice into the same temporary file.
let autoImportRunning = false;

/** While the library is open: every two minutes, ask the PC for finished
 *  audiobooks and import the new ones. Each is recorded by job id once
 *  imported, so a book is never brought in twice; removing the job from the
 *  queue list doesn't touch the book. */
export const useAudiobookAutoImport = (libraryLoaded: boolean, importBooks: ImportBooks) => {
  const client = useQueueClient();
  const { envConfig, appService } = useEnv();
  const importRef = useRef(importBooks);
  importRef.current = importBooks;

  useEffect(() => {
    if (!client || !libraryLoaded) return;
    let stopped = false;
    const tick = async () => {
      if (autoImportRunning || stopped) return;
      autoImportRunning = true;
      const store = useAudiobookQueueStore.getState();
      try {
        await store.refresh(client);
        const status = useAudiobookQueueStore.getState().status;
        if (!status) return;
        const imported = useSettingsStore.getState().settings.audiobookQueueImported ?? {};
        for (const job of jobsToImport(status.jobs, imported)) {
          if (stopped) break;
          // Each book on its own: one that fails to download or import
          // doesn't hold back the ones after it.
          try {
            const { selected, tempPath } = await fetchQueueBook(
              client,
              job,
              isWebAppPlatform() ? null : appService,
              tauriDownload,
            );
            try {
              const result = await importRef.current([selected], undefined, { silent: true });
              if (result.importedCount > 0 || result.failedPaths.length === 0) {
                // Re-read just before saving, so another change isn't lost.
                const latest = {
                  ...(useSettingsStore.getState().settings.audiobookQueueImported ?? {}),
                  [job.id]: job.checksum,
                };
                await saveSysSettings(envConfig, 'audiobookQueueImported', latest);
                store.setImportError(job.id);
              } else {
                store.setImportError(job.id, "the library didn't accept the file");
              }
            } finally {
              if (tempPath) await appService?.deleteFile(tempPath, 'Cache').catch(() => {});
            }
          } catch (e) {
            store.setImportError(job.id, (e as Error).message || String(e));
          }
        }
      } catch (e) {
        // The PC is off or away: try again next time.
        console.warn('[readalong-queue] auto-import', e);
      } finally {
        autoImportRunning = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), IMPORT_EVERY_MS);
    const now = () => void tick();
    eventDispatcher.on('readalong-queue-import-now', now);
    return () => {
      stopped = true;
      clearInterval(timer);
      eventDispatcher.off('readalong-queue-import-now', now);
    };
  }, [client, libraryLoaded, envConfig, appService]);
};
