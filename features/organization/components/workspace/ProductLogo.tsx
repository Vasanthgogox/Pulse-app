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

const INACTIVE_ICON = "#A1A5B7";

function iconColor(productId: ProductId, active: boolean): string {
  if (!active) return INACTIVE_ICON;
  return PRODUCT_REGISTRY[productId]?.color ?? Theme.primary;
}

export type ProductLogoProps = {
  productId: ProductId;
  size?: number;
  muted?: boolean;
  active?: boolean;
  /** @deprecated Dots removed — active state is icon color only. */
  showActiveDot?: boolean;
};

/** Flat product icon — no tile border or fill; active = brand color stroke only. */
export function ProductLogo({
  productId,
  size = 40,
  muted = false,
  active = false,
}: ProductLogoProps) {
  const Icon = PRODUCT_ICON[productId] ?? Zap;
  const isLive = active && !muted;
  const iconSize = Math.round(size * 0.52);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Icon
        color={iconColor(productId, isLive)}
        size={iconSize}
        strokeWidth={isLive ? 2.1 : 1.75}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export function productBrandColor(productId: ProductId): string {
  return PRODUCT_REGISTRY[productId]?.color ?? Theme.primary;
}
