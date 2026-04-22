/**
 * Right-column Trip Status Timeline — matches reference design.
 * 8-stage logistics timeline: Confirmed → S-in → S-out → Intransit →
 *   D-in → D-out → POD Pending → POD Received
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";

// ── Stage definitions ──────────────────────────────────────────────────────

export type TripStageKey =
  | "confirmed"
  | "s_in"
  | "s_out"
  | "intransit"
  | "d_in"
  | "d_out"
  | "pod_pending"
  | "pod_received";

export interface TripStageTimestamp {
  stageKey: TripStageKey;
  timestamp: string;
  location?: string;
}

const STAGES: { key: TripStageKey; short: string; full: string }[] = [
  { key: "confirmed", short: "Confirmed", full: "Confirmed" },
  { key: "s_in", short: "S-in 1", full: "Source In" },
  { key: "s_out", short: "S-out 1", full: "Source Out" },
  { key: "intransit", short: "Intransit", full: "In Transit" },
  { key: "d_in", short: "D-in 1", full: "Destination In" },
  { key: "d_out", short: "D-out 1", full: "Destination Out" },
  { key: "pod_pending", short: "POD Pending", full: "POD Pending" },
  { key: "pod_received", short: "POD Received", full: "POD Received" },
];

/** Map raw trip.status to the closest TripStageKey */
export function statusToStageIndex(status: string): number {
  const s = (status ?? "").toLowerCase();
  if (s === "pod_received" || s === "pod received") return 7;
  if (s === "pod_pending" || s === "pod pending") return 6;
  if (s === "d_out" || s === "destination_out") return 5;
  if (
    s === "d_in" ||
    s === "destination_in" ||
    s === "arrived" ||
    s === "at_destination" ||
    s === "at_drop"
  )
    return 4;
  if (s === "in_progress" || s === "in_transit" || s === "intransit") return 3;
  if (s === "s_out" || s === "source_out" || s === "picked_up" || s === "dispatched")
    return 2;
  if (s === "s_in" || s === "source_in") return 1;
  if (s === "completed" || s === "delivered" || s === "done") return 7;
  return 0;
}

const PROGRESS_BY_INDEX: number[] = [6, 14, 22, 36, 44, 58, 78, 100];

interface TripStatusTimelineProps {
  trip: TripRow;
  stageTimestamps?: TripStageTimestamp[];
  stageLocations?: Partial<Record<TripStageKey, string>>;
  lastUpdatedAt?: string | null;
  onRevert?: () => void;
  onNext?: () => void;
  canAdvance?: boolean;
  mapPreview?: React.ReactNode;
  distanceKm?: string | null;
}

export function TripStatusTimeline({
  trip,
  stageTimestamps = [],
  stageLocations = {},
  lastUpdatedAt,
  onRevert,
  onNext,
  canAdvance = false,
  mapPreview,
  distanceKm,
}: TripStatusTimelineProps) {
  const activeIdx = statusToStageIndex(trip.status ?? "");
  const progress = PROGRESS_BY_INDEX[activeIdx] ?? 0;
  const currentStage = STAGES[activeIdx];

  const prevStage = activeIdx > 0 ? STAGES[activeIdx - 1] : null;
  const nextStage = activeIdx < STAGES.length - 1 ? STAGES[activeIdx + 1] : null;

  const tsMap: Partial<Record<TripStageKey, TripStageTimestamp>> = {};
  for (const ts of stageTimestamps) tsMap[ts.stageKey] = ts;

  if (!tsMap.confirmed) {
    const d = trip.pickup_date ?? trip.created_at;
    if (d) tsMap.confirmed = { stageKey: "confirmed", timestamp: d };
  }
  if (!tsMap.intransit && trip.started_at) {
    tsMap.intransit = { stageKey: "intransit", timestamp: trip.started_at };
  }
  if (!tsMap.pod_received && trip.completed_at) {
    tsMap.pod_received = { stageKey: "pod_received", timestamp: trip.completed_at };
  }

  const lastUpdatedStr = lastUpdatedAt
    ? formatLastUpdated(lastUpdatedAt)
    : trip.updated_at
      ? formatLastUpdated(trip.updated_at)
      : null;

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.activeDotWrap}>
            <View style={styles.activeDot} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Live Status</Text>
            <View style={styles.currentRow}>
              <Text style={styles.currentLabel}>Currently: </Text>
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>{currentStage.short}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.progressWrap}>
          <Text style={styles.progressLabel}>Progress</Text>
          <CircularProgress percent={progress} />
        </View>
      </View>

      {/* Timeline stepper */}
      <View style={styles.timelineScroll}>
        <View style={styles.stepsRow}>
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < activeIdx;
            const isActive = idx === activeIdx;
            const ts = tsMap[stage.key];
            const loc =
              stageLocations[stage.key] ??
              ts?.location ??
              (idx === 0
                ? (trip.pickup_area ?? "").trim() || null
                : idx === 4 || idx === 5
                  ? (trip.drop_location ?? "").trim() || null
                  : null);

            return (
              <View key={stage.key} style={styles.stepWrap}>
                {idx > 0 && (
                  <View
                    style={[
                      styles.connectorLeft,
                      isCompleted || isActive ? styles.connectorActive : styles.connectorLight,
                    ]}
                  />
                )}

                <View
                  style={[
                    styles.dot,
                    isCompleted && styles.dotCompleted,
                    isActive && styles.dotActive,
                    !isCompleted && !isActive && styles.dotPending,
                  ]}
                >
                  {isCompleted && (
                    <FontAwesome name="check" size={10} color="#fff" />
                  )}
                  {isActive && <View style={styles.dotActiveFill} />}
                </View>

                {idx < STAGES.length - 1 && (
                  <View
                    style={[
                      styles.connectorRight,
                      isCompleted ? styles.connectorActive : styles.connectorLight,
                    ]}
                  />
                )}

                <View style={styles.stepLabelWrap}>
                  <Text
                    style={[
                      styles.stepLabel,
                      isActive && styles.stepLabelActive,
                      isCompleted && styles.stepLabelCompleted,
                    ]}
                    numberOfLines={1}
                  >
                    {stage.short}
                  </Text>
                  {ts ? (
                    <Text style={styles.stepDate} numberOfLines={1}>
                      {formatStageDate(ts.timestamp)}
                    </Text>
                  ) : null}
                  {loc ? (
                    <Text style={styles.stepLocation} numberOfLines={1}>
                      {loc}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Footer row */}
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <FontAwesome name="refresh" size={11} color="#94a3b8" />
          <Text style={styles.lastUpdatedText}>
            {lastUpdatedStr ? `Updated: ${lastUpdatedStr}` : "Updated: Just now"}
          </Text>
        </View>
        <View style={styles.footerActions}>
          {prevStage && onRevert ? (
            <TouchableOpacity
              style={styles.revertBtn}
              onPress={onRevert}
              activeOpacity={0.8}
            >
              <FontAwesome name="arrow-left" size={10} color="#374151" />
              <Text style={styles.revertBtnText}>Revert</Text>
            </TouchableOpacity>
          ) : null}
          {nextStage && canAdvance ? (
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={onNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextBtnText}>Advance Trip</Text>
              <FontAwesome name="arrow-right" size={11} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Map preview */}
      <View style={styles.mapSection}>
        <View style={styles.mapHeader}>
          <View style={styles.mapTitleRow}>
            <FontAwesome name="map-marker" size={13} color="#3b82f6" />
            <Text style={styles.mapTitle}>GPS Tracking</Text>
          </View>
          {distanceKm ? (
            <View style={styles.mapDistanceWrap}>
              <Text style={styles.mapDistance}>{distanceKm} <Text style={styles.mapDistanceUnit}>km</Text></Text>
              <Text style={styles.mapRoute}>Direct route</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.mapContainer}>
          {mapPreview ?? <MapPlaceholder />}
        </View>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CircularProgress({ percent }: { percent: number }) {
  return (
    <View style={styles.circleOuter}>
      <Text style={styles.circleText}>{percent}%</Text>
    </View>
  );
}

function MapPlaceholder() {
  return (
    <View style={styles.mapPlaceholder}>
      <FontAwesome name="map" size={32} color="#d1d5db" />
      <Text style={styles.mapPlaceholderText}>Map preview</Text>
    </View>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatStageDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatLastUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso.slice(0, 16);
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const DOT = 30;
const CONN_H = 2;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },

  // Header
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  activeDotWrap: {
    marginTop: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3b82f6",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  currentLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  currentBadge: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563eb",
  },

  progressWrap: {
    alignItems: "flex-end",
    gap: 4,
  },
  progressLabel: {
    fontSize: 9,
    color: "#94a3b8",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
  },
  circleOuter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  circleText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1e293b",
  },

  // Timeline stepper
  timelineScroll: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    overflow: Platform.OS === "web" ? ("auto" as any) : "scroll",
  },
  stepWrap: {
    flex: 1,
    alignItems: "center",
    minWidth: 64,
  },
  connectorLeft: {
    position: "absolute",
    top: DOT / 2 - CONN_H / 2,
    left: 0,
    right: "50%",
    height: CONN_H,
  },
  connectorRight: {
    position: "absolute",
    top: DOT / 2 - CONN_H / 2,
    left: "50%",
    right: 0,
    height: CONN_H,
  },
  connectorActive: {
    backgroundColor: "#2563eb",
  },
  connectorLight: {
    backgroundColor: "#e2e8f0",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    backgroundColor: "#fff",
  },
  dotCompleted: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  dotActive: {
    borderColor: "#2563eb",
    borderWidth: 2.5,
    backgroundColor: "#fff",
  },
  dotPending: {
    borderColor: "#e2e8f0",
  },
  dotActiveFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2563eb",
  },
  stepLabelWrap: {
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 2,
    width: "100%",
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#0f172a",
    fontWeight: "700",
  },
  stepLabelCompleted: {
    color: "#475569",
    fontWeight: "600",
  },
  stepDate: {
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 2,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  stepLocation: {
    fontSize: 9,
    color: "#64748b",
    textAlign: "center",
    marginTop: 2,
    fontWeight: "500",
  },

  // Footer
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexWrap: "wrap",
    gap: 8,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  lastUpdatedText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
  },
  footerActions: {
    flexDirection: "row",
    gap: 8,
  },
  revertBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  revertBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  nextBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Map
  mapSection: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  mapTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  mapTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  mapDistanceWrap: {
    alignItems: "flex-end",
  },
  mapDistance: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  mapDistanceUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
  },
  mapRoute: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 1,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  mapContainer: {
    minHeight: 220,
    overflow: "hidden",
  },
  mapPlaceholder: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 12,
    color: "#d1d5db",
  },
});
