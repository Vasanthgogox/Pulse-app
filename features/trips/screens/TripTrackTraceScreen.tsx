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
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import Theme from "@/constants/Theme";
import { formatTime } from "@/lib/format";
import { getTripById } from "@/features/trips/services/trips.service";
import { useTripTimelineQuery } from "@/lib/queries/useTripTimelineQuery";
import { useTripDriverPresenceQuery } from "@/lib/queries/useTripDriverPresenceQuery";
import {
  deriveTripStage,
  getStageMetadata,
  getTripStopCoordinate,
  distanceMeters,
} from "@/features/trips/domain";

const ARRIVING_SOON_M = 2000;

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
  const { events: timeline } = useTripTimelineQuery(trip?.id ?? null, trip?.created_at ?? null);
  const { presence } = useTripDriverPresenceQuery(trip?.id ?? null);

  const stage = trip ? deriveTripStage(trip) : null;
  const meta = stage ? getStageMetadata(stage === "lr" ? "pickup" : stage) : null;

  const distanceLabel = useMemo(() => {
    if (!trip || !meta?.target || !presence) return null;
    const stop = getTripStopCoordinate(trip, meta.target);
    if (!stop) return null;
    const m = distanceMeters(presence.latitude, presence.longitude, stop.latitude, stop.longitude);
    if (m <= ARRIVING_SOON_M) return "Arriving soon";
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
  }, [trip, meta, presence]);

  if (tripQuery.isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={Theme.driverPrimary} />
      </View>
    );
  }

  if (tripQuery.error || !trip || !stage || !meta) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.errorText}>This shipment isn't available to track right now.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.stageCard, { borderColor: STAGE_COLOR[meta.color] }]}>
        <Text style={[styles.stageTitle, { color: STAGE_COLOR[meta.color] }]}>{meta.title}</Text>
        <Text style={styles.routeText} numberOfLines={1}>
          {trip.pickup_area?.trim() || "Pickup"} → {trip.drop_location?.trim() || "Drop"}
        </Text>
        {distanceLabel ? <Text style={styles.distanceText}>{distanceLabel}</Text> : null}
        <Text style={styles.updatedText}>
          Last updated {presence ? agoLabel(presence.recorded_at) : agoLabel(trip.updated_at)}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>SHIPMENT TIMELINE</Text>
      <View style={styles.timelineCard}>
        {timeline.length === 0 ? (
          <Text style={styles.emptyText}>No milestones recorded yet.</Text>
        ) : (
          timeline.map((e, i) => (
            <View key={e.id} style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <FontAwesome
                  name="circle"
                  size={8}
                  color={i === timeline.length - 1 ? Theme.driverPrimary : Theme.borderMedium}
                />
                {i !== timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{e.title}</Text>
                <Text style={styles.timelineTime}>{formatTime(e.occurredAt)}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const STAGE_COLOR: Record<string, string> = {
  info: Theme.driverPrimary,
  warning: Theme.warning,
  progress: Theme.accentGold,
  success: Theme.success,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
  content: { padding: 16 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 13, color: Theme.textMuted, textAlign: "center" },
  stageCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Theme.surface,
    marginBottom: 16,
  },
  stageTitle: { fontSize: 16, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  routeText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark, marginBottom: 4 },
  distanceText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark, marginBottom: 4 },
  updatedText: { fontSize: 11, color: Theme.textMuted },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  timelineCard: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Theme.surface,
  },
  emptyText: { fontSize: 12, color: Theme.textMuted },
  timelineRow: { flexDirection: "row", marginBottom: 8 },
  timelineLeft: { alignItems: "center", width: 16 },
  timelineLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: Theme.surfaceLight, marginTop: 4 },
  timelineContent: { flex: 1, marginLeft: 10 },
  timelineTitle: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  timelineTime: { fontSize: 10, color: Theme.textMuted, marginTop: 2 },
});
