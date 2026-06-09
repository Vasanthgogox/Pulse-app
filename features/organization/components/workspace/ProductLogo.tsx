import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeftRight,
  BarChart2,
  Brain,
  FileCheck,
  Receipt,
  ShieldCheck,
  Store,
  Truck,
  UserSearch,
  Users,
  Zap,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import Theme from "@/constants/Theme";
import { PRODUCT_REGISTRY, type ProductId } from "@/lib/productRegistry";

const PRODUCT_ICON: Record<ProductId, LucideIcon> = {
  pulse_core: Zap,
  pulse_pod_pro: FileCheck,
  pulse_invoice_pro: Receipt,
  pulse_finance_pro: BarChart2,
  pulse_fleet_pro: Truck,
  pulse_people: Users,
  pulse_talent: UserSearch,
  pulse_marketplace: Store,
  pulse_exchange: ArrowLeftRight,
  pulse_compliance: ShieldCheck,
  pulse_ai: Brain,
};

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  if (raw.length !== 6) return `rgba(79, 70, 229, ${alpha})`;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const INACTIVE_ICON = "#A1A5B7";

function tileColors(productId: ProductId, active: boolean) {
  if (!active) {
    return {
      fg: INACTIVE_ICON,
      bg: "transparent",
      border: "transparent",
      showBorder: false,
    };
  }
  const brand = PRODUCT_REGISTRY[productId]?.color ?? Theme.primary;
  return {
    fg: brand,
    bg: hexToRgba(brand, 0.1),
    border: hexToRgba(brand, 0.22),
    showBorder: true,
  };
}

export type ProductLogoProps = {
  productId: ProductId;
  size?: number;
  muted?: boolean;
  active?: boolean;
  showActiveDot?: boolean;
};

/** Flat 2D product tile — Lucide icon on soft brand tint (enterprise dock style). */
export function ProductLogo({
  productId,
  size = 40,
  muted = false,
  active = false,
  showActiveDot = false,
}: ProductLogoProps) {
  const Icon = PRODUCT_ICON[productId] ?? Zap;
  const colors = tileColors(productId, active && !muted);
  const radius = Math.round(size * 0.26);
  const iconSize = Math.round(size * (active && !muted ? 0.46 : 0.52));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: active && !muted ? radius : 0,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: colors.showBorder ? 1 : 0,
          },
        ]}
      >
        <Icon
          color={colors.fg}
          size={iconSize}
          strokeWidth={active && !muted ? 2 : 1.75}
        />
      </View>
      {showActiveDot && active ? (
        <View style={[styles.activeDot, { width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    position: "absolute",
    top: -1,
    right: -1,
    backgroundColor: Theme.primary,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
  },
});

export function productBrandColor(productId: ProductId): string {
  return PRODUCT_REGISTRY[productId]?.color ?? Theme.primary;
}
