/**
 * Business Trip Stages — Operations Control Panel for an active trip.
 *
 * Powered by the shared stage engine, not its own logic:
 *   - deriveTripStage(trip) + getStageMetadata(stage)  (features/trips/domain)
 *   - useTripTimelineQuery                             (Phase 3 event timeline)
 *   - useTripDriverPresenceQuery                        (live GPS/speed/heading)
 *
 * Every metric shown here has a real data source. Traffic, warehouse contact,
 * loading status, delay-vs-schedule, receiver, and stops-remaining are
 * deliberately omitted — none are instrumented yet, and this panel does not
 * synthesize values for them. When those capabilities exist, add a metric
 * here; don't invent one now.
 *
 * Map is not wired here: this panel only exposes the stage's `target`
 * (pickup | drop) via getStageMetadata, for whichever map component the
 * caller places alongside it to consume — building a new stage-aware map
 * surface is out of scope for this pass.
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { formatTime } from "@/lib/format";
import { useTripTimelineQuery } from "@/lib/queries/useTripTimelineQuery";
import { useTripDriverPresenceQuery } from "@/lib/queries/useTripDriverPresenceQuery";
import {
  deriveTripStage,
  getStageMetadata,
  getTripStopCoordinate,
  distanceMeters,
  formatRoadDistanceM,
} from "@/features/trips/domain";
import type {
  TripTimelineEvent,
  TripTimelineEventType,
} from "@/features/trips/domain/tripTimeline";
import type { TripRow } from "../../services/trips.service";

export interface TripStageControlPanelProps {
  trip: TripRow;
  driverName?: string | null;
  vehicleLabel?: string | null;
}

const STAGE_COLOR: Record<string, string> = {
  info: Theme.driverPrimary,
  warning: Theme.warning,
  progress: Theme.accentGold,
  success: Theme.success,
};

/** Which timeline event marks the moment the current stage began. */
const STAGE_ENTRY_EVENT: Record<string, TripTimelineEventType | undefined> = {
  accepted: "driver_accepted",
  pickup: "entered_pickup",
  transit: "exited_pickup",
  reached: "entered_drop",
  completed: "completed",
};

function elapsedLabel(fromIso: string, nowMs: number): string {
  const fromMs = new Date(fromIso).getTime();
  if (!Number.isFinite(fromMs)) return "—";
  const totalMin = Math.max(0, Math.round((nowMs - fromMs) / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function agoLabel(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const sec = Math.max(0, Math.round((nowMs - then) / 1000));
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.round(sec / 60);
  return `${min} min ago`;
}

function findLatestEventOfType(
  events: TripTimelineEvent[],
  type: TripTimelineEventType,
): TripTimelineEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return events[i];
  }
  return null;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function TripStageControlPanel({
  trip,
  driverName,
  vehicleLabel,
}: TripStageControlPanelProps) {
  const nowMs = Date.now();
  const stage = deriveTripStage(trip);
  const meta = getStageMetadata(stage === "lr" ? "pickup" : stage);
  const color = STAGE_COLOR[meta.color] ?? Theme.driverPrimary;

  const { events: timeline } = useTripTimelineQuery(trip.id ?? null, trip.created_at ?? null);
  const { presence } = useTripDriverPresenceQuery(trip.id ?? null);

  const lastEvent = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  const stageEntryEvent = STAGE_ENTRY_EVENT[meta.stage];
  const stageStartedAt = stageEntryEvent
    ? findLatestEventOfType(timeline, stageEntryEvent)?.occurredAt ?? null
    : null;

  const currentObjectiveLabel =
    meta.target === "pickup"
      ? trip.pickup_area?.trim() || "Pickup"
      : meta.target === "drop"
        ? trip.drop_location?.trim() || "Drop"
        : "—";

  const distanceToTargetLabel = useMemo(() => {
    if (!meta.target || !presence) return "—";
    const stop = getTripStopCoordinate(trip, meta.target);
    if (!stop) return "—";
    const m = distanceMeters(presence.latitude, presence.longitude, stop.latitude, stop.longitude);
    return `${formatRoadDistanceM(m)} (straight-line)`;
  }, [meta.target, presence, trip]);

  const podEvent = findLatestEventOfType(timeline, "pod_uploaded");
  const completedEvent = findLatestEventOfType(timeline, "completed");

  return (
    <View style={styles.wrapper}>
      {/* Stage header */}
      <View style={[styles.headerCard, { borderColor: color }]}>
        <View style={styles.stageBadgeRow}>
          <FontAwesome name={meta.icon} size={14} color={color} style={styles.stageIcon} />
          <Text style={[styles.stageTitle, { color }]}>{meta.title}</Text>
        </View>
        <View style={styles.headerGrid}>
          <View style={styles.headerCell}>
            <Text style={styles.headerLabel}>Current Objective</Text>
            <Text style={styles.headerValue} numberOfLines={1}>{currentObjectiveLabel}</Text>
          </View>
          <View style={styles.headerCell}>
            <Text style={styles.headerLabel}>Current Stage Time</Text>
            <Text style={styles.headerValue}>
              {stageStartedAt ? elapsedLabel(stageStartedAt, nowMs) : "—"}
            </Text>
          </View>
        </View>
        <View style={styles.headerGrid}>
          <View style={styles.headerCell}>
            <Text style={styles.headerLabel}>Last Event</Text>
            <Text style={styles.headerValue} numberOfLines={1}>
              {lastEvent ? `${lastEvent.title} • ${formatTime(lastEvent.occurredAt)}` : "—"}
            </Text>
          </View>
          <View style={styles.headerCell}>
            <Text style={styles.headerLabel}>Next Expected</Text>
            <Text style={styles.headerValue} numberOfLines={1}>{meta.nextExpected}</Text>
          </View>
        </View>
      </View>

      {/* Live progress — stage-specific, real data only */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>LIVE PROGRESS</Text>
        {(meta.stage === "accepted" || meta.stage === "transit") && (
          <>
            <MetricRow
              label={meta.stage === "accepted" ? "Distance to pickup" : "Distance remaining"}
              value={distanceToTargetLabel}
            />
            <MetricRow label="GPS freshness" value={agoLabel(presence?.recorded_at, nowMs)} />
            <MetricRow
              label="Driver speed"
              value={presence?.speed_kmh != null ? `${Math.round(presence.speed_kmh)} km/h` : "—"}
            />
          </>
        )}
        {meta.stage === "pickup" && (
          <MetricRow
            label="Time at pickup"
            value={stageStartedAt ? elapsedLabel(stageStartedAt, nowMs) : "—"}
          />
        )}
        {meta.stage === "reached" && (
          <>
            <MetricRow
              label="Time at drop"
              value={stageStartedAt ? elapsedLabel(stageStartedAt, nowMs) : "—"}
            />
            <MetricRow label="POD" value={podEvent ? `Uploaded • ${formatTime(podEvent.occurredAt)}` : "Pending"} />
          </>
        )}
        {meta.stage === "completed" && (
          <>
            <MetricRow label="POD" value={podEvent ? `Uploaded • ${formatTime(podEvent.occurredAt)}` : "—"} />
            <MetricRow
              label="Completion time"
              value={completedEvent ? formatTime(completedEvent.occurredAt) : "—"}
            />
          </>
        )}
      </View>

      {/* Driver card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>DRIVER</Text>
        <View style={styles.driverRow}>
          <Text style={styles.driverName} numberOfLines={1}>
            {driverName ?? trip.driver_display_name ?? "—"}
          </Text>
          {presence && Date.now() - new Date(presence.recorded_at).getTime() < 5 * 60_000 ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <MetricRow label="Last GPS" value={agoLabel(presence?.recorded_at, nowMs)} />
        <MetricRow
          label="Speed"
          value={presence?.speed_kmh != null ? `${Math.round(presence.speed_kmh)} km/h` : "—"}
        />
        <MetricRow
          label="Heading"
          value={presence?.heading != null ? `${Math.round(presence.heading)}°` : "—"}
        />
        <MetricRow label="Vehicle" value={vehicleLabel ?? "—"} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: "stretch", gap: 12 },
  headerCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Theme.darkBackground,
  },
  stageBadgeRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  stageIcon: { marginRight: 8 },
  stageTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  headerGrid: { flexDirection: "row", marginBottom: 10 },
  headerCell: { flex: 1, minWidth: 0 },
  headerLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  headerValue: { fontSize: 13, fontWeight: "600", color: Theme.textOnDark },
  card: {
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Theme.darkBackground,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  metricLabel: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  metricValue: { fontSize: 12, fontWeight: "700", color: Theme.textOnDark },
  driverRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  driverName: { fontSize: 14, fontWeight: "700", color: Theme.textOnDark, flexShrink: 1, marginRight: 8 },
  liveBadge: {
    backgroundColor: Theme.success,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveBadgeText: { fontSize: 9, fontWeight: "800", color: Theme.textOnPrimary, letterSpacing: 0.5 },
});
