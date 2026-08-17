/**
 * One reusable "Entity Progress" modal, fed whichever entity/perspective the
 * user drilled into (KAM/Client/Region/Supplier/Asset) -- not six separate
 * modal designs. Reuses the exact centered <Modal transparent
 * animationType="fade"> shell already established by
 * NetworkDesktopEntityGoalWizard.tsx.
 *
 * Phase 1, Commit 6 groundwork: the header reuses the SAME PerformanceKpiRow
 * the page's own KPI band already computed (not a second calculation), and
 * the Portfolio section (KAM/Region only -- their clients) reuses the
 * existing buildEntityGoalRows(client) rows.
 *
 * Phase 2, Commit 1 (this commit): Trip evidence is now a real, paginated
 * table (5/10/20, default 10, plus "View all" within this same scroll
 * container -- no new screen/route) fed evidenceRows the page already built
 * via buildPerformanceTripEvidenceRows over the entity+period+cross-filter
 * scoped trips. Download exports exactly those rows via the existing
 * networkExport.util.ts / shareOrSave path -- no new query, nothing
 * org-wide. Zero rows -> empty state, Download disabled.
 *
 * Opening/closing this modal never touches the page's PerformanceCrossFilter
 * -- it's a read-only view over whatever the page has already computed.
 */
import Theme from "@/constants/Theme";
import type {
  EntityGoalRow,
  PerformanceKpiRow,
  PerformanceTripEvidenceRow,
} from "@/features/network/utils/connectionGoalsAnalytics.util";
import { paginateRows } from "@/features/network/utils/connectionSalesAnalytics.util";
import { exportPerformanceEvidenceExcel } from "@/features/network/lib/networkExport.util";
import { NetworkDesktopSalesTableOverflow } from "@/features/network/components/desktop/NetworkDesktopSalesTableOverflow";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { formatINRChip } from "@/lib/format";
import { Download, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export type EntityProgressKind = "kam" | "client" | "region" | "supplier" | "asset";

const KIND_LABEL: Record<EntityProgressKind, string> = {
  kam: "KAM Progress",
  client: "Client Progress",
  region: "Region Progress",
  supplier: "Supplier Progress",
  asset: "Asset Performance",
};

const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number] | "all";

type Props = {
  visible: boolean;
  onClose: () => void;
  kind: EntityProgressKind;
  entityName: string;
  /** The exact same computed row the page's KPI band already shows for this
   * entity -- Target/Actual/Achievement/Target-to-date/Pacing/Previous/
   * Variance never get recalculated a second time in here. */
  kpi: PerformanceKpiRow;
  /** KAM/Region only -- the clients under this entity, already computed by
   * the page (buildEntityGoalRows scoped to this entity's client set). */
  portfolioClients?: EntityGoalRow[];
  /** This entity's own trips, already scoped by the page to the active
   * cross-filter AND the selected period, already mapped to display-ready
   * rows -- this component never touches a raw TripRow or recalculates
   * anything. */
  evidenceRows: PerformanceTripEvidenceRow[];
  /** e.g. "August 2026", "Q3 '26", "YTD '26" -- from rollupLabel(), same
   * label the KPI cards elsewhere in Performance already use. */
  periodLabel: string;
  /** Any OTHER active cross-filter dimension besides this entity itself
   * (e.g. a Region filter active while viewing a KAM's modal), already
   * resolved to display names by the page. Null when none. */
  otherFilterLabel: string | null;
};

function formatKpiValue(unit: PerformanceKpiRow["unit"], value: number): string {
  if (unit === "trips") return String(Math.round(value));
  if (unit === "pct") return `${value.toFixed(1)}%`;
  return formatINRChip(value);
}

export function NetworkDesktopEntityProgressModal({
  visible,
  onClose,
  kind,
  entityName,
  kpi,
  portfolioClients,
  evidenceRows,
  periodLabel,
  otherFilterLabel,
}: Props) {
  const { compact } = useProfileHubCompactLayout();
  const showPortfolio = (kind === "kam" || kind === "region") && (portfolioClients?.length ?? 0) > 0;

  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [page, setPage] = useState(1);
  const isViewAll = pageSize === "all";
  const pagination = isViewAll
    ? { rows: evidenceRows, from: evidenceRows.length > 0 ? 1 : 0, to: evidenceRows.length, totalPages: 1 }
    : paginateRows(evidenceRows, page, pageSize);
  const hasEvidence = evidenceRows.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{KIND_LABEL[kind]}</Text>
              <Text style={styles.subtitle}>{entityName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <X size={18} color={Theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.kpiPrimaryRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiValue}>
                  {kpi.hasTarget ? formatKpiValue(kpi.unit, kpi.periodTarget) : "Not set"}
                </Text>
                <Text style={styles.kpiCaption}>Period target</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiValue}>{formatKpiValue(kpi.unit, kpi.actual)}</Text>
                <Text style={styles.kpiCaption}>Actual</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiValue}>
                  {kpi.achievement != null ? `${kpi.achievement}%` : "—"}
                </Text>
                <Text style={styles.kpiCaption}>Achievement</Text>
              </View>
            </View>
            {kpi.targetToDate != null ? (
              <View style={styles.kpiSecondaryRow}>
                <Text style={styles.kpiSecondaryText}>
                  {formatKpiValue(kpi.unit, kpi.targetToDate)} target-to-date
                </Text>
                <Text style={styles.kpiSecondaryText}>
                  {kpi.pacing != null ? `${kpi.pacing}% pacing` : "Pacing unavailable"}
                </Text>
              </View>
            ) : null}
            <Text style={styles.kpiTertiaryText}>
              {kpi.hasPreviousData && kpi.changeVsPrevious != null
                ? `${kpi.changeVsPrevious >= 0 ? "↑" : "↓"} ${Math.abs(kpi.changeVsPrevious)}% vs previous period`
                : "No previous period data"}
            </Text>
            {!kpi.hasTarget ? (
              <Text style={styles.noTargetNote}>No target set</Text>
            ) : null}

            {showPortfolio ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Portfolio</Text>
                <View style={styles.tableHeadRow}>
                  <Text style={[styles.tableHeadCell, styles.colName]}>Client</Text>
                  <Text style={[styles.tableHeadCell, styles.colNum]}>Trips</Text>
                  <Text style={[styles.tableHeadCell, styles.colNum]}>Sales</Text>
                  <Text style={[styles.tableHeadCell, styles.colNum]}>Target</Text>
                  <Text style={[styles.tableHeadCell, styles.colNum]}>%</Text>
                </View>
                {portfolioClients!.map((row) => (
                  <View key={row.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={[styles.tableCell, styles.colNum]}>{row.actualTrips}</Text>
                    <Text style={[styles.tableCell, styles.colNum]}>
                      {formatINRChip(row.actualRevenue)}
                    </Text>
                    <Text style={[styles.tableCell, styles.colNum]}>
                      {row.hasTarget ? formatINRChip(row.targetRevenue) : "—"}
                    </Text>
                    <Text style={[styles.tableCell, styles.colNum]}>
                      {row.hasTarget ? `${row.revenueProgressPct}%` : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trip evidence</Text>

              {/* Scope summary -- the evidence must reflect perspective +
                  cross-filter + period simultaneously; this line above the
                  table is what makes that obvious rather than implicit. */}
              <View style={styles.evidenceScopeRow}>
                <Text style={styles.evidenceScopeText}>
                  {periodLabel} · {evidenceRows.length} trip{evidenceRows.length === 1 ? "" : "s"}
                </Text>
                {otherFilterLabel ? (
                  <Text style={styles.evidenceScopeText}>Filters: {otherFilterLabel}</Text>
                ) : null}
              </View>

              {!hasEvidence ? (
                <Text style={styles.evidenceEmpty}>No trip evidence for this period.</Text>
              ) : (
                <>
                  <NetworkDesktopSalesTableOverflow compact={compact}>
                    <View>
                      <View style={styles.evidenceHeadRow}>
                        <Text style={[styles.evidenceHeadCell, styles.evColId]}>Trip ID</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColDate]}>Date</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColName]}>Client</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColName]}>Supplier/Operator</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColName]}>Vehicle</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColName]}>Driver</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColNum]}>Sales</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColNum]}>Cost</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColNum]}>Margin</Text>
                        <Text style={[styles.evidenceHeadCell, styles.evColStatus]}>Status</Text>
                      </View>
                      {pagination.rows.map((row) => (
                        <View key={row.id} style={styles.evidenceRow}>
                          <Text style={[styles.evidenceCell, styles.evColId]} numberOfLines={1}>
                            {row.tripRef}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColDate]} numberOfLines={1}>
                            {row.dateLabel}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColName]} numberOfLines={1}>
                            {row.clientName}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColName]} numberOfLines={1}>
                            {row.supplierName}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColName]} numberOfLines={1}>
                            {row.vehicleName}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColName]} numberOfLines={1}>
                            {row.driverName}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColNum]}>
                            {formatINRChip(row.sales)}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColNum]}>
                            {formatINRChip(row.cost)}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColNum]}>
                            {formatINRChip(row.margin)}
                          </Text>
                          <Text style={[styles.evidenceCell, styles.evColStatus]} numberOfLines={1}>
                            {row.statusLabel}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </NetworkDesktopSalesTableOverflow>

                  {!isViewAll ? (
                    <View style={styles.evidencePageNavRow}>
                      <Text style={styles.evidenceRangeText}>
                        {pagination.from}–{pagination.to} of {evidenceRows.length}
                      </Text>
                      <View style={styles.evidencePageNavBtns}>
                        <Pressable
                          disabled={page <= 1}
                          onPress={() => setPage((p) => Math.max(1, p - 1))}
                          style={[styles.evidenceNavBtn, page <= 1 && styles.evidenceNavBtnDisabled]}
                        >
                          <Text style={styles.evidenceNavBtnText}>Prev</Text>
                        </Pressable>
                        <Text style={styles.evidenceRangeText}>
                          Page {Math.min(page, pagination.totalPages)} of {pagination.totalPages}
                        </Text>
                        <Pressable
                          disabled={page >= pagination.totalPages}
                          onPress={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                          style={[
                            styles.evidenceNavBtn,
                            page >= pagination.totalPages && styles.evidenceNavBtnDisabled,
                          ]}
                        >
                          <Text style={styles.evidenceNavBtnText}>Next</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </>
              )}

              <View style={styles.evidenceControlsRow}>
                <View style={styles.evidencePageSizeRow}>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <Pressable
                      key={size}
                      onPress={() => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      style={[styles.evidencePageChip, pageSize === size && styles.evidencePageChipOn]}
                    >
                      <Text
                        style={[
                          styles.evidencePageChipText,
                          pageSize === size && styles.evidencePageChipTextOn,
                        ]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => setPageSize("all")}
                    style={[styles.evidencePageChip, isViewAll && styles.evidencePageChipOn]}
                  >
                    <Text
                      style={[styles.evidencePageChipText, isViewAll && styles.evidencePageChipTextOn]}
                    >
                      View all
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  disabled={!hasEvidence}
                  onPress={() => exportPerformanceEvidenceExcel(evidenceRows, entityName, periodLabel)}
                  style={[styles.evidenceDownloadBtn, !hasEvidence && styles.evidenceDownloadBtnDisabled]}
                >
                  <Download size={13} color={hasEvidence ? Theme.textOnPrimary : Theme.textMuted} />
                  <Text
                    style={[
                      styles.evidenceDownloadText,
                      !hasEvidence && styles.evidenceDownloadTextDisabled,
                    ]}
                  >
                    Download
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerText: { gap: 2 },
  title: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark },
  subtitle: { fontSize: 12, color: Theme.textMuted, fontWeight: "600" },
  body: { padding: 18 },
  kpiPrimaryRow: { flexDirection: "row", gap: 12 },
  kpiCell: { flex: 1 },
  kpiValue: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  kpiCaption: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  kpiSecondaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  kpiSecondaryText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  kpiTertiaryText: { fontSize: 11, fontWeight: "700", color: Theme.primary, marginTop: 8 },
  noTargetNote: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, marginTop: 4 },
  section: { marginTop: 20, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  evidenceCaption: { fontSize: 11, color: Theme.textMuted },
  evidenceEmpty: { fontSize: 12, color: Theme.textMuted, paddingVertical: 8 },
  tableHeadRow: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableHeadCell: { fontSize: 10, fontWeight: "800", color: Theme.textMuted },
  colName: { flex: 2 },
  colNum: { flex: 1, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableCell: { fontSize: 12, color: Theme.textPrimaryDark },
  evidenceScopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: -4 },
  evidenceScopeText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  evidenceHeadRow: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minWidth: 760,
  },
  evidenceHeadCell: { fontSize: 10, fontWeight: "800", color: Theme.textMuted, paddingHorizontal: 4 },
  evidenceRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minWidth: 760,
  },
  evidenceCell: { fontSize: 12, color: Theme.textPrimaryDark, paddingHorizontal: 4 },
  evColId: { width: 90 },
  evColDate: { width: 80 },
  evColName: { width: 110 },
  evColNum: { width: 80, textAlign: "right" },
  evColStatus: { width: 90 },
  evidenceRangeText: { fontSize: 11, color: Theme.textMuted },
  evidencePageNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  evidencePageNavBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  evidenceNavBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.surfaceForm,
  },
  evidenceNavBtnDisabled: { opacity: 0.4 },
  evidenceNavBtnText: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  evidenceControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    flexWrap: "wrap",
    gap: 10,
  },
  evidencePageSizeRow: { flexDirection: "row", gap: 6 },
  evidencePageChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Theme.surfaceForm,
    borderRadius: 8,
  },
  evidencePageChipOn: { backgroundColor: Theme.primary },
  evidencePageChipText: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  evidencePageChipTextOn: { color: Theme.textOnPrimary },
  evidenceDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Theme.primary,
    borderRadius: 8,
  },
  evidenceDownloadBtnDisabled: { backgroundColor: Theme.surfaceForm },
  evidenceDownloadText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },
  evidenceDownloadTextDisabled: { color: Theme.textMuted },
});
