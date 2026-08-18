import type { FinancePromoVariant } from "@/lib/financePromoAssets";
import type { AnimationObject } from "lottie-react-native";

/** Relevant hero Lottie per finance empty-state variant (replaces the static SVG). */
export const FINANCE_PROMO_HERO_LOTTIE: Record<
  FinancePromoVariant,
  AnimationObject
> = {
  ledger: require("@/assets/Animated folder/finance-presentation.json"),
  ledgerViewOnly: require("@/assets/Animated folder/recipt check.json"),
  customers: require("@/assets/Animated folder/add-user.json"),
  suppliers: require("@/assets/Animated folder/warehouse-management.json"),
  drivers: require("@/assets/Animated folder/person-driving-car.json"),
  garage: require("@/assets/Animated folder/truck-2.json"),
};

/**
 * Per-animation render boost so every hero reads at the same visual weight inside
 * the fixed slot (Lottie canvases have different padding / aspect ratios).
 */
export const FINANCE_PROMO_HERO_VISUAL_SCALE: Record<
  FinancePromoVariant,
  number
> = {
  ledger: 1.34,
  ledgerViewOnly: 1.28,
  customers: 1.3,
  suppliers: 1.36,
  drivers: 1.08,
  garage: 1.4,
};

/** Wide 16:9 driver canvas must cover the square slot or only a tiny head is visible. */
export const FINANCE_PROMO_HERO_RESIZE_MODE: Record<
  FinancePromoVariant,
  "contain" | "cover"
> = {
  ledger: "contain",
  ledgerViewOnly: "contain",
  customers: "contain",
  suppliers: "contain",
  drivers: "cover",
  garage: "contain",
};

export function resolveFinancePromoHeroLottie(
  variant: FinancePromoVariant,
): AnimationObject {
  return FINANCE_PROMO_HERO_LOTTIE[variant];
}

export function resolveFinancePromoHeroVisualScale(
  variant: FinancePromoVariant,
): number {
  return FINANCE_PROMO_HERO_VISUAL_SCALE[variant];
}

export function resolveFinancePromoHeroResizeMode(
  variant: FinancePromoVariant,
): "contain" | "cover" {
  return FINANCE_PROMO_HERO_RESIZE_MODE[variant];
}

/** Square slot for the finance / parties empty-state hero (40% smaller than the first pass). */
export const FINANCE_PROMO_HERO_SLOT = {
  compact: 80,
  mobile: 94,
  desktop: 112,
  column: 100,
  columnDesktop: 120,
} as const;
