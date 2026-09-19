import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import Theme from "@/constants/Theme";
import { ChevronLeft, ChevronRight, LayoutGrid, MoreVertical, Search } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

const PAGE_SIZES = [10, 20, 30] as const;

export type FinanceProTableColumn<T> = {
  key: string;
  label: string;
  flex: number;
  minWidth: number;
  align?: "left" | "right";
  variant?: "text" | "link" | "num" | "status" | "muted";
  render: (row: T) => ReactNode;
  searchValue?: (row: T) => string;
};

function paginate<T>(rows: T[], page: number, size: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * size;
  const slice = rows.slice(start, start + size);
  return {
    rows: slice,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
    totalPages: total === 0 ? 1 : totalPages,
    page: current,
  };
}

function cellString(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function inferVariant<T>(
  col: FinanceProTableColumn<T>,
  index: number,
  clickable: boolean,
): FinanceProTableColumn<T>["variant"] {
  if (col.variant) return col.variant;
  if (col.align === "right") return "num";
  const key = col.key.toLowerCase();
  const label = col.label.toLowerCase();
  if (
    key === "status" ||
    key === "pod" ||
    key === "invoice" ||
    key === "blocker" ||
    key === "dir" ||
    label === "status" ||
    label === "pod" ||
    label === "invoice" ||
    label === "blocker" ||
    label === "direction"
  ) {
    return "status";
  }
  if (index === 0 && clickable) return "link";
  return "text";
}

function statusTone(value: string): "ok" | "info" | "warn" | "neutral" {
  const v = value.toLowerCase();
  if (
    v.includes("received") ||
    v.includes("issued") ||
    v.includes("complete") ||
    v === "in"
  ) {
    return "ok";
  }
  if (
    v.includes("pending") ||
    v.includes("progress") ||
    v.includes("assigned") ||
    v.includes("not billed") ||
    v.includes("not invoiced") ||
    v.includes("ready")
  ) {
    return "info";
  }
  if (v.includes("not completed") || v.includes("uncollected") || v === "out") {
    return "warn";
  }
  return "neutral";
}

function nestedActionTarget(event: unknown): boolean {
  const native = event as {
    nativeEvent?: { target?: { closest?: (selector: string) => unknown } };
  };
  const target = native?.nativeEvent?.target;
  return Boolean(
    target &&
      typeof target.closest === "function" &&
      target.closest("[data-fp-stop]"),
  );
}

export function FinanceProDataTable<T>({
  title,
  kicker,
  action,
  columns,
  rows,
  keyExtractor,
  onRowPress,
  selectedKey,
  empty,
  searchPlaceholder = "Search…",
  context,
}: {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  columns: FinanceProTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  selectedKey?: string | null;
  empty: string;
  searchPlaceholder?: string;
  context?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] =
    useState<(typeof PAGE_SIZES)[number]>(10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = columns
        .map((col) => {
          if (col.searchValue) return col.searchValue(row);
          return cellString(col.render(row));
        })
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [columns, query, rows]);

  useEffect(() => {
    setPage(1);
  }, [query, rows.length]);

  const pagination = useMemo(
    () => paginate(filtered, page, rowsPerPage),
    [filtered, page, rowsPerPage],
  );

  const minWidth = columns.reduce((sum, col) => sum + col.minWidth, 0) + 48;
  const clickable = Boolean(onRowPress);
  const gridTemplate =
    Platform.OS === "web"
      ? columns
          .map((c) => `minmax(${Math.min(c.minWidth, 120)}px, ${c.flex}fr)`)
          .join(" ")
      : null;
  const gridStyle =
    gridTemplate != null
      ? ({
          display: "grid",
          gridTemplateColumns: gridTemplate,
          columnGap: 16,
          alignItems: "center",
          width: "100%",
        } as unknown as ViewStyle)
      : styles.grid;

  const head = (
    <View style={styles.head}>
      <View style={gridStyle}>
        {columns.map((col, index) => {
          const variant = inferVariant(col, index, clickable);
          return (
            <Text
              key={col.key}
              style={[
                styles.headCell,
                gridTemplate ? styles.headCellFill : { flex: col.flex, minWidth: col.minWidth },
                (variant === "num" || col.align === "right") && styles.headCellRight,
              ]}
            >
              {col.label}
            </Text>
          );
        })}
      </View>
    </View>
  );

  const body =
    pagination.rows.length === 0 ? (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>{empty}</Text>
      </View>
    ) : (
      pagination.rows.map((row, idx) => (
        <Pressable
          key={keyExtractor(row)}
          style={({ hovered, pressed }) => [
            styles.row,
            idx % 2 === 1 && styles.rowAlt,
            idx === pagination.rows.length - 1 && styles.rowLast,
            selectedKey === keyExtractor(row) && styles.rowSelected,
            (hovered || pressed) && styles.rowHover,
          ]}
          onPress={
            onRowPress
              ? (event) => {
                  if (nestedActionTarget(event)) return;
                  onRowPress(row);
                }
              : undefined
          }
          disabled={!onRowPress}
        >
          <View style={gridStyle}>
            {columns.map((col, index) => {
              const variant = inferVariant(col, index, clickable);
              const cell = col.render(row);
              const textValue = cellString(cell);
              return (
                <View
                  key={col.key}
                  style={[
                    styles.cell,
                    gridTemplate
                      ? styles.cellFill
                      : { flex: col.flex, minWidth: col.minWidth },
                    (variant === "num" || col.align === "right") && styles.cellRight,
                  ]}
                >
                  {typeof cell !== "string" && typeof cell !== "number" ? (
                    <View
                      {...(Platform.OS === "web"
                        ? { dataSet: { fpStop: "" } }
                        : { collapsable: false })}
                    >
                      {cell}
                    </View>
                  ) : variant === "status" && textValue && textValue !== "—" ? (
                    <View
                      style={[
                        styles.pill,
                        statusTone(textValue) === "ok" && styles.pillOk,
                        statusTone(textValue) === "info" && styles.pillInfo,
                        statusTone(textValue) === "warn" && styles.pillWarn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          statusTone(textValue) === "ok" && styles.pillTextOk,
                          statusTone(textValue) === "info" && styles.pillTextInfo,
                          statusTone(textValue) === "warn" && styles.pillTextWarn,
                        ]}
                        numberOfLines={1}
                      >
                        {textValue}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.cellText,
                        variant === "link" && styles.cellLink,
                        variant === "num" && styles.cellNum,
                        variant === "muted" && styles.cellMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {textValue}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </Pressable>
      ))
    );

  const table = (
    <>
      {head}
      {body}
    </>
  );

  const searchBox = (
    <View style={[styles.search, context ? styles.searchContext : null]}>
      {context ?? (
        <>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={METRONIC.muted}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setPage(1);
            }}
          />
        </>
      )}
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        {title ? (
          <View style={styles.titleCol}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {kicker ? (
              <Text style={styles.kicker} numberOfLines={1}>
                {kicker}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.titleCol} />
        )}
        <View style={styles.toolbar}>
          {searchBox}
          {action}
          <View style={styles.columnsBtn}>
            <LayoutGrid size={13} color={METRONIC.muted} />
            <Text style={styles.columnsBtnText}>Columns</Text>
          </View>
          <Pressable style={styles.menuBtn} hitSlop={8} accessibilityLabel="Table menu">
            <MoreVertical size={15} color={METRONIC.muted} />
          </Pressable>
        </View>
      </View>

      {Platform.OS === "web" ? (
        <View style={styles.webScroll}>
          <View style={styles.tableFill}>{table}</View>
        </View>
      ) : (
        <ScrollView
          horizontal
          style={styles.nativeScroll}
          contentContainerStyle={styles.nativeGrow}
        >
          <View style={{ minWidth, width: "100%" }}>{table}</View>
        </ScrollView>
      )}

      <View style={styles.pagination}>
        <View style={styles.pageSizeRow}>
          <Text style={styles.pageSizeLabel}>Rows per page</Text>
          {PAGE_SIZES.map((size) => (
            <Pressable
              key={size}
              onPress={() => {
                setRowsPerPage(size);
                setPage(1);
              }}
              style={[
                styles.pageSizeBtn,
                rowsPerPage === size && styles.pageSizeBtnOn,
              ]}
            >
              <Text
                style={[
                  styles.pageSizeBtnText,
                  rowsPerPage === size && styles.pageSizeBtnTextOn,
                ]}
              >
                {size}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.pageNav}>
          <Text style={styles.pageRange}>
            {pagination.from} – {pagination.to} of {pagination.total}
          </Text>
          <Pressable
            disabled={pagination.page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[
              styles.pageBtn,
              pagination.page <= 1 && styles.pageBtnDisabled,
            ]}
          >
            <ChevronLeft size={16} color={METRONIC.subtle} />
          </Pressable>
          {Array.from({ length: pagination.totalPages }).map((_, i) => {
            const n = i + 1;
            if (
              pagination.totalPages > 5 &&
              n !== 1 &&
              n !== pagination.totalPages &&
              Math.abs(n - pagination.page) > 1
            ) {
              return null;
            }
            return (
              <Pressable
                key={n}
                onPress={() => setPage(n)}
                style={[styles.pageNum, pagination.page === n && styles.pageNumOn]}
              >
                <Text
                  style={[
                    styles.pageNumText,
                    pagination.page === n && styles.pageNumTextOn,
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            disabled={pagination.page >= pagination.totalPages}
            onPress={() =>
              setPage((p) => Math.min(pagination.totalPages, p + 1))
            }
            style={[
              styles.pageBtn,
              pagination.page >= pagination.totalPages && styles.pageBtnDisabled,
            ]}
          >
            <ChevronRight size={16} color={METRONIC.subtle} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  titleCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 160,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: METRONIC.text,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.muted,
    lineHeight: 16,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
    marginLeft: "auto",
  },
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  search: {
    width: 220,
    maxWidth: 220,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  searchContext: {
    width: 320,
    maxWidth: 360,
    borderColor: Theme.brandBlueRing,
    backgroundColor: Theme.cardWhite,
    paddingLeft: 10,
    paddingRight: 4,
  },
  columnsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surface,
    flexShrink: 0,
  },
  columnsBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.text,
    paddingVertical: 0,
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none" } as unknown as TextStyle)
      : null),
  },
  webScroll: {
    width: "100%",
    ...(Platform.OS === "web" ? ({ overflowX: "auto" } as unknown as ViewStyle) : null),
  },
  tableFill: { width: "100%", minWidth: 640 },
  nativeScroll: { width: "100%" },
  nativeGrow: { flexGrow: 1, minWidth: "100%" },
  head: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.surface,
  },
  grid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    width: "100%",
  },
  headCell: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headCellFill: { minWidth: 0, width: "100%" },
  headCellRight: { textAlign: "right" },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as unknown as ViewStyle) : null),
  },
  rowAlt: { backgroundColor: Theme.cardWhite },
  rowHover: { backgroundColor: Theme.surface },
  rowSelected: { backgroundColor: Theme.brandBlueWashSubtle },
  rowLast: { borderBottomWidth: 0 },
  cell: { minWidth: 0, justifyContent: "center" },
  cellFill: { width: "100%", minWidth: 0 },
  cellRight: { alignItems: "flex-end" },
  cellText: {
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.text,
    lineHeight: 18,
  },
  cellLink: {
    fontWeight: "700",
    color: METRONIC.link,
  },
  cellNum: {
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  cellMuted: {
    fontWeight: "600",
    color: METRONIC.link,
  },
  emptyWrap: { paddingVertical: 32, alignItems: "center" },
  empty: { fontSize: 13, fontWeight: "500", color: METRONIC.muted },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
  },
  pillOk: { backgroundColor: Theme.scoreExcellentBg },
  pillInfo: { backgroundColor: Theme.scoreGoodBg },
  pillWarn: { backgroundColor: Theme.scoreWarningBg },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.subtle,
    textTransform: "uppercase",
  },
  pillTextOk: { color: Theme.scoreExcellentFg },
  pillTextInfo: { color: Theme.scoreGoodFg },
  pillTextWarn: { color: Theme.scoreWarningFg },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
    backgroundColor: Theme.surface,
  },
  pageSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    minWidth: 0,
  },
  pageSizeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.muted,
    marginRight: 4,
  },
  pageSizeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    minHeight: 28,
    justifyContent: "center",
  },
  pageSizeBtnOn: {
    borderColor: METRONIC.link,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  pageSizeBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  pageSizeBtnTextOn: { color: METRONIC.link },
  pageNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  pageRange: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
    marginRight: 8,
  },
  pageBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageNum: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pageNumOn: { backgroundColor: Theme.surfaceGray },
  pageNumText: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  pageNumTextOn: { color: METRONIC.text, fontWeight: "700" },
});
