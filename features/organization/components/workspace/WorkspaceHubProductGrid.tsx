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
          <ChevronRight size={14} color={Theme.primary} strokeWidth={2.2} />
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
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={() => {
                onSelectProduct?.(product.id);
                onOpenCatalogue();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}${isActive ? ", connected" : ""}`}
            >
              <ProductLogo
                productId={product.id}
                size={44}
                active={isActive}
                showActiveDot={isActive}
              />
              <Text style={styles.chipName} numberOfLines={1}>
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
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
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
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  dockMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
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
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  scrollContent: {
    paddingHorizontal: 14,
    gap: 4,
    paddingBottom: 2,
  },
  chip: {
    width: 80,
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chipPressed: {
    backgroundColor: "#f4f6fa",
  },
  chipName: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 13,
    width: "100%",
  },
});
