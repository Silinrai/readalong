// Readalong: when a narrated book opens on pages without narration, offer once
// (a toast with a Start button) to begin narrating where the narration starts.
import { useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useReaderProgressStore } from '@/store/readerProgressStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { ttsSessionManager } from '@/services/tts/TTSSessionManager';
import { eventDispatcher } from '@/utils/event';
import { goToSection } from './narrationJump';
import { narrationStartOffer } from './narrationStartOffer';

export const useNarrationStartOffer = (bookKey: string) => {
  const _ = useTranslation();
  const index = useReaderProgressStore((s) => s.progresses[bookKey]?.index);
  const offeredRef = useRef(false);

  useEffect(() => {
    if (offeredRef.current || typeof index !== 'number') return;
    // Only the page the book opened on counts.
    offeredRef.current = true;
    if (ttsSessionManager.getActiveSession()?.bookKey === bookKey) return;
    const book = useBookDataStore.getState().getBookData(bookKey)?.bookDoc;
    const offer = narrationStartOffer(book, index);
    if (!offer) return;
    eventDispatcher.dispatch('toast', {
      message: offer.label
        ? _('Narration starts at {{chapter}}', { chapter: offer.label })
        : _('Narration starts in a later chapter'),
      type: 'info',
      action: {
        label: _('Start narration'),
        onClick: () =>
          void goToSection(bookKey, offer.target).then((arrived) => {
            if (arrived) eventDispatcher.dispatch('tts-speak', { bookKey });
          }),
      },
    });
  }, [_, bookKey, index]);
};
