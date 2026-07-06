import type { FABIconName } from "@/lib/fabIconAssets";
import {
  FINANCE_PROMO_HERO_LOTTIE,
  FINANCE_PROMO_HERO_VISUAL_SCALE,
} from "@/lib/financePromoLottieAssets";
import type { AnimationObject } from "lottie-react-native";

export type FabLottieGlyph = {
  source: AnimationObject;
  /** Boost inside the clipped FAB well — tuned per canvas padding. */
  renderScale: number;
};

/** Party + finance FAB icons — same Lottie family as finance promo empty states. */
export const FAB_LOTTIE_GLYPHS: Partial<Record<FABIconName, FabLottieGlyph>> = {
  building: {
    source: FINANCE_PROMO_HERO_LOTTIE.customers,
    renderScale: FINANCE_PROMO_HERO_VISUAL_SCALE.customers,
  },
  warehouse: {
    source: FINANCE_PROMO_HERO_LOTTIE.suppliers,
    renderScale: FINANCE_PROMO_HERO_VISUAL_SCALE.suppliers,
  },
  user: {
    source: FINANCE_PROMO_HERO_LOTTIE.drivers,
    renderScale: FINANCE_PROMO_HERO_VISUAL_SCALE.drivers,
  },
  "user-plus": {
    source: FINANCE_PROMO_HERO_LOTTIE.drivers,
    renderScale: FINANCE_PROMO_HERO_VISUAL_SCALE.drivers,
  },
  truck: {
    source: FINANCE_PROMO_HERO_LOTTIE.garage,
    renderScale: FINANCE_PROMO_HERO_VISUAL_SCALE.garage,
  },
  "receipt-text": {
    source: require("@/assets/Animated folder/payment.json"),
    renderScale: 1.28,
  },
  "credit-card": {
    source: require("@/assets/Animated folder/online-payments.json"),
    renderScale: 1.3,
  },
  road: {
    source: require("@/assets/Animated folder/online-tracking.json"),
    renderScale: 1.3,
  },
  package: {
    source: require("@/assets/Animated folder/loading-cargo.json"),
    renderScale: 1.3,
  },
};

export function resolveFabLottie(icon: FABIconName): FabLottieGlyph | undefined {
  return FAB_LOTTIE_GLYPHS[icon];
}
