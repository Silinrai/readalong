import { describe, expect, it } from 'vitest';

import { startsOnSystemGestureEdge } from '@/readalong/gestureEdge';
import { isOnVisiblePage } from '@/readalong/narration/visiblePage';
import { canHideJob, isUploadCutOff, jobsToImport } from '@/readalong/audiobookQueue/queueStore';
import { changedEntries } from '@/readalong/settingsPatch';
import { capturePreset, PRESET_KEYS } from '@/readalong/readingPresets';
import type { QueueJob } from '@/readalong/audiobookQueue/types';
import type { ViewSettings } from '@/types/book';

const job = (over: Partial<QueueJob>): QueueJob =>
  ({ id: 'j', state: 'completed', has_output: true, checksum: 'abc', ...over }) as QueueJob;

describe('swipes from the bottom edge belong to Android', () => {
  it('only touches that start on the bottom strip', () => {
    expect(startsOnSystemGestureEdge(990, 1000)).toBe(true);
    expect(startsOnSystemGestureEdge(900, 1000)).toBe(false);
  });
});

describe('the narration only moves the page for an off-screen sentence', () => {
  it('compares the sentence with the visible range', () => {
    document.body.innerHTML = '<p id="a">one two three</p><p id="b">four five</p>';
    const range = (id: string) => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById(id)!);
      return r;
    };
    expect(isOnVisiblePage(range('a'), range('a'))).toBe(true);
    expect(isOnVisiblePage(range('b'), range('a'))).toBe(false);
    expect(isOnVisiblePage(range('a'), undefined)).toBe(false);
  });
});

describe('the audiobook queue keeps what the phone still needs', () => {
  it("won't drop a finished audiobook that isn't in the library yet", () => {
    expect(canHideJob(job({}), {})).toBe(false);
    expect(canHideJob(job({}), { j: 'abc' })).toBe(true);
    expect(canHideJob(job({ state: 'failed', has_output: false }), {})).toBe(true);
    expect(canHideJob(job({ state: 'processing' }), {})).toBe(false);
  });
  it('knows a cut-off upload has nothing to retry', () => {
    expect(isUploadCutOff(job({ checksum: 'upload:1' }))).toBe(true);
    expect(isUploadCutOff(job({}))).toBe(false);
  });
  it('imports finished audiobooks not yet imported', () => {
    expect(jobsToImport([job({}), job({ id: 'k' })], { j: 'abc' }).map((j) => j.id)).toEqual(['k']);
  });
});

describe('look settings', () => {
  it('a patch can clear a setting', () => {
    expect(
      changedEntries({ marginPx: 10 } as Partial<ViewSettings>, { marginPx: undefined }),
    ).toEqual([['marginPx', undefined]]);
  });
  it('a saved look keeps typeface, side margins and "no night texture"', () => {
    expect(PRESET_KEYS).toEqual(
      expect.arrayContaining(['serifFont', 'sansSerifFont', 'compactMarginLeftPx']),
    );
    const values = capturePreset({ defaultFontSize: 16 } as ViewSettings);
    expect(values.backgroundTextureIdDark).toBe('same');
  });
});
