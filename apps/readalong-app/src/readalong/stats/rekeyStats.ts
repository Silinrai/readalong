// Readalong: a book's narrated version replaces it under a new hash (the
// library re-keys the book and keeps its progress and notes). Statistics are
// kept by hash, so move the old hash's reading and listening history onto
// the new one; otherwise the book's stats start again from zero and the
// statistics list shows it twice.
import env from '@/services/environment';
import { StatisticsDb } from '@/services/statistics/statisticsDb';
import type { StatBook } from '@/types/statistics';

export const moveBookStats = async (fromHash: string, to: StatBook): Promise<void> => {
  if (!fromHash || fromHash === to.bookMd5) return;
  try {
    const appService = await env.getAppService();
    const db = await StatisticsDb.open(appService);
    await db.mergeBook(fromHash, to);
  } catch (e) {
    console.warn('[readalong] moving statistics to the new book file failed', e);
  }
};
