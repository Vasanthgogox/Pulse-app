import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import Illustration4 from "@/assets/illustrations/4.svg";
import Illustration15 from "@/assets/illustrations/15.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import Theme from "@/constants/Theme";

export type NetworkLoadsQuickActionId = "give" | "get" | "reach";

export type NetworkLoadsQuickAction = {
  id: NetworkLoadsQuickActionId;
  label: string;
  sub: string;
  chip: string;
  illustration: ComponentType<SvgProps>;
  aspect: number;
  accent: string;
  wash: string;
  lottie?: object;
  lottieScale?: number;
};

/** Supply = post freight; demand = find & bid; reach = boost loads. */
export const NETWORK_LOADS_QUICK_ACTIONS: NetworkLoadsQuickAction[] = [
  {
    id: "give",
    label: "Give loads",
    sub: "Post open freight",
    chip: "Supply",
    illustration: Illustration4,
    aspect: 600 / 463,
    accent: Theme.brandBlueInk,
    wash: "rgba(205, 233, 247, 0.45)",
    lottie: require("@/assets/Animated folder/signals.json"),
    lottieScale: 1.14,
  },
  {
    id: "get",
    label: "Get loads",
    sub: "Bid on freight",
    chip: "Demand",
    illustration: Illustration20,
    aspect: 600 / 480,
    accent: "#059669",
    wash: "rgba(16, 185, 129, 0.08)",
    lottie: require("@/assets/Animated folder/auction.json"),
    lottieScale: 1.12,
  },
  {
    id: "reach",
    label: "Pulse Reach",
    sub: "Boost loads, earn credits",
    chip: "Growth",
    illustration: Illustration15,
    aspect: 600 / 565,
    accent: Theme.accentBrown,
    wash: "rgba(107, 79, 58, 0.08)",
    lottie: require("@/assets/Animated folder/investment-growth.json"),
    lottieScale: 1.1,
  },
];

export function fitNetworkLoadsIllustration(
  boxW: number,
  boxH: number,
  aspect: number,
): { width: number; height: number } {
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  return { width: w, height: h };
}
