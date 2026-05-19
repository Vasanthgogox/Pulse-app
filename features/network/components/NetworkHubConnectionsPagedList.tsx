/**
 * Your connections — 2×3 list layout per page with Previous / Next (legacy export).
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  NETWORK_HUB_CONNECTION_PAGE_SIZE,
  NETWORK_HUB_CONNECTION_SCROLL_COLUMNS,
  NETWORK_HUB_CONNECTION_SCROLL_ROWS,
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
} from "@/features/network/constants/networkHubGrid";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

function chunkRow<T>(items: T[], columns: number): (T | null)[] {
  const row: (T | null)[] = [];
  for (let i = 0; i < columns; i += 1) {
    row.push(items[i] ?? null);
  }
  return row;
}

export type NetworkHubConnectionsPagedListProps<T> = {
  items: T[];
  resetKey: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
};

export function NetworkHubConnectionsPagedList<T>({
  items,
  resetKey,
  keyExtractor,
  renderItem,
}: NetworkHubConnectionsPagedListProps<T>) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / NETWORK_HUB_CONNECTION_PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const pageItems = useMemo(
    () =>
      items.slice(
        page * NETWORK_HUB_CONNECTION_PAGE_SIZE,
        (page + 1) * NETWORK_HUB_CONNECTION_PAGE_SIZE,
      ),
    [items, page],
  );

  const rows = useMemo(() => {
    const result: (T | null)[][] = [];
    for (let r = 0; r < NETWORK_HUB_CONNECTION_SCROLL_ROWS; r += 1) {
      const start = r * NETWORK_HUB_CONNECTION_SCROLL_COLUMNS;
      result.push(
        chunkRow(
          pageItems.slice(start, start + NETWORK_HUB_CONNECTION_SCROLL_COLUMNS),
          NETWORK_HUB_CONNECTION_SCROLL_COLUMNS,
        ),
      );
    }
    return result;
  }, [pageItems]);

  const canGoPrevious = page > 0;
  const canGoNext = page < pageCount - 1;

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.root}>
      <View style={styles.list}>
        {rows.map((row, rowIndex) => (
          <View key={`hub-list-row-${rowIndex}`} style={styles.row}>
            {row.map((item, colIndex) => (
              <View
                key={
                  item
                    ? keyExtractor(item)
                    : `hub-list-empty-${rowIndex}-${colIndex}`
                }
                style={styles.cell}
              >
                {item ? renderItem(item) : null}
              </View>
            ))}
          </View>
        ))}
      </View>

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
            <Text style={[styles.pagerBtnText, !canGoNext && styles.pagerBtnTextDisabled]}>
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
  list: {
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
