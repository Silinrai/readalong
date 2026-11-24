import { describe, expect, it } from 'vitest';
import { unnarratedPageNotice } from '@/readalong/narration/narrationJump';

const t = (s: string) => s;

describe('unnarratedPageNotice (No narration toast)', () => {
  it('offers the next narrated chapter when there is one ahead', () => {
    expect(unnarratedPageNotice(t, 41)).toEqual({
      message: 'No narration on this page',
      actionLabel: 'Next narrated chapter',
      target: 41,
    });
  });
  it('says so, with no action, when nothing narrated is left ahead', () => {
    expect(unnarratedPageNotice(t, -1)).toEqual({
      message: 'No narration in the rest of this book',
    });
  });
});

describe('goToSection', () => {
  it('resolves true once the reader reports the target section', async () => {
    const { goToSection } = await import('@/readalong/narration/narrationJump');
    const { useReaderStore } = await import('@/store/readerStore');
    const { setBookProgress } = await import('@/store/readerProgressStore');
    const view = {
      goTo: (index: number) => {
        setTimeout(() => setBookProgress('book', { index } as never), 10);
      },
    };
    const original = useReaderStore.getState().getView;
    useReaderStore.setState({ getView: () => view as never });
    try {
      await expect(goToSection('book', 41)).resolves.toBe(true);
    } finally {
      useReaderStore.setState({ getView: original });
    }
  });
});
