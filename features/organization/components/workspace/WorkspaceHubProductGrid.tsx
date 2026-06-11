import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { HUB_PURPLE } from "@/components/profile/workspaceHubMenu.styles";
import { ProductLogo } from "@/features/organization/components/workspace/ProductLogo";
import { productGridStyles as styles } from "@/features/organization/components/workspace/workspaceHubProductGrid.styles";
import { getProductsInDisplayOrder, type ProductId } from "@/lib/productRegistry";
import { ChevronRight } from "lucide-react-native";

function displayProductName(name: string): string {
  return name.replace(/^Pulse\s+/i, "").trim() || name;
}

type WorkspaceHubProductGridProps = {
  activeProductIds: Set<ProductId>;
  onOpenCatalogue: () => void;
  onSelectProduct?: (productId: ProductId) => void;
};

/** Pulse Products — 3-column grid inside the hub scroll body. */
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
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
        onPress={onOpenCatalogue}
        accessibilityRole="button"
        accessibilityLabel="Open Pulse Products catalogue"
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionAccent} />
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionEyebrow}>Pulse Products</Text>
            <Text style={styles.sectionMeta}>
              {activeCount} connected · {products.length} modules
            </Text>
          </View>
        </View>
        <View style={styles.catalogueLink}>
          <Text style={styles.catalogueLinkText}>Catalogue</Text>
          <ChevronRight size={12} color={HUB_PURPLE} strokeWidth={2.2} />
        </View>
      </Pressable>

      <View style={styles.grid}>
        {products.map((product) => {
          const isActive =
            activeProductIds.has(product.id) || product.id === "pulse_core";
          return (
            <View key={product.id} style={styles.gridCell}>
              <Pressable
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
                  size={36}
                  active={isActive}
                />
                <Text
                  style={[
                    styles.chipName,
                    isActive ? styles.chipNameActive : styles.chipNameLocked,
                  ]}
                  numberOfLines={2}
                >
                  {displayProductName(product.name)}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
});
