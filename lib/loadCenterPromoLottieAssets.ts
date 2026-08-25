import type { LoadCenterPromoVariant } from "@/lib/loadCenterPromoAssets";
import type { AnimationObject } from "lottie-react-native";

/**
 * One distinct hero Lottie per load-center empty-state — no duplicates across tabs.
 * (Avoid reusing logistics.json / delivery-truckcargo-truck on multiple variants.)
 */
export const LOAD_CENTER_PROMO_HERO_LOTTIE: Record<
  LoadCenterPromoVariant,
  AnimationObject
> = {
  give_open: require("@/assets/Animated folder/signals.json"),
  give_quoted: require("@/assets/Animated folder/auction.json"),
  give_awarded: require("@/assets/Animated folder/delivery-service-workers-loading-truck.json"),
  give_done_rejected: require("@/assets/Animated folder/archive.json"),
  give_done_converted: require("@/assets/Animated folder/delivery completed.json"),
  get_open: require("@/assets/Animated folder/explore.json"),
  get_quoted: require("@/assets/Animated folder/notification.json"),
  get_awarded: require("@/assets/Animated folder/trophy.json"),
  get_done_rejected: require("@/assets/Animated folder/web-error.json"),
  get_done_converted: require("@/assets/Animated folder/online-tracking.json"),
  claimed_awarded: require("@/assets/Animated folder/truck-loading.json"),
  claimed_done_rejected: require("@/assets/Animated folder/trash-can.json"),
  claimed_done_converted: require("@/assets/Animated folder/forklift-truck.json"),
  filtered_out: require("@/assets/Animated folder/search.json"),
};

export const LOAD_CENTER_PROMO_HERO_VISUAL_SCALE: Record<
  LoadCenterPromoVariant,
  number
> = {
  give_open: 1.05,
  give_quoted: 1.04,
  give_awarded: 1.08,
  give_done_rejected: 1.04,
  give_done_converted: 1.04,
  get_open: 1.02,
  get_quoted: 1.02,
  /** Trophy art fills more of its canvas than other heroes — keep it smaller. */
  get_awarded: 0.68,
  get_done_rejected: 1.02,
  get_done_converted: 1.02,
  claimed_awarded: 1.1,
  claimed_done_rejected: 1.04,
  claimed_done_converted: 1.06,
  filtered_out: 1.02,
};

/** Compact square slot — keeps empty-state Lottie icons small and readable. */
export const LOAD_CENTER_PROMO_HERO_SLOT = {
  compact: 112,
  mobile: 128,
  desktop: 144,
} as const;

export function resolveLoadCenterPromoHeroLottie(
  variant: LoadCenterPromoVariant,
): AnimationObject {
  return LOAD_CENTER_PROMO_HERO_LOTTIE[variant];
}

export function resolveLoadCenterPromoHeroVisualScale(
  variant: LoadCenterPromoVariant,
): number {
  return LOAD_CENTER_PROMO_HERO_VISUAL_SCALE[variant];
}
