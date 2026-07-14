import type { TripsPromoVariant } from "@/lib/tripsPromoAssets";
import type { AnimationObject } from "lottie-react-native";

/** Large hero Lottie per trips empty-state — one animation only, no orbit chips. */
export const TRIPS_PROMO_HERO_LOTTIE: Record<TripsPromoVariant, AnimationObject> = {
  unassigned: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  assigned: require("@/assets/Animated folder/chat-with-driver.json"),
  loading: require("@/assets/Animated folder/truck-loading.json"),
  in_transit: require("@/assets/Animated folder/online-tracking.json"),
  unloading: require("@/assets/Animated folder/truck-unloading.json"),
  delivered_docs_pending: require("@/assets/Animated folder/delivery completed.json"),
  first_trip: require("@/assets/Animated folder/website-startup.json"),
  filtered_out: require("@/assets/Animated folder/truck.json"),
  history_empty: require("@/assets/Animated folder/archive.json"),
  history_due_to_get: require("@/assets/Animated folder/finance-presentation.json"),
  history_no_due_to_get: require("@/assets/Animated folder/law approved.json"),
  history_due_to_pay: require("@/assets/Animated folder/withdraw-cash.json"),
  history_no_due_to_pay: require("@/assets/Animated folder/compare-scale.json"),
};

/**
 * Per-animation render boost so every hero reads at the same visual weight inside
 * the fixed square slot (Lottie canvases have different padding / aspect ratios).
 */
export const TRIPS_PROMO_HERO_VISUAL_SCALE: Record<TripsPromoVariant, number> = {
  unassigned: 1.28,
  assigned: 1.08,
  loading: 1.52,
  in_transit: 1.18,
  unloading: 1.5,
  delivered_docs_pending: 1.22,
  first_trip: 1.14,
  filtered_out: 1.2,
  history_empty: 1.24,
  history_due_to_get: 1.38,
  history_no_due_to_get: 1.2,
  history_due_to_pay: 1.22,
  history_no_due_to_pay: 1.22,
};

export function resolveTripsPromoHeroLottie(
  variant: TripsPromoVariant,
): AnimationObject {
  return TRIPS_PROMO_HERO_LOTTIE[variant];
}

export function resolveTripsPromoHeroVisualScale(
  variant: TripsPromoVariant,
): number {
  return TRIPS_PROMO_HERO_VISUAL_SCALE[variant];
}

/** Fixed square slot — all trip tabs share the same outer frame. */
export const TRIPS_PROMO_HERO_SLOT = {
  compact: 140,
  mobile: 160,
  desktop: 180,
} as const;
