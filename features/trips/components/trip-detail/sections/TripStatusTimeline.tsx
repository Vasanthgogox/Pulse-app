/**
 * Trip status UI: default 8-stage stepper, or `journey` variant with a
 * 4-segment progress bar + OPEN MAPS (web trip detail reference).
 */
import Theme from "@/constants/Theme";
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
  return 0; // confirmed / assigned / draft
}

/** Merge coarse trip timestamps into stage index so the 4-segment bar reflects reality. */
function effectiveJourneyProgressIndex(trip: TripRow): number {
  let i = statusToStageIndex(trip.status ?? "");
  if (trip.completed_at) i = Math.max(i, 7);
  if (trip.started_at) i = Math.max(i, 3);
  if (trip.pickup_date && (trip.driver_id || trip.vehicle_display_number?.trim())) {
    i = Math.max(i, 1);
  }
  return Math.min(i, 7);
}

const PROGRESS_BY_INDEX: number[] = [6, 14, 22, 36, 44, 58, 78, 100];

interface TripStatusTimelineProps {
  trip: TripRow;
  /** Timestamps per stage — from audit log or trip fields */
  stageTimestamps?: TripStageTimestamp[];
  /** Location labels per stage (pickup/drop or geocoded) */
  stageLocations?: Partial<Record<TripStageKey, string>>;
  lastUpdatedAt?: string | null;
  onRevert?: () => void;
  onNext?: () => void;
  canAdvance?: boolean;
  /** Map child node (pass <LeafletMap> or <TrackingMapBlock>) */
  mapPreview?: React.ReactNode;
  distanceKm?: string | null;
  /**
   * `journey` — compact 4-segment progress bar + OPEN MAPS (reference UI).
   * `default` — full 8-stage stepper with timestamps.
   */
  variant?: "default" | "journey";
  /** Shown under the right side of the progress bar (e.g. driver name + rating). */
  driverSummaryText?: string | null;
  /** Opens external / fullscreen map when user taps OPEN MAPS. */
  onOpenMaps?: () => void;
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
  variant = "default",
  driverSummaryText,
  onOpenMaps,
}: TripStatusTimelineProps) {
  const activeIdx = statusToStageIndex(trip.status ?? "");
  const journeyIdx = effectiveJourneyProgressIndex(trip);
  const progress = PROGRESS_BY_INDEX[activeIdx] ?? 0;
  const currentStage = STAGES[activeIdx];

  const prevStage = activeIdx > 0 ? STAGES[activeIdx - 1] : null;
  const nextStage = activeIdx < STAGES.length - 1 ? STAGES[activeIdx + 1] : null;

  /** Four macro segments: pickup (0–1), linehaul (2–3), destination (4–5), POD (6–7). */
  const segmentFilled = (segmentIndex: number) => {
    const idx = variant === "journey" ? journeyIdx : activeIdx;
    if (segmentIndex === 3) return idx >= 7;
    return idx >= segmentIndex * 2 + 2;
  };
  const firstMacroComplete = segmentFilled(0);

  const tsMap: Partial<Record<TripStageKey, TripStageTimestamp>> = {};
  for (const ts of stageTimestamps) tsMap[ts.stageKey] = ts;

  // Auto-fill from trip fields
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
      {variant === "journey" ? (
        <>
          <View style={styles.journeyHeader}>
            <View style={styles.journeyTitleRow}>
              <View style={styles.journeyGreenDot} />
              <Text style={styles.journeyTitle}>JOURNEY PROGRESS</Text>
            </View>
            {onOpenMaps ? (
              <TouchableOpacity
                style={styles.openMapsBtn}
                onPress={onOpenMaps}
                activeOpacity={0.85}
              >
                <FontAwesome name="location-arrow" size={11} color="#475569" />
                <Text style={styles.openMapsBtnText}>OPEN MAPS</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.segmentBarRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.segmentBar,
                  segmentFilled(i) ? styles.segmentBarFilled : styles.segmentBarEmpty,
                ]}
              />
            ))}
          </View>
          <View style={styles.journeyFooterRow}>
            <Text style={styles.journeyFooterLeft}>
              {firstMacroComplete ? "✓ completed" : ""}
            </Text>
            <Text style={styles.journeyFooterRight} numberOfLines={1}>
              {driverSummaryText?.trim() || ""}
            </Text>
          </View>
        </>
      ) : (
        <>
          {/* Card header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.activeDot} />
              <View>
                <Text style={styles.cardTitle}>Trip Status Timeline</Text>
                <Text style={styles.currentLabel}>
                  Current:{" "}
                  <Text style={styles.currentValue}>{currentStage.short}</Text>
                </Text>
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
                    {/* Connector left */}
                    {idx > 0 && (
                      <View
                        style={[
                          styles.connectorLeft,
                          isCompleted || isActive ? styles.connectorDark : styles.connectorLight,
                        ]}
                      />
                    )}

                    {/* Dot */}
                    <View
                      style={[
                        styles.dot,
                        isCompleted && styles.dotCompleted,
                        isActive && styles.dotActive,
                        !isCompleted && !isActive && styles.dotPending,
                      ]}
                    >
                      {isCompleted && (
                        <Text style={styles.checkMark}>✓</Text>
                      )}
                      {isActive && <View style={styles.dotActiveFill} />}
                    </View>

                    {/* Connector right */}
                    {idx < STAGES.length - 1 && (
                      <View
                        style={[
                          styles.connectorRight,
                          isCompleted ? styles.connectorDark : styles.connectorLight,
                        ]}
                      />
                    )}

                    {/* Label below */}
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

          {/* Footer row: last updated + action buttons */}
          <View style={styles.footerRow}>
            <View style={styles.footerLeft}>
              <View style={styles.footerDot} />
              {lastUpdatedStr ? (
                <Text style={styles.lastUpdatedText}>Last updated: {lastUpdatedStr}</Text>
              ) : null}
            </View>
            <View style={styles.footerActions}>
              {prevStage && onRevert ? (
                <TouchableOpacity
                  style={styles.revertBtn}
                  onPress={onRevert}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="arrow-left" size={11} color="#374151" />
                  <Text style={styles.revertBtnText}>Revert: {prevStage.short}</Text>
                </TouchableOpacity>
              ) : null}
              {nextStage && canAdvance ? (
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={onNext}
                  activeOpacity={0.8}
                >
                  <Text style={styles.nextBtnText}>Next: {nextStage.short}</Text>
                  <FontAwesome name="arrow-right" size={11} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </>
      )}

      {/* Map preview */}
      <View style={styles.mapSection}>
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>Live Map</Text>
          {distanceKm ? (
            <View style={styles.mapDistanceWrap}>
              <Text style={styles.mapDistance}>{distanceKm} km</Text>
              <Text style={styles.mapRoute}>Direct route</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.mapContainer, mapPreview ? styles.mapContainerFilled : null]}>
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
      <View style={styles.circleInner}>
        <Text style={styles.circleText}>{percent}%</Text>
      </View>
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
      year: "numeric",
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

const DOT = 28;
const CONN_H = 2;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  // ── Journey variant (4-segment bar, reference UI) ─────────────────────────
  journeyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  journeyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  journeyGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
  },
  journeyTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1e3a8a",
    letterSpacing: 0.6,
  },
  openMapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  openMapsBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.4,
  },
  segmentBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  segmentBar: {
    flex: 1,
    height: 12,
    borderRadius: 6,
  },
  segmentBarFilled: {
    backgroundColor: "#0f172a",
  },
  segmentBarEmpty: {
    backgroundColor: "#e5e7eb",
  },
  journeyFooterRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 12,
  },
  journeyFooterLeft: {
    fontSize: 11,
    fontStyle: "italic",
    fontWeight: "600",
    color: "#16a34a",
    flex: 1,
  },
  journeyFooterRight: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e3a8a",
    textAlign: "right",
    maxWidth: "55%",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#111827",
    marginTop: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  currentLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  currentValue: {
    fontWeight: "600",
    color: "#111827",
  },
  progressWrap: {
    alignItems: "flex-end",
    gap: 4,
  },
  progressLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "500",
    textAlign: "right",
  },
  circleOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  circleInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  circleText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#111827",
  },
  // ── Timeline ──
  timelineScroll: {
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    overflow: Platform.OS === "web" ? ("auto" as any) : "scroll",
  },
  stepWrap: {
    flex: 1,
    alignItems: "center",
    minWidth: 60,
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
  connectorDark: {
    backgroundColor: "#111827",
  },
  connectorLight: {
    backgroundColor: "#e5e7eb",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  dotCompleted: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  dotActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: "#111827",
    borderWidth: 2.5,
  },
  dotPending: {
    backgroundColor: Theme.screenBackground,
    borderColor: "#d1d5db",
  },
  dotActiveFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#111827",
  },
  checkMark: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "700",
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
    color: "#9ca3af",
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#111827",
    fontWeight: "700",
  },
  stepLabelCompleted: {
    color: "#374151",
    fontWeight: "600",
  },
  stepDate: {
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 2,
  },
  stepLocation: {
    fontSize: 9,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 1,
    fontWeight: "500",
  },
  // ── Footer ──
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    flexWrap: "wrap",
    gap: 8,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#9ca3af",
  },
  lastUpdatedText: {
    fontSize: 11,
    color: "#6b7280",
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
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: Theme.screenBackground,
  },
  revertBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "#111827",
  },
  nextBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  // ── Map ──
  mapSection: {
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  mapTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  mapDistanceWrap: {
    alignItems: "flex-end",
  },
  mapDistance: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  mapRoute: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 1,
  },
  mapContainer: {
    minHeight: 220,
    overflow: "hidden",
  },
  mapContainerFilled: {
    ...Platform.select({
      web: {
        height: 520,
        minHeight: 520,
      },
      default: {
        minHeight: 400,
      },
    }),
  },
  mapPlaceholder: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 12,
    color: "#d1d5db",
  },
});
