import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";
import type { TripMessageRow } from "../types/chat.types";
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
}

export const LateAlertCard = React.memo(function LateAlertCard({ message, liveRevisedEta, liveHealthStatus }: LateAlertCardProps) {
  const fromMsg = readLongHaulMetaFromMessage(message);
  const newEta = liveRevisedEta ?? fromMsg.newEta;
  const health = liveHealthStatus ?? fromMsg.health;
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

  const bodyText = (message.content ?? "").trim();
  const healthReadable = health ? health.replace(/_/g, " ") : null;

  return (
    <View style={s.card} accessibilityRole="text">
      <View style={s.iconWrap}>
        <Clock size={18} color="#5c6bc0" strokeWidth={2.1} />
      </View>
      <View style={s.body}>
        <Text style={s.headline}>Vehicle behind schedule</Text>
        {newEta ? (
          <Text style={s.detail}>
            Revised ETA: <Text style={s.detailStrong}>{newEta}</Text>
          </Text>
        ) : null}
        {healthReadable ? (
          <Text style={s.detail}>
            Health: <Text style={s.detailStrong}>{healthReadable}</Text>
          </Text>
        ) : null}
        {bodyText ? <Text style={s.detail}>{bodyText}</Text> : null}
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
  time: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 6,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
});
