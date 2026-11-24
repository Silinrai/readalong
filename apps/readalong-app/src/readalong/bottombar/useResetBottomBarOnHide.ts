// Readalong: when the reader's bars hide (tap the middle of the page), the
// panel that was open (Visual Options, colours, page jump) closes with them,
// so the bars come back with nothing selected.
import { useEffect } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { installReadalongDiagnostics } from '../diagnostics';
import { isBarsHiddenForTurn } from './toggleBars';

export const useResetBottomBarOnHide = () => {
  // Diagnostic builds only (NEXT_PUBLIC_READALONG_DIAG=1); a no-op otherwise.
  installReadalongDiagnostics();
  const hoveredBookKey = useReaderStore((s) => s.hoveredBookKey);
  useEffect(() => {
    if (hoveredBookKey) return;
    // A page-turn snapshot hides the bars for a moment; that is not the reader
    // hiding them, so the open panel stays (toggleBars.ts).
    if (isBarsHiddenForTurn()) return;
    const { bottomBarTab, setBottomBarTab } = useReaderStore.getState();
    if (bottomBarTab) setBottomBarTab('');
  }, [hoveredBookKey]);
};
