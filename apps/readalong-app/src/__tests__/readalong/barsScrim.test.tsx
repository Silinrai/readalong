import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarsScrim } from '@/readalong/bottombar/BarsScrim';

afterEach(cleanup);

describe('BarsScrim', () => {
  it('dims the page edges behind the bars while they show', () => {
    const { container } = render(<BarsScrim visible />);
    const scrim = container.firstElementChild as HTMLElement;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    expect(scrim.className).toContain('pointer-events-none');
    expect(scrim.className).toContain('opacity-100');
  });

  it('is clear when the bars are hidden', () => {
    const { container } = render(<BarsScrim visible={false} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('opacity-0');
  });
});
