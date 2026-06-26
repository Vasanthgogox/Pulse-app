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
  give_open: 1.26,
  give_quoted: 1.22,
  give_awarded: 1.32,
  give_done_rejected: 1.24,
  give_done_converted: 1.22,
  get_open: 1.18,
  get_quoted: 1.16,
  get_awarded: 1.2,
  get_done_rejected: 1.18,
  get_done_converted: 1.18,
  claimed_awarded: 1.5,
  claimed_done_rejected: 1.2,
  claimed_done_converted: 1.28,
  filtered_out: 1.15,
};

export const LOAD_CENTER_PROMO_HERO_SLOT = {
  compact: 200,
  mobile: 228,
  desktop: 256,
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
