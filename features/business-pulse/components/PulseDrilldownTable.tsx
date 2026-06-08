import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { Download, FileSpreadsheet, Search } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { PulsePartyCell } from "@/features/business-pulse/components/PulsePartyCell";
import { PulseTablePagination } from "@/features/business-pulse/components/PulseTablePagination";
import { pulseTableStyles as tbl } from "@/features/business-pulse/components/pulseTableStyles";
import {
  pulsePartyForDrilldownColumn,
  pulsePartyForName,
  type DrilldownRowPartyIds,
  type PulsePartyMaps,
} from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import {
  exportPulseDrilldownExcel,
  exportPulseDrilldownPdf,
} from "@/features/business-pulse/lib/pulseDrilldownExport.util";
import {
  formatDrilldownCell,
  type DrilldownColumnDef,
  type DrilldownDataRow,
  type PulseDrilldownView,
} from "@/features/business-pulse/lib/pulseDrilldownContext.util";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatCell(row: DrilldownDataRow, column: DrilldownColumnDef): string {
  if (column.isMoney) {
    const raw = row[column.key];
    if (typeof raw === "number") return inr(raw);
  }
  return formatDrilldownCell(row, column);
}

function isNegativeMoney(row: DrilldownDataRow, column: DrilldownColumnDef): boolean {
  if (!column.isMoney || column.key !== "margin") return false;
  const raw = row[column.key];
  return typeof raw === "number" && raw < 0;
}

function isEmptyMetaValue(raw: unknown): boolean {
  const v = String(raw ?? "").trim();
  return v === "" || v === "—" || v === "-";
}

function visibleMetaColumnsForRow(
  row: DrilldownDataRow,
  metaColumns: DrilldownColumnDef[],
  options: { routeInHeader: boolean },
): DrilldownColumnDef[] {
  return metaColumns.filter((col) => {
    if (options.routeInHeader && col.key === "branch") return false;
    const value = formatCell(row, col);
    if (col.key === "supplier" && isEmptyMetaValue(value)) return false;
    return !isEmptyMetaValue(value);
  });
}

type Props = {
  view: PulseDrilldownView;
  exportView?: PulseDrilldownView;
  reportTitle: string;
  companyName?: string;
  partyMaps?: PulsePartyMaps;
};

const PARTY_COLUMNS = new Set(["client", "supplier", "driver", "vehicle"]);

function drilldownColumnStyle(column: DrilldownColumnDef, stretch: boolean): ViewStyle {
  if (stretch) {
    return {
      flex: column.flex ?? 1,
      minWidth: Math.max(56, Math.round(column.width * 0.7)),
    };
  }
  return { width: column.width, flexShrink: 0 };
}

function columnAlignWrap(column: DrilldownColumnDef): ViewStyle {
  return column.align === "right" ? { alignItems: "flex-end" } : { alignItems: "flex-start" };
}

function partyEntityTypeForColumn(columnKey: string) {
  return columnKey === "vehicle"
    ? "vehicle"
    : columnKey === "driver"
      ? "driver"
      : columnKey === "supplier"
        ? "supplier"
        : "client";
}

function DrilldownCell({
  column,
  row,
  partyIds,
  partyMaps,
  stretch,
}: {
  column: DrilldownColumnDef;
  row: DrilldownDataRow;
  partyIds?: DrilldownRowPartyIds;
  partyMaps?: PulsePartyMaps;
  stretch: boolean;
}) {
  const text = formatCell(row, column);
  const containerStyle = [drilldownColumnStyle(column, stretch), columnAlignWrap(column)];

  if (PARTY_COLUMNS.has(column.key)) {
    const entityType = partyEntityTypeForColumn(column.key);
    const party =
      (partyMaps
        ? pulsePartyForDrilldownColumn(column.key, text, partyIds, partyMaps)
        : null) ??
      (text && text !== "—" ? pulsePartyForName(text, entityType) : null);

    if (party) {
      return (
        <View style={containerStyle}>
          <PulsePartyCell party={party} avatarSize={32} />
        </View>
      );
    }
  }

  return (
    <View style={containerStyle}>
      <Text
        style={[
          column.key === "trip" ? tbl.primaryName : tbl.cellText,
          column.align === "right" ? tbl.cellTextRight : null,
          column.isMoney && tbl.cellMoney,
          isNegativeMoney(row, column) ? tbl.negative : null,
        ]}
        numberOfLines={column.key === "route" ? 2 : 1}
      >
        {text}
      </Text>
    </View>
  );
}

const PAGE_SIZE = 10;

export function PulseDrilldownTable({ view, exportView, reportTitle, companyName, partyMaps }: Props) {
  const dataForExport = exportView ?? view;
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [view.rows.length, view.lensLabel]);

  const stretchColumns = !compact;

  const moneyColumns = useMemo(
    () => view.columns.filter((c) => c.isMoney),
    [view.columns],
  );

  const metaColumns = useMemo(
    () => view.columns.filter((c) => !c.isMoney && c.key !== "trip" && c.key !== "date"),
    [view.columns],
  );

  const pagedRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return view.rows.slice(start, start + PAGE_SIZE);
  }, [page, view.rows]);

  const runExport = async (format: "pdf" | "excel") => {
    if (dataForExport.rows.length === 0) {
      Alert.alert("No data", "Adjust filters to include trips before exporting.");
      return;
    }
    setExporting(format);
    try {
      if (format === "pdf") {
        await exportPulseDrilldownPdf(dataForExport, reportTitle, companyName);
      } else {
        await exportPulseDrilldownExcel(dataForExport);
      }
    } catch {
      Alert.alert(
        "Export failed",
        format === "pdf"
          ? "Could not generate PDF. Try Excel or narrow the filter scope."
          : "Could not generate Excel. Try PDF or narrow the filter scope.",
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={tbl.shell}>
      <View style={tbl.toolbar}>
        <View style={tbl.toolbarLeft}>
          <Search size={14} color={Theme.textMuted} strokeWidth={2} />
          <Text style={tbl.toolbarSearchText} numberOfLines={1}>
            {view.filterCaption || "Search trips in scope"}
          </Text>
        </View>
        <View style={tbl.toolbarMeta}>
          <Text style={tbl.toolbarMetaTitle}>{view.lensLabel}</Text>
          <Text style={tbl.toolbarMetaSub}>
            {view.rows.length} of {dataForExport.rows.length} trips
          </Text>
        </View>
        <View style={tbl.toolbarActions}>
          <Pressable
            style={[tbl.toolbarBtn, exporting === "pdf" && { opacity: 0.7 }]}
            onPress={() => void runExport("pdf")}
            disabled={!!exporting}
          >
            {exporting === "pdf" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <Download size={14} color={Theme.textSecondary} strokeWidth={2} />
            )}
            <Text style={tbl.toolbarBtnText}>PDF</Text>
          </Pressable>
          <Pressable
            style={[tbl.toolbarBtn, exporting === "excel" && { opacity: 0.7 }]}
            onPress={() => void runExport("excel")}
            disabled={!!exporting}
          >
            {exporting === "excel" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <FileSpreadsheet size={14} color={Theme.textSecondary} strokeWidth={2} />
            )}
            <Text style={tbl.toolbarBtnText}>Excel</Text>
          </Pressable>
        </View>
      </View>

      {view.rows.length === 0 ? (
        <Text style={tbl.empty}>No rows match current filter context.</Text>
      ) : compact ? (
        <View style={styles.cardList}>
          {pagedRows.map((row, index) => {
            const routeText =
              row.route && !isEmptyMetaValue(row.route) ? String(row.route) : null;
            const rowMeta = visibleMetaColumnsForRow(row, metaColumns, {
              routeInHeader: Boolean(routeText),
            });
            return (
              <View key={`${row.trip}-${index}`} style={styles.mobileCard}>
                <View style={styles.mobileCardHeader}>
                  <Text style={styles.mobileTrip} numberOfLines={1}>
                    {String(row.trip)}
                  </Text>
                  <Text style={styles.mobileDate} numberOfLines={1}>
                    {String(row.date)}
                  </Text>
                  {routeText ? (
                    <Text style={styles.mobileRoute} numberOfLines={2}>
                      {routeText}
                    </Text>
                  ) : null}
                </View>

                {rowMeta.length > 0 ? (
                  <View style={styles.mobileMetaGrid}>
                    {rowMeta.map((col) => (
                      <View key={col.key} style={styles.mobileMetaCell}>
                        <Text style={styles.mobileMetaLabel}>{col.label}</Text>
                        <Text style={styles.mobileMetaValue} numberOfLines={2}>
                          {formatCell(row, col)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {moneyColumns.length > 0 ? (
                  <View style={styles.mobileMoneyRow}>
                    {moneyColumns.map((col, moneyIndex) => (
                      <View
                        key={col.key}
                        style={[
                          styles.mobileMoneyCell,
                          moneyIndex > 0 && styles.mobileMoneyCellDivider,
                        ]}
                      >
                        <Text style={styles.mobileMetaLabel}>{col.label}</Text>
                        <Text
                          style={[
                            styles.mobileMoneyValue,
                            isNegativeMoney(row, col) ? tbl.negative : tbl.positive,
                          ]}
                          numberOfLines={1}
                        >
                          {formatCell(row, col)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {view.rows.length > PAGE_SIZE ? (
            <PulseTablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={view.rows.length}
              onPageChange={setPage}
            />
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.flexTable}>
            <View style={tbl.headerRow}>
              {view.columns.map((col) => (
                <View
                  key={col.key}
                  style={[
                    drilldownColumnStyle(col, stretchColumns),
                    columnAlignWrap(col),
                    tbl.headerCell,
                  ]}
                >
                  <Text
                    style={[
                      tbl.headerText,
                      col.align === "right" ? tbl.headerTextRight : null,
                    ]}
                  >
                    {col.label}
                  </Text>
                </View>
              ))}
            </View>
            {pagedRows.map((row, index) => (
              <View key={`${row.trip}-${index}`} style={tbl.dataRow}>
                {view.columns.map((col) => (
                  <DrilldownCell
                    key={col.key}
                    column={col}
                    row={row}
                    partyIds={view.rowPartyIds[page * PAGE_SIZE + index]}
                    partyMaps={partyMaps}
                    stretch={stretchColumns}
                  />
                ))}
              </View>
            ))}
          </View>
          {view.rows.length > PAGE_SIZE ? (
            <PulseTablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={view.rows.length}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flexTable: {
    width: "100%",
  },
  cardList: {
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mobileCard: {
    borderWidth: 1,
    borderColor: "#eff2f5",
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  mobileCardHeader: {
    gap: 3,
  },
  mobileTrip: {
    fontSize: 12,
    fontWeight: "600",
    color: "#181C32",
  },
  mobileDate: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  mobileRoute: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  mobileMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mobileMetaCell: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 120,
    gap: 2,
  },
  mobileMetaLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  mobileMetaValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  mobileMoneyRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eff2f5",
    paddingTop: 10,
    gap: 8,
  },
  mobileMoneyCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mobileMoneyCellDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#eff2f5",
    paddingLeft: 10,
  },
  mobileMoneyValue: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
