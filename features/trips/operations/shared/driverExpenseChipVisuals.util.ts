import type { LucideIcon } from "lucide-react-native";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Building2,
  CircleDot,
  Clock,
  CreditCard,
  Droplets,
  Fuel,
  HelpCircle,
  Hourglass,
  Layers,
  Leaf,
  MapPin,
  MoreHorizontal,
  Radio,
  Receipt,
  Scale,
  SquareParking,
  Truck,
  UserRound,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from "lucide-react-native";

import type {
  FuelType,
  OperationalPaymentMode,
  OperationalPaymentOwner,
  TripOtherExpenseCategory,
} from "../types";

export type DriverChipVisual = {
  Icon: LucideIcon;
  /** Icon stroke when tile is idle */
  tint: string;
  /** Icon badge background when idle */
  tintBg: string;
  /** Icon badge background when selected */
  activeTintBg: string;
};

const OTHER_CATEGORY_VISUALS: Record<TripOtherExpenseCategory, DriverChipVisual> = {
  parking: {
    Icon: SquareParking,
    tint: "#0369a1",
    tintBg: "rgba(14,165,233,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  challan: {
    Icon: AlertTriangle,
    tint: "#b45309",
    tintBg: "rgba(245,158,11,0.14)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  loading: {
    Icon: ArrowUpFromLine,
    tint: "#c2410c",
    tintBg: "rgba(249,115,22,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  unloading: {
    Icon: ArrowDownToLine,
    tint: "#7c2d12",
    tintBg: "rgba(234,88,12,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  detention: {
    Icon: Hourglass,
    tint: "#6d28d9",
    tintBg: "rgba(139,92,246,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  maintenance: {
    Icon: Wrench,
    tint: "#475569",
    tintBg: "rgba(100,116,139,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  fastag: {
    Icon: Radio,
    tint: "#4D3636",
    tintBg: "rgba(99,102,241,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  advance: {
    Icon: Wallet,
    tint: "#0f766e",
    tintBg: "rgba(20,184,166,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  food: {
    Icon: UtensilsCrossed,
    tint: "#be123c",
    tintBg: "rgba(244,63,94,0.11)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  weighbridge: {
    Icon: Scale,
    tint: "#334155",
    tintBg: "rgba(51,65,85,0.1)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  misc: {
    Icon: Layers,
    tint: "#64748b",
    tintBg: "rgba(100,116,139,0.1)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
};

const DRIVER_EXPENSE_CATEGORY_VISUALS: Record<string, DriverChipVisual> = {
  fuel: {
    Icon: Fuel,
    tint: "#047857",
    tintBg: "rgba(16,185,129,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  toll: {
    Icon: MapPin,
    tint: "#4D3636",
    tintBg: "rgba(99,102,241,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  ...OTHER_CATEGORY_VISUALS,
};

const PAYMENT_MODE_VISUALS: Record<OperationalPaymentMode, DriverChipVisual> = {
  cash: {
    Icon: Banknote,
    tint: "#15803d",
    tintBg: "rgba(34,197,94,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  fastag: {
    Icon: Radio,
    tint: "#4D3636",
    tintBg: "rgba(99,102,241,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  card: {
    Icon: CreditCard,
    tint: "#0369a1",
    tintBg: "rgba(14,165,233,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  credit: {
    Icon: Receipt,
    tint: "#7c3aed",
    tintBg: "rgba(139,92,246,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  pending: {
    Icon: Clock,
    tint: "#b45309",
    tintBg: "rgba(245,158,11,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  unknown: {
    Icon: HelpCircle,
    tint: "#64748b",
    tintBg: "rgba(100,116,139,0.1)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
};

const FUEL_TYPE_VISUALS: Record<FuelType, DriverChipVisual> = {
  diesel: {
    Icon: Fuel,
    tint: "#475569",
    tintBg: "rgba(71,85,105,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  petrol: {
    Icon: Droplets,
    tint: "#dc2626",
    tintBg: "rgba(239,68,68,0.11)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  cng: {
    Icon: Leaf,
    tint: "#059669",
    tintBg: "rgba(16,185,129,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  other: {
    Icon: CircleDot,
    tint: "#64748b",
    tintBg: "rgba(100,116,139,0.1)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
};

const TOLL_ENTRY_VISUALS: Record<"actual" | "estimated", DriverChipVisual> = {
  actual: {
    Icon: MapPin,
    tint: "#047857",
    tintBg: "rgba(16,185,129,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  estimated: {
    Icon: MoreHorizontal,
    tint: "#4D3636",
    tintBg: "rgba(99,102,241,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
};

const PAYMENT_OWNER_VISUALS: Record<OperationalPaymentOwner, DriverChipVisual> = {
  organization: {
    Icon: Building2,
    tint: "#0369a1",
    tintBg: "rgba(14,165,233,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  driver: {
    Icon: UserRound,
    tint: "#047857",
    tintBg: "rgba(16,185,129,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  supplier: {
    Icon: Truck,
    tint: "#7c3aed",
    tintBg: "rgba(139,92,246,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  fleet_card: {
    Icon: CreditCard,
    tint: "#0f766e",
    tintBg: "rgba(20,184,166,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  fastag: {
    Icon: Radio,
    tint: "#4D3636",
    tintBg: "rgba(99,102,241,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  cash_advance: {
    Icon: Banknote,
    tint: "#15803d",
    tintBg: "rgba(34,197,94,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  credit_vendor: {
    Icon: Receipt,
    tint: "#7c3aed",
    tintBg: "rgba(139,92,246,0.12)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
  unknown: {
    Icon: HelpCircle,
    tint: "#64748b",
    tintBg: "rgba(100,116,139,0.1)",
    activeTintBg: "rgba(4,120,87,0.18)",
  },
};

const DEFAULT_VISUAL: DriverChipVisual = {
  Icon: Layers,
  tint: "#64748b",
  tintBg: "rgba(100,116,139,0.1)",
  activeTintBg: "rgba(4,120,87,0.18)",
};

export function visualForDriverExpenseCategory(value: string): DriverChipVisual {
  return DRIVER_EXPENSE_CATEGORY_VISUALS[value] ?? DEFAULT_VISUAL;
}

export function visualForOtherExpenseCategory(
  value: TripOtherExpenseCategory,
): DriverChipVisual {
  return OTHER_CATEGORY_VISUALS[value] ?? DEFAULT_VISUAL;
}

export function visualForPaymentMode(value: OperationalPaymentMode): DriverChipVisual {
  return PAYMENT_MODE_VISUALS[value] ?? DEFAULT_VISUAL;
}

export function visualForPaymentOwner(value: OperationalPaymentOwner): DriverChipVisual {
  return PAYMENT_OWNER_VISUALS[value] ?? DEFAULT_VISUAL;
}

export function visualForFuelType(value: FuelType): DriverChipVisual {
  return FUEL_TYPE_VISUALS[value] ?? DEFAULT_VISUAL;
}

export function visualForTollEntryType(value: "actual" | "estimated"): DriverChipVisual {
  return TOLL_ENTRY_VISUALS[value] ?? DEFAULT_VISUAL;
}

export function resolveDriverChipVisual(
  value: string,
  group:
    | "other_category"
    | "driver_expense_category"
    | "payment_mode"
    | "payment_owner"
    | "fuel_type"
    | "toll_entry",
): DriverChipVisual {
  switch (group) {
    case "other_category":
      return visualForOtherExpenseCategory(value as TripOtherExpenseCategory);
    case "driver_expense_category":
      return visualForDriverExpenseCategory(value);
    case "payment_mode":
      return visualForPaymentMode(value as OperationalPaymentMode);
    case "payment_owner":
      return visualForPaymentOwner(value as OperationalPaymentOwner);
    case "fuel_type":
      return visualForFuelType(value as FuelType);
    case "toll_entry":
      return visualForTollEntryType(value as "actual" | "estimated");
    default:
      return DEFAULT_VISUAL;
  }
}
