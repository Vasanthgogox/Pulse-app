import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Download, FileSpreadsheet } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { PulsePartyCell } from "@/features/business-pulse/components/PulsePartyCell";
import { PulseTablePagination } from "@/features/business-pulse/components/PulseTablePagination";
import { pulseTableStyles as tbl } from "@/features/business-pulse/components/pulseTableStyles";
import {
  type PulsePartyMaps,
  pulsePartyForName,
} from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import { exportPulseAgingExcel, exportPulseAgingPdf } from "@/features/business-pulse/lib/pulseAgingExport.util";
import type { PulseAgingReport as PulseAgingReportData } from "@/features/business-pulse/selectors/pulseAgingSelectors";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

type Props = {
  report: PulseAgingReportData;
  reportTitle: string;
  companyName?: string;
  partyMaps?: PulsePartyMaps;
};

const AGING_COLUMNS = [
  { key: "trip", label: "Trip", flex: 1.05, minWidth: 88 },
  { key: "party", label: "Member", flex: 1.75, minWidth: 148 },
  { key: "category", label: "Category", flex: 1.25, minWidth: 108 },
  { key: "date", label: "Date", flex: 0.95, minWidth: 72 },
  { key: "days", label: "Days", flex: 0.65, minWidth: 48, align: "right" as const },
  { key: "amt", label: "Amount", flex: 1, minWidth: 80, align: "right" as const },
];

function resolveAgingParty(
  line: PulseAgingReportData["lines"][number],
  partyMaps?: PulsePartyMaps,
) {
  if (partyMaps && line.partyEntityId && line.partyEntityType) {
    const mapKey =
      line.partyEntityType === "client"
        ? "clients"
        : line.partyEntityType === "supplier"
          ? "suppliers"
          : line.partyEntityType === "driver"
            ? "drivers"
            : "vehicles";
    const profile = partyMaps[mapKey].get(line.partyEntityId);
    if (profile) return profile;
  }
  return pulsePartyForName(line.party, line.partyEntityType ?? "client");
}

export function PulseAgingReport({ report, reportTitle, companyName, partyMaps }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = compact ? 30 : 10;
  const maxBucket = Math.max(...report.buckets.map((b) => b.amount), 1);
  const pagedLines = useMemo(() => {
    const start = page * pageSize;
    return report.lines.slice(start, start + pageSize);
  }, [page, pageSize, report.lines]);
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
    <View style={tbl.shell}>
      <View style={tbl.toolbar}>
        <View style={tbl.toolbarMeta}>
          <Text style={tbl.toolbarMetaTitle}>{kindLabel} aging</Text>
          <Text style={tbl.toolbarMetaSub}>
            Outstanding {inr(report.totalOutstanding)} · {report.lines.length} items
          </Text>
        </View>
        <View style={tbl.toolbarActions}>
          <Pressable style={tbl.toolbarBtn} onPress={() => void runExport("pdf")} disabled={!!exporting}>
            {exporting === "pdf" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <Download size={14} color={Theme.textSecondary} strokeWidth={2} />
            )}
            <Text style={tbl.toolbarBtnText}>PDF</Text>
          </Pressable>
          <Pressable style={tbl.toolbarBtn} onPress={() => void runExport("excel")} disabled={!!exporting}>
            {exporting === "excel" ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : (
              <FileSpreadsheet size={14} color={Theme.textSecondary} strokeWidth={2} />
            )}
            <Text style={tbl.toolbarBtnText}>Excel</Text>
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

      {pagedLines.length === 0 ? (
        <Text style={tbl.empty}>{emptyMessage}</Text>
      ) : compact ? (
        <View style={styles.cardList}>
          {pagedLines.map((line) => (
            <View key={line.id} style={styles.lineCard}>
              <Text style={styles.lineTrip} numberOfLines={1}>
                {line.tripRef}
              </Text>
              <PulsePartyCell
                party={resolveAgingParty(line, partyMaps)}
                meta={line.category}
                avatarSize={36}
              />
              <View style={styles.lineFooter}>
                <Text style={styles.lineDate}>{line.anchorDate}</Text>
                <Text style={styles.lineDays}>{line.daysOutstanding}d</Text>
                <Text style={styles.lineAmount}>{inr(line.amount)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.flexTable}>
          <View style={tbl.headerRow}>
            {AGING_COLUMNS.map((col) => (
              <View
                key={col.key}
                style={[
                  styles.agingCol,
                  { flex: col.flex, minWidth: col.minWidth },
                  col.align === "right" ? styles.colRight : null,
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
          {pagedLines.map((line) => (
            <View key={line.id} style={tbl.dataRow}>
              <View style={[styles.agingCol, { flex: AGING_COLUMNS[0]!.flex, minWidth: AGING_COLUMNS[0]!.minWidth }]}>
                <Text style={tbl.primaryName} numberOfLines={1}>
                  {line.tripRef}
                </Text>
              </View>
              <View style={[styles.agingCol, { flex: AGING_COLUMNS[1]!.flex, minWidth: AGING_COLUMNS[1]!.minWidth }]}>
                <PulsePartyCell party={resolveAgingParty(line, partyMaps)} avatarSize={36} />
              </View>
              <View style={[styles.agingCol, { flex: AGING_COLUMNS[2]!.flex, minWidth: AGING_COLUMNS[2]!.minWidth }]}>
                <Text style={tbl.cellText} numberOfLines={1}>
                  {line.category}
                </Text>
              </View>
              <View style={[styles.agingCol, { flex: AGING_COLUMNS[3]!.flex, minWidth: AGING_COLUMNS[3]!.minWidth }]}>
                <Text style={tbl.cellText}>{line.anchorDate}</Text>
              </View>
              <View
                style={[
                  styles.agingCol,
                  styles.colRight,
                  { flex: AGING_COLUMNS[4]!.flex, minWidth: AGING_COLUMNS[4]!.minWidth },
                ]}
              >
                <Text style={[tbl.cellText, tbl.cellTextRight]}>{line.daysOutstanding}</Text>
              </View>
              <View
                style={[
                  styles.agingCol,
                  styles.colRight,
                  { flex: AGING_COLUMNS[5]!.flex, minWidth: AGING_COLUMNS[5]!.minWidth },
                ]}
              >
                <Text style={[tbl.cellMoney, tbl.cellTextRight]}>{inr(line.amount)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {report.lines.length > pageSize ? (
        <PulseTablePagination
          page={page}
          pageSize={pageSize}
          total={report.lines.length}
          onPageChange={setPage}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flexTable: {
    width: "100%",
  },
  agingCol: {
    minWidth: 0,
    justifyContent: "center",
  },
  colRight: {
    alignItems: "flex-end",
  },
  bucketGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eff2f5",
  },
  bucketCard: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 5,
  },
  bucketHealthy: { borderColor: "#a7f3d0", backgroundColor: "#f0fdf4" },
  bucketWarning: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  bucketCritical: { borderColor: "#fecdd3", backgroundColor: "#fff1f2" },
  bucketLabel: { fontSize: 11, fontWeight: "600", color: Theme.textPrimaryDark },
  bucketBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  bucketBarFill: { height: "100%", backgroundColor: Theme.buttonPrimary, borderRadius: 999 },
  bucketAmount: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  bucketMeta: { fontSize: 11, color: Theme.textMuted },
  cardList: { gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
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
  lineAmount: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
});
