import { ScrollView, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { MetricDisplay, OperationalDetailSkeleton, Surface } from "@/components/operational";
import { useVehicleEconomics } from "./useVehicleEconomics";

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

export function VehicleEconomicsDashboard({
  organizationId,
  enabled = true,
}: {
  organizationId: string | null;
  enabled?: boolean;
}) {
  const query = useVehicleEconomics({ organizationId, enabled });
  if (!enabled) return null;
  if (query.isLoading) return <OperationalDetailSkeleton />;
  if (query.isError) {
    return (
      <Surface style={styles.surface}>
        <Text style={styles.errorText}>Vehicle economics unavailable.</Text>
      </Surface>
    );
  }
  const data = query.data;
  if (!data || data.rows.length === 0) {
    return (
      <Surface style={styles.surface}>
        <Text style={styles.emptyText}>
          No owned-asset vehicle economics available yet.
        </Text>
      </Surface>
    );
  }
  return (
    <View style={styles.container}>
      <Surface style={styles.summary} elevation={2}>
        <Text style={styles.heading}>Vehicle economics</Text>
        <View style={styles.metricsWrap}>
          <MetricDisplay
            label="Fleet avg fuel/km"
            value={`₹${formatNumber(data.profitability.avgFuelCostPerKm)}`}
            tone="neutral"
          />
          <MetricDisplay
            label="Fleet avg maintenance/km"
            value={`₹${formatNumber(data.profitability.avgMaintenanceCostPerKm)}`}
            tone="neutral"
          />
          <MetricDisplay
            label="Anomalies"
            value={String(data.profitability.anomalyCount)}
            tone={data.profitability.anomalyCount > 0 ? "pending" : "brand"}
          />
        </View>
      </Surface>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {data.rows.map((row) => (
          <Surface key={row.vehicleId} style={styles.card} elevation={1}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {row.vehicleLabel}
              </Text>
              <Text
                style={[
                  styles.trend,
                  row.efficiencyTrend === "up"
                    ? styles.trendUp
                    : row.efficiencyTrend === "down"
                      ? styles.trendDown
                      : styles.trendFlat,
                ]}
              >
                {row.efficiencyTrend.toUpperCase()}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Fuel/km</Text>
              <Text style={styles.metricValue}>₹{formatNumber(row.fuelCostPerKm)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Maintenance/km</Text>
              <Text style={styles.metricValue}>
                ₹{formatNumber(row.maintenanceCostPerKm)}
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Toll/km</Text>
              <Text style={styles.metricValue}>₹{formatNumber(row.tollCostPerKm)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Utilization</Text>
              <Text style={styles.metricValue}>{formatNumber(row.utilizationPct)}%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Cost variance</Text>
              <Text style={styles.metricValue}>{formatNumber(row.costVariancePct)}%</Text>
            </View>
          </Surface>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  surface: {
    padding: 12,
  },
  summary: {
    padding: 12,
    gap: 10,
  },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textPrimary,
  },
  metricsWrap: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: 8,
    paddingBottom: 8,
  },
  card: {
    padding: 10,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  trend: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  trendUp: { color: Theme.positive },
  trendDown: { color: Theme.negative },
  trendFlat: { color: Theme.textMuted },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  metricValue: {
    fontSize: 11,
    color: Theme.textPrimary,
    fontWeight: "600",
  },
  emptyText: { fontSize: 12, color: Theme.textSecondary },
  errorText: { fontSize: 12, color: Theme.negative },
});
