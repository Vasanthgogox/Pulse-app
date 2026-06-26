import type { AnimationObject } from "lottie-react-native";

/** Chip Lotties — distinct from empty-state heroes (no logistics.json repeat). */
export const LOAD_CENTER_NETWORK_NUDGE_LOTTIE = {
  invite: require("@/assets/Animated folder/add-friend.json"),
  give: require("@/assets/Animated folder/signals.json"),
  get: require("@/assets/Animated folder/map.json"),
} as const satisfies Record<string, AnimationObject>;
