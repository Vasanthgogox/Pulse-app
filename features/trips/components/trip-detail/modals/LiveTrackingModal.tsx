/**
 * Full-screen Live Tracking modal — extracted from TripDetailScreen.
 * Web/desktop: same Leaflet TripMap as trip detail (route, driver pin, ping trail).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Feather } from "@expo/vector-icons";
import { Home, MoreHorizontal, Navigation, Package } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getTripDisplayNumber,
  type TripRow,
} from "../../../services/trips.service";
import { TripMap, type TripMapProps } from "../TripMap";
import {
  buildDriverLastPingDisplay,
  formatHubPingOfflineLabel,
  formatHubPingTimeLabel,
} from "@/features/trips/utils/driverLastPingDisplay.util";
import {
  buildManifestDeliveryPlan,
  type ManifestDeliveryPlan,
} from "@/features/trips/utils/manifestDeliveryPlan.util";
import type { DriverActivityTimelineRow } from "../hooks/useTripDetail";
import type { TrackingState } from "@/features/tracking/hooks/useTrackingState";

interface LiveTrackingModalProps {
  visible: boolean;
  onClose: () => void;

  trip: TripRow;
  isClientIndentView?: boolean;
  /** In-transit but driver not broadcasting (or not linked). */
  isDriverOffline?: boolean;
  onSendLoginReminder?: () => void;
  onReassignDriver?: () => void;
  trackingState: TrackingState;

  // Map props (desktop TripMap on web)
  vehicleLabel: string | null;
  locationLabels: [string, string, string, string, string];
  originCoordinate: { latitude: number; longitude: number } | null;
  destinationCoordinate: { latitude: number; longitude: number } | null;
  tripLocationPoints: { latitude: number; longitude: number; recorded_at: string }[];
  locationAddress: string | null;
  mapTruckLocation?: { latitude: number; longitude: number } | null;
  mapDbLocationTrail: TripMapProps["dbLocationTrail"];
  mapTruckStatus: TripMapProps["truckStatus"];
  trackingBroadcastActive?: boolean;
  lastPingRecordedAt?: string | null;
  /** Live map pin avatar (matches driver-app map). */
  driverAvatarUri?: string | null;
  driverAvatarSeed?: string | null;

  // Timeline props
  driverActivityTimelineRows: DriverActivityTimelineRow[];
  expandedTimelineEntryIds: Record<string, boolean>;
  onToggleTimelineItem: (id: string) => void;
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  driverName: string | null;
  driverPhone?: string | null;
  currentUserId: string | null;
  /** Route driving duration (seconds) when driver GPS routing is available. */
  routeEtaSeconds?: number | null;
  /** Pre-calculated trip distance (km) or map fallback label. */
  mapRouteDistanceKm?: string | null;
  displayClientName?: string | null;
  /** Pre-built plan; computed in parent when omitted. */
  deliveryPlan?: ManifestDeliveryPlan;
}

function formatAssignmentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return (iso as string).slice(0, 16).replace("T", " ") || "—";
  }
}

function timelineItemId(item: DriverActivityTimelineRow): string {
  return item.kind === "assignment" ? item.row.id : item.id;
}

export function LiveTrackingModal({
  visible,
  onClose,
  trip,
  isClientIndentView: _isClientIndentView,
  isDriverOffline: isDriverOfflineProp,
  onSendLoginReminder,
  onReassignDriver,
  trackingState,
  vehicleLabel,
  locationLabels: _locationLabels,
  originCoordinate,
  destinationCoordinate,
  tripLocationPoints: _tripLocationPoints,
  locationAddress,
  mapTruckLocation,
  mapDbLocationTrail,
  mapTruckStatus,
  trackingBroadcastActive = false,
  lastPingRecordedAt,
  driverAvatarUri,
  driverAvatarSeed,
  driverActivityTimelineRows,
  expandedTimelineEntryIds,
  onToggleTimelineItem,
  assignmentDriverNames,
  assignmentVehicleLabels,
  driverName,
  driverPhone,
  currentUserId,
  routeEtaSeconds = null,
  mapRouteDistanceKm = null,
  displayClientName,
  deliveryPlan: deliveryPlanProp,
}: LiveTrackingModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapHeroHeight = Math.round(Math.min(windowHeight * 0.48, 440));
  const [activityOpen, setActivityOpen] = useState(true);
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, handleClose]);

  const handleCallDriverToCoordinate = useCallback(async () => {
    const normalized = (driverPhone ?? "").replace(/[^\d+]/g, "");
    if (!normalized) {
      Alert.alert(
        "Unable to call",
        "No driver phone number on file. Assign or update the driver contact on the trip.",
      );
      return;
    }
    try {
      await Linking.openURL(`tel:${normalized}`);
    } catch {
      Alert.alert(
        "Unable to call",
        "Phone calls are not available on this device or the number could not be opened.",
      );
    }
  }, [driverPhone]);

  const openLastPingInMaps = useCallback(async () => {
    if (!mapTruckLocation) return;
    const { latitude, longitude } = mapTruckLocation;
    const label = encodeURIComponent(
      (locationAddress ?? "").trim() || "Driver location",
    );
    const url =
      Platform.OS === "ios"
        ? `maps:?q=${latitude},${longitude}&ll=${latitude},${longitude}`
        : Platform.OS === "android"
          ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
          : `https://www.google.com/maps?q=${latitude},${longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open maps", "Could not open the driver location.");
    }
  }, [mapTruckLocation, locationAddress]);

  if (!visible) return null;

  const driverOffline =
    isDriverOfflineProp ?? !trackingState.driverOnline;
  const lastPingDisplay = buildDriverLastPingDisplay({
    latitude: mapTruckLocation?.latitude ?? null,
    longitude: mapTruckLocation?.longitude ?? null,
    locationAddress,
    recordedAt: lastPingRecordedAt,
  });
  const offlineLabel = formatHubPingOfflineLabel(lastPingRecordedAt);
  const pingTimeShort = lastPingRecordedAt
    ? formatHubPingTimeLabel(lastPingRecordedAt)
    : null;
  const deliveryPlan =
    deliveryPlanProp ??
    buildManifestDeliveryPlan({
      tripDistance: trip.distance,
      mapRouteDistanceKm,
      routeEtaSeconds,
      estimatedDuration: trip.estimated_duration,
      startedAt: trip.started_at,
      pickupAt: trip.pickup_date,
      createdAt: trip.created_at,
    });
  const statusHeadline = trackingStatusHeadline(
    trip?.status ?? "draft",
    driverOffline,
    trackingState.broadcastActive,
  );
  const tripRef = getTripDisplayNumber(trip);
  const headerTitle =
    (displayClientName ?? trip.client_name ?? "").trim() ||
    locationPrimaryLine(trip.pickup_area) ||
    tripRef;
  const headerSubtitle = [
    driverName?.trim() || null,
    vehicleLabel?.trim() || null,
    tripRef,
  ]
    .filter(Boolean)
    .join(" · ");
  const originPrimary = locationPrimaryLine(trip.pickup_area);
  const destPrimary = locationPrimaryLine(trip.drop_location);
  const driverPingLine =
    lastPingDisplay.locationLabel ?? lastPingDisplay.cityLabel ?? null;

  const { step, label } = trackingStepAndLabel(trip?.status ?? "draft");
  const progressPct = Math.round((step / 4) * 100);
  const statusTone = driverOffline
    ? "offline"
    : trackingState.broadcastActive
      ? "live"
      : "idle";
  const statusChangeRowsOnly = driverActivityTimelineRows.filter(
    (r) => r.kind === "status",
  ) as Extract<DriverActivityTimelineRow, { kind: "status" }>[];

  const timelineSection = (
    <View style={styles.timelineWrap}>
      {statusChangeRowsOnly.length > 0 ? (
        <View style={styles.statusChangesWrap}>
          {statusChangeRowsOnly.map((row, idx) => (
            <View
              key={row.id}
              style={[
                styles.statusChangeRow,
                idx === statusChangeRowsOnly.length - 1 &&
                  styles.statusChangeRowLast,
              ]}
            >
              <Text style={styles.statusChangeLabel}>{row.status_label}</Text>
              <Text style={styles.statusChangeTime}>
                {formatAssignmentDate(row.changed_at)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {driverActivityTimelineRows.length === 0 ? (
        <View style={styles.emptyTimeline}>
          <Text style={styles.emptyTimelineText}>No activity recorded yet</Text>
        </View>
      ) : (
        <>
          <View style={styles.timelineLine} />
          {driverActivityTimelineRows.map((item, idx) => {
            const itemId = timelineItemId(item);
            const isExpanded = !!expandedTimelineEntryIds[itemId];
            const isFirst = idx === 0;
            const isLast = idx === driverActivityTimelineRows.length - 1;

            if (item.kind === "status") {
              return (
                <TimelineItem
                  key={item.id}
                  label={item.status_label}
                  sublabel={
                    item.status_context === "completed"
                      ? "Delivery completed"
                      : item.status_context === "in_transit"
                        ? "Movement update"
                        : "Driver status change"
                  }
                  date={formatAssignmentDate(item.changed_at)}
                  isFirst={isFirst}
                  isLast={isLast}
                  isExpanded={isExpanded}
                  onPress={() => onToggleTimelineItem(itemId)}
                  expandedContent={
                    <ExpandedContent
                      lines={[
                        ["Event", item.status_label],
                        ["Context", item.detail_line],
                        [
                          "Recorded at",
                          formatAssignmentDate(item.changed_at),
                        ],
                      ]}
                    />
                  }
                />
              );
            }

            const row = item.row;
            const eventLabel =
              row.event_type === "reassignment" ? "Reassignment" : "Assignment";
            const dateStr = formatAssignmentDate(row.changed_at);
            const byLabel =
              row.changed_by != null
                ? row.changed_by === currentUserId
                  ? " · BY YOU"
                  : " · BY DISPATCHER"
                : "";
            const isFallback = row.id === "fallback";
            const driverPrev =
              !isFallback && row.driver_id_prev
                ? (assignmentDriverNames[row.driver_id_prev] ??
                  row.driver_id_prev)
                : null;
            const driverNew = row.driver_id_new
              ? (assignmentDriverNames[row.driver_id_new] ??
                (isFallback ? (driverName ?? null) : row.driver_id_new))
              : null;
            const vehiclePrev =
              !isFallback && row.vehicle_id_prev
                ? (assignmentVehicleLabels[row.vehicle_id_prev] ??
                  row.vehicle_id_prev)
                : null;
            const vehicleNew = row.vehicle_id_new
              ? (assignmentVehicleLabels[row.vehicle_id_new] ??
                (isFallback ? (vehicleLabel ?? null) : row.vehicle_id_new))
              : null;
            const driverLine =
              driverPrev && driverNew
                ? `Driver: ${driverPrev} → ${driverNew}`
                : driverNew
                  ? `Driver: ${driverNew}`
                  : driverPrev
                    ? `Driver: ${driverPrev} (removed)`
                    : null;
            const vehicleLine =
              vehiclePrev && vehicleNew
                ? `Vehicle: ${vehiclePrev} → ${vehicleNew}`
                : vehicleNew
                  ? `Vehicle: ${vehicleNew}`
                  : vehiclePrev
                    ? `Vehicle: ${vehiclePrev} (removed)`
                    : null;
            const detail = [driverLine, vehicleLine]
              .filter(Boolean)
              .join("  ·  ");

            return (
              <TimelineItem
                key={row.id}
                label={detail || eventLabel}
                sublabel={`${eventLabel} @ node${byLabel}`}
                date={dateStr}
                isFirst={isFirst}
                isLast={isLast}
                isExpanded={isExpanded}
                onPress={() => onToggleTimelineItem(itemId)}
                expandedContent={
                  <ExpandedContent
                    lines={[
                      ["Event type", eventLabel],
                      [
                        "Driver update",
                        driverLine ?? "No driver change recorded",
                      ],
                      [
                        "Vehicle update",
                        vehicleLine ?? "No vehicle change recorded",
                      ],
                      [
                        "Updated by",
                        byLabel ? byLabel.replace(" · ", "") : "System",
                      ],
                      ["Recorded at", dateStr],
                    ]}
                  />
                }
              />
            );
          })}
        </>
      )}
    </View>
  );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <View
          style={[styles.headerFloat, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.headerCircleBtn,
              pressed && styles.headerCircleBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close live tracking"
          >
            <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
          </Pressable>

          <View style={styles.headerCenter} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          </View>

          <Pressable
            onPress={
              driverPhone?.trim()
                ? handleCallDriverToCoordinate
                : handleClose
            }
            style={({ pressed }) => [
              styles.headerCircleBtn,
              pressed && styles.headerCircleBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              driverPhone?.trim() ? "Call driver" : "More options"
            }
          >
            {driverPhone?.trim() ? (
              <FontAwesome name="phone" size={14} color={Theme.textPrimaryDark} />
            ) : (
              <MoreHorizontal size={16} color={Theme.textPrimaryDark} strokeWidth={1.75} />
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 28 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <View style={[styles.mapHero, { height: mapHeroHeight }]}>
            <TripMap
              source={(trip.pickup_area ?? "").trim() || undefined}
              destination={(trip.drop_location ?? "").trim() || undefined}
              sourceCoords={originCoordinate ?? undefined}
              destCoords={destinationCoordinate ?? undefined}
              truckLocation={mapTruckLocation ?? undefined}
              dbLocationTrail={mapDbLocationTrail ?? []}
              truckStatus={mapTruckStatus}
              height={mapHeroHeight}
              tripId={trip.id}
              trackingEnabled={trackingBroadcastActive}
              fitPaddingBottom={96}
              driverAvatarUri={driverAvatarUri}
              driverAvatarSeed={driverAvatarSeed ?? trip.driver_id}
              driverOnline={trackingBroadcastActive}
            />
            <View style={styles.mapChip} pointerEvents="none">
              <Text style={styles.mapChipText}>MAP</Text>
            </View>
            {trackingState.broadcastActive ? (
              <View style={styles.livePill} pointerEvents="none">
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sheetStack}>
            <View style={styles.statusCard}>
              <View
                style={[
                  styles.statusBanner,
                  statusTone === "offline" && {
                    backgroundColor: TRACKING.offline.bannerBg,
                    borderColor: TRACKING.offline.bannerBorder,
                  },
                  statusTone === "live" && {
                    backgroundColor: TRACKING.live.bannerBg,
                    borderColor: TRACKING.live.bannerBorder,
                  },
                ]}
              >
                <View style={styles.statusBannerTop}>
                  <View style={styles.statusBannerLeft}>
                    <View
                      style={[
                        styles.statusIconWrap,
                        statusTone === "offline" && {
                          backgroundColor: TRACKING.offline.iconBg,
                        },
                        statusTone === "live" && {
                          backgroundColor: TRACKING.live.iconBg,
                        },
                        statusTone === "idle" && {
                          backgroundColor: TRACKING.idle.iconBg,
                        },
                      ]}
                    >
                      <Feather
                        name={
                          statusTone === "offline"
                            ? "wifi-off"
                            : statusTone === "live"
                              ? "radio"
                              : "truck"
                        }
                        size={15}
                        color={
                          statusTone === "offline"
                            ? Theme.textPrimaryDark
                            : Theme.textOnPrimary
                        }
                      />
                    </View>
                    <View style={styles.statusCopy}>
                      <Text style={styles.statusHeadline}>{statusHeadline}</Text>
                      <Text style={styles.statusSubcopy}>
                        Step {step} of 4 · {label}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      statusTone === "offline" && {
                        backgroundColor: TRACKING.offline.chipBg,
                      },
                      statusTone === "live" && {
                        backgroundColor: TRACKING.live.chipBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        statusTone === "offline" && {
                          color: TRACKING.offline.chipText,
                        },
                        statusTone === "live" && {
                          color: TRACKING.live.chipText,
                        },
                      ]}
                    >
                      {statusTone === "offline"
                        ? "OFFLINE"
                        : statusTone === "live"
                          ? "LIVE"
                          : "TRACKING"}
                    </Text>
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressPct}%`,
                        backgroundColor:
                          statusTone === "offline"
                            ? TRACKING.offline.progress
                            : statusTone === "live"
                              ? TRACKING.live.progress
                              : TRACKING.idle.progress,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.planCard}>
                <Text style={styles.planCardLabel}>Delivery plan</Text>
                <View style={styles.planCardBody}>
                  <View style={styles.planBadgeCol}>
                    <EtaBadgeCompact
                      label="Driver ETA"
                      value={deliveryPlan.etaBadgeValue}
                      unit={deliveryPlan.etaBadgeUnit}
                    />
                    <EtaBadgeCompact
                      label="Est. delivery"
                      value={deliveryPlan.deliveryDateBadgeValue}
                      unit={deliveryPlan.deliveryDateBadgeUnit}
                    />
                  </View>
                  <View style={styles.planTextCol}>
                    <Text style={styles.planSummary}>
                      {deliveryPlan.planSummaryLine}
                    </Text>
                    <Text style={styles.planDetail} numberOfLines={3}>
                      {deliveryPlan.planDetailLine}
                    </Text>
                    {deliveryPlan.estimatedDeliveryDateLabel !== "—" ? (
                      <View style={styles.planDateChip}>
                        <Feather name="calendar" size={10} color={Theme.pulseIndigo} />
                        <Text style={styles.planDateChipText}>
                          {deliveryPlan.estimatedDeliveryDateLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.routeSection}>
                <Text style={styles.routeSectionTitle}>Trip route</Text>
                <View style={styles.routeTimeline}>
                  <RouteStopRow
                    variant="origin"
                    icon={
                      <Package
                        size={12}
                        color={Theme.textSecondary}
                        strokeWidth={1.75}
                      />
                    }
                    label="From"
                    title={originPrimary}
                    subtitle={trip.pickup_area?.trim() || "Pickup"}
                    isFirst
                  />
                  {lastPingDisplay.hasPing ? (
                    <RouteStopRow
                      variant={driverOffline ? "current-offline" : "current-live"}
                      label="Driver now"
                      title={driverPingLine ?? "Last driver ping"}
                      subtitle={pingTimeShort ?? "Ping time unknown"}
                      meta={
                        offlineLabel ? (
                          <Text
                            style={[
                              styles.offlineMeta,
                              { color: TRACKING.offline.metaText },
                            ]}
                          >
                            {offlineLabel}
                          </Text>
                        ) : (
                          <Text style={styles.onlineMeta}>On route</Text>
                        )
                      }
                      onPress={
                        mapTruckLocation ? openLastPingInMaps : undefined
                      }
                      actionLabel={
                        mapTruckLocation ? "Open in maps" : undefined
                      }
                    />
                  ) : driverOffline ? (
                    <View
                      style={[
                        styles.noPingCard,
                        {
                          backgroundColor: TRACKING.offline.rowBg,
                          borderColor: TRACKING.offline.bannerBorder,
                        },
                      ]}
                    >
                      <Feather
                        name="alert-circle"
                        size={14}
                        color={Theme.pulseIndigo}
                      />
                      <Text
                        style={[
                          styles.noPingText,
                          { color: TRACKING.offline.metaText },
                        ]}
                      >
                        No GPS ping yet — ask the driver to open the app and accept
                        the trip.
                      </Text>
                    </View>
                  ) : null}
                  <RouteStopRow
                    variant="destination"
                    icon={
                      <Home
                        size={12}
                        color={Theme.textSecondary}
                        strokeWidth={1.75}
                      />
                    }
                    label="To"
                    title={destPrimary}
                    subtitle={(trip.drop_location ?? "").trim() || "Destination"}
                    isLast
                  />
                </View>
              </View>

              <View style={styles.actionBar}>
                <Pressable
                  onPress={handleCallDriverToCoordinate}
                  disabled={!driverPhone?.trim()}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnPrimary,
                    !driverPhone?.trim() && styles.actionBtnDisabled,
                    pressed && styles.actionBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Call driver"
                >
                  <Feather name="phone" size={14} color={Theme.textPrimaryDark} />
                  <Text style={styles.actionBtnPrimaryText}>Call driver</Text>
                </Pressable>
                {driverOffline && onSendLoginReminder ? (
                  <Pressable
                    onPress={onSendLoginReminder}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.actionBtnSecondary,
                      pressed && styles.actionBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Request driver location"
                  >
                    <Feather name="bell" size={14} color={Theme.pulseIndigo} />
                    <Text style={styles.actionBtnSecondaryText}>Request ping</Text>
                  </Pressable>
                ) : null}
              </View>
              {driverOffline && onReassignDriver ? (
                <Pressable
                  onPress={onReassignDriver}
                  style={({ pressed }) => [
                    styles.reassignLink,
                    pressed && styles.headerCircleBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Reassign driver"
                >
                  <Text style={styles.reassignLinkText}>Re-assign driver</Text>
                  <Feather name="chevron-right" size={14} color={Theme.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.activityCard}>
              <Pressable
                onPress={() => setActivityOpen((v) => !v)}
                style={({ pressed }) => [
                  styles.activityCardHeader,
                  !activityOpen && styles.activityCardHeaderCollapsed,
                  pressed && styles.headerCircleBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: activityOpen }}
                accessibilityLabel="Toggle driver activity"
              >
                <FontAwesome name="list-alt" size={12} color={Theme.pulseIndigo} />
                <Text style={styles.activityCardTitle}>Driver activity</Text>
                <Text style={styles.activityCount}>
                  {driverActivityTimelineRows.length} events
                </Text>
                <Feather
                  name={activityOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Theme.textMuted}
                />
              </Pressable>
              {activityOpen ? timelineSection : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function locationPrimaryLine(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const comma = raw.indexOf(",");
  return comma > 0 ? raw.slice(0, comma).trim() : raw;
}

function trackingStatusHeadline(
  status: string,
  driverOffline: boolean,
  broadcastActive: boolean,
): string {
  if (driverOffline) return "Driver offline";
  if (broadcastActive) return "Live on map";
  const s = status.toLowerCase();
  if (s === "in_transit" || s === "in transit") return "In transit";
  if (s === "in_progress") return "At pickup";
  if (s === "completed" || s === "delivered") return "Delivered";
  if (s === "assigned" || s === "pending_acceptance") return "Assigned";
  return "Tracking trip";
}

function EtaBadgeCompact({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={styles.etaCompactSlot}>
      <Text style={styles.etaCompactLabel}>{label}</Text>
      <View style={styles.etaBadge}>
        <Text style={styles.etaBadgeValue}>{value}</Text>
        <Text style={styles.etaBadgeUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function RouteStopRow({
  icon,
  label,
  title,
  subtitle,
  meta,
  variant = "origin",
  isFirst,
  isLast,
  onPress,
  actionLabel,
}: {
  icon?: ReactNode;
  label: string;
  title: string;
  subtitle: string;
  meta?: ReactNode;
  variant?: "origin" | "destination" | "current-live" | "current-offline";
  isFirst?: boolean;
  isLast?: boolean;
  onPress?: () => void;
  actionLabel?: string;
}) {
  const isCurrent =
    variant === "current-live" || variant === "current-offline";
  const isOffline = variant === "current-offline";
  const tone = isOffline ? TRACKING.offline : TRACKING.live;

  const trailingNavBadge = isCurrent ? (
    <View
      style={[
        styles.routeTrailingBadge,
        { backgroundColor: isOffline ? tone.badgeBg : TRACKING.live.badgeBg },
      ]}
    >
      <Navigation
        size={16}
        color={isOffline ? Theme.textPrimaryDark : Theme.textOnPrimary}
        strokeWidth={2.5}
      />
    </View>
  ) : null;

  const body = (
    <>
      <View style={styles.routeRailCol}>
        {!isFirst ? <View style={styles.routeRailLineTop} /> : null}
        <View
          style={[
            styles.routeRailDot,
            isCurrent && {
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 0,
              backgroundColor: isOffline ? tone.badgeBg : TRACKING.live.badgeBg,
            },
          ]}
        >
          {!isCurrent ? icon : null}
        </View>
        {!isLast ? <View style={styles.routeRailLineBottom} /> : null}
      </View>
      <View style={[styles.routeRowBody, isCurrent && styles.routeRowBodyCurrent]}>
        <Text style={styles.routeStopLabel}>{label}</Text>
        <Text
          style={[styles.routeRowTitle, isCurrent && styles.routeRowTitleCurrent]}
          numberOfLines={isCurrent ? 2 : 1}
        >
          {title}
        </Text>
        {subtitle.trim() ? (
          <Text style={styles.routeRowSubtitle} numberOfLines={isCurrent ? 3 : 2}>
            {subtitle}
          </Text>
        ) : null}
        {meta}
        {actionLabel ? (
          <View style={styles.routeActionRow}>
            <Text style={styles.routeActionText}>{actionLabel}</Text>
            <Feather name="external-link" size={11} color={Theme.pulseIndigo} />
          </View>
        ) : null}
      </View>
      {trailingNavBadge}
    </>
  );

  if (isCurrent && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.routeRow,
          styles.routeRowCurrent,
          {
            backgroundColor: isOffline ? tone.rowBg : TRACKING.live.rowBg,
            borderColor: isOffline ? tone.rowBorder : TRACKING.live.rowBorder,
          },
          pressed && styles.routeRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${title}`}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.routeRow,
        isCurrent && [
          styles.routeRowCurrent,
          {
            backgroundColor: isOffline ? tone.rowBg : TRACKING.live.rowBg,
            borderColor: isOffline ? tone.rowBorder : TRACKING.live.rowBorder,
          },
        ],
      ]}
    >
      {body}
    </View>
  );
}

function TimelineItem({
  label,
  sublabel,
  date,
  isFirst,
  isLast,
  isExpanded,
  onPress,
  expandedContent,
}: {
  label: string;
  sublabel: string;
  date: string;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onPress: () => void;
  expandedContent: ReactNode;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={[styles.timelineDot, isFirst && styles.timelineDotActive]}>
        {isFirst && <View style={styles.timelineDotInner} />}
      </View>
      <View style={[styles.timelineItemBody, !isLast && styles.timelineItemBorder]}>
        <TouchableOpacity
          style={styles.timelineItemRow}
          activeOpacity={0.85}
          onPress={onPress}
        >
          <View style={styles.timelineItemLeft}>
            <Text
              style={[styles.timelineLocation, isFirst && styles.timelineLocationActive]}
              numberOfLines={2}
            >
              {label}
            </Text>
            <Text style={styles.timelineCoords}>{sublabel}</Text>
          </View>
          <View style={styles.timelineTimeBadge}>
            <Text style={styles.timelineTimeText}>{date}</Text>
          </View>
        </TouchableOpacity>
        {isExpanded && expandedContent}
      </View>
    </View>
  );
}

function ExpandedContent({ lines }: { lines: [string, string][] }) {
  return (
    <View style={styles.expandedPanel}>
      <Text style={styles.expandedTitle}>Activity details</Text>
      {lines.map(([key, value]) => (
        <Text key={key} style={styles.expandedLine}>
          {key}: {value}
        </Text>
      ))}
    </View>
  );
}

function trackingStepAndLabel(status: string): { step: number; label: string } {
  const s = status.toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done")
    return { step: 4, label: "Completed" };
  if (s === "arrived" || s === "at_destination" || s === "at_drop")
    return { step: 3, label: "Arrived" };
  if (
    s === "in_progress" || s === "in_transit" || s === "dispatched" ||
    s === "picked_up" || s === "pickup"
  )
    return { step: 2, label: "In progress" };
  return { step: 1, label: "Assigned" };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SHEET_OVERLAP = 20;
const SCREEN_PAD = Layout.screenPaddingHorizontal;

/** Solid tracking tones — slate + Pulse purple (offline), green (live). */
const TRACKING = {
  live: {
    bannerBg: Theme.positiveMuted,
    bannerBorder: Theme.positive,
    iconBg: Theme.positive,
    chipBg: Theme.positive,
    chipText: Theme.textOnPrimary,
    progress: Theme.positive,
    rowBg: "#ECFDF5",
    rowBorder: "rgba(21, 128, 61, 0.28)",
    badgeBg: Theme.pulseIndigo,
    metaText: Theme.positive,
  },
  offline: {
    bannerBg: "#EEF2FF",
    bannerBorder: "#C7D2FE",
    iconBg: Theme.loadMainTabBg,
    chipBg: Theme.loadDoneSubTabBg,
    chipText: Theme.textPrimaryDark,
    progress: Theme.loadDoneSubTabBg,
    rowBg: "#F5F3FF",
    rowBorder: Theme.pulseIndigoRing,
    badgeBg: Theme.loadMainTabBg,
    metaText: "#64748b",
  },
  idle: {
    bannerBg: Theme.surface,
    bannerBorder: Theme.borderMedium,
    iconBg: Theme.pulseIndigo,
    chipBg: Theme.surfaceGray,
    chipText: Theme.textSecondary,
    progress: Theme.pulseIndigo,
    rowBg: Theme.pulseIndigoWash,
    rowBorder: Theme.pulseIndigoRing,
    badgeBg: Theme.pulseIndigo,
    metaText: Theme.textSecondary,
  },
} as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mapHero: {
    width: "100%",
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  mapChip: {
    position: "absolute",
    right: SCREEN_PAD,
    bottom: SHEET_OVERLAP + 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: { boxShadow: "0 2px 8px rgba(15,23,42,0.1)" } as object,
    }),
  },
  mapChipText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: Theme.textSecondary,
  },
  livePill: {
    position: "absolute",
    left: SCREEN_PAD,
    bottom: SHEET_OVERLAP + 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(79, 70, 229, 0.92)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#86efac",
  },
  livePillText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    letterSpacing: 0.4,
  },
  sheetStack: {
    marginTop: -SHEET_OVERLAP,
    paddingHorizontal: 0,
    gap: 8,
  },
  headerFloat: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 8,
    gap: 8,
  },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
      default: {
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.12)",
      } as object,
    }),
  },
  headerCircleBtnPressed: {
    opacity: 0.88,
  },
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
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  statusCard: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 16,
    paddingBottom: 8,
    marginHorizontal: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {
        boxShadow: "0 -8px 28px rgba(15, 23, 42, 0.12)",
      } as object,
    }),
  },
  statusBanner: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  statusBannerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
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
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
    alignSelf: "center",
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textSecondary,
  },
  statusChipTextSolid: {
    color: Theme.textOnPrimary,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  planCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  planCardLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.pulseIndigo,
    marginBottom: 10,
  },
  planCardBody: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  planBadgeCol: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  planTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingBottom: 2,
  },
  planSummary: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  planDetail: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  planDateChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
  },
  planDateChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.pulseIndigo,
  },
  etaCompactSlot: {
    alignItems: "center",
    gap: 4,
  },
  etaCompactLabel: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  routeSection: {
    marginBottom: 14,
  },
  routeSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 10,
  },
  etaBadge: {
    width: 56,
    height: 56,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  etaBadgeValue: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  etaBadgeUnit: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    marginTop: 1,
  },
  routeTimeline: {
    gap: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 48,
  },
  routeRowCurrent: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginVertical: 4,
  },
  routeRowPressed: {
    opacity: 0.9,
  },
  routeRailCol: {
    width: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  routeRailLineTop: {
    width: 2,
    flex: 1,
    backgroundColor: Theme.borderMedium,
    minHeight: 6,
  },
  routeRailLineBottom: {
    width: 2,
    flex: 1,
    backgroundColor: Theme.borderMedium,
    minHeight: 6,
  },
  routeRailDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  routeRowBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 8,
    paddingTop: 1,
    gap: 3,
  },
  routeRowBodyCurrent: {
    paddingBottom: 0,
    paddingTop: 0,
    paddingLeft: 4,
    paddingRight: 4,
  },
  routeTrailingBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: 8,
    alignSelf: "center",
  },
  routeStopLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  routeRowTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  routeRowTitleCurrent: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  routeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  routeActionText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.pulseIndigo,
  },
  routeRowSubtitle: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  offlineMeta: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  onlineMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.positive,
    marginTop: 4,
  },
  noPingCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginLeft: 34,
    marginRight: 0,
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noPingText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  actionBar: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  actionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    ...Platform.select({
      ios: {
        shadowColor: Theme.pulseIndigo,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: {} as object,
    }),
  },
  actionBtnSecondary: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnPressed: {
    opacity: 0.88,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.pulseIndigo,
  },
  reassignLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  reassignLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  activityCard: {
    marginHorizontal: SCREEN_PAD,
    marginBottom: 8,
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
  activityCardHeaderCollapsed: {
    borderBottomWidth: 0,
  },
  activityCardTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  activityCount: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginRight: 4,
  },
  timelineWrap: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  statusChangesWrap: {
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  statusChangesTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  statusChangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  statusChangeRowLast: {
    borderBottomWidth: 0,
  },
  statusChangeLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  statusChangeTime: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  emptyTimeline: {
    padding: 24,
    alignItems: "center",
  },
  emptyTimelineText: {
    fontSize: 13,
    color: Theme.textMuted,
  },
  timelineLine: {
    position: "absolute",
    left: SCREEN_PAD + 11,
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
  },
  timelineItem: {
    flexDirection: "row",
    paddingHorizontal: SCREEN_PAD,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    marginTop: 18,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
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
  timelineItemBody: {
    flex: 1,
    paddingVertical: 10,
  },
  timelineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  timelineItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  timelineItemLeft: {
    flex: 1,
    minWidth: 0,
  },
  timelineLocation: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  timelineLocationActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
  },
  timelineCoords: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
  timelineTimeBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  timelineTimeText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  expandedPanel: {
    marginTop: 10,
    padding: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    gap: 4,
  },
  expandedTitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  expandedLine: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
  },
});
