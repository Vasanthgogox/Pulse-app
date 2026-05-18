/**
 * Horizontal multi-row card scroller (Your connections hub — card view).
 */
import {
  chunkIntoTwoRowColumns,
  hubScrollCardWidth,
  NETWORK_HUB_CONNECTION_SCROLL_COLUMNS,
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
} from "@/features/network/constants/networkHubGrid";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";

export type NetworkHubTwoRowScrollProps<T> = {
  items: T[];
  windowWidth: number;
  cardHeight: number;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  columnsVisible?: number;
  contentStyle?: ViewStyle;
};

export function NetworkHubTwoRowScroll<T>({
  items,
  windowWidth,
  cardHeight,
  keyExtractor,
  renderItem,
  columnsVisible = NETWORK_HUB_CONNECTION_SCROLL_COLUMNS,
  contentStyle,
}: NetworkHubTwoRowScrollProps<T>) {
  const cardWidth = useMemo(
    () => hubScrollCardWidth(windowWidth, columnsVisible),
    [windowWidth, columnsVisible],
  );
  const columns = useMemo(() => chunkIntoTwoRowColumns(items), [items]);

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
    >
      <View style={styles.columnsRow}>
        {columns.map((column, columnIndex) => (
          <View
            key={`hub-scroll-col-${columnIndex}`}
            style={[styles.column, { width: cardWidth }]}
          >
            {column.map((item, rowIndex) => (
              <View
                key={keyExtractor(item)}
                style={[
                  styles.cell,
                  { height: cardHeight, minHeight: cardHeight },
                  rowIndex > 0 && styles.cellGap,
                ]}
              >
                {renderItem(item)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    width: "100%",
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingBottom: 4,
  },
  columnsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  column: {
    flexShrink: 0,
  },
  cell: {
    width: "100%",
    overflow: "hidden",
  },
  cellGap: {
    marginTop: NETWORK_HUB_GRID_GAP_PX,
  },
});
