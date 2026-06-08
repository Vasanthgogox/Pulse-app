import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";
import type { TripMessageRow } from "../types/chat.types";
import {
  buildLongHaulLateDisplay,
  type LongHaulLateTripPlanInput,
} from "../utils/longHaulLateDisplay.util";
import {
  isLongHaulLateChatMessage,
  readLongHaulMetaFromMessage,
} from "../utils/longHaulChat.util";

export { isLongHaulLateChatMessage };

export interface LateAlertCardProps {
  message: TripMessageRow;
  /** Live rolling ETA/health from chat store (updates after pings with forward metadata). */
  liveRevisedEta?: string | null;
  liveHealthStatus?: string | null;
  /** Trip plan inputs for scheduled ETA when metadata lacks `original_eta`. */
  tripPlan?: LongHaulLateTripPlanInput | null;
}

export const LateAlertCard = React.memo(function LateAlertCard({
  message,
  liveRevisedEta,
  liveHealthStatus,
  tripPlan,
}: LateAlertCardProps) {
  const fromMsg = readLongHaulMetaFromMessage(message);
  const revisedRaw = liveRevisedEta ?? fromMsg.newEta;
  const health = liveHealthStatus ?? fromMsg.health;

  const display = useMemo(
    () =>
      buildLongHaulLateDisplay({
        revisedEta: revisedRaw,
        originalEta: fromMsg.originalEta,
        tripPlan,
      }),
    [revisedRaw, fromMsg.originalEta, tripPlan],
  );

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const healthReadable = health ? health.replace(/_/g, " ") : null;

  return (
    <View style={s.card} accessibilityRole="text">
      <View style={s.iconWrap}>
        <Clock size={18} color="#5c6bc0" strokeWidth={2.1} />
      </View>
      <View style={s.body}>
        <Text style={s.headline}>Vehicle behind schedule</Text>

        {display.scheduledEtaLabel ? (
          <Text style={s.detail}>
            Scheduled ETA:{" "}
            <Text style={s.detailStrong}>{display.scheduledEtaLabel}</Text>
          </Text>
        ) : null}

        {display.revisedEtaLabel ? (
          <Text style={s.detail}>
            Updated ETA:{" "}
            <Text style={[s.detailStrong, s.revisedStrong]}>
              {display.revisedEtaLabel}
            </Text>
          </Text>
        ) : null}

        {display.delayLabel ? (
          <Text style={s.delayLine}>
            Delay: <Text style={s.delayStrong}>{display.delayLabel}</Text>
            <Text style={s.paceHint}> · pace {display.paceLabel}</Text>
          </Text>
        ) : null}

        {healthReadable ? (
          <Text style={s.detail}>
            Health: <Text style={s.detailStrong}>{healthReadable}</Text>
          </Text>
        ) : null}

        <Text style={s.time}>{displayTime}</Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: "92%",
    marginVertical: 6,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#e8eaf6",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0, paddingTop: 1 },
  headline: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  detail: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    fontWeight: "500",
    marginTop: 2,
  },
  detailStrong: {
    color: "#334155",
    fontWeight: "600",
  },
  revisedStrong: {
    color: "#b45309",
  },
  delayLine: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    fontWeight: "500",
    marginTop: 4,
  },
  delayStrong: {
    color: "#be123c",
    fontWeight: "700",
  },
  paceHint: {
    color: "#94a3b8",
    fontWeight: "500",
    fontSize: 12,
  },
  time: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 6,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
});
