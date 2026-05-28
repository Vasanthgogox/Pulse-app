import { useState } from "react";
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
import { exportPulseAgingExcel, exportPulseAgingPdf } from "@/features/business-pulse/lib/pulseAgingExport.util";
import type { PulseAgingReport as PulseAgingReportData } from "@/features/business-pulse/selectors/pulseAgingSelectors";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

type Props = {
  report: PulseAgingReportData;
  reportTitle: string;
  companyName?: string;
};

export function PulseAgingReport({ report, reportTitle, companyName }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const maxBucket = Math.max(...report.buckets.map((b) => b.amount), 1);
  const displayLines = report.lines.slice(0, compact ? 30 : 60);
  const kindLabel = report.kind === "receivable" ? "Receivable" : "Payable";
  const emptyMessage =
    report.kind === "receivable"
      ? "No client receivables past 7 days in this scope."
      : "No supplier payables or driver settlements in this scope.";

  const runExport = async (format: "pdf" | "excel") => {
    if (report.lines.length === 0) {
      Alert.alert("No data", emptyMessage);
      return;
    }
    setExporting(format);
    try {
      if (format === "pdf") await exportPulseAgingPdf(report, reportTitle, companyName);
      else await exportPulseAgingExcel(report);
    } catch {
      Alert.alert("Export failed", "Could not generate the aging report. Try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarText}>
          <Text style={styles.kindBadge}>{kindLabel} aging</Text>
          <Text style={styles.totalLabel}>
            Outstanding {inr(report.totalOutstanding)} · {report.lines.length} items
          </Text>
        </View>
        <View style={styles.exportRow}>
          <Pressable
            style={styles.exportBtn}
            onPress={() => void runExport("pdf")}
            disabled={!!exporting}
          >
            {exporting === "pdf" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <Download size={12} color={Theme.primary} />
            )}
            <Text style={styles.exportBtnText}>PDF</Text>
          </Pressable>
          <Pressable
            style={styles.exportBtn}
            onPress={() => void runExport("excel")}
            disabled={!!exporting}
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

      <View style={styles.bucketGrid}>
        {report.buckets.map((bucket) => {
          const widthPct = Math.max(6, (bucket.amount / maxBucket) * 100);
          const heat =
            bucket.id === "90_plus"
              ? styles.bucketCritical
              : bucket.id === "61_90"
                ? styles.bucketWarning
                : styles.bucketHealthy;
          return (
            <View key={bucket.id} style={[styles.bucketCard, heat]}>
              <Text style={styles.bucketLabel}>{bucket.label}</Text>
              <View style={styles.bucketBarTrack}>
                <View style={[styles.bucketBarFill, { width: `${widthPct}%` }]} />
              </View>
              <Text style={styles.bucketAmount}>{inr(bucket.amount)}</Text>
              <Text style={styles.bucketMeta}>
                {bucket.count} items · {bucket.sharePct}%
              </Text>
            </View>
          );
        })}
      </View>

      {displayLines.length === 0 ? (
        <Text style={styles.empty}>{emptyMessage}</Text>
      ) : compact ? (
        <View style={styles.cardList}>
          {displayLines.map((line) => (
            <View key={line.id} style={styles.lineCard}>
              <Text style={styles.lineTrip} numberOfLines={1}>
                {line.tripRef}
              </Text>
              <Text style={styles.lineParty} numberOfLines={1}>
                {line.party}
              </Text>
              <Text style={styles.lineCategory}>{line.category}</Text>
              <View style={styles.lineFooter}>
                <Text style={styles.lineDate}>{line.anchorDate}</Text>
                <Text style={styles.lineDays}>{line.daysOutstanding}d</Text>
                <Text style={styles.lineAmount}>{inr(line.amount)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              {[
                { key: "trip", label: "Trip", width: 88 },
                { key: "party", label: "Party", width: 120 },
                { key: "category", label: "Category", width: 110 },
                { key: "date", label: "Date", width: 72 },
                { key: "days", label: "Days", width: 40, align: "right" as const },
                { key: "amt", label: "Amount", width: 72, align: "right" as const },
              ].map((col) => (
                <View
                  key={col.key}
                  style={[
                    styles.colCell,
                    { width: col.width },
                    "align" in col && col.align === "right" ? styles.colAlignRight : null,
                  ]}
                >
                  <Text style={[styles.th, "align" in col && col.align === "right" && styles.thRight]}>
                    {col.label}
                  </Text>
                </View>
              ))}
            </View>
            {displayLines.map((line) => (
              <View key={line.id} style={styles.tableRow}>
                <View style={[styles.colCell, styles.colTrip]}>
                  <Text style={styles.td} numberOfLines={1}>
                    {line.tripRef}
                  </Text>
                </View>
                <View style={[styles.colCell, styles.colParty]}>
                  <Text style={styles.td} numberOfLines={1}>
                    {line.party}
                  </Text>
                </View>
                <View style={[styles.colCell, styles.colCategory]}>
                  <Text style={styles.td} numberOfLines={1}>
                    {line.category}
                  </Text>
                </View>
                <View style={[styles.colCell, styles.colDate]}>
                  <Text style={styles.td}>{line.anchorDate}</Text>
                </View>
                <View style={[styles.colCell, styles.colDays, styles.colAlignRight]}>
                  <Text style={[styles.td, styles.tdRight]}>{line.daysOutstanding}</Text>
                </View>
                <View style={[styles.colCell, styles.colAmt, styles.colAlignRight]}>
                  <Text style={[styles.td, styles.tdRight, styles.tdMoney]}>{inr(line.amount)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      {report.lines.length > displayLines.length ? (
        <Text style={styles.moreHint}>
          Showing {displayLines.length} of {report.lines.length} — export for full list
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  toolbar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  toolbarText: { flex: 1, minWidth: 120, gap: 2 },
  kindBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  totalLabel: { fontSize: 10, fontWeight: "700", color: Theme.textSecondary },
  exportRow: { flexDirection: "row", gap: 6 },
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
  },
  exportBtnText: { fontSize: 10, fontWeight: "800", color: Theme.primary },
  bucketGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bucketCard: {
    flex: 1,
    minWidth: "46%",
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 4,
  },
  bucketHealthy: { borderColor: "#a7f3d0", backgroundColor: "#f0fdf4" },
  bucketWarning: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  bucketCritical: { borderColor: "#fecdd3", backgroundColor: "#fff1f2" },
  bucketLabel: { fontSize: 9, fontWeight: "800", color: Theme.textPrimaryDark },
  bucketBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  bucketBarFill: { height: "100%", backgroundColor: Theme.primary, borderRadius: 999 },
  bucketAmount: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  bucketMeta: { fontSize: 8, color: Theme.textMuted },
  empty: { fontSize: 9, color: Theme.textMuted },
  cardList: { gap: 8 },
  lineCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
    padding: 10,
    gap: 4,
  },
  lineTrip: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
  lineParty: { fontSize: 10, fontWeight: "600", color: Theme.text },
  lineCategory: { fontSize: 9, color: Theme.textMuted },
  lineFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  lineDate: { fontSize: 9, color: Theme.textMuted, flex: 1 },
  lineDays: { fontSize: 9, fontWeight: "800", color: Theme.primary },
  lineAmount: { fontSize: 10, fontWeight: "800", color: Theme.textPrimaryDark },
  table: { minWidth: 640 },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: Theme.whiteMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  colCell: {
    flexShrink: 0,
    justifyContent: "center",
  },
  colAlignRight: {
    alignItems: "flex-end",
  },
  th: { fontSize: 8, fontWeight: "800", color: Theme.textMuted, textTransform: "uppercase" },
  thRight: { textAlign: "right" },
  td: { fontSize: 10, fontWeight: "600", color: Theme.text },
  tdRight: { textAlign: "right" },
  tdMoney: { fontWeight: "800", color: Theme.textPrimaryDark },
  colTrip: { width: 88 },
  colParty: { width: 120 },
  colCategory: { width: 110 },
  colDate: { width: 72 },
  colDays: { width: 40 },
  colAmt: { width: 72 },
  moreHint: { fontSize: 8, color: Theme.textMuted, fontStyle: "italic" },
});
