import { describe, expect, it } from 'vitest';
import { nextImportedList } from '@/readalong/useDevBookSeed';

describe('nextImportedList (RA-5)', () => {
  it('records only URLs whose fetch succeeded', () => {
    expect(nextImportedList([], ['/a.epub'], 1)).toEqual(['/a.epub']);
  });
  it('keeps earlier entries and does not duplicate', () => {
    expect(nextImportedList(['/a.epub'], ['/a.epub', '/b.epub'], 2)).toEqual([
      '/a.epub',
      '/b.epub',
    ]);
  });
  it('records nothing when nothing imported', () => {
    expect(nextImportedList(['/x.epub'], ['/a.epub'], 0)).toEqual(['/x.epub']);
  });
});
