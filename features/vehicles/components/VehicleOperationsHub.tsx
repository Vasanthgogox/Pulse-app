import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import Theme from "@/constants/Theme";
import { VehicleHealthBadge } from "@/features/ai";
import { mapVehicleLedgerRowToExpenseEvent } from "@/features/fleet";
import {
  selectVehicleAccountingIntegrity,
  selectVehicleAllocationExposure,
} from "@/features/finance";
import {
  useSetVehicleOperationLedgerApproval,
  useVehicleOperationLedgerEntries,
  useVehicleOperationsLedger,
} from "@/features/trips/operations";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function km(value: number): string {
  return `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })} km`;
}

function healthTone(health: string): { bg: string; fg: string } {
  const h = health.toLowerCase();
  if (h.includes("healthy") || h.includes("good")) {
    return { bg: "#ecfdf5", fg: "#15803d" };
  }
  if (h.includes("low") || h.includes("warn")) {
    return { bg: "#fffbeb", fg: "#b45309" };
  }
  if (h.includes("negative") || h.includes("critical")) {
    return { bg: "#fef2f2", fg: "#dc2626" };
  }
  return { bg: "#f1f5f9", fg: "#475569" };
}

export type VehicleTripOperationalSpend = {
  fuelInr: number;
  tollInr: number;
};

export type VehicleFleetTotals = {
  revenueInr: number;
  expenseInr: number;
  netInr: number;
  tripCount: number;
};

export function VehicleOperationsHub({
  organizationId,
  vehicleId,
  utilizationPct,
  actorUserId,
  tripOperationalSpend,
  fleetTotals,
  onOpenAnalytics,
  onSwitchToCashFlow,
}: {
  organizationId: string | null;
  vehicleId: string;
  utilizationPct: number | null;
  actorUserId: string | null;
  /** Posted fuel/toll from trip P&L (cash + trip ops), when operation ledger is still draft. */
  tripOperationalSpend?: VehicleTripOperationalSpend;
  fleetTotals?: VehicleFleetTotals;
  onOpenAnalytics?: () => void;
  onSwitchToCashFlow?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const ledgerQuery = useVehicleOperationsLedger({
    organizationId,
    vehicleId,
    enabled: !!organizationId && expanded,
  });
  const pendingQuery = useVehicleOperationLedgerEntries({
    organizationId,
    vehicleId,
    approvalStates: ["draft", "verified"],
    enabled: !!organizationId && expanded,
  });
  const approvedLedgerEntriesQuery = useVehicleOperationLedgerEntries({
    organizationId,
    vehicleId,
    approvalStates: ["approved"],
    enabled: !!organizationId && expanded,
  });
  const setApproval = useSetVehicleOperationLedgerApproval();

  const displaySpend = useMemo(() => {
    const s = ledgerQuery.data;
    const tripFuel = tripOperationalSpend?.fuelInr ?? 0;
    const tripToll = tripOperationalSpend?.tollInr ?? 0;
    const ledgerFuel = s?.approvedFuelSpendInr ?? 0;
    const ledgerToll = s?.approvedTollSpendInr ?? 0;
    const fuelInr = Math.max(ledgerFuel, tripFuel);
    const tollInr = Math.max(ledgerToll, tripToll);
    const operationalInr = fuelInr + tollInr;
    const usesTripFallback = fuelInr > ledgerFuel || tollInr > ledgerToll;
    return {
      fuelInr,
      tollInr,
      operationalInr,
      maintenanceInr: s?.approvedMaintenanceSpendInr ?? 0,
      approvedSpendInr: Math.max(s?.approvedSpendInr ?? 0, operationalInr + (s?.approvedMaintenanceSpendInr ?? 0)),
      approvedCostPerKm: s?.approvedCostPerKm ?? null,
      approvedEntries: s?.approvedEntries ?? 0,
      draftEntries: s?.draftEntries ?? 0,
      verifiedEntries: s?.verifiedEntries ?? 0,
      ignoredEntries: s?.ignoredEntries ?? 0,
      totalDistanceKm: s?.totalDistanceKm ?? 0,
      usesTripFallback,
      ledgerFuel,
      ledgerToll,
    };
  }, [ledgerQuery.data, tripOperationalSpend]);

  const financialHealth = useMemo(() => {
    const summary = ledgerQuery.data;
    if (!summary) return null;
    const events = (approvedLedgerEntriesQuery.data ?? []).map((entry) =>
      mapVehicleLedgerRowToExpenseEvent(entry),
    );
    const accounting = selectVehicleAccountingIntegrity({
      monthlyRevenueInr: fleetTotals?.revenueInr ?? summary.monthlyRevenueInr,
      operationalCostInr: Math.max(summary.operationalCostInr, displaySpend.operationalInr),
      events,
    });
    const allocation = selectVehicleAllocationExposure(events);
    return { accounting, allocation };
  }, [
    approvedLedgerEntriesQuery.data,
    displaySpend.operationalInr,
    fleetTotals?.revenueInr,
    ledgerQuery.data,
  ]);

  const pendingCount = (pendingQuery.data ?? []).length;
  const utilizationLabel =
    utilizationPct != null && Number.isFinite(utilizationPct)
      ? `${Math.round(utilizationPct)}%`
      : "—";

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Feather name="truck" size={14} color={Theme.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Operations</Text>
            <Text style={styles.sub}>Trip expenses · ledger approvals · health</Text>
          </View>
        </View>
        <Text style={styles.toggle}>{expanded ? "Hide" : "Show"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {fleetTotals ? (
            <View style={styles.hero}>
              <View style={styles.heroMain}>
                <Text style={styles.heroLabel}>Fleet net (trips)</Text>
                <Text style={styles.heroValue}>{inr(fleetTotals.netInr)}</Text>
              </View>
              <View style={styles.heroMetaCol}>
                <Text style={styles.heroMeta}>
                  Rev {inr(fleetTotals.revenueInr)}
                </Text>
                <Text style={styles.heroMeta}>
                  Exp {inr(fleetTotals.expenseInr)} · {fleetTotals.tripCount} trips
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>Health</Text>
            {organizationId ? (
              <VehicleHealthBadge organizationId={organizationId} vehicleId={vehicleId} />
            ) : (
              <Text style={styles.meta}>Unavailable</Text>
            )}
          </View>

          {ledgerQuery.isLoading ? (
            <Text style={styles.meta}>Loading operational ledger…</Text>
          ) : ledgerQuery.data || displaySpend.operationalInr > 0 ? (
            <>
              <View style={styles.metricGrid}>
                <MetricTile
                  icon="droplet"
                  iconColor="#15803d"
                  iconBg="#dcfce7"
                  label="Fuel"
                  value={inr(displaySpend.fuelInr)}
                  hint={
                    displaySpend.usesTripFallback && displaySpend.fuelInr > displaySpend.ledgerFuel
                      ? "Includes trip-posted"
                      : "Approved ops fuel"
                  }
                />
                <MetricTile
                  icon="map-pin"
                  iconColor="#6d28d9"
                  iconBg="#ede9fe"
                  label="Toll"
                  value={inr(displaySpend.tollInr)}
                  hint={
                    displaySpend.usesTripFallback && displaySpend.tollInr > displaySpend.ledgerToll
                      ? "Includes trip-posted"
                      : "Approved ops toll"
                  }
                />
                <MetricTile
                  icon="activity"
                  iconColor={Theme.primary}
                  iconBg="#eef2ff"
                  label="Ops spend"
                  value={inr(displaySpend.approvedSpendInr)}
                  hint={
                    displaySpend.approvedCostPerKm != null
                      ? `₹${displaySpend.approvedCostPerKm.toFixed(2)}/km · ${displaySpend.approvedEntries} approved`
                      : `${displaySpend.approvedEntries} approved entries`
                  }
                />
                <MetricTile
                  icon="tool"
                  iconColor="#0369a1"
                  iconBg="#e0f2fe"
                  label="Maintenance"
                  value={inr(displaySpend.maintenanceInr)}
                  hint="Repair · service · permit"
                />
              </View>

              {financialHealth ? (
                <View style={styles.healthCard}>
                  <View style={styles.healthHeader}>
                    <Text style={styles.healthTitle}>Financial health</Text>
                    <View
                      style={[
                        styles.healthPill,
                        {
                          backgroundColor: healthTone(financialHealth.accounting.health).bg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.healthPillText,
                          { color: healthTone(financialHealth.accounting.health).fg },
                        ]}
                      >
                        {financialHealth.accounting.health.replace(/_/g, " ")}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.healthLine}>
                    Revenue {inr(financialHealth.accounting.monthlyRevenueInr)} · Ops{" "}
                    {inr(financialHealth.accounting.operationalCostInr)} · Net{" "}
                    {inr(financialHealth.accounting.netVehicleProfitabilityInr)}
                  </Text>
                  <Text style={styles.healthLine}>
                    Payables {inr(financialHealth.accounting.outstandingPayablesInr)} · Alloc{" "}
                    {financialHealth.allocation.allocationEfficiencyPct.toFixed(0)}%
                  </Text>
                </View>
              ) : null}

              <View style={styles.inlineStats}>
                <Text style={styles.inlineStat}>
                  {displaySpend.verifiedEntries} verified · {displaySpend.draftEntries} draft ·{" "}
                  {displaySpend.ignoredEntries} ignored
                </Text>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionEyebrow}>Pending approvals</Text>
                  {pendingCount > 0 ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{pendingCount}</Text>
                    </View>
                  ) : null}
                </View>
                {pendingQuery.isLoading ? (
                  <Text style={styles.meta}>Loading…</Text>
                ) : pendingCount === 0 ? (
                  <Text style={styles.meta}>No draft entries waiting.</Text>
                ) : (
                  <View style={styles.pendingList}>
                    {(pendingQuery.data ?? []).slice(0, 6).map((entry) => (
                      <View key={entry.id} style={styles.pendingRow}>
                        <View style={styles.pendingMain}>
                          <Text style={styles.pendingTitle} numberOfLines={1}>
                            {entry.source_type.toUpperCase()} · {inr(Number(entry.amount ?? 0))}
                          </Text>
                          <Text style={styles.pendingMeta}>{entry.approval_state}</Text>
                        </View>
                        <View style={styles.pendingActions}>
                          <Pressable
                            style={[styles.pendingBtn, styles.pendingBtnPrimary]}
                            onPress={() =>
                              setApproval.mutate({
                                entryId: entry.id,
                                approvalState: "approved",
                                approvedBy: actorUserId,
                              })
                            }
                          >
                            <Text style={styles.pendingBtnTextPrimary}>Approve</Text>
                          </Pressable>
                          <Pressable
                            style={styles.pendingBtn}
                            onPress={() =>
                              setApproval.mutate({
                                entryId: entry.id,
                                approvalState: "ignored",
                                approvedBy: actorUserId,
                              })
                            }
                          >
                            <Text style={styles.pendingBtnText}>Skip</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.linkRow}>
                {onOpenAnalytics ? (
                  <Pressable style={styles.linkCard} onPress={onOpenAnalytics}>
                    <Feather name="bar-chart-2" size={14} color={Theme.primary} />
                    <View style={styles.linkText}>
                      <Text style={styles.linkTitle}>Analytics</Text>
                      <Text style={styles.linkSub}>
                        {km(displaySpend.totalDistanceKm)} · {utilizationLabel} utilization
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={Theme.textMuted} />
                  </Pressable>
                ) : null}
                {onSwitchToCashFlow ? (
                  <Pressable style={styles.linkCard} onPress={onSwitchToCashFlow}>
                    <Feather name="credit-card" size={14} color="#0f766e" />
                    <View style={styles.linkText}>
                      <Text style={styles.linkTitle}>Cash flow</Text>
                      <Text style={styles.linkSub}>Posted transactions for this vehicle</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={Theme.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No operational data yet</Text>
              <Text style={styles.meta}>
                Post fuel or toll on trips for this vehicle, then approve entries here or
                view Cash flow.
              </Text>
              {onSwitchToCashFlow ? (
                <Pressable style={styles.emptyCta} onPress={onSwitchToCashFlow}>
                  <Text style={styles.emptyCtaText}>Open cash flow</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function MetricTile({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  hint,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <View style={styles.metricTile}>
      <View style={[styles.metricIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={13} color={iconColor} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricHint} numberOfLines={2}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  sub: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    marginTop: 1,
  },
  toggle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  body: {
    padding: 10,
    gap: 10,
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  heroMain: { flex: 1, minWidth: 0 },
  heroLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  heroMetaCol: { alignItems: "flex-end", gap: 2 },
  heroMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  section: { gap: 6 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricTile: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    gap: 4,
  },
  metricIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  metricHint: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  healthCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    gap: 6,
  },
  healthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  healthTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  healthPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  healthPillText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  healthLine: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  inlineStats: {
    paddingHorizontal: 2,
  },
  inlineStat: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },
  pendingList: { gap: 6 },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  pendingMain: { flex: 1, minWidth: 0, gap: 2 },
  pendingTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  pendingMeta: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "capitalize",
  },
  pendingActions: { flexDirection: "row", gap: 6 },
  pendingBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surface,
    minHeight: 32,
    justifyContent: "center",
  },
  pendingBtnPrimary: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  pendingBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  pendingBtnTextPrimary: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnPrimary,
  },
  linkRow: { gap: 6 },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  linkText: { flex: 1, minWidth: 0, gap: 2 },
  linkTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  linkSub: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  emptyBox: {
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: Theme.surface,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  meta: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.primary,
  },
  emptyCtaText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnPrimary,
  },
});
