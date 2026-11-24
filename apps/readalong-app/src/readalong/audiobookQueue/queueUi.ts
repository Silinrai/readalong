// Readalong: which audiobook-queue dialog is open, so the library menu and
// the select-mode bar can open them without passing props through the page.
import { create } from 'zustand';
import type { BookToSend } from './queueStore';

interface QueueUiState {
  queueOpen: boolean;
  generateBooks: BookToSend[] | null;
  openQueue: () => void;
  closeQueue: () => void;
  openGenerate: (books: BookToSend[]) => void;
  closeGenerate: () => void;
}

export const useQueueUi = create<QueueUiState>((set) => ({
  queueOpen: false,
  generateBooks: null,
  openQueue: () => set({ queueOpen: true }),
  closeQueue: () => set({ queueOpen: false }),
  openGenerate: (books) => set({ generateBooks: books }),
  closeGenerate: () => set({ generateBooks: null }),
}));
