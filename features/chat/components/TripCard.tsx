import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Bell, Network, Truck } from "lucide-react-native";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import type { ChatTripFlow } from "@/features/chat/types/chat.types";

export type TripCardProps = {
  tripActive: boolean;
  totalUnread: number;
  onPressHero: () => void;
  tripLabel: string;
  pickup: string;
  drop: string;
  hubDateLabel: string | null;
  statusLabel: string;
  isUnassignedBadge: boolean;
  /** Integrated indent-backed trip — show network icon in title row. */
  chatFlow: ChatTripFlow;
  /** When set, treat as integrated for hub lavender chip even if chatFlow is stale. */
  indentId?: string | null;
  /** From merged chat store stream (e.g. RUNNING_LATE). */
  trackingStatus: string | null;
  /** Client / Supplier / Driver icon buttons row. */
  partyIconRow: React.ReactNode;
  lastActivityPartyLabel: string | null;
  lastMessagePreview: string | null;
};

/**
 * All-trips hub row: multi-lane indicators + optional RUNNING_LATE preview override.
 */
export function TripCard({
  tripActive,
  totalUnread,
  onPressHero,
  tripLabel,
  pickup,
  drop,
  hubDateLabel,
  statusLabel,
  isUnassignedBadge,
  chatFlow,
  indentId = null,
  trackingStatus,
  partyIconRow,
  lastActivityPartyLabel,
  lastMessagePreview,
}: TripCardProps) {
  const showIntegrated =
    chatFlow === "integrated_group" ||
    Boolean(indentId && String(indentId).trim());
  const showVehicleLate = trackingStatus === "RUNNING_LATE";

  return (
    <View style={[styles.tripHubCard, tripActive && styles.tripHubCardOn]}>
      {totalUnread > 0 ? (
        <View style={[styles.tripHubAlertBar, tripActive && styles.tripHubAlertBarOn]}>
          <Bell size={13} color={tripActive ? "#fecdd3" : "#e11d48"} />
          <Text style={[styles.tripHubAlertBarText, tripActive && styles.tripHubAlertBarTextOn]}>
            Trip alerts · {totalUnread > 99 ? "99+" : String(totalUnread)}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity onPress={onPressHero} activeOpacity={0.88} style={styles.tripHubHeroTouchable}>
        <View style={styles.tripHubHeroRow}>
          <View style={styles.tripHubHeroMain}>
            <View style={[styles.tripHubTruckPill, tripActive && styles.tripHubTruckPillOn]}>
              <Truck size={14} color="#ffffff" />
            </View>
            <View style={styles.tripHubHeroTextCol}>
              <View style={styles.tripHubTitleRow}>
                {showIntegrated ? (
                  <View style={styles.networkIconWrap} accessibilityLabel="Integrated network trip">
                    <Network size={14} color={tripActive ? "#a5b4fc" : CHAT_ACCENT} strokeWidth={2.4} />
                  </View>
                ) : null}
                {chatFlow === "private_trip" ? (
                  <View
                    style={[
                      styles.hubFlowBadge,
                      tripActive ? styles.hubFlowBadgeManualOn : styles.hubFlowBadgeManual,
                    ]}
                  >
                    <Text
                      style={[
                        styles.hubFlowBadgeText,
                        tripActive && styles.hubFlowBadgeTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      [MANUAL]
                    </Text>
                  </View>
                ) : null}
                {chatFlow === "integrated_group" ? (
                  <View
                    style={[
                      styles.hubFlowBadge,
                      tripActive ? styles.hubFlowBadgeIntegratedOn : styles.hubFlowBadgeIntegrated,
                    ]}
                  >
                    <Text
                      style={[
                        styles.hubFlowBadgeText,
                        tripActive && styles.hubFlowBadgeTextIntegratedOn,
                      ]}
                      numberOfLines={1}
                    >
                      [INTEGRATED]
                    </Text>
                  </View>
                ) : null}
                <Text
                  style={[styles.tripHubTripTitle, tripActive && styles.tripHubTripTitleOn]}
                  numberOfLines={1}
                >
                  {tripLabel}
                </Text>
              </View>
              <View style={styles.tripHubRouteRow}>
                <View style={styles.tripHubRouteTextWrap}>
                  <Text
                    style={[styles.tripHubRouteLarge, tripActive && styles.tripHubRouteLargeOn]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {pickup} {"→"} {drop}
                  </Text>
                </View>
                {hubDateLabel ? (
                  <Text
                    style={[styles.tripHubRouteDate, tripActive && styles.tripHubRouteDateOn]}
                    numberOfLines={1}
                  >
                    {hubDateLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          <View style={styles.tripHubHeroTrail}>
            <Text
              style={[
                styles.tripHubStatusPill,
                isUnassignedBadge
                  ? tripActive
                    ? styles.tripHubStatusPillUnassignedOn
                    : styles.tripHubStatusPillUnassigned
                  : tripActive
                    ? styles.tripHubStatusPillAssignedOn
                    : styles.tripHubStatusPillAssigned,
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
            {totalUnread > 0 ? (
              <View style={styles.tripHubTotalUnread}>
                <Text style={styles.tripHubTotalUnreadText}>
                  {totalUnread > 9 ? "9+" : String(totalUnread)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.tripHubPartyIconRow}>{partyIconRow}</View>
      {(showVehicleLate || (lastActivityPartyLabel && lastMessagePreview)) ? (
        <Text style={[styles.tripHubLastMsg, tripActive && styles.tripHubLastMsgOn]} numberOfLines={1}>
          {showVehicleLate ? (
            <Text style={styles.vehicleLateText}>🚨 VEHICLE LATE</Text>
          ) : (
            <>
              <Text style={[styles.tripHubLastMsgParty, tripActive && styles.tripHubLastMsgOn]}>
                {lastActivityPartyLabel}:{" "}
              </Text>
              {lastMessagePreview}
            </>
          )}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tripHubCard: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#f1f5f9",
    padding: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  tripHubCardOn: {
    backgroundColor: "#020617",
    borderColor: "#020617",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  tripHubAlertBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderLeftWidth: 3,
    borderLeftColor: "#f43f5e",
  },
  tripHubAlertBarOn: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderColor: "rgba(244,63,94,0.35)",
    borderLeftColor: "#fb7185",
  },
  tripHubAlertBarText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
    color: "#be123c",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  tripHubAlertBarTextOn: {
    color: "#fecdd3",
  },
  tripHubHeroTouchable: {
    marginBottom: 10,
  },
  tripHubHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripHubHeroMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripHubHeroTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  tripHubTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  networkIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hubFlowBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  hubFlowBadgeManual: {
    backgroundColor: "rgba(100,116,139,0.18)",
    borderWidth: 1,
    borderColor: "rgba(100,116,139,0.35)",
  },
  hubFlowBadgeManualOn: {
    backgroundColor: "rgba(148,163,184,0.22)",
    borderColor: "rgba(226,232,240,0.45)",
  },
  hubFlowBadgeIntegrated: {
    backgroundColor: "rgba(167,139,250,0.22)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.45)",
  },
  hubFlowBadgeIntegratedOn: {
    backgroundColor: "rgba(196,181,253,0.2)",
    borderColor: "rgba(196,181,253,0.55)",
  },
  hubFlowBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: "#475569",
  },
  hubFlowBadgeTextOn: {
    color: "#e2e8f0",
  },
  hubFlowBadgeTextIntegratedOn: {
    color: "#e9d5ff",
  },
  tripHubHeroTrail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  tripHubTotalUnread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tripHubTotalUnreadText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 9,
  },
  tripHubTruckPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tripHubTruckPillOn: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tripHubStatusPill: {
    flexShrink: 0,
    maxWidth: 108,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    overflow: "hidden",
  },
  tripHubStatusPillAssigned: {
    backgroundColor: "#059669",
    color: "#ffffff",
  },
  tripHubStatusPillAssignedOn: {
    backgroundColor: "#059669",
    color: "#ffffff",
  },
  tripHubStatusPillUnassigned: {
    backgroundColor: "#64748b",
    color: "#ffffff",
  },
  tripHubStatusPillUnassignedOn: {
    backgroundColor: "#64748b",
    color: "#ffffff",
  },
  tripHubTripTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.35,
    lineHeight: 16,
  },
  tripHubTripTitleOn: {
    color: "#ffffff",
  },
  tripHubRouteLarge: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 11,
  },
  tripHubRouteLargeOn: {
    color: "rgba(248,250,252,0.52)",
  },
  tripHubRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  tripHubRouteTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tripHubRouteDate: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.25,
    flexShrink: 0,
  },
  tripHubRouteDateOn: {
    color: "rgba(248,250,252,0.45)",
  },
  tripHubPartyIconRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    marginTop: 2,
  },
  tripHubLastMsg: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: "400",
    color: "#64748b",
    lineHeight: 12,
    letterSpacing: 0.1,
  },
  tripHubLastMsgOn: {
    color: "rgba(248,250,252,0.55)",
  },
  tripHubLastMsgParty: {
    fontWeight: "400",
    color: "#94a3b8",
  },
  vehicleLateText: {
    fontWeight: "900",
    color: "#dc2626",
    fontSize: 10,
    letterSpacing: 0.4,
  },
});
