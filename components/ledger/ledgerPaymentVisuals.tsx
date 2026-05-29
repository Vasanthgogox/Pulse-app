import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  Banknote,
  Building2,
  CheckCircle2,
  CircleEllipsis,
  Clock,
  CreditCard,
  FileText,
  Fuel,
  MinusCircle,
  Package,
  ParkingCircle,
  Percent,
  PlusCircle,
  Shield,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  Ticket,
  Timer,
  Truck,
  Undo2,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { PaymentModeLogo } from "@/components/ledger/paymentModeLogos";

const STROKE = 2.2;

export function isLedgerCashPaymentMode(id: string | null | undefined): boolean {
  return (id ?? "").trim().toUpperCase() === "CASH";
}

export type PaymentModeVisual = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  tint: string;
  gradient: readonly [string, string, ...string[]];
  Icon: LucideIcon;
};

export const LEDGER_PAYMENT_MODES: PaymentModeVisual[] = [
  {
    id: "CASH",
    label: "Cash",
    shortLabel: "Cash",
    color: "#16a34a",
    tint: "#dcfce7",
    gradient: ["#4ade80", "#16a34a", "#14532d"],
    Icon: Banknote,
  },
  {
    id: "UPI",
    label: "UPI",
    shortLabel: "UPI",
    color: "#7c3aed",
    tint: "#ede9fe",
    gradient: ["#f97316", "#7c3aed", "#059669"],
    Icon: Smartphone,
  },
  {
    id: "BANK",
    label: "Bank Transfer",
    shortLabel: "Bank",
    color: "#2563eb",
    tint: "#dbeafe",
    gradient: ["#60a5fa", "#2563eb", "#1e3a8a"],
    Icon: Building2,
  },
  {
    id: "CHEQUE",
    label: "Cheque",
    shortLabel: "Cheque",
    color: "#db2777",
    tint: "#fce7f3",
    gradient: ["#f9a8d4", "#db2777", "#9d174d"],
    Icon: FileText,
  },
  {
    id: "FUEL_CARD",
    label: "Fuel Card",
    shortLabel: "Fuel card",
    color: "#ea580c",
    tint: "#ffedd5",
    gradient: ["#fdba74", "#ea580c", "#9a3412"],
    Icon: CreditCard,
  },
  {
    id: "FASTAG",
    label: "FASTag",
    shortLabel: "FASTag",
    color: "#4f46e5",
    tint: "#e0e7ff",
    gradient: ["#a5b4fc", "#4f46e5", "#312e81"],
    Icon: Ticket,
  },
  {
    id: "CREDIT",
    label: "Credit",
    shortLabel: "Credit",
    color: "#64748b",
    tint: "#f1f5f9",
    gradient: ["#cbd5e1", "#64748b", "#334155"],
    Icon: Clock,
  },
];

export function ledgerPaymentModeVisual(modeId: string): PaymentModeVisual {
  return LEDGER_PAYMENT_MODES.find((m) => m.id === modeId) ?? LEDGER_PAYMENT_MODES[0]!;
}

export const LedgerPaymentModeTile = memo(function LedgerPaymentModeTile({
  modeId,
  selected,
  size = "md",
}: {
  modeId: string;
  selected?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? 44 : 52;

  return (
    <View style={[styles.tileOuter, selected && styles.tileOuterSelected]}>
      <View style={[styles.tileIconWrap, { width: box, height: box }]}>
        <PaymentModeLogo modeId={modeId} size={Math.round(box * 0.92)} />
      </View>
    </View>
  );
});

function paymentTypeIcon(kind: string, size: number) {
  const p = { size, strokeWidth: STROKE };
  switch (kind) {
    case "Trip Payment":
      return <Truck {...p} color="#2563eb" />;
    case "Advance Payment":
    case "Advance from Client":
    case "Advance":
    case "advance":
      return <ArrowUpRight {...p} color="#16a34a" />;
    case "Partial Payment":
      return <ArrowLeftRight {...p} color="#d97706" />;
    case "Balance Payment":
    case "settlement":
      return <CheckCircle2 {...p} color="#0d9488" />;
    case "Extra Charges":
      return <PlusCircle {...p} color="#ca8a04" />;
    case "Detention Charges":
      return <Timer {...p} color="#ea580c" />;
    case "Cancellation Charges":
      return <Ban {...p} color="#dc2626" />;
    case "Commission":
      return <Percent {...p} color="#7c3aed" />;
    case "Penalty":
      return <AlertTriangle {...p} color="#e11d48" />;
    case "Adjustment":
    case "adjustment":
      return <Sliders {...p} color="#64748b" />;
    case "Other":
      return <CircleEllipsis {...p} color="#94a3b8" />;
    case "salary":
      return <User {...p} color="#2563eb" />;
    case "reimbursement":
      return <Undo2 {...p} color="#8b5cf6" />;
    case "bonus":
      return <Star {...p} color="#ca8a04" />;
    case "deduction":
      return <MinusCircle {...p} color="#dc2626" />;
    case "Fuel":
      return <Fuel {...p} color="#15803d" />;
    case "Toll":
      return <ArrowLeftRight {...p} color="#0ea5e9" />;
    case "Maintenance":
    case "Repair":
      return <Wrench {...p} color="#64748b" />;
    case "Tyre":
      return <Package {...p} color="#57534e" />;
    case "Insurance":
      return <Shield {...p} color="#1d4ed8" />;
    case "Permit / Tax":
      return <FileText {...p} color="#7c3aed" />;
    case "Parking":
      return <ParkingCircle {...p} color="#0891b2" />;
    case "Cleaning":
      return <Sparkles {...p} color="#db2777" />;
    default:
      return <Package {...p} color="#94a3b8" />;
  }
}

export const LedgerPaymentTypeIcon = memo(function LedgerPaymentTypeIcon({
  kind,
  size = 20,
}: {
  kind: string;
  size?: number;
}) {
  return paymentTypeIcon(kind, size);
});

export function ledgerPaymentModeLabel(modeId: string): string {
  return ledgerPaymentModeVisual(modeId).label;
}

const styles = StyleSheet.create({
  tileOuter: {
    borderRadius: 12,
  },
  tileOuterSelected: {
    transform: [{ scale: 1.04 }],
  },
  tileIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
