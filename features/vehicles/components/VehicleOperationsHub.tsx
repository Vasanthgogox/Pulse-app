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
  return `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KM`;
}

export function VehicleOperationsHub({
  organizationId,
  vehicleId,
  utilizationPct,
  actorUserId,
}: {
  organizationId: string | null;
  vehicleId: string;
  utilizationPct: number | null;
  actorUserId: string | null;
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

  const sections = useMemo(() => {
    const s = ledgerQuery.data;
    if (!s) return null;
    return {
      financialOps: {
        approvedSpend: inr(s.approvedSpendInr),
        approvedCostPerKm:
          s.approvedCostPerKm != null ? `₹${s.approvedCostPerKm.toFixed(2)}/KM` : "—",
        approvedEntries: s.approvedEntries,
      },
      maintenance: inr(s.approvedMaintenanceSpendInr),
      fuel: inr(s.approvedFuelSpendInr),
      toll: inr(s.approvedTollSpendInr),
      verification: `${s.verifiedEntries} verified · ${s.draftEntries} draft · ${s.ignoredEntries} ignored`,
      analytics: {
        distance: km(s.totalDistanceKm),
        utilization:
          utilizationPct != null && Number.isFinite(utilizationPct)
            ? `${Math.round(utilizationPct)}%`
            : "—",
      },
    };
  }, [ledgerQuery.data, utilizationPct]);
  const financialHealth = useMemo(() => {
    const summary = ledgerQuery.data;
    if (!summary) return null;
    const events = (approvedLedgerEntriesQuery.data ?? []).map((entry) =>
      mapVehicleLedgerRowToExpenseEvent(entry),
    );
    const accounting = selectVehicleAccountingIntegrity({
      monthlyRevenueInr: summary.monthlyRevenueInr,
      operationalCostInr: summary.operationalCostInr,
      events,
    });
    const allocation = selectVehicleAllocationExposure(events);
    return { accounting, allocation };
  }, [approvedLedgerEntriesQuery.data, ledgerQuery.data]);

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <View>
          <Text style={styles.title}>Vehicle Operations Hub</Text>
          <Text style={styles.sub}>Operational economics only (not accounting)</Text>
        </View>
        <Text style={styles.toggle}>{expanded ? "Hide" : "View"}</Text>
      </Pressable>

      {expanded ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Operational Health</Text>
            {organizationId ? (
              <VehicleHealthBadge organizationId={organizationId} vehicleId={vehicleId} />
            ) : (
              <Text style={styles.meta}>Unavailable</Text>
            )}
          </View>

          {ledgerQuery.isLoading ? (
            <Text style={styles.meta}>Loading operational ledger…</Text>
          ) : sections ? (
            <>
              <View style={styles.grid}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Financial Operations</Text>
                  <Text style={styles.metricValue}>{sections.financialOps.approvedSpend}</Text>
                  <Text style={styles.meta}>
                    {sections.financialOps.approvedCostPerKm} · {sections.financialOps.approvedEntries} approved
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Maintenance</Text>
                  <Text style={styles.metricValue}>{sections.maintenance}</Text>
                  <Text style={styles.meta}>Approved maintenance/repair/service/permit/insurance</Text>
                </View>
              </View>

              {financialHealth ? (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Vehicle Financial Health</Text>
                  <Text style={styles.metricValue}>
                    {financialHealth.accounting.health.replace(/_/g, " ").toUpperCase()}
                  </Text>
                  <Text style={styles.meta}>
                    Revenue {inr(financialHealth.accounting.monthlyRevenueInr)} · Operational{" "}
                    {inr(financialHealth.accounting.operationalCostInr)} · Ownership{" "}
                    {inr(financialHealth.accounting.ownershipCostInr)}
                  </Text>
                  <Text style={styles.meta}>
                    Payables {inr(financialHealth.accounting.outstandingPayablesInr)} · Unallocated{" "}
                    {inr(financialHealth.accounting.unallocatedOverheadInr)} · Net{" "}
                    {inr(financialHealth.accounting.netVehicleProfitabilityInr)}
                  </Text>
                  <Text style={styles.meta}>
                    Allocation efficiency {financialHealth.allocation.allocationEfficiencyPct.toFixed(1)}%
                  </Text>
                </View>
              ) : null}

              <View style={styles.grid}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Fuel</Text>
                  <Text style={styles.metricValue}>{sections.fuel}</Text>
                  <Text style={styles.meta}>Approved operational fuel spend</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Toll</Text>
                  <Text style={styles.metricValue}>{sections.toll}</Text>
                  <Text style={styles.meta}>Approved operational toll spend</Text>
                </View>
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Verification</Text>
                <Text style={styles.meta}>{sections.verification}</Text>
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Pending Approvals</Text>
                {pendingQuery.isLoading ? (
                  <Text style={styles.meta}>Loading pending entries…</Text>
                ) : (pendingQuery.data ?? []).length === 0 ? (
                  <Text style={styles.meta}>No draft/verified entries pending.</Text>
                ) : (
                  <View style={styles.pendingList}>
                    {(pendingQuery.data ?? []).slice(0, 5).map((entry) => (
                      <View key={entry.id} style={styles.pendingRow}>
                        <View style={styles.pendingTextWrap}>
                          <Text style={styles.pendingTitle}>
                            {entry.source_type.toUpperCase()} · {inr(Number(entry.amount ?? 0))}
                          </Text>
                          <Text style={styles.meta}>State: {entry.approval_state}</Text>
                        </View>
                        <View style={styles.pendingActions}>
                          <Pressable
                            style={styles.pendingAction}
                            onPress={() =>
                              setApproval.mutate({
                                entryId: entry.id,
                                approvalState: "approved",
                                approvedBy: actorUserId,
                              })
                            }
                          >
                            <Text style={styles.pendingActionText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            style={styles.pendingAction}
                            onPress={() =>
                              setApproval.mutate({
                                entryId: entry.id,
                                approvalState: "ignored",
                                approvedBy: actorUserId,
                              })
                            }
                          >
                            <Text style={styles.pendingActionText}>Ignore</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Analytics</Text>
                <Text style={styles.meta}>
                  Distance: {sections.analytics.distance} · Utilization: {sections.analytics.utilization}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.meta}>No operational ledger entries yet.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  title: { color: Theme.text, fontSize: 15, fontWeight: "700" },
  sub: { color: Theme.textSecondary, fontSize: 12, marginTop: 2 },
  toggle: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  section: { gap: 6 },
  sectionTitle: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", gap: 10 },
  metric: {
    flex: 1,
    backgroundColor: Theme.whiteMuted,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  metricLabel: { color: Theme.textSecondary, fontSize: 11, fontWeight: "600" },
  metricValue: { color: Theme.text, fontSize: 13, fontWeight: "700" },
  meta: { color: Theme.textSecondary, fontSize: 11 },
  pendingList: { gap: 8, marginTop: 4 },
  pendingRow: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    padding: 8,
    gap: 6,
  },
  pendingTextWrap: { gap: 2 },
  pendingTitle: { color: Theme.text, fontSize: 11, fontWeight: "700" },
  pendingActions: { flexDirection: "row", gap: 8 },
  pendingAction: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingActionText: { color: Theme.text, fontSize: 11, fontWeight: "700" },
});
