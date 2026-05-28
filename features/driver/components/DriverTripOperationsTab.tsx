import { type Href, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Activity,
  ChevronRight,
  Fuel,
  Gauge,
  MapPin,
  Receipt,
  Route,
  Zap,
} from "lucide-react-native";
import { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { useDriverTheme, useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { tripHistoryDetailStyles as td } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import { getTripOperationalCapabilities } from "@/features/trips/capabilities";
import {
  OperationsHub,
  type OperationsHubDriverTheme,
} from "@/features/trips/operations/hub/OperationsHub";
import { deriveOperationalHealth } from "@/features/trips/operations/health/operationalHealth";
import { toOperationsDisplayMetrics } from "@/features/trips/operations/metrics/operationsMetrics";
import { useTripOperationsSummary } from "@/features/trips/operations/queries/useTripOperations";
import type { TripRow } from "@/features/trips/services/trips.service";
import { toVerificationSnapshot } from "@/features/trips/verification/selectors/verificationSelectors";
import { VerificationStatusChip } from "@/features/trips/verification/components/VerificationStatusChip";

type OperationsSyncState = {
  isSyncing: boolean;
  lastResult?: { failed?: number; processed?: number } | null;
};

type Props = {
  trip: TripRow;
  operationsSync: OperationsSyncState;
};

function inr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function km(v: number | null | undefined): string {
  if (!Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
}

function healthTone(state: "healthy" | "attention" | "at_risk", isDark: boolean) {
  if (state === "healthy") {
    return {
      bg: isDark ? "rgba(16,185,129,0.14)" : Theme.positiveMuted,
      border: isDark ? Theme.driverEmeraldBorder : Theme.positive,
      text: Theme.driverEmerald,
    };
  }
  if (state === "attention") {
    return {
      bg: isDark ? "rgba(251,191,36,0.12)" : "#fff7ed",
      border: isDark ? "rgba(251,191,36,0.35)" : "#fed7aa",
      text: "#d97706",
    };
  }
  return {
    bg: isDark ? "rgba(248,113,113,0.12)" : "#fef2f2",
    border: isDark ? "rgba(248,113,113,0.35)" : "#fecaca",
    text: Theme.negative,
  };
}

type QuickAction = {
  key: string;
  label: string;
  sub: string;
  icon: typeof Fuel;
  onPress: () => void;
  primary?: boolean;
  hidden?: boolean;
};

export function DriverTripOperationsTab({ trip, operationsSync }: Props) {
  const router = useRouter();
  const colors = useDriverThemeColors();
  const { theme } = useDriverTheme();
  const isDark = theme === "dark";

  const tripHref = (path: string) =>
    `/trip/${encodeURIComponent(trip.id)}/operations/${path}` as Href;
  const verificationHref = (side: "start" | "end") =>
    `/trip/${encodeURIComponent(trip.id)}/verification?side=${side}` as Href;

  const snapshot = toVerificationSnapshot(trip);
  const capabilities = getTripOperationalCapabilities(trip);
  const health = deriveOperationalHealth(trip);
  const healthColors = healthTone(health.state, isDark);
  const summaryQuery = useTripOperationsSummary(trip.id);

  const metrics = useMemo(() => {
    if (!summaryQuery.data) return null;
    return toOperationsDisplayMetrics(summaryQuery.data.mileage);
  }, [summaryQuery.data]);

  const driverTheme: OperationsHubDriverTheme = useMemo(
    () => ({
      surface: colors.surface,
      surfaceElevated: colors.surfaceElevated,
      border: colors.border,
      text: colors.text,
      textMuted: colors.textMuted,
      emerald: colors.emerald,
      emeraldMuted: colors.emeraldMuted,
      emeraldDark: colors.emeraldDark,
      background: colors.background,
      isDark,
    }),
    [colors, isDark],
  );

  const syncLabel = operationsSync.isSyncing
    ? "Syncing"
    : operationsSync.lastResult?.failed
      ? `Retry (${operationsSync.lastResult.failed})`
      : operationsSync.lastResult?.processed
        ? `Posted ${operationsSync.lastResult.processed}`
        : "Live";

  const syncTone =
    operationsSync.isSyncing || operationsSync.lastResult?.failed
      ? { dot: Theme.warning, pillBg: isDark ? "rgba(251,191,36,0.14)" : "#fff7ed" }
      : { dot: colors.emerald, pillBg: isDark ? "rgba(16,185,129,0.14)" : colors.emeraldMuted };

  const distanceKm =
    summaryQuery.data?.mileage.distanceKm ??
    snapshot.odometerDistanceKm ??
    (trip.distance != null ? Number(trip.distance) : null);
  const fuelSpend = summaryQuery.data?.mileage.totalFuelSpendInr ?? 0;
  const tollSpend = summaryQuery.data?.mileage.totalTollSpendInr ?? 0;

  const quickActions: QuickAction[] = [
    {
      key: "fuel",
      label: "Fuel",
      sub: capabilities.canTrackFuel ? "Log fill-up" : "Notes",
      icon: Fuel,
      onPress: () => router.push(tripHref("fuel")),
      primary: true,
      hidden: false,
    },
    {
      key: "toll",
      label: "Toll",
      sub: "Add toll",
      icon: Receipt,
      onPress: () => router.push(tripHref("toll")),
    },
    {
      key: "expenses",
      label: "Expenses",
      sub: "All costs",
      icon: Activity,
      onPress: () => router.push(tripHref("expenses")),
    },
    {
      key: "start",
      label: "Start KM",
      sub: "Odometer",
      icon: Gauge,
      onPress: () => router.push(verificationHref("start")),
    },
    {
      key: "end",
      label: "End KM",
      sub: "Odometer",
      icon: MapPin,
      onPress: () => router.push(verificationHref("end")),
    },
    {
      key: "route",
      label: "Route",
      sub: capabilities.isAssetTrip ? "Asset trip" : "Coordination",
      icon: Route,
      onPress: () => router.push(tripHref("expenses")),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.heroOuter}>
        <LinearGradient
          colors={isDark ? ["#0f172a", "#020617"] : ["#0f172a", "#1e293b"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Route
            size={96}
            color="rgba(255,255,255,0.06)"
            style={styles.heroWatermark}
          />
          <View style={styles.heroTop}>
            <View style={styles.heroIconWrap}>
              <Activity size={18} color={colors.emerald} strokeWidth={2.4} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroKicker}>Trip operations</Text>
              <Text style={styles.heroTitle}>
                {capabilities.isAssetTrip ? "Asset manifest" : "Coordination"}
              </Text>
              <Text style={styles.heroSub}>
                Fuel, toll, mileage & verification for this trip
              </Text>
            </View>
            <View style={[styles.syncPill, { backgroundColor: syncTone.pillBg }]}>
              <View style={[styles.syncDot, { backgroundColor: syncTone.dot }]} />
              <Text style={[styles.syncPillText, { color: colors.emerald }]}>{syncLabel}</Text>
            </View>
          </View>
          <View style={styles.heroFooter}>
            <VerificationStatusChip state={snapshot.state} />
            <Text style={styles.heroStatus}>
              {String(trip.status ?? "—").replaceAll("_", " ")}
            </Text>
          </View>
          <View style={[styles.heroAccent, { backgroundColor: colors.emerald }]} />
        </LinearGradient>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metricScroll}
      >
        <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Distance</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {summaryQuery.isLoading ? "…" : km(distanceKm)}
          </Text>
        </View>
        <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Fuel</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {summaryQuery.isLoading
              ? "…"
              : capabilities.canTrackFuel
                ? inr(fuelSpend)
                : "—"}
          </Text>
        </View>
        <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Toll</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {summaryQuery.isLoading ? "…" : inr(tollSpend)}
          </Text>
        </View>
        <View style={[styles.metricTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Efficiency</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {capabilities.canTrackMileage ? metrics?.efficiencyLabel ?? "—" : "N/A"}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.healthCard,
          {
            backgroundColor: healthColors.bg,
            borderColor: healthColors.border,
          },
        ]}
      >
        <View style={styles.healthRow}>
          <Zap size={14} color={healthColors.text} />
          <Text style={[styles.healthTitle, { color: healthColors.text }]}>
            {health.state.replaceAll("_", " ")}
          </Text>
          <Text style={[styles.healthSpend, { color: colors.textMuted }]}>
            {metrics?.totalOpsSpendLabel ? `Ops ${metrics.totalOpsSpendLabel}` : ""}
          </Text>
        </View>
        <Text style={[styles.healthMessage, { color: colors.text }]}>{health.message}</Text>
      </View>

      <View style={td.tdTimelineHeader}>
        <View style={[td.tdTimelineHeaderIcon, { backgroundColor: isDark ? colors.surfaceElevated : "#0f172a" }]}>
          <Fuel size={13} color={isDark ? colors.emerald : "#fff"} />
        </View>
        <Text style={[td.tdTimelineHeaderTitle, { color: colors.textMuted }]}>Quick log</Text>
      </View>

      <View style={styles.actionGrid}>
        {quickActions.map((action) => {
          const Icon = action.icon;
          const isPrimary = action.primary;
          return (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.actionTile,
                {
                  backgroundColor: isPrimary ? colors.emeraldMuted : colors.surface,
                  borderColor: isPrimary ? colors.emeraldBorder : colors.border,
                },
              ]}
              onPress={action.onPress}
              activeOpacity={0.82}
            >
              <View
                style={[
                  styles.actionIconCircle,
                  {
                    backgroundColor: isPrimary
                      ? `${colors.emerald}22`
                      : isDark
                        ? colors.surfaceElevated
                        : "#f1f5f9",
                  },
                ]}
              >
                <Icon size={18} color={isPrimary ? colors.emerald : colors.text} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{action.label}</Text>
              <Text style={[styles.actionSub, { color: colors.textMuted }]}>{action.sub}</Text>
              <ChevronRight
                size={12}
                color={colors.textMuted}
                style={styles.actionChevron}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={td.tdTimelineHeader}>
        <View style={[td.tdTimelineHeaderIcon, { backgroundColor: isDark ? colors.surfaceElevated : "#0f172a" }]}>
          <Activity size={13} color={isDark ? colors.emerald : "#fff"} />
        </View>
        <Text style={[td.tdTimelineHeaderTitle, { color: colors.textMuted }]}>
          Ledger & activity
        </Text>
      </View>

      <OperationsHub
        trip={trip}
        variant="driver"
        driverTheme={driverTheme}
        hideHeader
        onEditStart={() => router.push(verificationHref("start"))}
        onEditEnd={() => router.push(verificationHref("end"))}
        onAddFuel={() => router.push(tripHref("fuel"))}
        onAddToll={() => router.push(tripHref("toll"))}
        onOpenExpenses={() => router.push(tripHref("expenses"))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  heroOuter: {
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      default: { elevation: 4 },
    }),
  },
  heroCard: {
    borderRadius: 16,
    padding: 14,
    minHeight: 118,
    overflow: "hidden",
  },
  heroWatermark: {
    position: "absolute",
    right: -8,
    top: -12,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroKicker: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.driverPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
  },
  heroSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
    lineHeight: 14,
  },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 100,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncPillText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 8,
  },
  heroStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroAccent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
  metricScroll: {
    gap: 8,
    paddingRight: 4,
  },
  metricTile: {
    minWidth: 108,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  healthCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  healthTitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  healthSpend: {
    fontSize: 9,
    fontWeight: "700",
  },
  healthMessage: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionTile: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    minHeight: 88,
    position: "relative",
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  actionSub: {
    fontSize: 9,
    fontWeight: "600",
    marginTop: 2,
  },
  actionChevron: {
    position: "absolute",
    right: 10,
    top: 12,
  },
});
