/**
 * Your connections — horizontal swipe pages (3×2 grid) + compact Previous / Next.
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

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

function buildPages<T>(items: T[], pageSize: number, pageCount: number): T[][] {
  const pages: T[][] = [];
  for (let p = 0; p < pageCount; p += 1) {
    pages.push(items.slice(p * pageSize, (p + 1) * pageSize));
  }
  return pages;
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
  const [viewportWidth, setViewportWidth] = useState(0);
  const listRef = useRef<FlatList<T[]>>(null);
  const { columns, rows, pageSize } = layout;

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pages = useMemo(
    () => buildPages(items, pageSize, pageCount),
    [items, pageSize, pageCount],
  );

  const singleColumn = columns === 1;

  const goToPage = useCallback(
    (target: number, animated = true) => {
      const next = Math.max(0, Math.min(pageCount - 1, target));
      setPage(next);
      if (viewportWidth > 0 && listRef.current) {
        listRef.current.scrollToOffset({
          offset: next * viewportWidth,
          animated,
        });
      }
    },
    [pageCount, viewportWidth],
  );

  useEffect(() => {
    setPage(0);
    if (viewportWidth > 0 && listRef.current) {
      listRef.current.scrollToOffset({ offset: 0, animated: false });
    }
  }, [resetKey, viewportWidth]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const onPagerScrollSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (viewportWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / viewportWidth);
      setPage(Math.max(0, Math.min(pageCount - 1, idx)));
    },
    [viewportWidth, pageCount],
  );

  const renderPageBody = useCallback(
    (pageItems: T[]) => {
      if (singleColumn) {
        return (
          <View style={styles.nativeList}>
            {pageItems.map((item) => (
              <View key={keyExtractor(item)} style={styles.nativeListItem}>
                {renderItem(item)}
              </View>
            ))}
          </View>
        );
      }

      const gridRows: (T | null)[][] = [];
      for (let r = 0; r < rows; r += 1) {
        const start = r * columns;
        gridRows.push(
          chunkRow(pageItems.slice(start, start + columns), columns),
        );
      }

      return (
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
      );
    },
    [columns, keyExtractor, renderItem, rows, singleColumn],
  );

  if (items.length === 0) {
    return null;
  }

  const canGoPrevious = page > 0;
  const canGoNext = page < pageCount - 1;
  const slideWidth = viewportWidth > 0 ? viewportWidth : undefined;

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== viewportWidth) {
          setViewportWidth(w);
        }
      }}
    >
      {pageCount > 1 && slideWidth ? (
        <FlatList
          ref={listRef}
          data={pages}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          keyExtractor={(_, index) => `connections-hub-page-${index}`}
          getItemLayout={(_, index) => ({
            length: slideWidth,
            offset: slideWidth * index,
            index,
          })}
          onMomentumScrollEnd={onPagerScrollSettled}
          onScrollEndDrag={onPagerScrollSettled}
          renderItem={({ item: pageItems }) => (
            <View style={[styles.pageSlide, { width: slideWidth }]}>
              {renderPageBody(pageItems)}
            </View>
          )}
          style={styles.pagerList}
        />
      ) : (
        renderPageBody(pages[0] ?? [])
      )}

      {pageCount > 1 ? (
        <View style={styles.pager}>
          <Pressable
            onPress={() => goToPage(page - 1)}
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
              size={12}
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
            onPress={() => goToPage(page + 1)}
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
              size={12}
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
    gap: 8,
  },
  pagerList: {
    width: "100%",
  },
  pageSlide: {
    flexShrink: 0,
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
    paddingTop: 2,
    paddingBottom: 4,
    gap: 8,
  },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  pagerBtnPressed: {
    opacity: 0.88,
  },
  pagerBtnDisabled: {
    opacity: 0.42,
    backgroundColor: Theme.surfaceForm,
  },
  pagerBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pagerBtnTextDisabled: {
    color: Theme.textMuted,
  },
  pagerMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
});
