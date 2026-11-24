// RA-4: every UI string has a translation in every locale. The i18n scanner
// (pnpm i18n:extract) writes __STRING_NOT_TRANSLATED__ for a key that has none;
// a key it never wrote (extraction not run) is caught by the second test, which
// reads the `_('...')` literals straight from the fork's source.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import langs from '../../../i18n-langs.json';

const root = join(__dirname, '../../..');
const read = (lng: string): Record<string, string> =>
  JSON.parse(readFileSync(join(root, 'public/locales', lng, 'translation.json'), 'utf-8'));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });

// Every `_('literal')` in the fork's own code.
const forkKeys = [
  ...new Set(
    sourceFiles(join(root, 'src/readalong')).flatMap((file) =>
      // Fork keys contain no apostrophes, so the literal ends at the next quote.
      [...readFileSync(file, 'utf-8').matchAll(/_\(\s*'([^']+)'/g)].map((m) => m[1]!),
    ),
  ),
];
const others = (langs as string[]).filter((lng) => lng !== 'en');
const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('translation coverage', () => {
  it('finds the fork strings to check', () => {
    expect(forkKeys).toContain('No narration on this page');
    expect(forkKeys.length).toBeGreaterThan(15);
  });

  it.each(others)('%s has no untranslated strings', (lng) => {
    const missing = Object.entries(read(lng))
      .filter(([, value]) => value === '__STRING_NOT_TRANSLATED__')
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  // 2026-11-23, the owner: "tbh the translations dont matter". New Readalong
  // strings may stay English (i18next falls back to the key); a string that
  // IS translated must still keep its placeholders, or the UI would show
  // a raw {{count}} or lose a number.
  it.each(others)('%s keeps placeholders in every translated Readalong string', (lng) => {
    const strings = read(lng);
    for (const key of forkKeys.filter((k) => strings[k])) {
      expect(placeholders(strings[key]!), `${lng}: ${key}`).toEqual(placeholders(key));
    }
  });
});
