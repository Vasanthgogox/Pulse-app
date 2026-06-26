import type { AnimationObject } from "lottie-react-native";

export const TRIP_MARGIN_LOTTIE = {
  profit: require("@/assets/Animated folder/profit.json"),
  loss: require("@/assets/Animated folder/withdraw-cash.json"),
  flat: require("@/assets/Animated folder/compare-scale.json"),
} as const satisfies Record<string, AnimationObject>;

export type TripMarginTone = "profit" | "loss" | "flat";

export function tripMarginTone(amount: number): TripMarginTone {
  if (amount < 0) return "loss";
  if (amount > 0) return "profit";
  return "flat";
}

export function tripMarginLottie(tone: TripMarginTone): AnimationObject {
  return TRIP_MARGIN_LOTTIE[tone];
}
