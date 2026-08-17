/**
 * One reusable "Entity Progress" modal, fed whichever entity/perspective the
 * user drilled into (KAM/Client/Region/Supplier/Asset) -- not six separate
 * modal designs. Reuses the exact centered <Modal transparent
 * animationType="fade"> shell already established by
 * NetworkDesktopEntityGoalWizard.tsx.
 *
 * Phase 1, Commit 6 groundwork: the header reuses the SAME PerformanceKpiRow
 * the page's own KPI band already computed (not a second calculation), the
 * Portfolio section (KAM/Region only -- their clients) reuses the existing
 * buildEntityGoalRows(client) rows, and Trip evidence is a small, non-
 * paginated preview (first 5 rows) of the entity's own filtered trips --
 * full 5/10/20 pagination, "View all", and Download are Commit 7, not here.
 *
 * Opening/closing this modal never touches the page's PerformanceCrossFilter
 * -- it's a read-only view over whatever the page has already computed.
 */
import Theme from "@/constants/Theme";
import type { EntityGoalRow, PerformanceKpiRow } from "@/features/network/utils/connectionGoalsAnalytics.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatINRChip } from "@/lib/format";
import { X } from "lucide-react-native";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export type EntityProgressKind = "kam" | "client" | "region" | "supplier" | "asset";

const KIND_LABEL: Record<EntityProgressKind, string> = {
  kam: "KAM Progress",
  client: "Client Progress",
  region: "Region Progress",
  supplier: "Supplier Progress",
  asset: "Asset Performance",
};

const TRIP_EVIDENCE_PREVIEW_COUNT = 5;

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
  /** This entity's own trips (already filtered by the page's pipeline) --
   * used only for the small evidence preview below. */
  trips: TripRow[];
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
  trips,
}: Props) {
  const showPortfolio = (kind === "kam" || kind === "region") && (portfolioClients?.length ?? 0) > 0;
  const previewTrips = trips.slice(0, TRIP_EVIDENCE_PREVIEW_COUNT);

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
              <Text style={styles.evidenceCaption}>
                Showing {previewTrips.length} of {trips.length} matching trips. Full pagination,
                "View all", and download land in a later commit.
              </Text>
              {previewTrips.length === 0 ? (
                <Text style={styles.evidenceEmpty}>No matching trips in this period.</Text>
              ) : (
                <View style={styles.tableHeadRow}>
                  <Text style={[styles.tableHeadCell, styles.colName]}>Trip</Text>
                  <Text style={[styles.tableHeadCell, styles.colNum]}>Sales</Text>
                  <Text style={[styles.tableHeadCell, styles.colNum]}>Status</Text>
                </View>
              )}
              {previewTrips.map((trip) => (
                <View key={trip.id} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>
                    {trip.trip_number}
                  </Text>
                  <Text style={[styles.tableCell, styles.colNum]}>
                    {formatINRChip(Number(trip.client_price) || 0)}
                  </Text>
                  <Text style={[styles.tableCell, styles.colNum]}>{trip.status}</Text>
                </View>
              ))}
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
});
