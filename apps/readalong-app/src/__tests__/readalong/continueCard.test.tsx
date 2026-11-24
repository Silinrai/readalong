import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';

const openBook = vi.fn();
vi.mock('@/app/library/hooks/useOpenBook', () => ({ useOpenBook: () => ({ openBook }) }));
vi.mock('@/components/BookCover', () => ({ default: () => <span>cover</span> }));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, opts?: Record<string, unknown>) =>
    key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts?.[name] ?? '')),
}));

import { ContinueCard } from '@/readalong/library/ContinueCard';

afterEach(cleanup);

const book = {
  hash: 'h',
  title: 'HWFWM 5',
  author: 'Shirtaloon',
  updatedAt: 2,
  createdAt: 0,
  progress: [25, 100],
} as Book;

describe('ContinueCard', () => {
  it('shows the book in progress and opens it', () => {
    render(<ContinueCard books={[book]} handleBookDownload={vi.fn()} />);
    expect(screen.getByText('25% read')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue: HWFWM 5' }));
    expect(openBook).toHaveBeenCalledWith(book);
  });

  it('is absent when no book is in progress', () => {
    const { container } = render(
      <ContinueCard books={[{ ...book, progress: null }]} handleBookDownload={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
