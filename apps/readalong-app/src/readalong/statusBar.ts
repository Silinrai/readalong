// Readalong: whether Android's status bar (clock, battery) shows in the reader.
// Readalong shows it with the reader's own bars; `hideStatusBarWhileReading`
// keeps it hidden then too, for a quieter page. "Always show" still wins.
export const showSystemStatusBar = ({
  barsVisible,
  alwaysShow,
  hideWithBars,
}: {
  barsVisible: boolean;
  alwaysShow: boolean;
  hideWithBars: boolean;
}): boolean => alwaysShow || (barsVisible && !hideWithBars);
