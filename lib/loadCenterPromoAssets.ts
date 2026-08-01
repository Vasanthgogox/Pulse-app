import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import Illustration2 from "@/assets/illustrations/2.svg";
import Illustration3 from "@/assets/illustrations/3.svg";
import Illustration6 from "@/assets/illustrations/6.svg";
import Illustration11 from "@/assets/illustrations/11.svg";
import Illustration14 from "@/assets/illustrations/14.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import Illustration28 from "@/assets/illustrations/28.svg";
import type {
  DoneSubTab,
  LoadSubTab,
  StatusFilterTab,
} from "@/features/network/utils/loadCenter.model";
import {
  TripsPromoIcons,
  type TripsPromoIconId,
} from "@/lib/tripsPromoBulletAssets";

export type LoadCenterPromoVariant =
  | "give_open"
  | "give_quoted"
  | "give_awarded"
  | "give_done_rejected"
  | "give_done_converted"
  | "get_open"
  | "get_quoted"
  | "get_awarded"
  | "get_done_rejected"
  | "get_done_converted"
  | "claimed_awarded"
  | "claimed_done_rejected"
  | "claimed_done_converted"
  | "filtered_out";

export type LoadCenterPromoBullet = {
  label: string;
  icon: TripsPromoIconId;
};

export type LoadCenterPromoPreset = {
  illustration: ComponentType<SvgProps>;
  aspect: number;
  title: string;
  description: string;
  ctaLabel: string;
  bullets: LoadCenterPromoBullet[];
};

export const LOAD_CENTER_PROMO_PRESETS: Record<
  LoadCenterPromoVariant,
  LoadCenterPromoPreset
> = {
  give_open: {
    illustration: Illustration11,
    aspect: 580 / 600,
    title: "No created loads yet",
    description:
      "Post open freight to your network. Suppliers can quote, you award, then convert to a trip.",
    ctaLabel: "Add first load →",
    bullets: [
      { label: "Post route & rate", icon: "doc" },
      { label: "Broadcast to network", icon: "mail" },
      { label: "Collect quotes", icon: "xls" },
      { label: "Award & dispatch", icon: "vector" },
    ],
  },
  give_quoted: {
    illustration: Illustration14,
    aspect: 600 / 466,
    title: "No loads receiving bids yet",
    description:
      "Loads with supplier bids appear here. Review offers and award the best partner.",
    ctaLabel: "",
    bullets: [
      { label: "Compare bids", icon: "xls" },
      { label: "Check supplier", icon: "mail" },
      { label: "Negotiate rate", icon: "pdf" },
      { label: "Award load", icon: "doc" },
    ],
  },
  give_awarded: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "No awarded loads here",
    description:
      "Loads you have awarded to a supplier show here until they are deployed or closed out.",
    ctaLabel: "",
    bullets: [
      { label: "Partner confirmed", icon: "mail" },
      { label: "Rate locked", icon: "excel" },
      { label: "Await deployment", icon: "vector" },
      { label: "Track handoff", icon: "image" },
    ],
  },
  give_done_rejected: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No closed loads",
    description:
      "Cancelled or expired loads you posted appear here for reference and audit.",
    ctaLabel: "",
    bullets: [
      { label: "Cancelled freight", icon: "pdf" },
      { label: "Expired listings", icon: "text" },
      { label: "Archive record", icon: "zip" },
      { label: "Repost if needed", icon: "doc" },
    ],
  },
  give_done_converted: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No converted loads yet",
    description:
      "Awarded loads that became trips on your books show here with driver and vehicle details.",
    ctaLabel: "",
    bullets: [
      { label: "Trip created", icon: "vector" },
      { label: "Driver assigned", icon: "mail" },
      { label: "On books", icon: "excel" },
      { label: "Ledger linked", icon: "xls" },
    ],
  },
  get_open: {
    illustration: Illustration2,
    aspect: 600 / 437,
    title: "No open freight to bid on",
    description:
      "Open loads from shippers in your Pulse network appear here. Submit a quote to compete.",
    ctaLabel: "",
    bullets: [
      { label: "Browse routes", icon: "vector" },
      { label: "Check target rate", icon: "xls" },
      { label: "Submit quote", icon: "doc" },
      { label: "Grow network", icon: "mail" },
    ],
  },
  get_quoted: {
    illustration: Illustration6,
    aspect: 600 / 595,
    title: "No bids in My Bids yet",
    description:
      "Loads where you have sent a bid appear here while the shipper reviews offers.",
    ctaLabel: "",
    bullets: [
      { label: "Bid pending", icon: "xls" },
      { label: "Update bid", icon: "doc" },
      { label: "Follow up", icon: "mail" },
      { label: "Await award", icon: "pdf" },
    ],
  },
  get_awarded: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "No awarded freight yet",
    description:
      "Loads awarded to you appear here. Assign staff and deploy to convert into a trip.",
    ctaLabel: "",
    bullets: [
      { label: "You won the bid", icon: "excel" },
      { label: "Assign driver", icon: "mail" },
      { label: "Deploy trip", icon: "vector" },
      { label: "Start execution", icon: "image" },
    ],
  },
  get_done_rejected: {
    illustration: Illustration3,
    aspect: 600 / 587,
    title: "No declined quotes",
    description:
      "Loads where your quote was not selected appear here for your records.",
    ctaLabel: "",
    bullets: [
      { label: "Quote declined", icon: "pdf" },
      { label: "Closed opportunity", icon: "text" },
      { label: "Learn & rebid", icon: "xls" },
      { label: "Archive", icon: "zip" },
    ],
  },
  get_done_converted: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No converted trips yet",
    description:
      "Awarded loads you converted to trips with driver and vehicle show here.",
    ctaLabel: "",
    bullets: [
      { label: "Trip live", icon: "vector" },
      { label: "Driver on road", icon: "mail" },
      { label: "On books", icon: "excel" },
      { label: "Settlement ready", icon: "xls" },
    ],
  },
  claimed_awarded: {
    illustration: Illustration14,
    aspect: 600 / 466,
    title: "No claimed loads yet",
    description:
      "Freight awarded to you appears here. Assign staff and deploy when you are ready to run.",
    ctaLabel: "",
    bullets: [
      { label: "Award confirmed", icon: "pdf" },
      { label: "Assign staff", icon: "mail" },
      { label: "Deploy vehicle", icon: "vector" },
      { label: "Share indent", icon: "doc" },
    ],
  },
  claimed_done_rejected: {
    illustration: Illustration11,
    aspect: 580 / 600,
    title: "No rejected claimed loads",
    description:
      "Claimed loads that were cancelled or closed without a trip appear here.",
    ctaLabel: "",
    bullets: [
      { label: "Closed award", icon: "pdf" },
      { label: "No trip created", icon: "text" },
      { label: "Audit trail", icon: "zip" },
      { label: "Reference only", icon: "doc" },
    ],
  },
  claimed_done_converted: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No completed claimed loads",
    description:
      "Claimed loads converted to trips and completed appear here on your books.",
    ctaLabel: "",
    bullets: [
      { label: "Trip completed", icon: "vector" },
      { label: "POD captured", icon: "pdf" },
      { label: "On books", icon: "excel" },
      { label: "Archive", icon: "zip" },
    ],
  },
  filtered_out: {
    illustration: Illustration11,
    aspect: 580 / 600,
    title: "No loads match your search",
    description:
      "Clear your search or switch status tabs to see more loads in this view.",
    ctaLabel: "",
    bullets: [
      { label: "Clear search", icon: "text" },
      { label: "Widen filters", icon: "vector" },
      { label: "All statuses", icon: "xls" },
      { label: "Reset view", icon: "doc" },
    ],
  },
};

export { TripsPromoIcons };

export type LoadCenterPromoContext = {
  loadSubTab: LoadSubTab;
  statusFilterTab: StatusFilterTab;
  doneSubTab: DoneSubTab;
  hasSearchFilter: boolean;
};

export function resolveLoadCenterPromoVariant(
  ctx: LoadCenterPromoContext,
): LoadCenterPromoVariant {
  const { loadSubTab, statusFilterTab, doneSubTab, hasSearchFilter } = ctx;

  if (hasSearchFilter) {
    return "filtered_out";
  }

  if (loadSubTab === "GIVE_LOAD") {
    if (statusFilterTab === "OPEN") return "give_open";
    if (statusFilterTab === "QUOTED") return "give_quoted";
    if (statusFilterTab === "AWARDED") return "give_awarded";
    if (statusFilterTab === "DONE") {
      return doneSubTab === "REJECTED"
        ? "give_done_rejected"
        : "give_done_converted";
    }
  }

  if (loadSubTab === "GET_LOAD") {
    if (statusFilterTab === "OPEN") return "get_open";
    if (statusFilterTab === "QUOTED") return "get_quoted";
    if (statusFilterTab === "AWARDED") return "get_awarded";
    if (statusFilterTab === "DONE") {
      return doneSubTab === "REJECTED"
        ? "get_done_rejected"
        : "get_done_converted";
    }
  }

  if (loadSubTab === "AWARDED") {
    if (statusFilterTab === "AWARDED") return "claimed_awarded";
    return doneSubTab === "REJECTED"
      ? "claimed_done_rejected"
      : "claimed_done_converted";
  }

  return "give_open";
}

export function fitLoadCenterIllustration(
  boxW: number,
  boxH: number,
  assetAspect: number,
) {
  let w = boxW;
  let h = w / assetAspect;
  if (h > boxH) {
    h = boxH;
    w = h * assetAspect;
  }
  return { width: w, height: h };
}
