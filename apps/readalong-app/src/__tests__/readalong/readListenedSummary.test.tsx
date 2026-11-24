import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadListenedSummary } from '@/readalong/stats/ReadListenedSummary';
import { recordListening } from '@/readalong/stats/listeningLog';
import { toDateKey } from '@/services/statistics/readingStats';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, opts?: Record<string, unknown>) =>
    key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts?.[name] ?? '')),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ReadListenedSummary', () => {
  it("splits today's time into read and listened", () => {
    recordListening([{ startTime: Date.now() / 1000, duration: 20 * 60 }]);
    render(<ReadListenedSummary daily={new Map([[toDateKey(new Date()), 50 * 60]])} />);
    screen.getByText('Today');
    const texts = screen.getAllByText(/read · /).map((el) => el.textContent);
    expect(texts[0]).toMatch(/30.*read · .*20.*listened/);
  });
});
