// Readalong, development builds only: import the books listed (as URLs) in
// NEXT_PUBLIC_READALONG_DEV_BOOKS once, so a test book is in the library on
// first run. Set it in .env.development.local (git-ignored); release builds
// never bundle or fetch a book (see scripts/strip-dev-books.mjs).
import { useEffect, useRef } from 'react';
import type { SelectedFile } from '@/hooks/useFileSelector';

const DONE_KEY = 'readalong-dev-books-imported';

/** URLs to record as imported: only those whose fetch succeeded, so a URL that
 *  404s or fails offline is tried again next run (QA RA-5). */
export const nextImportedList = (
  done: string[],
  fetchedUrls: string[],
  importedCount: number,
): string[] => (importedCount > 0 ? [...new Set([...done, ...fetchedUrls])] : done);

type ImportBooks = (
  files: SelectedFile[],
  groupId?: string,
  options?: { silent?: boolean },
) => Promise<{ importedCount: number }>;

export const useDevBookSeed = (libraryLoaded: boolean, importBooks: ImportBooks) => {
  const startedRef = useRef(false);
  const importRef = useRef(importBooks);
  importRef.current = importBooks;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !libraryLoaded) return;
    if (startedRef.current) return;
    const urls = (process.env['NEXT_PUBLIC_READALONG_DEV_BOOKS'] ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    if (!urls.length) return;
    startedRef.current = true;
    let done: string[] = [];
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]');
      done = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      done = [];
    }
    const pending = urls.filter((url) => !done.includes(url));
    if (!pending.length) return;
    void (async () => {
      const files: SelectedFile[] = [];
      const fetchedUrls: string[] = [];
      for (const url of pending) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const name = decodeURIComponent(url.split('/').pop() || 'book.epub');
          files.push({ file: new File([await response.blob()], name) });
          fetchedUrls.push(url);
        } catch (e) {
          console.warn('Readalong dev book not imported', url, e);
        }
      }
      if (!files.length) return;
      const { importedCount } = await importRef.current(files, undefined, { silent: true });
      if (importedCount > 0) {
        try {
          localStorage.setItem(
            DONE_KEY,
            JSON.stringify(nextImportedList(done, fetchedUrls, importedCount)),
          );
        } catch {
          // Private mode: it imports again next time, and dedups by content.
        }
      }
    })();
  }, [libraryLoaded]);
};
