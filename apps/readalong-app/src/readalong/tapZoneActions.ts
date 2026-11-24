// Readalong: what a tap on the page does before Readalong's own tap zones.
//
// 1. Custom 3x3 tap zones, when set, run their action (one grid per page on a
//    two-page spread).
// 2. Otherwise Readalong's own zones apply (return false): the sides turn the
//    page, the middle shows the menu. A tap never moves the narration; lines
//    are reached by dragging (useNarrationGestures).
//
// Called by usePagination after Readalong's single-click handlers (selection,
// popups, handwriting) passed on the tap.
import type { ViewSettings } from '@/types/book';
import type { TapZoneAction } from '@/types/readalong';
import { useReaderStore } from '@/store/readerStore';
import { eventDispatcher } from '@/utils/event';
import { tapZoneActionAt } from './tapZones';
import { toggleBarsFromTap } from './bottombar/toggleBars';

export interface ReadalongTap {
  bookKey: string;
  viewSettings: ViewSettings;
  windowX: number;
  windowY: number;
  rect: DOMRect;
  /** Pages on screen (2 for a two-page spread). */
  columns?: number;
  /** The tap opened page-filling media; Readalong handles that. */
  media: boolean;
  turn: (side: 'left' | 'right') => void;
}

export const runTapZoneAction = (
  action: TapZoneAction,
  { bookKey, turn }: Pick<ReadalongTap, 'bookKey' | 'turn'>,
) => {
  const { getViewState } = useReaderStore.getState();
  const ttsOn = !!getViewState(bookKey)?.ttsEnabled;
  switch (action) {
    case 'prev':
      turn('left');
      break;
    case 'next':
      turn('right');
      break;
    case 'menu':
      toggleBarsFromTap(bookKey);
      break;
    case 'playPause':
      eventDispatcher.dispatch(ttsOn ? 'tts-toggle-play' : 'tts-speak', { bookKey });
      break;
    case 'prevLine':
      if (ttsOn) eventDispatcher.dispatch('tts-backward', { bookKey, byMark: true });
      else turn('left');
      break;
    case 'nextLine':
      if (ttsOn) eventDispatcher.dispatch('tts-forward', { bookKey, byMark: true });
      else turn('right');
      break;
    case 'bookmark':
      eventDispatcher.dispatch('toggle-bookmark', { bookKey });
      break;
    case 'none':
      break;
  }
};

/** True when Readalong handled the tap and Readalong's zones must not run. */
export const handleReadalongTap = (tap: ReadalongTap): boolean => {
  const { viewSettings, windowX, windowY, rect, columns } = tap;
  // "Disable Click" and media taps keep Readalong's behaviour.
  const zoneAction =
    viewSettings.disableClick || tap.media
      ? null
      : tapZoneActionAt(viewSettings.tapZones, windowX, windowY, rect, {
          columns,
          rightZones: viewSettings.tapZonesRight,
        });
  if (!zoneAction) return false;
  const { hoveredBookKey, setHoveredBookKey } = useReaderStore.getState();
  if (hoveredBookKey && zoneAction !== 'menu') {
    setHoveredBookKey(null);
    return true;
  }
  runTapZoneAction(zoneAction, tap);
  return true;
};
