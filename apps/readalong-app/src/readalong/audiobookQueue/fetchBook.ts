// Readalong: fetch a finished queue book so importBooks can take it.
import type { SelectedFile } from '@/hooks/useFileSelector';
import type { AppService } from '@/types/system';
import type { QueueClient } from './client';
import type { QueueJob } from './types';

export type NativeFiles = Pick<AppService, 'createDir' | 'resolveFilePath'>;

/** A finished job's narrated EPUB, ready for importBooks. Natively it is
 *  streamed to the cache folder and imported by path: these books are
 *  hundreds of MB (book 6: 566 MB), and held in the WebView as an
 *  ArrayBuffer plus a File copy they ran out of memory and failed silently.
 *  `tempPath` (base 'Cache') is the file to delete after the import. */
export const fetchQueueBook = async (
  client: Pick<QueueClient, 'download' | 'downloadUrl'>,
  job: Pick<QueueJob, 'id' | 'title'>,
  native: NativeFiles | null,
  download: (url: string, dst: string) => Promise<unknown>,
): Promise<{ selected: SelectedFile; tempPath: string }> => {
  const name = `${job.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Audiobook'} (narrated).epub`;
  if (!native) {
    const data = await client.download(job.id);
    return {
      selected: { file: new File([data], name, { type: 'application/epub+zip' }) },
      tempPath: '',
    };
  }
  const tempPath = `readalong-queue/${job.id}.epub`;
  await native.createDir('readalong-queue', 'Cache', true);
  const dst = await native.resolveFilePath(tempPath, 'Cache');
  await download(client.downloadUrl(job.id), dst);
  return { selected: { path: dst, name }, tempPath };
};
