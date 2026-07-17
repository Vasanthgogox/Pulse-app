import Theme from "@/constants/Theme";
import type { TripRow } from "@/features/trips/services/trips.service";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { useTripOperationsSummary } from "../queries/useTripOperations";
import { toOperationsDisplayMetrics } from "../metrics/operationsMetrics";
import { VerificationStatusChip } from "@/features/trips/verification/components/VerificationStatusChip";
import type { OdometerVerificationState } from "@/features/trips/verification/types";

function formatInr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

const ODOMETER_VERIFICATION_STATES: readonly OdometerVerificationState[] = [
  "none",
  "partial",
  "driver_verified",
  "business_verified",
  "gps_verified",
];

function toVerificationState(value: string | null | undefined): OdometerVerificationState {
  return ODOMETER_VERIFICATION_STATES.includes(value as OdometerVerificationState)
    ? (value as OdometerVerificationState)
    : "none";
}

export function TripOperationsSummary({
  trip,
  onAddFuel,
  onAddToll,
}: {
  trip: TripRow;
  onAddFuel?: () => void;
  onAddToll?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: expanded });

  const metrics = useMemo(() => {
    if (!summaryQuery.data) return null;
    return toOperationsDisplayMetrics(summaryQuery.data.mileage);
  }, [summaryQuery.data]);

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <View>
          <Text style={styles.title}>Operations</Text>
          <Text style={styles.sub}>Fuel, toll, mileage and lightweight trip metrics</Text>
        </View>
        <Text style={styles.toggle}>{expanded ? "Hide" : "View"}</Text>
      </Pressable>

      {expanded ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verification</Text>
            <VerificationStatusChip
              state={toVerificationState(trip.odometer_verification_state)}
            />
          </View>

          {summaryQuery.isLoading ? (
            <Text style={styles.loading}>Loading operations summary…</Text>
          ) : summaryQuery.data ? (
            <>
              <View style={styles.grid}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Fuel Spend</Text>
                  <Text style={styles.metricValue}>
                    {formatInr(summaryQuery.data.mileage.totalFuelSpendInr)}
                  </Text>
                  <Text style={styles.metricMeta}>
                    {summaryQuery.data.fuelEntries.length} entries
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Toll Spend</Text>
                  <Text style={styles.metricValue}>
                    {formatInr(summaryQuery.data.mileage.totalTollSpendInr)}
                  </Text>
                  <Text style={styles.metricMeta}>
                    {summaryQuery.data.tollEntries.length} entries
                  </Text>
                </View>
              </View>

              <View style={styles.grid}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>KM/L</Text>
                  <Text style={styles.metricValue}>{metrics?.efficiencyLabel ?? "—"}</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Fuel Cost/KM</Text>
                  <Text style={styles.metricValue}>
                    {metrics?.fuelCostPerKmLabel ?? "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Distance</Text>
                <Text style={styles.metricValue}>
                  {summaryQuery.data.mileage.distanceKm != null
                    ? `${summaryQuery.data.mileage.distanceKm.toLocaleString("en-IN", {
                        maximumFractionDigits: 1,
                      })} KM`
                    : "—"}
                </Text>
                <Text style={styles.metricMeta}>
                  Loaded:{" "}
                  {summaryQuery.data.mileage.loadedMileageKm != null
                    ? `${summaryQuery.data.mileage.loadedMileageKm.toLocaleString("en-IN", {
                        maximumFractionDigits: 1,
                      })} KM`
                    : "—"}{" "}
                  · Dry run:{" "}
                  {summaryQuery.data.mileage.dryRunMileageKm != null
                    ? `${summaryQuery.data.mileage.dryRunMileageKm.toLocaleString("en-IN", {
                        maximumFractionDigits: 1,
                      })} KM`
                    : "—"}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.loading}>No operations data yet.</Text>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={onAddFuel}>
              <Text style={styles.actionText}>Add Fuel</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={onAddToll}>
              <Text style={styles.actionText}>Add Toll</Text>
            </Pressable>
          </View>
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
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: { color: Theme.text, fontSize: 15, fontWeight: "700" },
  sub: { color: Theme.textSecondary, fontSize: 12, marginTop: 2 },
  toggle: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  section: { gap: 6 },
  sectionTitle: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  loading: { color: Theme.textSecondary, fontSize: 12 },
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
  metricMeta: { color: Theme.textSecondary, fontSize: 11 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: Theme.whiteMuted,
  },
  actionText: { color: Theme.text, fontSize: 12, fontWeight: "700" },
});
