import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  CircleEllipsis,
  FileText,
  Fuel,
  MinusCircle,
  Package,
  ParkingCircle,
  Percent,
  PlusCircle,
  Shield,
  Sliders,
  Sparkles,
  Star,
  Timer,
  Truck,
  Undo2,
  User,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";

import type { ImageSourcePropType } from "react-native";

export type PaymentTypeVisual = {
  color: string;
  tint: string;
  Icon: LucideIcon;
  /** Optional crisp PNG for strip tiles (Lottie is too padded below ~28px). */
  stripPng?: ImageSourcePropType;
  stripPngScale?: number;
};

const DEFAULT_VISUAL: PaymentTypeVisual = {
  color: "#64748b",
  tint: "#f1f5f9",
  Icon: Package,
};

/** Semantic colours + glyphs for ledger payment-type chips. */
export function ledgerPaymentTypeVisual(kind: string): PaymentTypeVisual {
  switch (kind) {
    case "Trip Payment":
      return {
        color: "#2563eb",
        tint: "#dbeafe",
        Icon: Truck,
        stripPng: require("@/assets/icon and logos/truck.png"),
        stripPngScale: 0.92,
      };
    case "Advance Payment":
    case "Advance from Client":
    case "Advance":
    case "advance":
      return { color: "#16a34a", tint: "#dcfce7", Icon: ArrowUpRight };
    case "Partial Payment":
      return { color: "#d97706", tint: "#ffedd5", Icon: ArrowLeftRight };
    case "Balance Payment":
    case "settlement":
      return { color: "#0d9488", tint: "#ccfbf1", Icon: CheckCircle2 };
    case "Extra Charges":
      return { color: "#ca8a04", tint: "#fef9c3", Icon: PlusCircle };
    case "Detention Charges":
      return { color: "#ea580c", tint: "#ffedd5", Icon: Timer };
    case "Cancellation Charges":
      return { color: "#dc2626", tint: "#fee2e2", Icon: Ban };
    case "Commission":
    case "DRIVER COMMISSION":
      return { color: "#7c3aed", tint: "#ede9fe", Icon: Percent };
    case "Penalty":
      return { color: "#e11d48", tint: "#ffe4e6", Icon: AlertTriangle };
    case "Adjustment":
    case "adjustment":
      return { color: "#64748b", tint: "#f1f5f9", Icon: Sliders };
    case "Other":
      return { color: "#94a3b8", tint: "#f8fafc", Icon: CircleEllipsis };
    case "salary":
      return {
        color: "#2563eb",
        tint: "#dbeafe",
        Icon: User,
        stripPng: require("@/assets/icon and logos/taxi-driver.png"),
        stripPngScale: 0.9,
      };
    case "reimbursement":
      return { color: "#8b5cf6", tint: "#ede9fe", Icon: Undo2 };
    case "bonus":
      return { color: "#ca8a04", tint: "#fef9c3", Icon: Star };
    case "deduction":
      return { color: "#dc2626", tint: "#fee2e2", Icon: MinusCircle };
    case "SUPPLIER PAYMENT":
    case "DRIVER SALARY":
    case "SUPPLIER COST":
      return {
        color: "#0f766e",
        tint: "#ccfbf1",
        Icon: Wallet,
        stripPng: require("@/assets/file type icons/dollar-calendar.png"),
        stripPngScale: 0.9,
      };
    case "Fuel":
      return { color: "#15803d", tint: "#dcfce7", Icon: Fuel };
    case "Toll":
      return { color: "#0ea5e9", tint: "#e0f2fe", Icon: ArrowLeftRight };
    case "Maintenance":
    case "Repair":
      return { color: "#64748b", tint: "#f1f5f9", Icon: Wrench };
    case "Tyre":
      return { color: "#57534e", tint: "#f5f5f4", Icon: Package };
    case "Insurance":
      return { color: "#1d4ed8", tint: "#dbeafe", Icon: Shield };
    case "Permit / Tax":
      return { color: "#7c3aed", tint: "#ede9fe", Icon: FileText };
    case "Parking":
      return { color: "#0891b2", tint: "#cffafe", Icon: ParkingCircle };
    case "Cleaning":
      return { color: "#db2777", tint: "#fce7f3", Icon: Sparkles };
    default:
      return DEFAULT_VISUAL;
  }
}
