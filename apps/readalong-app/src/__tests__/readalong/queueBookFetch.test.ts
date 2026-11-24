import { describe, expect, it, vi } from 'vitest';
import { fetchQueueBook } from '@/readalong/audiobookQueue/fetchBook';

const job = { id: 'eb5fcfd73da4', title: 'He Who Fights with Monsters 6: A LitRPG Adventure' };

const client = () => ({
  download: vi.fn(async () => new ArrayBuffer(8)),
  downloadUrl: vi.fn((id: string) => `http://pc:3910/api/jobs/${id}/download?token=t`),
});

describe('fetchQueueBook', () => {
  it('streams a finished book to disk natively instead of holding it in memory', async () => {
    const c = client();
    const native = {
      createDir: vi.fn(async () => {}),
      resolveFilePath: vi.fn(async (p: string) => `/data/cache/${p}`),
    };
    const download = vi.fn(async () => ({}));
    const { selected, tempPath } = await fetchQueueBook(c, job, native, download);

    expect(c.download).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(
      'http://pc:3910/api/jobs/eb5fcfd73da4/download?token=t',
      '/data/cache/readalong-queue/eb5fcfd73da4.epub',
    );
    expect(selected).toEqual({
      path: '/data/cache/readalong-queue/eb5fcfd73da4.epub',
      name: 'He Who Fights with Monsters 6  A LitRPG Adventure (narrated).epub',
    });
    expect(tempPath).toBe('readalong-queue/eb5fcfd73da4.epub');
  });

  it('uses an in-memory File on the web build', async () => {
    const c = client();
    const { selected, tempPath } = await fetchQueueBook(c, job, null, vi.fn());
    expect(c.download).toHaveBeenCalledWith('eb5fcfd73da4');
    expect(selected.file?.name).toBe(
      'He Who Fights with Monsters 6  A LitRPG Adventure (narrated).epub',
    );
    expect(tempPath).toBe('');
  });
});
