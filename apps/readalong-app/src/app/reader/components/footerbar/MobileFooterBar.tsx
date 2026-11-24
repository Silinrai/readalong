import React from 'react';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useThemeStore } from '@/store/themeStore';
import { useEnv } from '@/context/EnvContext';
import { getHorizontalInsetStyle } from '@/utils/insets';
import { FooterBarChildProps } from './types';
import { NavigationPanel } from './NavigationPanel';
import { ColorPanel } from './ColorPanel';
// Readalong: the two-row bottom bar and the Visual Options sheet replace
// Readalong's icon row and quick font panel here (src/readalong).
import {
  BOTTOM_BAR_HEIGHT_VAR,
  ReadalongBottomBar,
  READALONG_BAR_HEIGHT_PX,
} from '@/readalong/bottombar/ReadalongBottomBar';
import { VisualOptionsSheet } from '@/readalong/visual/VisualOptionsSheet';
import '@/styles/readalong-visual.css';

const MobileFooterBar: React.FC<FooterBarChildProps> = ({
  bookKey,
  gridInsets,
  actionTab,
  progressValid,
  progressFraction,
  navigationHandlers,
  forceMobileLayout,
  onSetActionTab,
}) => {
  const isMobile = forceMobileLayout || window.innerWidth < 640 || window.innerHeight < 640;
  const { appService } = useEnv();
  const sliderHeight = useResponsiveSize(28);
  const isIPhoneDuo = useThemeStore((s) => s.isIPhoneDuo);
  // iPhone Duo's status-bar strip reports as a large left/right inset (#6307);
  // the bases match the panels' px-4 and the bar's px-8.
  const panelInsetStyle = getHorizontalInsetStyle(gridInsets, isIPhoneDuo, 16);
  const barInsetStyle = getHorizontalInsetStyle(gridInsets, isIPhoneDuo, 32);
  // Panels open right on top of the bar: its measured height, or an estimate
  // until it has been measured.
  const estimatedBarHeight = appService?.isAndroidApp
    ? `calc(env(safe-area-inset-bottom) + ${READALONG_BAR_HEIGHT_PX}px)`
    : isMobile
      ? `${gridInsets.bottom * 0.33 + READALONG_BAR_HEIGHT_PX}px`
      : `${READALONG_BAR_HEIGHT_PX}px`;
  const bottomOffset = `var(${BOTTOM_BAR_HEIGHT_VAR}, ${estimatedBarHeight})`;

  return (
    <>
      <ColorPanel
        actionTab={actionTab}
        bottomOffset={bottomOffset}
        forceMobileLayout={forceMobileLayout}
        insetStyle={panelInsetStyle}
      />
      <NavigationPanel
        bookKey={bookKey}
        actionTab={actionTab}
        progressFraction={progressFraction}
        progressValid={progressValid}
        navigationHandlers={navigationHandlers}
        bottomOffset={bottomOffset}
        sliderHeight={sliderHeight}
        forceMobileLayout={forceMobileLayout}
        insetStyle={panelInsetStyle}
      />
      <VisualOptionsSheet
        bookKey={bookKey}
        open={actionTab === 'font'}
        bottomOffset={bottomOffset}
        forceMobileLayout={forceMobileLayout}
        insetStyle={panelInsetStyle}
        onClose={() => onSetActionTab?.('font')}
        onOpenColors={() => onSetActionTab?.('color')}
      />
      <div className={forceMobileLayout ? 'contents' : 'contents sm:hidden'}>
        <ReadalongBottomBar
          bookKey={bookKey}
          actionTab={actionTab}
          gridInsets={gridInsets}
          progressFraction={progressFraction}
          progressValid={progressValid}
          navigationHandlers={navigationHandlers}
          insetStyle={barInsetStyle}
          onSetActionTab={onSetActionTab!}
        />
      </div>
    </>
  );
};

// Memoized so a footer that keeps its props (hidden, between page turns) skips
// its panels and buttons.
export default React.memo(MobileFooterBar);
