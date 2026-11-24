// Readalong: gestures that steer narration while it runs.
//
// - Drag up or down on a page: an outline marks the narrated line under the
//   finger and follows it, on whichever page of a two-page spread was touched.
//   Letting go plays from that line.
// - Swipe sideways: narration off; the page turns as usual.
//
// Taps do not move the narration: the middle of the page shows the menu and
// the sides turn the page (narration follows), via Readalong's zones or the
// custom tap zones (tapZoneActions.ts).
import { useEffect, useRef } from 'react';
import type { TTSController } from '@/services/tts';
import { useReaderStore } from '@/store/readerStore';
import { eventDispatcher } from '@/utils/event';
import { registerTouchInterceptor, type TouchDetail } from '@/app/reader/hooks/useTouchInterceptor';
import { classifyNarrationSwipe, isNarrationDrag, textRangeNearWindowPoint } from './gestures';
import { markSwipeOff, markUserPageTurn } from './turnIntent';
import type { NarrationUi } from './useNarrationFollow';

// Above the fixed-layout swipe flip (0) and the captured turn (5); the reading
// ruler is checked explicitly instead.
const NARRATION_SWIPE_PRIORITY = 50;
// The sideways swipe's own page turn animates first; stopping narration
// re-lays out the page (the mini player's space goes), so it waits.
const SWIPE_OFF_STOP_DELAY_MS = 350;

// Touches report screen coordinates; the window point is found the way
// Readalong's tap zones find it (usePagination).
const windowPoint = (detail: TouchDetail) => ({
  x: detail.touch.screenX - window.screenX,
  y: detail.touch.screenY - window.screenY,
});

export const useNarrationGestures = ({
  bookKey,
  controller,
  controllerRef,
  ui,
}: {
  bookKey: string;
  controller: TTSController | null;
  controllerRef: React.MutableRefObject<TTSController | null>;
  ui: NarrationUi;
}) => {
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    if (!controller) return;
    const live = () => controllerRef.current === controller;

    const playFrom = (range: Range, index: number) => {
      void controller.playFromRange(range, index).then((result) => {
        if (!live() || result === 'superseded') return;
        const { setPlaying, setShowBack, toast, translate: _ } = uiRef.current;
        if (result === 'started') {
          setPlaying(true);
          setShowBack(false);
        } else {
          // The jump may have stopped playback before finding nothing (S-2).
          if (controller.state === 'stop-paused') {
            setPlaying(false);
            setShowBack(true);
          }
          toast(_('No narration for this sentence'));
        }
      });
    };

    // The narrated line under the finger, on whichever page it is.
    const lineUnderFinger = (detail: TouchDetail): { range: Range; index: number } | null => {
      const view = useReaderStore.getState().getView(bookKey);
      if (!view) return null;
      const { x, y } = windowPoint(detail);
      const hit = textRangeNearWindowPoint(view.renderer.getContents(), x, y);
      if (!hit) return null;
      const range = controller.narrationRangeNear(hit.range);
      return range ? { range, index: hit.index } : null;
    };

    let drag: { range: Range; index: number } | null = null;
    let dragging = false;
    const endDrag = () => {
      if (drag) controller.clearSeekPreview();
      drag = null;
      dragging = false;
    };
    const unregister = registerTouchInterceptor(
      `narration-swipe-${bookKey}`,
      (bk, detail) => {
        if (bk !== bookKey || !live()) return false;
        const { getView, getViewSettings, hoveredBookKey } = useReaderStore.getState();
        const viewSettings = getViewSettings(bookKey);
        if (viewSettings?.scrolled || viewSettings?.readingRulerEnabled) return false;
        // Toolbars up: the swipe is about them.
        if (hoveredBookKey) {
          endDrag();
          return false;
        }
        if (detail.phase === 'start' || detail.phase === 'cancel') {
          endDrag();
          return false;
        }
        if (detail.phase === 'move') {
          if (!dragging && !isNarrationDrag(detail.deltaX, detail.deltaY)) return false;
          dragging = true;
          const target = lineUnderFinger(detail);
          if (target && target.range !== drag?.range) {
            drag = target;
            controller.previewNarrationRange(target.range);
          }
          return true;
        }
        // phase === 'end'
        if (dragging) {
          const target = lineUnderFinger(detail) ?? drag;
          endDrag();
          if (target) playFrom(target.range, target.index);
          return true;
        }
        if (classifyNarrationSwipe(detail.deltaX, detail.deltaY) === 'turn') {
          if (viewSettings?.disableSwipe) return false;
          // "I'll read now": narration off, the page turns as usual.
          const view = getView(bookKey);
          markSwipeOff(view);
          const { toast, translate: _ } = uiRef.current;
          toast(_('Narration off'));
          setTimeout(() => {
            if (live()) eventDispatcher.dispatch('tts-stop', { bookKey });
          }, SWIPE_OFF_STOP_DELAY_MS);
        }
        return false;
      },
      NARRATION_SWIPE_PRIORITY,
    );

    return () => {
      unregister();
      endDrag();
    };
  }, [bookKey, controller, controllerRef]);
};

// Re-exported for usePagination, which records hand turns.
export { markUserPageTurn };
