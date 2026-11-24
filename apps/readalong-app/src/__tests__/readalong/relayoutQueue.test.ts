import { describe, expect, it } from 'vitest';
import { createRelayoutQueue } from '@/readalong/relayoutQueue';

// A settle() the test releases by hand, to model a relayout still running.
const manualSettle = () => {
  const waiters: (() => void)[] = [];
  return {
    settle: () => new Promise<void>((resolve) => waiters.push(resolve)),
    release: async () => {
      waiters.shift()?.();
      // let the queue's awaits run
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    pending: () => waiters.length,
  };
};

describe('createRelayoutQueue', () => {
  it('never starts a relayout while one is in flight, and runs only the latest value', async () => {
    const applied: number[] = [];
    const gate = manualSettle();
    const queue = createRelayoutQueue({
      settle: gate.settle,
    });

    queue.schedule('fontSize', () => void applied.push(18));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // a drag keeps firing while the first relayout is still settling
    for (const size of [19, 20, 21, 22]) queue.schedule('fontSize', () => void applied.push(size));
    expect(applied).toEqual([18]);
    expect(gate.pending()).toBe(1);

    await gate.release();
    expect(applied).toEqual([18, 22]);
    await gate.release();
    await queue.idle();
    expect(applied).toEqual([18, 22]);
  });

  it('keeps separate settings in one pass, each with its latest task', async () => {
    const applied: string[] = [];
    const queue = createRelayoutQueue({
      settle: () => Promise.resolve(),
    });
    queue.schedule('a', () => void applied.push('a1'));
    queue.schedule('b', () => void applied.push('b1'));
    queue.schedule('a', () => void applied.push('a2'));
    await queue.idle();
    expect(applied).toEqual(['a2', 'b1']);
  });

  it('keeps working after a task throws', async () => {
    const applied: string[] = [];
    const queue = createRelayoutQueue({
      settle: () => Promise.resolve(),
    });
    queue.schedule('a', () => {
      throw new Error('boom');
    });
    await queue.idle();
    queue.schedule('a', () => void applied.push('ok'));
    await queue.idle();
    expect(applied).toEqual(['ok']);
  });
});
