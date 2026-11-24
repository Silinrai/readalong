import { describe, expect, it } from 'vitest';
import { computeShelfMetrics } from '@/readalong/library/useShelfBackdrop';

describe('computeShelfMetrics', () => {
  it('spaces the shelves at the row spacing with the plank under the covers', () => {
    expect(
      computeShelfMetrics({
        scrollerTop: 52,
        scrollTop: 0,
        rowTops: [52, 265, 478],
        rowHeight: 213,
        coverBottom: 52 + 178,
        listEnd: 52 + 3 * 213,
      }),
    ).toEqual({ pitch: 213, plankY: 178, tail: 3 * 213 });
  });

  // Search results put a header and an empty-state line above the first row
  // (124px here, less than a row): no shelf may be drawn through them. The
  // rows carry their own planks; the empty shelves start below the last row.
  it('starts the empty shelves below the last row, never above the first', () => {
    const metrics = computeShelfMetrics({
      scrollerTop: 88,
      scrollTop: 0,
      rowTops: [88 + 124],
      rowHeight: 275,
      coverBottom: 88 + 124 + 229,
      listEnd: 88 + 124 + 275,
    });
    expect(metrics).toEqual({ pitch: 275, plankY: 229, tail: 124 + 275 });
  });

  it('measures the tail in content coordinates after scrolling', () => {
    const metrics = computeShelfMetrics({
      scrollerTop: 52,
      scrollTop: 500,
      rowTops: [52 + 426 - 500, 52 + 639 - 500],
      rowHeight: 213,
      coverBottom: null,
      listEnd: 52 + 852 - 500,
    });
    expect(metrics).toEqual({ pitch: 213, plankY: 189, tail: 852 });
  });

  it('draws no empty shelves while the list goes on past the rendered rows', () => {
    const metrics = computeShelfMetrics({
      scrollerTop: 0,
      scrollTop: 0,
      rowTops: [0, 213],
      rowHeight: 213,
      coverBottom: 178,
      listEnd: null,
    });
    expect(metrics?.tail).toBeNull();
  });

  it('uses the row height when only one row is rendered, and gives up with none', () => {
    expect(
      computeShelfMetrics({
        scrollerTop: 0,
        scrollTop: 0,
        rowTops: [10],
        rowHeight: 200,
        coverBottom: 190,
        listEnd: 210,
      }),
    ).toEqual({ pitch: 200, plankY: 180, tail: 210 });
    expect(
      computeShelfMetrics({
        scrollerTop: 0,
        scrollTop: 0,
        rowTops: [],
        rowHeight: 0,
        coverBottom: null,
        listEnd: null,
      }),
    ).toBeNull();
  });
});
