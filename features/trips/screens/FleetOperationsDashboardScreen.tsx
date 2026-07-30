/**
 * Operations Dashboard — the fleet-wide consumer of the platform built this
 * session. Every view here reads useFleetOperationsQuery(); nothing on this
 * screen re-derives stage, timing, or alert logic.
 *
 * Scope, matching what was asked: active critical alerts, pickup-dwell
 * exceeded, long-running transit, stale-location trips, a fleet-wide stage
 * distribution, and per-alert recommended actions. Not built: notification
 * delivery, alert persistence, background schedulers, SLA configuration —
 * those are infrastructure around this dashboard, not part of it.
 *
 * Alert actions are metadata from getAlertActions(), not a workflow engine.
 * Only "Open Trip" (navigate) and "Call Driver" (when a phone number exists)
 * are wired to real capabilities. "Message Driver"/"Notify Customer"/
 * "Escalate" render as recommended-but-unavailable: shown so the intended
 * design is visible, but inert, because no trip-specific dispatcher chat
 * deep-link, customer notification, or escalation workflow exists yet.
 */
import { useMemo } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  useFleetOperationsQuery,
  type FleetTripOperations,
} from "@/lib/queries/useFleetOperationsQuery";
import {
  getStageMetadata,
  getAlertActions,
  ALERT_ACTION_CAPABILITIES,
  type TripStage,
  type OperationalAlert,
  type AlertAction,
  type JourneyMetrics,
  type JourneyHealth,
} from "@/features/trips/domain";

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDurationSigned(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const label = days > 0 ? `${days}d ${hours}h` : `${hours}h ${totalMin % 60}m`;
  return ms > 0 ? `+${label}` : `-${label}`;
}

function formatEta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const JOURNEY_HEALTH_BADGE: Record<JourneyHealth, { emoji: string; label: string; color: string }> = {
  healthy: { emoji: "🟢", label: "Healthy", color: Theme.success },
  watch: { emoji: "🟡", label: "Watch", color: Theme.accentGold },
  delayed: { emoji: "🟠", label: "Delayed", color: Theme.warning },
  critical: { emoji: "🔴", label: "Critical", color: Theme.negative },
};

function JourneyHealthCard({
  item,
  journeyMetrics,
}: {
  item: FleetTripOperations;
  journeyMetrics: JourneyMetrics;
}) {
  const router = useRouter();
  const badge = JOURNEY_HEALTH_BADGE[journeyMetrics.health];
  const coveredPct = Math.round(
    (journeyMetrics.completedDistanceKm / journeyMetrics.routeDistanceKm) * 100,
  );
  const alert = item.alerts.find((a) => a.id === "journey_behind_schedule");
  const actions = alert ? getAlertActions(alert) : [];

  return (
    <TouchableOpacity
      style={[styles.journeyCard, { borderColor: badge.color }]}
      activeOpacity={0.85}
      onPress={() => router.push(ROUTES.tripDetail(item.trip.id))}
    >
      <View style={styles.journeyHeadRow}>
        <Text style={styles.journeyTripTitle} numberOfLines={1}>
          {item.trip.trip_number || item.trip.id}
        </Text>
        <Text style={[styles.journeyHealthBadge, { color: badge.color }]}>
          {badge.emoji} {badge.label}
        </Text>
      </View>
      <View style={styles.journeyGrid}>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Distance</Text>
          <Text style={styles.journeyValue}>{formatKmValue(journeyMetrics.routeDistanceKm)}</Text>
        </View>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Covered</Text>
          <Text style={styles.journeyValue}>
            {formatKmValue(journeyMetrics.completedDistanceKm)} ({coveredPct}%)
          </Text>
        </View>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Remaining</Text>
          <Text style={styles.journeyValue}>{formatKmValue(journeyMetrics.remainingDistanceKm)}</Text>
        </View>
      </View>
      <View style={styles.journeyGrid}>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Expected ETA</Text>
          <Text style={styles.journeyValue}>{formatEta(journeyMetrics.expectedArrival)}</Text>
        </View>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Updated ETA</Text>
          <Text style={styles.journeyValue}>{formatEta(journeyMetrics.predictedArrival)}</Text>
        </View>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Delay</Text>
          <Text style={[styles.journeyValue, journeyMetrics.delayMs && journeyMetrics.delayMs > 0 ? styles.journeyValueBad : null]}>
            {journeyMetrics.delayMs != null ? formatDurationSigned(journeyMetrics.delayMs) : "—"}
          </Text>
        </View>
      </View>
      <View style={styles.journeyGrid}>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Average Pace</Text>
          <Text style={styles.journeyValue}>{Math.round(journeyMetrics.actualPaceKmPerDay)} km/day</Text>
        </View>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Expected Pace</Text>
          <Text style={styles.journeyValue}>
            {Math.round(journeyMetrics.expectedPaceKmPerDay)} km/day
            {!journeyMetrics.expectedPaceIsEstimateBased ? " *" : ""}
          </Text>
        </View>
        <View style={styles.journeyCell}>
          <Text style={styles.journeyLabel}>Last GPS</Text>
          <Text style={styles.journeyValue}>
            {item.presence ? formatAgoLabel(item.presence.recorded_at) : "—"}
          </Text>
        </View>
      </View>
      {!journeyMetrics.expectedPaceIsEstimateBased ? (
        <Text style={styles.journeyFootnote}>
          * No trip ETA on file — expected pace uses a {Math.round(journeyMetrics.expectedPaceKmPerDay)} km/day default assumption, not this trip's own estimate.
        </Text>
      ) : null}
      {actions.length > 0 ? (
        <AlertActionButtons actions={actions} tripId={item.trip.id} driverPhone={item.driverPhone} />
      ) : null}
    </TouchableOpacity>
  );
}

function formatKmValue(km: number): string {
  return `${Math.round(km).toLocaleString("en-IN")} km`;
}

function formatAgoLabel(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} hr ago`;
}

const STAGE_COLOR: Record<string, string> = {
  info: Theme.driverPrimary,
  warning: Theme.warning,
  progress: Theme.accentGold,
  success: Theme.success,
};

const STAGE_ORDER: Exclude<TripStage, "lr">[] = ["accepted", "pickup", "transit", "reached", "completed"];

function AlertActionButtons({
  actions,
  tripId,
  driverPhone,
}: {
  actions: AlertAction[];
  tripId: string;
  driverPhone: string | null;
}) {
  const router = useRouter();

  return (
    <View style={styles.actionRow}>
      {actions.map((action) => {
        if (action.kind === "navigate") {
          return (
            <TouchableOpacity
              key={action.id}
              style={styles.actionBtn}
              activeOpacity={0.8}
              onPress={(e) => {
                e.stopPropagation();
                router.push(ROUTES.tripDetail(tripId));
              }}
            >
              <Text style={styles.actionBtnText}>{action.label}</Text>
            </TouchableOpacity>
          );
        }
        if (action.kind === "call") {
          if (!driverPhone) {
            return (
              <View key={action.id} style={styles.actionBtnDisabled}>
                <Text style={styles.actionBtnDisabledText}>{action.label} (no phone on file)</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={action.id}
              style={styles.actionBtn}
              activeOpacity={0.8}
              onPress={(e) => {
                e.stopPropagation();
                Linking.openURL(`tel:${driverPhone}`);
              }}
            >
              <Text style={styles.actionBtnText}>{action.label}</Text>
            </TouchableOpacity>
          );
        }
        // message / notify / escalate: recommended, not yet wired to a real capability.
        // See ALERT_ACTION_CAPABILITIES for exactly what unlocks each one.
        const capability = ALERT_ACTION_CAPABILITIES[action.kind];
        return (
          <View
            key={action.id}
            style={styles.actionBtnDisabled}
            accessibilityHint={capability.requires}
          >
            <Text style={styles.actionBtnDisabledText}>🚧 {action.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TripRowItem({
  item,
  detail,
  primaryAlert,
}: {
  item: FleetTripOperations;
  detail?: string;
  primaryAlert?: OperationalAlert;
}) {
  const router = useRouter();
  const meta = getStageMetadata(item.stage === "lr" ? "pickup" : item.stage);
  const actions = primaryAlert ? getAlertActions(primaryAlert) : null;

  return (
    <TouchableOpacity
      style={styles.tripRow}
      activeOpacity={0.8}
      onPress={() => router.push(ROUTES.tripDetail(item.trip.id))}
    >
      <View style={styles.tripRowHead}>
        <View style={[styles.tripRowStageDot, { backgroundColor: STAGE_COLOR[meta.color] }]} />
        <View style={styles.tripRowBody}>
          <Text style={styles.tripRowTitle} numberOfLines={1}>
            {item.trip.trip_number || item.trip.id}
          </Text>
          <Text style={styles.tripRowSubtitle} numberOfLines={1}>
            {item.trip.pickup_area?.trim() || "Pickup"} → {item.trip.drop_location?.trim() || "Drop"}
          </Text>
        </View>
        {detail ? <Text style={styles.tripRowDetail}>{detail}</Text> : null}
      </View>
      {actions ? (
        <AlertActionButtons actions={actions} tripId={item.trip.id} driverPhone={item.driverPhone} />
      ) : null}
    </TouchableOpacity>
  );
}

function Section({
  title,
  items,
  emptyLabel,
  detailFor,
  alertFor,
}: {
  title: string;
  items: FleetTripOperations[];
  emptyLabel: string;
  detailFor?: (item: FleetTripOperations) => string | undefined;
  alertFor?: (item: FleetTripOperations) => OperationalAlert | undefined;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} {items.length > 0 ? `(${items.length})` : ""}
      </Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : (
        items.map((item) => (
          <TripRowItem
            key={item.trip.id}
            item={item}
            detail={detailFor?.(item)}
            primaryAlert={alertFor?.(item)}
          />
        ))
      )}
    </View>
  );
}

export function FleetOperationsDashboardScreen() {
  const { currentOrganization } = useOrganization();
  const { trips, isLoading, error } = useFleetOperationsQuery(currentOrganization?.id ?? null);

  const criticalAlertTrips = useMemo(
    () => trips.filter((t) => t.alerts.some((a) => a.severity === "critical")),
    [trips],
  );
  const pickupDwellTrips = useMemo(
    () => trips.filter((t) => t.alerts.some((a) => a.id === "pickup_dwell_exceeded")),
    [trips],
  );
  const longTransitTrips = useMemo(
    () => trips.filter((t) => t.alerts.some((a) => a.id === "transit_unusually_long")),
    [trips],
  );
  const staleLocationTrips = useMemo(
    () => trips.filter((t) => t.alerts.some((a) => a.id === "no_location_updates")),
    [trips],
  );
  const journeyBehindScheduleTrips = useMemo(
    () => trips.filter((t) => t.journeyMetrics && (t.journeyMetrics.health === "delayed" || t.journeyMetrics.health === "critical")),
    [trips],
  );
  const stageDistribution = useMemo(() => {
    const counts = new Map<Exclude<TripStage, "lr">, number>();
    for (const stage of STAGE_ORDER) counts.set(stage, 0);
    for (const t of trips) {
      const stage = t.stage === "lr" ? "pickup" : t.stage;
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return STAGE_ORDER.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
  }, [trips]);

  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={Theme.driverPrimary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.errorText}>Couldn't load fleet operations right now.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.distributionCard}>
        <Text style={styles.sectionTitle}>FLEET STAGE DISTRIBUTION</Text>
        <View style={styles.distributionRow}>
          {stageDistribution.map(({ stage, count }) => {
            const meta = getStageMetadata(stage);
            return (
              <View key={stage} style={styles.distributionCell}>
                <Text style={[styles.distributionCount, { color: STAGE_COLOR[meta.color] }]}>
                  {count}
                </Text>
                <Text style={styles.distributionLabel} numberOfLines={1}>
                  {meta.title}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          JOURNEY HEALTH {journeyBehindScheduleTrips.length > 0 ? `(${journeyBehindScheduleTrips.length})` : ""}
        </Text>
        {journeyBehindScheduleTrips.length === 0 ? (
          <Text style={styles.emptyText}>No long-haul trips behind schedule.</Text>
        ) : (
          journeyBehindScheduleTrips.map((item) => (
            <JourneyHealthCard key={item.trip.id} item={item} journeyMetrics={item.journeyMetrics!} />
          ))
        )}
      </View>

      <Section
        title="ACTIVE CRITICAL ALERTS"
        items={criticalAlertTrips}
        emptyLabel="No critical alerts right now."
        detailFor={(item) => item.alerts.find((a) => a.severity === "critical")?.title}
        alertFor={(item) => item.alerts.find((a) => a.severity === "critical")}
      />

      <Section
        title="PICKUP DWELL EXCEEDED"
        items={pickupDwellTrips}
        emptyLabel="No trips lingering at pickup."
        detailFor={(item) =>
          item.metrics.pickupDwellDuration ? formatDuration(item.metrics.pickupDwellDuration.ms) : undefined
        }
        alertFor={(item) => item.alerts.find((a) => a.id === "pickup_dwell_exceeded")}
      />

      <Section
        title="LONG-RUNNING TRANSIT"
        items={longTransitTrips}
        emptyLabel="No unusually long transits."
        detailFor={(item) =>
          item.metrics.transitDuration ? formatDuration(item.metrics.transitDuration.ms) : undefined
        }
        alertFor={(item) => item.alerts.find((a) => a.id === "transit_unusually_long")}
      />

      <Section
        title="STALE LOCATION UPDATES"
        items={staleLocationTrips}
        emptyLabel="All active drivers reporting normally."
        alertFor={(item) => item.alerts.find((a) => a.id === "no_location_updates")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  content: { padding: 16, gap: 16 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 13, color: Theme.textMuted, textAlign: "center" },
  distributionCard: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Theme.surface,
  },
  distributionRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  distributionCell: { alignItems: "center", flex: 1 },
  distributionCount: { fontSize: 20, fontWeight: "800" },
  distributionLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    marginTop: 2,
    textAlign: "center",
  },
  section: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Theme.surface,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  emptyText: { fontSize: 12, color: Theme.textMuted, marginTop: 8 },
  tripRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
    marginTop: 8,
  },
  tripRowHead: { flexDirection: "row", alignItems: "center" },
  tripRowStageDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  tripRowBody: { flex: 1, minWidth: 0 },
  tripRowTitle: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  tripRowSubtitle: { fontSize: 10, color: Theme.textMuted, marginTop: 1 },
  tripRowDetail: { fontSize: 11, fontWeight: "700", color: Theme.warning, marginLeft: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 18 },
  actionBtn: {
    borderWidth: 1,
    borderColor: Theme.driverPrimary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionBtnText: { fontSize: 10, fontWeight: "700", color: Theme.driverPrimary },
  actionBtnDisabled: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    opacity: 0.5,
  },
  actionBtnDisabledText: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  journeyCard: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    backgroundColor: Theme.screenBackground,
  },
  journeyHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  journeyTripTitle: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1, marginRight: 8 },
  journeyHealthBadge: { fontSize: 11, fontWeight: "800" },
  journeyGrid: { flexDirection: "row", marginBottom: 6 },
  journeyCell: { flex: 1, minWidth: 0 },
  journeyLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  journeyValue: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  journeyValueBad: { color: Theme.warning },
  journeyFootnote: { fontSize: 9, color: Theme.textMuted, fontStyle: "italic", marginTop: 2, marginBottom: 6 },
});
