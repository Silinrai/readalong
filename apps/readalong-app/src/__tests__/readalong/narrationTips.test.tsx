// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

import {
  NarrationGestureTips,
  NARRATION_TIPS_KEY,
} from '@/readalong/narration/NarrationGestureTips';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('NarrationGestureTips (first narration)', () => {
  test('shows once, explains the gestures, and is not shown again after Got it', () => {
    const { unmount } = render(<NarrationGestureTips bookKey='b' scrolled={false} />);
    const dialog = screen.getByRole('dialog', { name: 'Listening tips' });
    expect(dialog.textContent).toContain('Tap the middle of the page to show the menu.');
    expect(dialog.textContent).not.toContain('Tap a sentence');
    expect(dialog.textContent).toContain('Swipe sideways');
    expect(dialog.textContent).toContain('Drag up or down');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(NARRATION_TIPS_KEY)).toBe('1');
    unmount();
    render(<NarrationGestureTips bookKey='b' scrolled={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('Escape dismisses it too', () => {
    render(<NarrationGestureTips bookKey='b' scrolled={false} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(NARRATION_TIPS_KEY)).toBe('1');
  });

  test('scrolled mode leaves out the swipe gestures (swipes scroll there)', () => {
    render(<NarrationGestureTips bookKey='b' scrolled />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Tap the middle of the page to show the menu.');
    expect(dialog.textContent).not.toContain('Swipe sideways');
    expect(dialog.textContent).not.toContain('Drag up or down');
  });

  test('without storage it still renders and dismisses', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<NarrationGestureTips bookKey='b' scrolled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
