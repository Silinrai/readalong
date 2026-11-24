import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { ViewSettings } from '@/types/book';
import {
  DuoPose,
  getDevicePose,
  getRendererLayout,
  isAndroidDevice,
  RendererLayout,
} from '@/utils/duo';
import { getReadingScreenInsets, getRecordedScreenInsets } from '@/utils/insets';
import { isEditingText, shouldHoldPose } from '@/readalong/foldPose';

const readPose = (isIPhoneDuo: boolean): DuoPose =>
  getDevicePose(isIPhoneDuo, isAndroidDevice(), window.innerWidth, window.innerHeight);

/**
 * The width the page lays out in: the viewport inside the side insets the
 * reading page keeps (see getReadingScreenInsets), so showing the toolbar and
 * its status strip does not change the layout.
 */
const readPageWidth = () => {
  const { safeAreaInsets, statusBarHiddenInsets, isIPhoneDuo } = useThemeStore.getState();
  const { alwaysShowStatusBar } = useSettingsStore.getState().settings;
  const insets =
    safeAreaInsets &&
    getReadingScreenInsets(
      safeAreaInsets,
      isIPhoneDuo && !alwaysShowStatusBar
        ? getRecordedScreenInsets(statusBarHiddenInsets, window.innerWidth, window.innerHeight)
        : null,
      window.innerWidth,
      window.innerHeight,
    );
  return window.innerWidth - (insets?.left ?? 0) - (insets?.right ?? 0);
};

/**
 * The renderer layout for the current iPhone Duo pose, read at call time for
 * imperative callers. Off the Duo it is the reader's own settings.
 */
export const getCurrentRendererLayout = (viewSettings: ViewSettings): RendererLayout => {
  const { isIPhoneDuo, duoFold } = useThemeStore.getState();
  return getRendererLayout(viewSettings, readPose(isIPhoneDuo), readPageWidth(), duoFold);
};

/**
 * The current iPhone Duo pose, kept up to date as the device folds, unfolds
 * or turns. Always `off` on other devices, which never subscribe to resize.
 */
export const useDuoPose = (): DuoPose => {
  const isIPhoneDuo = useThemeStore((s) => s.isIPhoneDuo);
  const [pose, setPose] = useState<DuoPose>(() => readPose(isIPhoneDuo));

  useEffect(() => {
    setPose(readPose(isIPhoneDuo));
    // Readalong: an Android foldable changes pose on fold/unfold too.
    if (!isIPhoneDuo && !isAndroidDevice()) return;
    // Readalong: the soft keyboard shrinks the window but the screen is still
    // unfolded; hold the pose for a height-only resize while a text field has
    // focus. A fold changes the width and is followed even then.
    let lastWidth = window.innerWidth;
    const handleResize = () => {
      const width = window.innerWidth;
      const hold = !isIPhoneDuo && shouldHoldPose({ editing: isEditingText(), lastWidth, width });
      lastWidth = width;
      if (hold) return;
      setPose(readPose(isIPhoneDuo));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isIPhoneDuo]);

  return pose;
};
