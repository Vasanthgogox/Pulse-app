import type { LucideIcon } from "lucide-react-native";
import {
  ArrowDownLeft,
  BarChart3,
  Building2,
  Calculator,
  Car,
  Download,
  Eye,
  FileCheck,
  History,
  Link2,
  MessageCircle,
  Receipt,
  Route,
  Scale,
  Truck,
  UserCircle,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react-native";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import Illustration3 from "@/assets/illustrations/3.svg";
import Illustration6 from "@/assets/illustrations/6.svg";
import Illustration14 from "@/assets/illustrations/14.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import Illustration28 from "@/assets/illustrations/28.svg";

export type FinancePromoVariant =
  | "ledger"
  | "ledgerViewOnly"
  | "customers"
  | "suppliers"
  | "drivers"
  | "garage";

export type FinancePromoBullet = {
  label: string;
  Icon: LucideIcon;
  tint: string;
};

export type FinancePromoPreset = {
  illustration: ComponentType<SvgProps>;
  aspect: number;
  title: string;
  description: string;
  ctaLabel: string;
  bullets: FinancePromoBullet[];
};

export const FINANCE_PROMO_PRESETS: Record<FinancePromoVariant, FinancePromoPreset> = {
  ledger: {
    illustration: Illustration6,
    aspect: 600 / 595,
    title: "Your ledger is empty",
    description:
      "Add customers, suppliers, or drivers and associate trips first. Record transactions from a trip or party tab — details will show here.",
    ctaLabel: "",
    bullets: [
      { label: "Add parties first", Icon: UserPlus, tint: "rgba(79, 70, 229, 0.1)" },
      { label: "Associate trips", Icon: Route, tint: "rgba(59, 130, 246, 0.1)" },
      { label: "Record transactions", Icon: Receipt, tint: "rgba(16, 185, 129, 0.1)" },
      { label: "View details here", Icon: Eye, tint: "rgba(168, 85, 247, 0.1)" },
    ],
  },
  ledgerViewOnly: {
    illustration: Illustration6,
    aspect: 600 / 595,
    title: "No entries yet",
    description:
      "Transactions for this party appear here once recorded from a linked trip or party ledger.",
    ctaLabel: "",
    bullets: [
      { label: "Party-linked entries", Icon: Link2, tint: "rgba(79, 70, 229, 0.1)" },
      { label: "Trip allocations", Icon: Route, tint: "rgba(59, 130, 246, 0.1)" },
      { label: "Running balance", Icon: Scale, tint: "rgba(16, 185, 129, 0.1)" },
      { label: "Audit trail", Icon: History, tint: "rgba(107, 114, 128, 0.12)" },
    ],
  },
  customers: {
    illustration: Illustration3,
    aspect: 600 / 587,
    title: "Add your first customer",
    description:
      "Track billing, collections, and trip-linked receivables for every client you work with.",
    ctaLabel: "Add customer",
    bullets: [
      { label: "Receivables view", Icon: ArrowDownLeft, tint: "rgba(16, 185, 129, 0.1)" },
      { label: "Trip billing", Icon: Receipt, tint: "rgba(79, 70, 229, 0.1)" },
      { label: "Invite on Pulse", Icon: MessageCircle, tint: "rgba(59, 130, 246, 0.1)" },
      { label: "Statement export", Icon: Download, tint: "rgba(107, 114, 128, 0.12)" },
    ],
  },
  suppliers: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "Add your first supplier",
    description:
      "Register carriers and vendors to manage payables, settlements, and lane rates.",
    ctaLabel: "Add supplier",
    bullets: [
      { label: "Payables tracking", Icon: Wallet, tint: "rgba(79, 70, 229, 0.1)" },
      { label: "Trip settlements", Icon: Building2, tint: "rgba(16, 185, 129, 0.1)" },
      { label: "Partner invites", Icon: Users, tint: "rgba(59, 130, 246, 0.1)" },
      { label: "Invoice matching", Icon: FileCheck, tint: "rgba(107, 114, 128, 0.12)" },
    ],
  },
  drivers: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "Add your first driver",
    description:
      "Onboard fleet drivers to track earnings, advances, and trip commissions in one place.",
    ctaLabel: "Add driver",
    bullets: [
      { label: "Trip earnings", Icon: Wallet, tint: "rgba(16, 185, 129, 0.1)" },
      { label: "Advance tracking", Icon: Receipt, tint: "rgba(79, 70, 229, 0.1)" },
      { label: "Settlement view", Icon: Scale, tint: "rgba(59, 130, 246, 0.1)" },
      { label: "Performance scores", Icon: BarChart3, tint: "rgba(168, 85, 247, 0.1)" },
    ],
  },
  garage: {
    illustration: Illustration14,
    aspect: 600 / 466,
    title: "Add your first vehicle",
    description:
      "Register trucks and assets to link trips, fuel, maintenance, and garage spend.",
    ctaLabel: "Add vehicle",
    bullets: [
      { label: "Trip linkage", Icon: Route, tint: "rgba(79, 70, 229, 0.1)" },
      { label: "Fuel & tolls", Icon: Truck, tint: "rgba(59, 130, 246, 0.1)" },
      { label: "Maintenance log", Icon: Wrench, tint: "rgba(107, 114, 128, 0.12)" },
      { label: "Cost per km", Icon: Calculator, tint: "rgba(16, 185, 129, 0.1)" },
    ],
  },
};

export type FinanceKanbanColumnType = "customers" | "suppliers" | "garage" | "drivers";

export const FINANCE_KANBAN_COLUMN_PROMO_VARIANT: Record<
  FinanceKanbanColumnType,
  FinancePromoVariant
> = {
  customers: "customers",
  suppliers: "suppliers",
  garage: "garage",
  drivers: "drivers",
};

export const FINANCE_KANBAN_COLUMN_EMPTY: Record<
  FinanceKanbanColumnType,
  { label: string; Icon: LucideIcon }
> = {
  customers: { label: "Client payments appear here", Icon: Users },
  suppliers: { label: "Supplier settlements appear here", Icon: Building2 },
  garage: { label: "Vehicle expenses appear here", Icon: Car },
  drivers: { label: "Driver payouts appear here", Icon: UserCircle },
};

export function fitFinanceIllustration(
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
