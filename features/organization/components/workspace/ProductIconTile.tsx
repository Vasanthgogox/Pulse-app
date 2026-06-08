import { StyleSheet, View } from "react-native";

import type { ProductId } from "@/lib/productRegistry";
import { ProductLogo } from "@/features/organization/components/workspace/ProductLogo";

type ProductIconTileProps = {
  productId: ProductId;
  iconName?: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  /** Catalogue cards always show full brand color. */
  variant?: "dock" | "catalog";
};

const SIZE_MAP = {
  sm: 36,
  md: 44,
  lg: 52,
} as const;

export function ProductIconTile({
  productId,
  size = "md",
  active = false,
  variant = "dock",
}: ProductIconTileProps) {
  const logoSize = SIZE_MAP[size];
  const muted = variant === "dock" && !active;

  return (
    <View style={styles.wrap}>
      <ProductLogo
        productId={productId}
        size={logoSize}
        active={active}
        muted={muted}
        showActiveDot={variant === "dock" && active}
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
