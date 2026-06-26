import type { AnimationObject } from "lottie-react-native";

export const SUPPLIER_ANALYTICS_LOTTIE = {
  cost: require("@/assets/Animated folder/payment-gateway.json"),
  margin: require("@/assets/Animated folder/profit.json"),
  settlement: require("@/assets/Animated folder/reports.json"),
  trips: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  reliability: require("@/assets/Animated folder/finance-presentation.json"),
  lanes: require("@/assets/Animated folder/map.json"),
} as const satisfies Record<string, AnimationObject>;
