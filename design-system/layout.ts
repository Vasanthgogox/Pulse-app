import { space, screenPaddingX, touchTargetMin, bottomActionOffset } from './spacing';

/**
 * Layout primitives for operational screens.
 */
export const layout = {
  screenPaddingX,
  contentMaxWidth: 560,
  contentMaxWidthWide: 720,
  sectionGap: space[6],
  groupGap: space[3],
  touchTargetMin,
  bottomActionOffset,
  /** Reserve above tab bar + safe area (use layoutInsets hook for precise value). */
  tabBarClearanceEstimate: 88,
  desktopTopNav: 84,
  webDesktopMinWidth: 900,
} as const;

export default layout;
