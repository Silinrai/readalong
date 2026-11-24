// Readalong: keeps narration and the page together.
//
// - A hand page turn while narrating restarts narration at the new page top.
// - A relayout (style change, folding) keeps the voice and brings its
//   sentence back into view.
// - Pausing scrolls back to the sentence narration stopped at.
// The decision itself is the pure decideOnPageChange (followPolicy.ts).
import { useCallback, useEffect, useRef } from 'react';
import type { TTSController } from '@/services/tts';
import type { ToastAction } from '@/components/Toast';
import { useReaderStore } from '@/store/readerStore';
import { decideOnPageChange } from './followPolicy';
import { goToSection, unnarratedPageNotice } from './narrationJump';
import { eventDispatcher } from '@/utils/event';
import { consumeUserPageTurn, markRelayout, readTurnIntent } from './turnIntent';
import { isRendered, isTypingNote } from './viewHelpers';

export interface NarrationUi {
  setPlaying: (playing: boolean) => void;
  setShowBack: (show: boolean) => void;
  toast: (message: string, action?: ToastAction) => void;
  translate: (text: string) => string;
}

// How long after the last width change the layout is taken as settled.
const RESIZE_SETTLE_MS = 600;

export const useNarrationFollow = ({
  bookKey,
  controller,
  controllerRef,
  followingRef,
  ui,
}: {
  bookKey: string;
  controller: TTSController | null;
  controllerRef: React.MutableRefObject<TTSController | null>;
  followingRef: React.MutableRefObject<boolean>;
  ui: NarrationUi;
}) => {
  const uiRef = useRef(ui);
  uiRef.current = ui;
  // Set when narration pauses itself on a page with nothing to narrate: that
  // pause must leave the reader on the page they chose.
  const holdNextPauseRef = useRef(false);
  // The toast's "Next narrated chapter" action (set below; it calls back in).
  const jumpToNarratedRef = useRef<(index: number) => void>(() => {});

  const showSoundingSentence = useCallback(() => {
    const ctrl = controllerRef.current;
    const { getView, getViewSettings } = useReaderStore.getState();
    const view = getView(bookKey);
    if (!ctrl || !view || isTypingNote()) return;
    if (ctrl.isSoundingSentenceOnScreen()) return;
    const cfi = ctrl.getCurrentPlaybackCfi() ?? getViewSettings(bookKey)?.ttsLocation;
    if (!cfi) return;
    const { anchor, index } = view.resolveCFI(cfi);
    const content = view.renderer.getContents().find((x) => x.index === index);
    const range = content ? anchor(content.doc) : null;
    if (range && isRendered(range)) {
      view.renderer.scrollToAnchor?.(range);
    } else {
      view.renderer.goTo?.(view.resolveNavigation(cfi));
    }
  }, [bookKey, controllerRef]);

  const narrateFromPageTop = useCallback(async () => {
    const ctrl = controllerRef.current;
    const progress = useReaderStore.getState().getProgress(bookKey);
    const range = progress?.range as Range | undefined;
    if (!ctrl || !range || typeof progress?.index !== 'number') return;
    const result = await ctrl
      .playFromRange(ctrl.pageStartRange(range), progress.index)
      .catch(() => 'unnarrated' as const);
    if (controllerRef.current !== ctrl || result === 'superseded') return;
    const { setPlaying, setShowBack, toast, translate: _ } = uiRef.current;
    if (result === 'started') {
      setPlaying(true);
      setShowBack(false);
      return;
    }
    holdNextPauseRef.current = true;
    setPlaying(false);
    // Already stop-paused when the jump stopped playback first (S-2).
    if (ctrl.state === 'playing') await ctrl.pause();
    setShowBack(true);
    const notice = unnarratedPageNotice(_, ctrl.nextNarratedSection(progress.index));
    const target = notice.target;
    toast(
      notice.message,
      notice.actionLabel && target !== undefined
        ? { label: notice.actionLabel, onClick: () => jumpToNarratedRef.current(target) }
        : undefined,
    );
  }, [bookKey, controllerRef]);

  // Open a narrated chapter the reader chose from the toast and narrate from
  // its first page.
  jumpToNarratedRef.current = (index: number) => {
    void goToSection(bookKey, index).then((arrived) => {
      if (!arrived) return;
      // Narration may have been stopped since the toast appeared: start it.
      if (controllerRef.current) void narrateFromPageTop();
      else eventDispatcher.dispatch('tts-speak', { bookKey });
    });
  };

  /** The page changed and the voice is not on it. True when handled here. */
  const handlePageChange = useCallback((): boolean => {
    const ctrl = controllerRef.current;
    const view = useReaderStore.getState().getView(bookKey);
    if (!ctrl || !view) return false;
    const decision = decideOnPageChange({
      now: Date.now(),
      playing: ctrl.state === 'playing',
      typing: isTypingNote(),
      ...readTurnIntent(view),
    });
    switch (decision) {
      case 'ignore':
        return true;
      case 'reshowVoice':
        showSoundingSentence();
        return true;
      case 'narrateFromTop':
        consumeUserPageTurn(view);
        void narrateFromPageTop();
        return true;
      default:
        return false;
    }
  }, [bookKey, controllerRef, narrateFromPageTop, showSoundingSentence]);

  /** The page changed and the voice is on it: a pending hand turn is used up. */
  const handlePageOnVoice = useCallback(() => {
    consumeUserPageTurn(useReaderStore.getState().getView(bookKey));
  }, [bookKey]);

  /** Controller state changes. Only a real pause brings the voice back. */
  const handleStateChange = useCallback(
    (state: string) => {
      // forward-/backward-/setrate-/stop-paused are transitions, not pauses.
      if (state !== 'paused') return;
      if (holdNextPauseRef.current) {
        holdNextPauseRef.current = false;
        return;
      }
      showSoundingSentence();
    },
    [showSoundingSentence],
  );

  // Folding, unfolding or turning the phone re-lays the book out. Height-only
  // changes (the keyboard, system bars) do not change the layout's columns and
  // are ignored.
  useEffect(() => {
    if (!controller) return;
    let lastWidth = window.innerWidth;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      markRelayout();
      clearTimeout(timer);
      timer = setTimeout(() => {
        markRelayout();
        if (controllerRef.current?.state === 'playing' && followingRef.current) {
          showSoundingSentence();
        }
      }, RESIZE_SETTLE_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, [controller, controllerRef, followingRef, showSoundingSentence]);

  return {
    handlePageChange,
    handlePageOnVoice,
    handleStateChange,
    showSoundingSentence,
    narrateFromPageTop,
  };
};
