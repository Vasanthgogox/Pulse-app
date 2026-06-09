import { memo, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { ProductLogo } from "@/features/organization/components/workspace/ProductLogo";
import {
  getProductsInDisplayOrder,
  type ProductDefinition,
  type ProductId,
} from "@/lib/productRegistry";
import { ChevronRight } from "lucide-react-native";

function shortProductName(name: string): string {
  const trimmed = name.replace(/^Pulse\s+/i, "").trim() || name;
  if (trimmed.length <= 11) return trimmed;
  const aliases: Record<string, string> = {
    Marketplace: "Market",
    Compliance: "Comply",
    "Invoice Pro": "Invoice",
    "Finance Pro": "Finance",
    "Fleet Pro": "Fleet",
    "POD Pro": "POD",
  };
  return aliases[trimmed] ?? trimmed;
}

type WorkspaceHubProductGridProps = {
  activeProductIds: Set<ProductId>;
  onOpenCatalogue: () => void;
  onSelectProduct?: (productId: ProductId) => void;
};

/** Pinned bottom dock — compact product launcher. */
export const WorkspaceHubProductGrid = memo(function WorkspaceHubProductGrid({
  activeProductIds,
  onOpenCatalogue,
  onSelectProduct,
}: WorkspaceHubProductGridProps) {
  const products = useMemo(() => getProductsInDisplayOrder(), []);
  const activeCount = useMemo(
    () =>
      products.filter(
        (product) => activeProductIds.has(product.id) || product.id === "pulse_core",
      ).length,
    [activeProductIds, products],
  );

  return (
    <View style={styles.dock}>
      <Pressable
        style={({ pressed }) => [styles.dockHeader, pressed && styles.dockHeaderPressed]}
        onPress={onOpenCatalogue}
        accessibilityRole="button"
        accessibilityLabel="Open Pulse Products catalogue"
      >
        <View style={styles.dockHeaderLeft}>
          <Text style={styles.dockEyebrow}>Pulse Products</Text>
          <Text style={styles.dockMeta}>
            {activeCount} connected · {products.length} modules
          </Text>
        </View>
        <View style={styles.catalogueLink}>
          <Text style={styles.catalogueLinkText}>Catalogue</Text>
          <ChevronRight size={12} color={Theme.primary} strokeWidth={2.2} />
        </View>
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {products.map((product) => {
          const isActive =
            activeProductIds.has(product.id) || product.id === "pulse_core";
          return (
            <Pressable
              key={product.id}
              style={({ pressed }) => [
                styles.chip,
                pressed && isActive && styles.chipPressed,
              ]}
              onPress={
                isActive
                  ? () => {
                      onSelectProduct?.(product.id);
                      onOpenCatalogue();
                    }
                  : undefined
              }
              disabled={!isActive}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}${isActive ? ", connected" : ", locked"}`}
            >
              <ProductLogo
                productId={product.id}
                size={34}
                active={isActive}
                showActiveDot={isActive}
              />
              <Text
                style={[styles.chipName, isActive && styles.chipNameActive]}
                numberOfLines={1}
              >
                {shortProductName(product.name)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  dock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  dockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
  },
  dockHeaderPressed: {
    opacity: 0.88,
  },
  dockHeaderLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dockEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  dockMeta: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  catalogueLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  catalogueLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 2,
    paddingBottom: 2,
  },
  chip: {
    width: 62,
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipPressed: {
    backgroundColor: "#f4f6fa",
  },
  chipName: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 12,
    width: "100%",
  },
  chipNameActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
  },
});
