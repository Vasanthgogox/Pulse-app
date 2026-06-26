import type { AnimationObject } from "lottie-react-native";

export const DRIVER_ANALYTICS_LOTTIE = {
  earnings: require("@/assets/Animated folder/money-bag.json"),
  revenue: require("@/assets/Animated folder/revenue.json"),
  settlement: require("@/assets/Animated folder/payment.json"),
  trips: require("@/assets/Animated folder/chat-with-driver.json"),
  performance: require("@/assets/Animated folder/medal.json"),
  lanes: require("@/assets/Animated folder/map.json"),
} as const satisfies Record<string, AnimationObject>;
