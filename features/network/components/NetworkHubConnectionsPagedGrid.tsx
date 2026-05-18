/**
 * Your connections — paginated list grid (desktop 3×2, mobile 2×3) with Previous / Next.
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import type { NetworkHubConnectionsLayout } from "@/features/network/constants/networkHubGrid";
import {
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_NATIVE_LIST_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
} from "@/features/network/constants/networkHubGrid";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type NetworkHubConnectionsPagedGridProps<T> = {
  items: T[];
  layout: NetworkHubConnectionsLayout;
  resetKey: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
};

function chunkRow<T>(items: T[], columns: number): (T | null)[] {
  const row: (T | null)[] = [];
  for (let i = 0; i < columns; i += 1) {
    row.push(items[i] ?? null);
  }
  return row;
}

export function NetworkHubConnectionsPagedGrid<T>({
  items,
  layout,
  resetKey,
  keyExtractor,
  renderItem,
}: NetworkHubConnectionsPagedGridProps<T>) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const { columns, rows, pageSize } = layout;

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const pageItems = useMemo(
    () => items.slice(page * pageSize, (page + 1) * pageSize),
    [items, page, pageSize],
  );

  const gridRows = useMemo(() => {
    const result: (T | null)[][] = [];
    for (let r = 0; r < rows; r += 1) {
      const start = r * columns;
      result.push(
        chunkRow(pageItems.slice(start, start + columns), columns),
      );
    }
    return result;
  }, [pageItems, columns, rows]);

  const canGoPrevious = page > 0;
  const canGoNext = page < pageCount - 1;

  if (items.length === 0) {
    return null;
  }

  const singleColumn = columns === 1;

  return (
    <View style={styles.root}>
      {singleColumn ? (
        <View style={styles.nativeList}>
          {pageItems.map((item) => (
            <View key={keyExtractor(item)} style={styles.nativeListItem}>
              {renderItem(item)}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          {gridRows.map((row, rowIndex) => (
            <View key={`hub-page-row-${rowIndex}`} style={styles.row}>
              {row.map((item, colIndex) => (
                <View
                  key={
                    item
                      ? keyExtractor(item)
                      : `hub-page-empty-${rowIndex}-${colIndex}`
                  }
                  style={styles.cell}
                >
                  {item ? renderItem(item) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {pageCount > 1 ? (
        <View style={styles.pager}>
          <Pressable
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!canGoPrevious}
            style={({ pressed }) => [
              styles.pagerBtn,
              !canGoPrevious && styles.pagerBtnDisabled,
              pressed && canGoPrevious && styles.pagerBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("networkConnectionsPrevious")}
          >
            <ChevronLeft
              size={16}
              color={canGoPrevious ? Theme.textPrimaryDark : Theme.textMuted}
              strokeWidth={2.4}
            />
            <Text
              style={[styles.pagerBtnText, !canGoPrevious && styles.pagerBtnTextDisabled]}
            >
              {t("networkConnectionsPrevious")}
            </Text>
          </Pressable>

          <Text style={styles.pagerMeta}>
            {page + 1} / {pageCount}
          </Text>

          <Pressable
            onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={!canGoNext}
            style={({ pressed }) => [
              styles.pagerBtn,
              !canGoNext && styles.pagerBtnDisabled,
              pressed && canGoNext && styles.pagerBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("networkConnectionsNext")}
          >
            <Text
              style={[styles.pagerBtnText, !canGoNext && styles.pagerBtnTextDisabled]}
            >
              {t("networkConnectionsNext")}
            </Text>
            <ChevronRight
              size={16}
              color={canGoNext ? Theme.textPrimaryDark : Theme.textMuted}
              strokeWidth={2.4}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 12,
  },
  grid: {
    width: "100%",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: NETWORK_HUB_GRID_GAP_PX,
    width: "100%",
  },
  cell: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  nativeList: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    gap: NETWORK_HUB_NATIVE_LIST_GAP_PX,
  },
  nativeListItem: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingBottom: 4,
    gap: 12,
  },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.networkCardBackground,
    minWidth: 108,
    justifyContent: "center",
  },
  pagerBtnPressed: {
    opacity: 0.88,
  },
  pagerBtnDisabled: {
    opacity: 0.45,
    backgroundColor: Theme.surfaceGray,
  },
  pagerBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pagerBtnTextDisabled: {
    color: Theme.textMuted,
  },
  pagerMeta: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.3,
  },
});
