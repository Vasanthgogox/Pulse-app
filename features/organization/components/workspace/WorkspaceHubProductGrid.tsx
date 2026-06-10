import { memo, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { HUB_PURPLE } from "@/components/profile/workspaceHubMenu.styles";
import { ProductLogo } from "@/features/organization/components/workspace/ProductLogo";
import { productDockStyles as styles } from "@/features/organization/components/workspace/workspaceHubProductGrid.styles";
import { getProductsInDisplayOrder, type ProductId } from "@/lib/productRegistry";
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
          <ChevronRight size={12} color={HUB_PURPLE} strokeWidth={2.2} />
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
                isActive && styles.chipActive,
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
                style={[
                  styles.chipName,
                  isActive ? styles.chipNameActive : styles.chipNameLocked,
                ]}
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
