import type { AnimationObject } from "lottie-react-native";

export const CLIENT_ANALYTICS_LOTTIE = {
  sales: require("@/assets/Animated folder/payment.json"),
  revenue: require("@/assets/Animated folder/profit.json"),
  trips: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  collection: require("@/assets/Animated folder/reports.json"),
  health: require("@/assets/Animated folder/finance-presentation.json"),
  lanes: require("@/assets/Animated folder/map.json"),
} as const satisfies Record<string, AnimationObject>;
