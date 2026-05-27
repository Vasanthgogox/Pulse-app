/**
 * Full-screen Live Tracking modal — extracted from TripDetailScreen.
 * Shows real-time map, vehicle card, and the driver's activity timeline.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TripRow } from "../../../services/trips.service";
import type { TripAssignmentAuditRow } from "../../../services/trip-assignment-audit.service";
import { TrackingMapBlock, VehicleTrackingCard } from "../TrackingMapBlock";
import type { DriverActivityTimelineRow } from "../hooks/useTripDetail";
import type { TrackingState } from "@/features/tracking/hooks/useTrackingState";

interface LiveTrackingModalProps {
  visible: boolean;
  onClose: () => void;

  trip: TripRow;
  isClientIndentView?: boolean;
  trackingState: TrackingState;

  // Map props
  vehicleLabel: string | null;
  locationLabels: [string, string, string, string, string];
  originCoordinate: { latitude: number; longitude: number } | null;
  destinationCoordinate: { latitude: number; longitude: number } | null;
  tripLocationPoints: { latitude: number; longitude: number; recorded_at: string }[];
  locationAddress: string | null;

  // Timeline props
  driverActivityTimelineRows: DriverActivityTimelineRow[];
  expandedTimelineEntryIds: Record<string, boolean>;
  onToggleTimelineItem: (id: string) => void;
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  driverName: string | null;
  currentUserId: string | null;
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
  isClientIndentView,
  trackingState,
  vehicleLabel,
  locationLabels,
  originCoordinate,
  destinationCoordinate,
  tripLocationPoints,
  locationAddress,
  driverActivityTimelineRows,
  expandedTimelineEntryIds,
  onToggleTimelineItem,
  assignmentDriverNames,
  assignmentVehicleLabels,
  driverName,
  currentUserId,
}: LiveTrackingModalProps) {
  const insets = useSafeAreaInsets();
  const isDriverOffline = !trackingState.driverOnline;
  const { step, label } = trackingStepAndLabel(trip?.status ?? "draft");
  const statusChangeRowsOnly = driverActivityTimelineRows.filter(
    (r) => r.kind === "status",
  ) as Extract<DriverActivityTimelineRow, { kind: "status" }>[];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backBtn}
            activeOpacity={0.8}
            accessibilityLabel="Close tracking"
          >
            <FontAwesome name="chevron-left" size={18} color={Theme.textMuted} />
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Live Tracking</Text>
            <Text style={[styles.subtitle, isDriverOffline && styles.subtitleOffline]}>
              {isDriverOffline ? "Driver Node Offline" : "Real-time Connection Active"}
            </Text>
          </View>
          <View style={[styles.iconWrap, isDriverOffline && styles.iconWrapOffline]}>
            <FontAwesome
              name={isDriverOffline ? "exclamation-circle" : "map"}
              size={18}
              color={isDriverOffline ? Theme.negative : Theme.primary}
            />
          </View>
        </View>

        {isDriverOffline ? (
          <DriverOfflineState
            isClientIndentView={isClientIndentView}
            onClose={onClose}
            insets={insets}
          />
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: 24 + insets.bottom },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <TrackingMapBlock
                mapHeight={Math.min(Dimensions.get("window").height * 0.38, 300)}
                vehicleLabel={vehicleLabel}
                locationLabels={locationLabels}
                originCoordinate={originCoordinate}
                destinationCoordinate={destinationCoordinate}
                latestLocation={trackingState.currentPosition}
                isLocating={!trackingState.broadcastActive && !trackingState.currentPosition}
                tripLocationPoints={tripLocationPoints}
                locationAddress={locationAddress}
              />

              <VehicleTrackingCard
                vehicleLabel={vehicleLabel}
                cardStatusText={
                  trackingState.broadcastActive
                    ? "LIVE"
                    : trackingState.currentPosition
                      ? "Last known"
                      : "No location yet"
                }
                cardSubtext={
                  trackingState.currentPosition
                    ? `${locationAddress?.trim() || "Location available"} · ${trackingState.lastSeenLabel}`
                    : "Open map to see driver position"
                }
              />

              {/* Timeline */}
              <View style={styles.timelineWrap}>
                <View style={styles.timelineHeader}>
                  <FontAwesome name="list-alt" size={14} color={Theme.primary} />
                  <Text style={styles.timelineTitle}>Driver's Activity Timeline</Text>
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>Live Updates</Text>
                  </View>
                </View>

                <View style={styles.currentStep}>
                  <Text style={styles.currentStepLabel}>Current step</Text>
                  <Text style={styles.currentStepValue}>
                    Step {step} of 4 — {label}
                  </Text>
                </View>

                {statusChangeRowsOnly.length > 0 && (
                  <View style={styles.statusChangesWrap}>
                    <Text style={styles.statusChangesTitle}>Status changes</Text>
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
                )}

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
                                  ["Recorded at", formatAssignmentDate(item.changed_at)],
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
                          ? (assignmentDriverNames[row.driver_id_prev] ?? row.driver_id_prev)
                          : null;
                      const driverNew = row.driver_id_new
                        ? (assignmentDriverNames[row.driver_id_new] ??
                           (isFallback ? driverName ?? null : row.driver_id_new))
                        : null;
                      const vehiclePrev =
                        !isFallback && row.vehicle_id_prev
                          ? (assignmentVehicleLabels[row.vehicle_id_prev] ?? row.vehicle_id_prev)
                          : null;
                      const vehicleNew = row.vehicle_id_new
                        ? (assignmentVehicleLabels[row.vehicle_id_new] ??
                           (isFallback ? vehicleLabel ?? null : row.vehicle_id_new))
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
                      const detail = [driverLine, vehicleLine].filter(Boolean).join("  ·  ");

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
                                ["Driver update", driverLine ?? "No driver change recorded"],
                                ["Vehicle update", vehicleLine ?? "No vehicle change recorded"],
                                ["Updated by", byLabel ? byLabel.replace(" · ", "") : "System"],
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
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.doneBtn}
                activeOpacity={0.8}
              >
                <FontAwesome name="shield" size={18} color={Theme.primary} />
                <Text style={styles.doneBtnText}>Done Viewing Timeline</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DriverOfflineState({
  isClientIndentView,
  onClose,
  insets,
}: {
  isClientIndentView?: boolean;
  onClose: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  return (
    <View style={[styles.offlineRoot, { paddingBottom: 24 + insets.bottom }]}>
      <View style={styles.offlineContent}>
        <View style={styles.offlineIconWrap}>
          <FontAwesome name="user-times" size={48} color={Theme.negative} />
        </View>
        <Text style={styles.offlineTitle}>Driver is Offline</Text>
        <Text style={styles.offlineMessage}>
          Assigned driver node is currently disconnected. Please ask the driver to{" "}
          <Text style={styles.offlineMessageBold}>login</Text> and{" "}
          <Text style={styles.offlineMessageBold}>accept the trip</Text> to activate journey
          tracking.
        </Text>
        <View style={styles.offlineActions}>
          <TouchableOpacity
            style={styles.offlineBtnPrimary}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <FontAwesome name="bell" size={16} color={Theme.primary} />
            <Text style={styles.offlineBtnPrimaryText}>Send Login Reminder</Text>
          </TouchableOpacity>
          {!isClientIndentView && (
            <TouchableOpacity
              style={styles.offlineBtnSecondary}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.offlineBtnSecondaryText}>Re-assign Driver</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.offlineProtocol}>
          <FontAwesome name="lock" size={12} color={Theme.textMuted} />
          <Text style={styles.offlineProtocolText}>Encrypted Grid Protocol v4.2</Text>
        </View>
      </View>
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
  expandedContent: React.ReactNode;
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.positive,
    letterSpacing: 1,
    marginTop: 4,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  subtitleOffline: {
    color: Theme.negative,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(79,70,229,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOffline: {
    backgroundColor: "rgba(232,33,39,0.08)",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  // ── Offline state ──
  offlineRoot: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  offlineContent: {
    alignItems: "center",
  },
  offlineIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(232,33,39,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  offlineMessage: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  offlineMessageBold: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  offlineActions: {
    width: "100%",
    gap: 10,
    marginBottom: 24,
  },
  offlineBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.04)",
  },
  offlineBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  offlineBtnSecondary: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  offlineBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  offlineProtocol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offlineProtocolText: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  // ── Timeline ──
  timelineWrap: {
    marginTop: 12,
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginBottom: 8,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  timelineTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  liveBadge: {
    backgroundColor: "rgba(21,128,61,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.positive,
    letterSpacing: 0.5,
  },
  currentStep: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(79,70,229,0.04)",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  currentStepLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  currentStepValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  statusChangesWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 12,
    fontWeight: "600",
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
    left: 31,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Theme.borderLight,
  },
  timelineItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
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
    backgroundColor: Theme.primary,
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.textOnPrimary,
  },
  timelineItemBody: {
    flex: 1,
    paddingVertical: 12,
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
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  timelineLocationActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
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
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  expandedPanel: {
    marginTop: 10,
    padding: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    gap: 4,
  },
  expandedTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  expandedLine: {
    fontSize: 11,
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
});
