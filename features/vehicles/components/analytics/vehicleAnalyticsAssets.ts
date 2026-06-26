import type { AnimationObject } from "lottie-react-native";

export const VEHICLE_ANALYTICS_LOTTIE = {
  revenue: require("@/assets/Animated folder/revenue.json"),
  profit: require("@/assets/Animated folder/profit.json"),
  utilization: require("@/assets/Animated folder/truck-loading.json"),
  trips: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
  performance: require("@/assets/Animated folder/online-tracking.json"),
  lanes: require("@/assets/Animated folder/map.json"),
} as const satisfies Record<string, AnimationObject>;
