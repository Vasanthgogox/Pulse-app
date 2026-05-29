import { Easing } from 'react-native-reanimated';

export const CLUSTER_PILL_INSET = 5;
export const MOBILE_EDGE_ICON_SIZE = 22;
export const MOBILE_EDGE_ICON_SIZE_COMPACT = 19;
export const MOBILE_CLUSTER_ICON_SIZE = 19;
export const MOBILE_CLUSTER_ICON_SIZE_COMPACT = 17;
export const CLUSTER_STROKE = 1.75;

export const TAB_MOTION = {
  duration: 100,
  easing: Easing.out(Easing.quad),
} as const;
