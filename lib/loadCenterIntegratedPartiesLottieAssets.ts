import type { LoadCenterIntegratedPartyMode } from "@/lib/loadCenterIntegratedPartiesPromoAssets";
import type { AnimationObject } from "lottie-react-native";

export const LOAD_CENTER_INTEGRATED_PARTIES_HERO_LOTTIE: Record<
  LoadCenterIntegratedPartyMode,
  AnimationObject
> = {
  supplier: require("@/assets/Animated folder/warehouse-management.json"),
  client: require("@/assets/Animated folder/business-startup.json"),
};

export const LOAD_CENTER_INTEGRATED_PARTIES_HERO_VISUAL_SCALE: Record<
  LoadCenterIntegratedPartyMode,
  number
> = {
  supplier: 1.24,
  client: 1.16,
};

export function resolveIntegratedPartiesHeroLottie(
  mode: LoadCenterIntegratedPartyMode,
): AnimationObject {
  return LOAD_CENTER_INTEGRATED_PARTIES_HERO_LOTTIE[mode];
}

export function resolveIntegratedPartiesHeroVisualScale(
  mode: LoadCenterIntegratedPartyMode,
): number {
  return LOAD_CENTER_INTEGRATED_PARTIES_HERO_VISUAL_SCALE[mode];
}
