/** UI-thread motion — calm, no spring bounce (Slack-like permanence). */
export const TAB_NAV_TIMING_MS = 100;

export const TAB_NAV_EASING = {
  duration: TAB_NAV_TIMING_MS,
} as const;

/** Press feedback — subtle, operational (max scale 1.03). */
export const TAB_PRESS_SCALE_ACTIVE = 0.97;
export const TAB_PRESS_SCALE_REST = 1;
export const TAB_PRESS_TIMING_MS = 80;

/** Active pill / label micro-motion caps */
export const TAB_ACTIVE_SCALE_MAX = 1.03;

export const MOBILE_PRIMARY_TAB_NAMES = [
  'finance',
  'trips',
  'network',
] as const;
