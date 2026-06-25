import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeftRight,
  BarChart2,
  Brain,
  FileCheck,
  Gavel,
  MessageSquare,
  Network,
  Receipt,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
  UserSearch,
  Users,
  Zap,
} from "lucide-react-native";
import LottieView from "lottie-react-native";
import { StyleSheet, View } from "react-native";

import Theme from "@/constants/Theme";
import { PRODUCT_LOTTIE_ASSETS } from "@/features/organization/utils/productLottieAssets.util";
import { PRODUCT_REGISTRY, type ProductId } from "@/lib/productRegistry";

const PRODUCT_ICON: Record<ProductId, LucideIcon> = {
  pulse_core: Zap,
  pulse_driver: Smartphone,
  pulse_network: Network,
  pulse_network_bidding: Gavel,
  pulse_chat: MessageSquare,
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

export type ProductLogoProps = {
  productId: ProductId;
  size?: number;
  muted?: boolean;
  active?: boolean;
  /** @deprecated Dots removed — active state is icon color only. */
  showActiveDot?: boolean;
};

function ProductLottieLogo({
  productId,
  size,
}: {
  productId: ProductId;
  size: number;
}) {
  const asset = PRODUCT_LOTTIE_ASSETS[productId];
  const glyphScale = asset.glyphScale ?? 1.1;
  const lottieSize = Math.round(size * glyphScale);

  return (
    <View style={[styles.lottieSlot, { width: size, height: size }]}>
      <LottieView
        source={asset.source}
        autoPlay
        loop
        speed={asset.speed ?? 1}
        resizeMode="contain"
        style={{ width: lottieSize, height: lottieSize }}
      />
    </View>
  );
}

/** Product glyph — active modules use Lottie; locked modules stay flat grey Lucide. */
export function ProductLogo({
  productId,
  size = 40,
  muted = false,
  active = false,
}: ProductLogoProps) {
  const Icon = PRODUCT_ICON[productId] ?? Zap;
  const isLive = active && !muted;
  const iconSize = Math.round(size * 0.52);

  if (isLive) {
    return <ProductLottieLogo productId={productId} size={size} />;
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Icon color={INACTIVE_ICON} size={iconSize} strokeWidth={1.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  lottieSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

export function productBrandColor(productId: ProductId): string {
  return PRODUCT_REGISTRY[productId]?.color ?? Theme.primary;
}
