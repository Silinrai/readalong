// @vitest-environment happy-dom
import { bookDataStoreHooks } from '@/__tests__/helpers/book-data-store-mock';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FooterBar from '@/app/reader/components/footerbar/FooterBar';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isMobile: true } }),
}));
const setHoveredBookKey = vi.hoisted(() => vi.fn());
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    hoveredBookKey: 'book-1',
    setHoveredBookKey,
    bottomBarTab: '',
    setBottomBarTab: vi.fn(),
    getView: () => null,
    getViewState: () => null,
    getProgress: () => null,
    getViewSettings: () => null,
  }),
}));
vi.mock('@/store/bookDataStore', () => ({
  ...bookDataStoreHooks(() => ({
    getConfig: () => null,
    setConfig: vi.fn(),
    getBookData: () => null,
  })),
}));
vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    isSideBarVisible: false,
    isSideBarPinned: false,
    setSideBarVisible: vi.fn(),
  }),
}));
vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: vi.fn(),
    releaseBackKeyInterception: vi.fn(),
  }),
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: (select: (s: { isIPhoneDuo: boolean }) => unknown) =>
    select({ isIPhoneDuo: false }),
}));
vi.mock('@/app/reader/hooks/useSpatialNavigation', () => ({ useSpatialNavigation: () => {} }));
vi.mock('@/app/reader/components/footerbar/MobileFooterBar', () => ({ default: () => null }));
vi.mock('@/app/reader/components/footerbar/DesktopFooterBar', () => ({ default: () => null }));
vi.mock('@/app/reader/components/tts/TTSControl', () => ({ default: () => null }));
vi.mock('@/app/reader/components/rsvp', () => ({ RSVPControl: () => null }));

const insets = { top: 0, right: 0, bottom: 0, left: 0 };

// Readalong: on the unfolded Fold (about 840 CSS px wide) a tap on the page
// after using the bottom bar made Android's WebView send the bar a synthetic
// mouseleave. The bar hid itself on it, then the tap's own toggle saw the
// bars hidden and showed them again: one tap closed only the panel.
describe('FooterBar on a touch screen', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 841, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 933, configurable: true });
  });

  afterEach(() => {
    cleanup();
    setHoveredBookKey.mockReset();
  });

  it('does not hide the bars on the mouseleave a tap elsewhere sends', () => {
    render(
      <FooterBar bookKey='book-1' bookFormat='EPUB' isHoveredAnim={false} gridInsets={insets} />,
    );
    fireEvent.mouseLeave(screen.getByRole('contentinfo'), { clientX: 420, clientY: 300 });
    expect(setHoveredBookKey).not.toHaveBeenCalledWith('');
  });
});
