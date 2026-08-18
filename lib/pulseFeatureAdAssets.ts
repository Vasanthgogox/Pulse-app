/**
 * Curated Pulse feature-ad creatives — product topics only.
 * Never reuse content-error / 404 / 500 Metronic sketches here.
 */
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import FeedbackIllustration from "@/assets/illustrations/customer-giving-feedback-for-delivery-service.svg";
import Illustration2 from "@/assets/illustrations/2.svg";
import Illustration3 from "@/assets/illustrations/3.svg";
import Illustration4 from "@/assets/illustrations/4.svg";
import Illustration6 from "@/assets/illustrations/6.svg";
import Illustration9 from "@/assets/illustrations/9.svg";
import Illustration11 from "@/assets/illustrations/11.svg";
import Illustration15 from "@/assets/illustrations/15.svg";
import Illustration20 from "@/assets/illustrations/20.svg";

export type PulseFeatureAdId =
  | "driver_app"
  | "invite_drivers"
  | "track_drivers"
  | "manage_ledger"
  | "network_chat"
  | "chat_updates"
  | "network_feedback"
  | "trip_ops"
  | "pulse_loads"
  | "grow_network";

export type PulseFeatureAd = {
  id: PulseFeatureAdId;
  chip: string;
  title: string;
  sub: string;
  cta: string;
  accent: string;
  wash: string;
  /** Soft product SVG — never an error/empty-state sketch. */
  illustration: ComponentType<SvgProps>;
  aspect: number;
  /** Preferred motion art when Lottie is available. */
  lottie?: object;
  lottieScale?: number;
  href: string;
};

export const PULSE_FEATURE_ADS: readonly PulseFeatureAd[] = [
  {
    id: "network_chat",
    chip: "Chat",
    title: "Chat with your network",
    sub: "Message clients, suppliers, and fleet partners in one shared workspace",
    cta: "Open chat",
    accent: Theme.primary,
    wash: "rgba(205, 233, 247, 0.55)",
    illustration: Illustration2,
    aspect: 600 / 520,
    lottie: require("@/assets/Animated folder/Chat.json"),
    lottieScale: 1.08,
    href: ROUTES.CHAT,
  },
  {
    id: "chat_updates",
    chip: "Alerts",
    title: "Stay on top of Pulse updates",
    sub: "Trip alerts, bid notices, and workspace signals land in Pulse Chat",
    cta: "See messages",
    accent: "#4F46E5",
    wash: "rgba(99, 102, 241, 0.08)",
    illustration: Illustration11,
    aspect: 600 / 520,
    lottie: require("@/assets/Animated folder/notification.json"),
    lottieScale: 1.05,
    href: ROUTES.CHAT,
  },
  {
    id: "network_feedback",
    chip: "Trust",
    title: "Share feedback with partners",
    sub: "Rate completed trips so your network stays reliable and high quality",
    cta: "Open network",
    accent: Theme.accentBrown,
    wash: "rgba(107, 79, 58, 0.07)",
    illustration: FeedbackIllustration,
    aspect: 800 / 600,
    lottie: require("@/assets/Animated folder/positive-feedback.json"),
    lottieScale: 1.06,
    href: ROUTES.TABS.NETWORK,
  },
  {
    id: "trip_ops",
    chip: "Trips",
    title: "Keep every trip moving",
    sub: "Assign, track, and close trips with clear ownership end to end",
    cta: "Go to trips",
    accent: "#059669",
    wash: "rgba(16, 185, 129, 0.09)",
    illustration: Illustration20,
    aspect: 600 / 480,
    lottie: require("@/assets/Animated folder/logistics.json"),
    lottieScale: 1.1,
    href: ROUTES.TABS.TRIPS,
  },
  {
    id: "track_drivers",
    chip: "Live",
    title: "Track your fleet live",
    sub: "Follow driver progress and ETAs without leaving the trip workspace",
    cta: "View trips",
    accent: "#0EA5E9",
    wash: "rgba(14, 165, 233, 0.09)",
    illustration: Illustration11,
    aspect: 600 / 520,
    lottie: require("@/assets/Animated folder/online-tracking.json"),
    lottieScale: 1.08,
    href: ROUTES.TABS.TRIPS,
  },
  {
    id: "driver_app",
    chip: "Fleet",
    title: "Equip your driver app",
    sub: "Give drivers a Pulse workspace for trips, docs, and earnings",
    cta: "Open drivers",
    accent: Theme.primary,
    wash: "rgba(0, 158, 247, 0.08)",
    illustration: Illustration3,
    aspect: 600 / 520,
    lottie: require("@/assets/Animated folder/person-driving-car.json"),
    lottieScale: 1.08,
    href: ROUTES.partyDirectory("drivers"),
  },
  {
    id: "invite_drivers",
    chip: "Grow",
    title: "Invite drivers to Pulse",
    sub: "Onboard fleet partners quickly and keep everyone in sync",
    cta: "Invite drivers",
    accent: Theme.accentBrown,
    wash: "rgba(246, 240, 234, 0.95)",
    illustration: Illustration9,
    aspect: 600 / 520,
    lottie: require("@/assets/Animated folder/add-user.json"),
    lottieScale: 1.06,
    href: ROUTES.partyDirectory("drivers"),
  },
  {
    id: "manage_ledger",
    chip: "Cash",
    title: "Manage your ledger",
    sub: "Settle partner and driver balances from one finance hub",
    cta: "Open finance",
    accent: Theme.brandBlueInk,
    wash: "rgba(205, 233, 247, 0.5)",
    illustration: Illustration6,
    aspect: 600 / 595,
    lottie: require("@/assets/Animated folder/finance-presentation.json"),
    lottieScale: 1.05,
    href: ROUTES.TABS.FINANCE,
  },
  {
    id: "pulse_loads",
    chip: "Loads",
    title: "Give & get loads",
    sub: "Post freight or bid on open loads from verified partners",
    cta: "Open Load Center",
    accent: "#059669",
    wash: "rgba(16, 185, 129, 0.08)",
    illustration: Illustration4,
    aspect: 600 / 463,
    lottie: require("@/assets/Animated folder/auction.json"),
    lottieScale: 1.08,
    href: ROUTES.PULSE_LOADS,
  },
  {
    id: "grow_network",
    chip: "Discover",
    title: "Grow your network",
    sub: "Find recommended partners with lane overlap and mutuals",
    cta: "Discover partners",
    accent: Theme.accentBrown,
    wash: "rgba(107, 79, 58, 0.07)",
    illustration: Illustration15,
    aspect: 600 / 565,
    lottie: require("@/assets/Animated folder/explore.json"),
    lottieScale: 1.06,
    href: ROUTES.TABS.NETWORK,
  },
] as const;

/** Sidebar filler prefers chat / trips / finance / fleet topics. */
export const PULSE_FEATURE_AD_SIDEBAR_POOL: readonly PulseFeatureAdId[] = [
  "network_chat",
  "chat_updates",
  "trip_ops",
  "track_drivers",
  "manage_ledger",
  "driver_app",
  "invite_drivers",
  "network_feedback",
  "pulse_loads",
  "grow_network",
];

export function pickPulseFeatureAds(
  count: number,
  options?: {
    pool?: readonly PulseFeatureAdId[];
    exclude?: readonly PulseFeatureAdId[];
  },
): PulseFeatureAd[] {
  const poolIds = options?.pool ?? PULSE_FEATURE_AD_SIDEBAR_POOL;
  const exclude = new Set(options?.exclude ?? []);
  const source = PULSE_FEATURE_ADS.filter(
    (ad) => poolIds.includes(ad.id) && !exclude.has(ad.id),
  );
  const list = source.length > 0 ? [...source] : [...PULSE_FEATURE_ADS];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list.slice(0, Math.max(1, Math.min(count, list.length)));
}

export function fitPulseFeatureIllustration(
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
