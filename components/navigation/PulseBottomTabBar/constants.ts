import { WEB_TOP_NAV_ICON } from '@/components/demo/webTopNavIcon.tokens';
import { Easing } from 'react-native-reanimated';

export const MOBILE_TAB_ICON_SIZE = WEB_TOP_NAV_ICON.size;
export const MOBILE_TAB_ICON_SIZE_COMPACT = WEB_TOP_NAV_ICON.size;
export const TAB_ICON_STROKE = 1.75;
export const TAB_ICON_STROKE_ACTIVE = 2.05;

/** @deprecated Cluster track removed — kept for any legacy imports. */
export const CLUSTER_PILL_INSET = 5;
/** @deprecated */
export const MOBILE_EDGE_ICON_SIZE = MOBILE_TAB_ICON_SIZE;
/** @deprecated */
export const MOBILE_EDGE_ICON_SIZE_COMPACT = MOBILE_TAB_ICON_SIZE_COMPACT;
/** @deprecated */
export const MOBILE_CLUSTER_ICON_SIZE = MOBILE_TAB_ICON_SIZE;
/** @deprecated */
export const MOBILE_CLUSTER_ICON_SIZE_COMPACT = MOBILE_TAB_ICON_SIZE_COMPACT;
/** @deprecated */
export const CLUSTER_STROKE = TAB_ICON_STROKE;

export const TAB_MOTION = {
  duration: 100,
  easing: Easing.out(Easing.quad),
} as const;
