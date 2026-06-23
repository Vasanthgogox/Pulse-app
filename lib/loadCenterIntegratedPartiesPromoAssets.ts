import type { LucideIcon } from "lucide-react-native";
import {
  ArrowUpRight,
  Building2,
  Send,
  Truck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react-native";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import Theme from "@/constants/Theme";
import Illustration4 from "@/assets/illustrations/4.svg";
import Illustration20 from "@/assets/illustrations/20.svg";

export type LoadCenterIntegratedPartyMode = "supplier" | "client";

export type LoadCenterIntegratedPartiesPromoBullet = {
  label: string;
  Icon: LucideIcon;
  tint: string;
};

export type LoadCenterIntegratedPartiesPromoPreset = {
  chip: string;
  chipColor: string;
  wash: string;
  illustration: ComponentType<SvgProps>;
  aspect: number;
  title: string;
  description: string;
  ctaLabel: string;
  bullets: LoadCenterIntegratedPartiesPromoBullet[];
};

export const LOAD_CENTER_INTEGRATED_PARTIES_PROMO: Record<
  LoadCenterIntegratedPartyMode,
  LoadCenterIntegratedPartiesPromoPreset
> = {
  supplier: {
    chip: "Supply",
    chipColor: Theme.loadAddButtonText,
    wash: "rgba(185, 226, 245, 0.14)",
    illustration: Illustration4,
    aspect: 600 / 463,
    title: "No integrated suppliers yet",
    description:
      "Send invites on Pulse Network or explore verified carriers — integrated partners can quote on your open freight and help scale your business.",
    ctaLabel: "Explore Network",
    bullets: [
      { label: "Send invite", Icon: Send, tint: "rgba(185, 226, 245, 0.55)" },
      { label: "Discover carriers", Icon: Truck, tint: "rgba(154, 206, 235, 0.45)" },
      { label: "Share open loads", Icon: ArrowUpRight, tint: "rgba(185, 226, 245, 0.4)" },
      { label: "Scale your fleet", Icon: Zap, tint: "rgba(154, 206, 235, 0.45)" },
    ],
  },
  client: {
    chip: "Demand",
    chipColor: "#059669",
    wash: "rgba(16, 185, 129, 0.07)",
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No integrated clients yet",
    description:
      "Invite shippers to your network or explore Pulse users — when they connect, their open loads show up here for you to bid and grow revenue.",
    ctaLabel: "Explore Network",
    bullets: [
      { label: "Send invite", Icon: UserPlus, tint: "rgba(16, 185, 129, 0.12)" },
      { label: "Find shippers", Icon: Building2, tint: "rgba(16, 185, 129, 0.1)" },
      { label: "Browse network", Icon: Users, tint: "rgba(16, 185, 129, 0.08)" },
      { label: "Scale business", Icon: Zap, tint: "rgba(16, 185, 129, 0.1)" },
    ],
  },
};

export function fitLoadCenterIntegratedPartiesIllustration(
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
