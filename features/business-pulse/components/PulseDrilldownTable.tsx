import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Download, FileSpreadsheet } from "lucide-react-native";
import Theme from "@/constants/Theme";
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

type Props = {
  view: PulseDrilldownView;
  /** Full filtered set for PDF/Excel export */
  exportView?: PulseDrilldownView;
  reportTitle: string;
  companyName?: string;
};

export function PulseDrilldownTable({ view, exportView, reportTitle, companyName }: Props) {
  const dataForExport = exportView ?? view;
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const tableMinWidth = useMemo(
    () => view.columns.reduce((sum, col) => sum + col.width, 0) + view.columns.length * 8 + 16,
    [view.columns],
  );

  const moneyColumns = useMemo(
    () => view.columns.filter((c) => c.isMoney),
    [view.columns],
  );

  const metaColumns = useMemo(
    () => view.columns.filter((c) => !c.isMoney && c.key !== "trip" && c.key !== "date"),
    [view.columns],
  );

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
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarText}>
          <Text style={styles.lensText}>{view.lensLabel}</Text>
          <Text style={styles.countText} numberOfLines={2}>
            Showing {view.rows.length} of {dataForExport.rows.length} trips
          </Text>
          <Text style={styles.filterCaption} numberOfLines={3}>
            {view.filterCaption}
          </Text>
        </View>
        <View style={styles.exportRow}>
          <Pressable
            style={[styles.exportBtn, exporting === "pdf" && styles.exportBtnBusy]}
            onPress={() => void runExport("pdf")}
            disabled={!!exporting}
            accessibilityRole="button"
            accessibilityLabel="Download PDF report"
          >
            {exporting === "pdf" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <Download size={12} color={Theme.primary} />
            )}
            <Text style={styles.exportBtnText}>PDF</Text>
          </Pressable>
          <Pressable
            style={[styles.exportBtn, exporting === "excel" && styles.exportBtnBusy]}
            onPress={() => void runExport("excel")}
            disabled={!!exporting}
            accessibilityRole="button"
            accessibilityLabel="Download Excel report"
          >
            {exporting === "excel" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <FileSpreadsheet size={12} color={Theme.primary} />
            )}
            <Text style={styles.exportBtnText}>Excel</Text>
          </Pressable>
        </View>
      </View>

      {view.rows.length === 0 ? (
        <Text style={styles.empty}>No rows match current filter context.</Text>
      ) : compact ? (
        <View style={styles.cardList}>
          {view.rows.map((row, index) => (
            <View key={`${row.trip}-${index}`} style={styles.mobileCard}>
              <Text style={styles.mobileTrip} numberOfLines={1}>
                {String(row.trip)}
              </Text>
              <Text style={styles.mobileSubline} numberOfLines={2}>
                {String(row.date)}
                {row.route ? ` · ${String(row.route)}` : row.branch ? ` · ${String(row.branch)}` : ""}
              </Text>
              {metaColumns.map((col) => (
                <View key={col.key} style={styles.mobileMetaRow}>
                  <Text style={styles.mobileMetaLabel}>{col.label}</Text>
                  <Text style={styles.mobileMetaValue} numberOfLines={2}>
                    {formatCell(row, col)}
                  </Text>
                </View>
              ))}
              {moneyColumns.length > 0 ? (
                <View style={styles.mobileMoneyRow}>
                  {moneyColumns.map((col) => (
                    <View key={col.key} style={styles.mobileMoneyCell}>
                      <Text style={styles.mobileMoneyLabel}>{col.label}</Text>
                      <Text
                        style={[
                          styles.mobileMoneyValue,
                          isNegativeMoney(row, col) ? styles.negative : styles.positive,
                        ]}
                      >
                        {formatCell(row, col)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={[styles.table, { minWidth: tableMinWidth }]}>
            <View style={styles.tableHeader}>
              {view.columns.map((col) => (
                <Text
                  key={col.key}
                  style={[
                    styles.th,
                    { width: col.width },
                    col.align === "right" ? styles.thRight : null,
                  ]}
                >
                  {col.label}
                </Text>
              ))}
            </View>
            {view.rows.map((row, index) => (
              <View key={`${row.trip}-${index}`} style={styles.tableRow}>
                {view.columns.map((col) => (
                  <Text
                    key={col.key}
                    style={[
                      styles.td,
                      { width: col.width },
                      col.align === "right" ? styles.tdRight : null,
                      isNegativeMoney(row, col) ? styles.negative : null,
                    ]}
                    numberOfLines={col.key === "route" ? 2 : 1}
                  >
                    {formatCell(row, col)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  toolbarText: {
    flex: 1,
    minWidth: 120,
    gap: 2,
  },
  lensText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  countText: {
    fontSize: 9,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  filterCaption: {
    fontSize: 9,
    color: Theme.textSecondary,
    fontWeight: "500",
    marginTop: 2,
  },
  exportRow: {
    flexDirection: "row",
    gap: 6,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Theme.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#eef2ff",
    minHeight: 32,
  },
  exportBtnBusy: {
    opacity: 0.7,
  },
  exportBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
  },
  empty: {
    fontSize: 9,
    color: Theme.textMuted,
  },
  cardList: {
    gap: 8,
  },
  mobileCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
    padding: 10,
    gap: 5,
  },
  mobileTrip: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  mobileMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  mobileMetaLabel: {
    width: 72,
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  mobileMetaValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.text,
  },
  mobileMoneyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  mobileMoneyCell: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 72,
  },
  mobileMoneyLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  mobileMoneyValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  mobileSubline: {
    fontSize: 9,
    color: Theme.textMuted,
    marginBottom: 4,
  },
  table: {
    gap: 0,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    minHeight: 36,
  },
  th: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  thRight: {
    textAlign: "right",
  },
  td: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.text,
  },
  tdRight: {
    textAlign: "right",
  },
  positive: {
    color: "#047857",
  },
  negative: {
    color: Theme.teslaRed,
  },
});
