/**
 * Customer Track & Trace — simplified, read-only trip view for the client
 * org linked to a trip (RLS: "Orgs can read trips where they are the client"
 * + can_access_trip_location(), both pre-existing — no new access model).
 *
 * Deliberately thin: no new stage derivation, no new event interpretation,
 * no new metadata. Everything here is deriveTripStage()/getStageMetadata()/
 * the Phase 3 timeline/Phase 4 driver-presence hook, re-rendered for a
 * customer audience instead of dispatchers.
 *
 * Scope, by design:
 *  - Current stage, driver location (only if a live presence row exists —
 *    that IS the only "permission" concept that exists today: RLS access,
 *    not a granular per-shipment consent toggle), distance-based "arriving
 *    soon" framing, the completed-milestones timeline, and a last-updated
 *    timestamp.
 *  - No speed, heading, or internal workflow states — those are operational
 *    detail for dispatchers, not something a customer needs.
 *  - No map. Distance is straight-line, honestly labeled as such, same as
 *    the Business Control Panel — a real routing ETA is a separate
 *    integration decision, not fabricated here.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";
import { formatTrackingDateTime } from "@/features/trips/utils/formatTrackingTimestamp.util";
import { getTripById } from "@/features/trips/services/trips.service";
import { useTripTimelineQuery } from "@/lib/queries/useTripTimelineQuery";
import { useTripDriverPresenceQuery } from "@/lib/queries/useTripDriverPresenceQuery";
import { getTripLocationHistory } from "@/features/driver/services/driverLocation.service";
import { reverseGeocodeCityStateLabel } from "@/lib/reverseGeocodePlace.util";
import {
  deriveTripStage,
  getStageMetadata,
  getTripStopCoordinate,
  distanceMeters,
  type TripTimelineEvent,
} from "@/features/trips/domain";

const ARRIVING_SOON_M = 2000;

// Same visual language as the in-transit LiveTrackingModal's status banner
// (icon chip / headline / chip badge / progress bar), reusing this screen's
// existing 4-color stage system (STAGE_METADATA) instead of that modal's
// live-only tones (which assume a broadcasting driver, not applicable to a
// finished trip). Colors are existing Theme tokens, not new ones.
const STAGE_TONE: Record<
  "info" | "warning" | "progress" | "success",
  { bannerBg: string; bannerBorder: string; iconBg: string; chipBg: string; chipText: string; progress: string }
> = {
  info: {
    bannerBg: Theme.pulseIndigoWash,
    bannerBorder: Theme.pulseIndigoRing,
    iconBg: Theme.driverPrimary,
    chipBg: Theme.surfaceGray,
    chipText: Theme.textPrimaryDark,
    progress: Theme.driverPrimary,
  },
  warning: {
    bannerBg: Theme.warningMuted,
    bannerBorder: Theme.warning,
    iconBg: Theme.warning,
    chipBg: Theme.warning,
    chipText: Theme.textOnPrimary,
    progress: Theme.warning,
  },
  progress: {
    bannerBg: Theme.accentGoldMuted,
    bannerBorder: Theme.accentGoldBorder,
    iconBg: Theme.accentGold,
    chipBg: Theme.accentGold,
    chipText: Theme.textPrimaryDark,
    progress: Theme.accentGold,
  },
  success: {
    bannerBg: Theme.positiveMuted,
    bannerBorder: Theme.positive,
    iconBg: Theme.positive,
    chipBg: Theme.positive,
    chipText: Theme.textOnPrimary,
    progress: Theme.positive,
  },
};

// Only these event types have a genuine "actual location" to compare
// against the planned pickup/drop point. entered/exited pickup|drop already
// carry real captured GPS (geofence_events). pod_uploaded/completed have no
// GPS of their own, but the driver's location history can supply the
// nearest-in-time point as an honest proxy for "where the driver was at
// delivery." assigned/driver_accepted are business events with no location
// expectation -- deliberately excluded, not fabricated.
const NEAREST_HISTORY_EVENT_TYPES = new Set<TripTimelineEvent["type"]>([
  "pod_uploaded",
  "completed",
]);
const NEAREST_HISTORY_TOLERANCE_MS = 60 * 60 * 1000; // 1 hour

function findNearestHistoryPoint(
  points: { latitude: number; longitude: number; recorded_at: string }[],
  targetIso: string,
): { latitude: number; longitude: number } | null {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs) || points.length === 0) return null;
  let best: { latitude: number; longitude: number } | null = null;
  let bestDiff = Infinity;
  for (const p of points) {
    const diff = Math.abs(new Date(p.recorded_at).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { latitude: p.latitude, longitude: p.longitude };
    }
  }
  return best && bestDiff <= NEAREST_HISTORY_TOLERANCE_MS ? best : null;
}

function coordKey(lat: number, lon: number): string {
  // Rounded to ~11m -- enough to dedupe reverse-geocode calls for
  // effectively-the-same point without losing meaningful precision.
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function plannedTargetForEvent(type: TripTimelineEvent["type"]): "pickup" | "drop" | null {
  if (type === "entered_pickup" || type === "exited_pickup") return "pickup";
  if (type === "entered_drop" || type === "exited_drop" || type === "pod_uploaded" || type === "completed") {
    return "drop";
  }
  return null;
}

function formatDistanceFromPlanned(meters: number, target: "pickup" | "drop"): string {
  const label = target === "pickup" ? "planned pickup" : "planned drop";
  if (meters < 1000) return `${Math.round(meters)} m from ${label}`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km from ${label}`;
}

function agoLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr} hr ago`;
}

export interface TripTrackTraceScreenProps {
  tripId: string;
}

export function TripTrackTraceScreen({ tripId }: TripTrackTraceScreenProps) {
  const router = useRouter();
  const tripQuery = useQuery({
    queryKey: ["q", "track-trace", "trip", tripId],
    queryFn: async () => {
      const { trip, error } = await getTripById(tripId);
      if (error) throw error;
      return trip;
    },
    enabled: !!tripId,
    staleTime: 15_000,
  });

  const trip = tripQuery.data ?? null;
  const { events: timeline } = useTripTimelineQuery(
    trip?.id ?? null,
    trip?.created_at ?? null,
  );
  const { presence } = useTripDriverPresenceQuery(trip?.id ?? null);

  // Fallback source for events with no GPS of their own (pod_uploaded,
  // completed) -- the nearest recorded driver location in time stands in
  // for "where the driver actually was," never a fabricated point.
  const locationHistoryQuery = useQuery({
    queryKey: ["q", "track-trace", "location-history", trip?.id ?? null],
    queryFn: async () => {
      if (!trip?.id) return [];
      const { points } = await getTripLocationHistory(trip.id);
      return points;
    },
    enabled: !!trip?.id,
    staleTime: 30_000,
  });
  const locationHistory = locationHistoryQuery.data ?? [];

  // Per-event actual GPS: geofence events already carry it; pod_uploaded/
  // completed borrow the nearest-in-time history point (within an hour);
  // everything else (assigned, driver_accepted) has none, by design.
  const actualLocationByEventId = useMemo(() => {
    const map = new Map<string, { latitude: number; longitude: number }>();
    for (const e of timeline) {
      if (e.location) {
        map.set(e.id, e.location);
        continue;
      }
      if (NEAREST_HISTORY_EVENT_TYPES.has(e.type)) {
        const nearest = findNearestHistoryPoint(locationHistory, e.occurredAt);
        if (nearest) map.set(e.id, nearest);
      }
    }
    return map;
  }, [timeline, locationHistory]);

  // Reverse-geocode every distinct point that needs a human-readable place
  // name. Keyed by rounded coordinate, not event id, so two events at the
  // same spot share one lookup.
  const [placeLabelByCoord, setPlaceLabelByCoord] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const pending = new Set<string>();
    const byKey = new Map<string, { latitude: number; longitude: number }>();
    for (const loc of actualLocationByEventId.values()) {
      const key = coordKey(loc.latitude, loc.longitude);
      if (!placeLabelByCoord.has(key) && !byKey.has(key)) {
        pending.add(key);
        byKey.set(key, loc);
      }
    }
    if (pending.size === 0) return;
    let isActive = true;
    (async () => {
      const entries = await Promise.all(
        [...pending].map(async (key) => {
          const loc = byKey.get(key)!;
          const label = await reverseGeocodeCityStateLabel(loc.latitude, loc.longitude);
          return [key, label] as const;
        }),
      );
      if (!isActive) return;
      setPlaceLabelByCoord((prev) => {
        const next = new Map(prev);
        for (const [key, label] of entries) {
          if (label) next.set(key, label);
        }
        return next;
      });
    })();
    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualLocationByEventId]);

  const stage = trip ? deriveTripStage(trip) : null;
  const meta = stage
    ? getStageMetadata(stage === "lr" ? "pickup" : stage)
    : null;

  const distanceLabel = useMemo(() => {
    if (!trip || !meta?.target || !presence) return null;
    const stop = getTripStopCoordinate(trip, meta.target);
    if (!stop) return null;
    const m = distanceMeters(
      presence.latitude,
      presence.longitude,
      stop.latitude,
      stop.longitude,
    );
    if (m <= ARRIVING_SOON_M) return "Arriving soon";
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
  }, [trip, meta, presence]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/trips" as never);
  };

  const insets = useSafeAreaInsets();

  if (tripQuery.isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader onBack={handleBack} title="Track shipment" subtitle={null} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={Theme.driverPrimary} />
        </View>
      </View>
    );
  }

  if (tripQuery.error || !trip || !stage || !meta) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader onBack={handleBack} title="Track shipment" subtitle={null} />
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>
            This shipment isn&apos;t available to track right now.
          </Text>
        </View>
      </View>
    );
  }

  const tone = STAGE_TONE[meta.color];
  const isCompleted = stage === "completed";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader
        onBack={handleBack}
        title="Track shipment"
        subtitle={`${trip.pickup_area?.trim() || "Pickup"} → ${trip.drop_location?.trim() || "Drop"}`}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheetStack}>
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: tone.bannerBg, borderColor: tone.bannerBorder },
            ]}
          >
            <View style={styles.statusBannerTop}>
              <View style={styles.statusBannerLeft}>
                <View style={[styles.statusIconWrap, { backgroundColor: tone.iconBg }]}>
                  <FontAwesome
                    name={meta.icon}
                    size={15}
                    // accentGold (progress tone) is bright/light -- needs a dark
                    // icon for contrast; the other three tones are all
                    // saturated enough for a white icon.
                    color={meta.color === "progress" ? Theme.textPrimaryDark : Theme.textOnPrimary}
                  />
                </View>
                <View style={styles.statusCopy}>
                  <Text style={styles.statusHeadline} numberOfLines={2}>
                    {meta.title}
                  </Text>
                  {distanceLabel ? (
                    <Text style={styles.statusSubcopy} numberOfLines={1}>
                      {distanceLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={styles.statusMetaRow}>
              <View style={[styles.statusChip, { backgroundColor: tone.chipBg }]}>
                <Text style={[styles.statusChipText, { color: tone.chipText }]} numberOfLines={1}>
                  {meta.title}
                </Text>
              </View>
              <Text style={styles.lastUpdatedInline} numberOfLines={1}>
                Updated {presence ? agoLabel(presence.recorded_at) : agoLabel(trip.updated_at)}
              </Text>
            </View>
            {isCompleted ? (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: "100%", backgroundColor: tone.progress }]} />
              </View>
            ) : null}
          </View>

          <View style={styles.activityCard}>
            <View style={styles.activityCardHeader}>
              <FontAwesome name="list-alt" size={12} color={Theme.pulseIndigo} />
              <Text style={styles.activityCardTitle}>Shipment timeline</Text>
              <Text style={styles.activityCount}>{timeline.length} events</Text>
            </View>
            <View style={styles.timelineWrap}>
              {timeline.length === 0 ? (
                <View style={styles.emptyTimeline}>
                  <Text style={styles.emptyTimelineText}>No milestones recorded yet.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.timelineLine} />
                  {timeline.map((e, i) => {
                    const actualLoc = actualLocationByEventId.get(e.id);
                    const placeLabel = actualLoc
                      ? placeLabelByCoord.get(coordKey(actualLoc.latitude, actualLoc.longitude))
                      : undefined;
                    const target = plannedTargetForEvent(e.type);
                    const stop = target ? getTripStopCoordinate(trip, target) : null;
                    const distanceFromPlanned =
                      actualLoc && stop
                        ? formatDistanceFromPlanned(
                            distanceMeters(
                              actualLoc.latitude,
                              actualLoc.longitude,
                              stop.latitude,
                              stop.longitude,
                            ),
                            target!,
                          )
                        : null;
                    const isLast = i === timeline.length - 1;

                    return (
                      <View key={e.id} style={styles.timelineItem}>
                        <View style={[styles.timelineDot, isLast && styles.timelineDotActive]}>
                          {isLast ? <View style={styles.timelineDotInner} /> : null}
                        </View>
                        <View style={[styles.timelineItemBody, !isLast && styles.timelineItemBorder]}>
                          <View style={styles.timelineItemRow}>
                            <View style={styles.timelineItemLeft}>
                              <Text
                                style={[styles.timelineLocation, isLast && styles.timelineLocationActive]}
                                numberOfLines={2}
                              >
                                {e.title}
                              </Text>
                              {actualLoc ? (
                                <Text style={styles.timelineCoords} numberOfLines={2}>
                                  Driver was at {placeLabel ?? "…locating"}
                                  {distanceFromPlanned ? ` · ${distanceFromPlanned}` : ""}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.timelineTimeBadge}>
                              <Text style={styles.timelineTimeText}>
                                {formatTrackingDateTime(e.occurredAt)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Circular-button header matching LiveTrackingModal's headerFloat/headerCircleBtn
 * visual language -- in-flow here (not absolutely positioned) since this screen has
 * no map hero for it to float over. */
function ScreenHeader({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle: string | null;
}) {
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.headerCircleBtn, pressed && styles.headerCircleBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
      </Pressable>
      <View style={styles.headerCenter} pointerEvents="none">
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {/* Empty same-size view keeps the title truly centered, matching
          DetailPageLayout's own left/right-symmetry convention. */}
      <View style={styles.headerCircleBtn} />
    </View>
  );
}

const SCREEN_PAD = 16;
const TIMELINE_DOT_SIZE = 14;
const TIMELINE_ROW_PAD_V = 10;
const TIMELINE_LABEL_LINE_HEIGHT = 15;
const TIMELINE_DOT_TOP = Math.round(
  TIMELINE_ROW_PAD_V + TIMELINE_LABEL_LINE_HEIGHT / 2 - TIMELINE_DOT_SIZE / 2,
);
const TIMELINE_DOT_CENTER = TIMELINE_DOT_TOP + TIMELINE_DOT_SIZE / 2;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: SCREEN_PAD, gap: 8 },
  centerFill: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  errorText: {
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 8,
    gap: 8,
  },
  headerCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: { boxShadow: "0 2px 10px rgba(15, 23, 42, 0.12)" } as object,
    }),
  },
  headerCircleBtnPressed: { opacity: 0.88 },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    textAlign: "center",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  sheetStack: { gap: 8, width: "100%" },
  statusBanner: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    gap: 12,
  },
  statusBannerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statusBannerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusCopy: { flex: 1, minWidth: 0, gap: 2 },
  statusHeadline: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  statusSubcopy: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimary,
    lineHeight: 14,
  },
  statusMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexShrink: 0,
    maxWidth: "48%",
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  lastUpdatedInline: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    textAlign: "right",
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  arrivalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  arrivalLabel: { fontSize: 11, fontWeight: "600", color: Theme.textPrimary },
  arrivalValue: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  activityCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  activityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  activityCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  activityCount: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimary,
    flexShrink: 0,
  },
  timelineWrap: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  emptyTimeline: { padding: 24, alignItems: "center" },
  emptyTimelineText: { fontSize: 13, color: Theme.textPrimary },
  timelineLine: {
    position: "absolute",
    left: SCREEN_PAD + TIMELINE_DOT_SIZE / 2,
    top: TIMELINE_DOT_CENTER,
    bottom: TIMELINE_DOT_CENTER,
    width: 1,
    backgroundColor: Theme.borderFocus,
  },
  timelineItem: {
    flexDirection: "row",
    paddingHorizontal: SCREEN_PAD,
  },
  timelineDot: {
    width: TIMELINE_DOT_SIZE,
    height: TIMELINE_DOT_SIZE,
    borderRadius: TIMELINE_DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: Theme.borderFocus,
    backgroundColor: Theme.screenBackground,
    marginTop: TIMELINE_DOT_TOP,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    flexShrink: 0,
  },
  timelineDotActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.buttonPrimary,
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.textPrimaryDark,
  },
  timelineItemBody: { flex: 1, minWidth: 0, paddingVertical: TIMELINE_ROW_PAD_V },
  timelineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  timelineItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  timelineItemLeft: { flex: 1, minWidth: 0 },
  timelineLocation: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: TIMELINE_LABEL_LINE_HEIGHT,
  },
  timelineLocationActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  timelineCoords: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimary,
    marginTop: 2,
  },
  timelineTimeBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    flexShrink: 0,
    maxWidth: 148,
  },
  timelineTimeText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: TIMELINE_LABEL_LINE_HEIGHT - 2,
  },
});
