import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { TripMessageRow } from "../types/chat.types";

export function isLongHaulLateChatMessage(message: TripMessageRow): boolean {
  if (message.message_type !== "system_log") return false;
  const m = message.metadata as Record<string, unknown> | null | undefined;
  if (m?.long_haul_late === true) return true;
  const ep =
    m?.event_payload && typeof m.event_payload === "object" && !Array.isArray(m.event_payload)
      ? (m.event_payload as Record<string, unknown>)
      : null;
  return String(ep?.event_tag ?? "").toUpperCase() === "LATE";
}

function readLateMeta(message: TripMessageRow): { newEta: string | null; health: string | null } {
  const m = message.metadata as Record<string, unknown> | null | undefined;
  const ep =
    m?.event_payload && typeof m.event_payload === "object" && !Array.isArray(m.event_payload)
      ? (m.event_payload as Record<string, unknown>)
      : null;
  const newEta = typeof ep?.new_eta === "string" ? ep.new_eta.trim() : null;
  const health = typeof ep?.health_status === "string" ? ep.health_status.trim() : null;
  return { newEta: newEta || null, health: health || null };
}

/**
 * Long-haul schedule slip (`event_payload.event_tag === 'LATE'`) — distinct from generic system lines.
 */
export function LateAlertCard({ message }: { message: TripMessageRow }) {
  const { newEta, health } = readLateMeta(message);
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

  return (
    <View style={s.card} accessibilityRole="text">
      <View style={s.iconWrap}>
        <AlertTriangle size={18} color="#b91c1c" />
      </View>
      <View style={s.body}>
        <Text style={s.tag}>LATE</Text>
        <Text style={s.title}>Vehicle behind schedule</Text>
        {newEta ? (
          <Text style={s.sub}>
            Revised ETA: <Text style={s.etaEm}>{newEta}</Text>
          </Text>
        ) : null}
        {health ? (
          <Text style={s.muted}>
            Health: {health.replace(/_/g, " ")}
          </Text>
        ) : null}
        <Text style={s.content}>{message.content}</Text>
        <Text style={s.time}>{displayTime}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#fecaca",
    maxWidth: "100%",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  tag: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b91c1c",
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 4,
  },
  sub: { fontSize: 13, color: Theme.textSecondary, marginBottom: 2 },
  etaEm: { fontWeight: "700", color: Theme.textPrimary },
  muted: { fontSize: 12, color: Theme.textSecondary, marginBottom: 4 },
  content: { fontSize: 13, color: Theme.textPrimary, lineHeight: 18 },
  time: { fontSize: 11, color: Theme.textSecondary, marginTop: 6 },
});
