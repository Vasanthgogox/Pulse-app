/** Lottie animation keys mapped to repo assets. */
export const LOTTIE_ASSETS = {
  logistics:        () => import('@pulse-assets/Animated folder/logistics.json'),
  warehouse:        () => import('@pulse-assets/Animated folder/warehouse-management.json'),
  delivery:         () => import('@pulse-assets/Animated folder/delivery-truck-loading.json'),
  map:              () => import('@pulse-assets/Animated folder/map.json'),
  robot:            () => import('@pulse-assets/Animated folder/robot.json'),
  finance:          () => import('@pulse-assets/Animated folder/finance-presentation.json'),
  tracking:         () => import('@pulse-assets/Animated folder/online-tracking.json'),
  planning:         () => import('@pulse-assets/Animated folder/business-idea.json'),
  merge:            () => import('@pulse-assets/Animated folder/compare-scale.json'),
  success:          () => import('@pulse-assets/Animated folder/delivery completed.json'),
} as const;

export type LottieAssetKey = keyof typeof LOTTIE_ASSETS;
