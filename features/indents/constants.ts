/**
 * Create indent form options — aligned with Q-unified-base create-indent types.
 */

import type { CirculationTarget } from "@/features/indents/services/indents.service";

export const VEHICLE_TYPES = [
  "Tata Ace",
  "Eicher 14ft",
  "Taurus 17ft",
  "Container 20ft",
  "Container 32ft",
  "Trailer",
  "Container",
  "32FT Container",
  "40ft Container",
  "Truck",
  "Tipper",
  "Open Body",
  "Tanker",
  "Tempo",
  "Mini Truck",
  "Pickup",
];

export const LOAD_TYPES = [
  "Electronics",
  "FMCG Goods",
  "Construction Material",
  "Textiles",
  "Machinery Parts",
  "Pharmaceuticals",
];

export const CIRCULATION_TARGETS: Array<{
  value: CirculationTarget;
  label: string;
  description: string;
}> = [
  {
    value: "marketplace",
    label: "Marketplace Only",
    description: "Post to open marketplace for competitive bidding",
  },
  {
    value: "integrated_supplier",
    label: "Integrated Suppliers",
    description: "Send to your integrated supplier network",
  },
  {
    value: "offline",
    label: "Offline Only",
    description: "Handle through offline channels",
  },
  {
    value: "both",
    label: "Marketplace + Integrated",
    description: "Post to both marketplace and integrated suppliers",
  },
];
