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
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PaymentModeLogo } from "@/components/ledger/paymentModeLogos";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";

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
    color: "#4D3636",
    tint: "#e0e7ff",
    gradient: ["#a5b4fc", "#4D3636", "#312e81"],
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

export type LedgerProtocolStripVariant = "desktop" | "compact";

type LedgerProtocolStripTileBaseProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  width?: number;
  variant?: LedgerProtocolStripVariant;
};

/** Desktop / web ledger strip — brand logo + tinted selection (matches mobile wizard). */
export const LedgerProtocolStripModeTile = memo(function LedgerProtocolStripModeTile({
  modeId,
  label,
  selected,
  onPress,
  width,
  variant = "desktop",
}: LedgerProtocolStripTileBaseProps & { modeId: string }) {
  const mode = ledgerPaymentModeVisual(modeId);
  const logoSize = variant === "compact" ? 26 : 32;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        stripStyles.tile,
        width != null && { width },
        variant === "compact" && stripStyles.tileCompact,
        selected && { borderColor: mode.color, backgroundColor: mode.tint },
        pressed && stripStyles.tilePressed,
      ]}
    >
      <View style={stripStyles.modeLogoWrap}>
        <PaymentModeLogo modeId={modeId} size={logoSize} />
      </View>
      <Text
        style={[
          stripStyles.label,
          variant === "compact" && stripStyles.labelCompact,
          selected && { color: mode.color },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
});

/** Desktop / web ledger strip — coloured icon orb + label. */
export const LedgerProtocolStripTypeTile = memo(function LedgerProtocolStripTypeTile({
  kind,
  label,
  selected,
  onPress,
  width,
  variant = "desktop",
}: LedgerProtocolStripTileBaseProps & { kind: string }) {
  const iconSize = variant === "compact" ? 16 : 18;
  const wrapSize = variant === "compact" ? 32 : 36;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        stripStyles.tile,
        width != null && { width },
        variant === "compact" && stripStyles.tileCompact,
        selected && stripStyles.typeTileSelected,
        pressed && stripStyles.tilePressed,
      ]}
    >
      <View
        style={[
          stripStyles.typeIconWrap,
          { width: wrapSize, height: wrapSize, borderRadius: Math.round(wrapSize * 0.32) },
          selected && stripStyles.typeIconWrapSelected,
        ]}
      >
        <LedgerPaymentTypeIcon kind={kind} size={iconSize} />
      </View>
      <Text
        style={[
          stripStyles.label,
          variant === "compact" && stripStyles.labelCompact,
          selected && stripStyles.typeLabelSelected,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const stripStyles = StyleSheet.create({
  tile: {
    minHeight: 76,
    flexShrink: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tileCompact: {
    minHeight: 64,
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  tilePressed: {
    opacity: 0.92,
  },
  modeLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  typeIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  typeIconWrapSelected: {
    backgroundColor: "rgba(99,102,241,0.12)",
    borderColor: "rgba(99,102,241,0.22)",
  },
  typeTileSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  label: {
    ...FinanceTxnTypography.chipLabel,
    fontSize: 9,
    lineHeight: 11,
    textAlign: "center",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  labelCompact: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.25,
  },
  typeLabelSelected: {
    color: Theme.primary,
  },
});

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
