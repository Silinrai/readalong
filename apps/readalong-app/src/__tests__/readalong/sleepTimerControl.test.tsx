// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, opts?: Record<string, unknown>) =>
    opts ? Object.entries(opts).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), key) : key,
}));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));

import { SleepTimerControl } from '@/readalong/narration/SleepTimerControl';
import { TTS_STOP_AT_CHAPTER_END } from '@/services/tts/TTSSessionManager';

afterEach(cleanup);

const setup = (timeoutOption: number, timerLabel = '') => {
  const onSelect = vi.fn();
  render(
    <SleepTimerControl timeoutOption={timeoutOption} timerLabel={timerLabel} onSelect={onSelect} />,
  );
  return onSelect;
};

describe('SleepTimerControl (mini-player sleep timer)', () => {
  test('off: the button says so and offers both kinds of timer', () => {
    setup(0);
    const button = screen.getByRole('button', { name: 'Sleep Timer: Off' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'End of Chapter' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: '30 minutes' })).toBeTruthy();
    expect(
      screen.getByRole('menuitemradio', { name: 'No Timeout' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  test('choosing End of Chapter arms the chapter-end stop and closes the menu', () => {
    const onSelect = setup(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sleep Timer: Off' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'End of Chapter' }));
    expect(onSelect).toHaveBeenCalledWith(TTS_STOP_AT_CHAPTER_END);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('chapter-end mode is shown on the button, not by color alone', () => {
    setup(TTS_STOP_AT_CHAPTER_END);
    const button = screen.getByRole('button', { name: 'Sleep Timer: End of Chapter' });
    expect(button.textContent).toContain('End of Chapter');
  });

  test('a running timer shows its countdown', () => {
    setup(1800, '29:58');
    const button = screen.getByRole('button', { name: 'Sleep Timer: 29:58' });
    expect(button.textContent).toContain('29:58');
  });

  test('Escape closes the menu', () => {
    setup(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sleep Timer: Off' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('SleepTimerControl visibility', () => {
  test('the menu closes when the mini-player fades out', () => {
    const { rerender } = render(
      <SleepTimerControl timeoutOption={0} timerLabel='' onSelect={() => {}} visible />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sleep Timer: Off' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    rerender(
      <SleepTimerControl timeoutOption={0} timerLabel='' onSelect={() => {}} visible={false} />,
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
