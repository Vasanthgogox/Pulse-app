import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";
import Theme from "@/constants/Theme";
import {
  CHAT_ACCENT,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
  CHAT_TEXT_SECONDARY,
} from "@/features/chat/chatTheme";
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
      <View style={s.accentRail} />
      <View style={s.cornerDot} />
      <View style={s.body}>
        <View style={s.headerRow}>
          <View style={s.iconWrap}>
            <Clock size={14} color={CHAT_ACCENT} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.kicker}>ALERT</Text>
            <Text style={s.headline}>Vehicle behind schedule</Text>
          </View>
        </View>

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

        <View style={s.footer}>
          <View style={s.pill}>
            <View style={s.pillDot} />
            <Text style={s.pillText}>{healthReadable ? "ACTIVE" : "LATE"}</Text>
          </View>
          <Text style={s.time}>{displayTime}</Text>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    alignSelf: "center",
    width: "62%",
    maxWidth: 520,
    minWidth: 240,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E9EDEF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
    position: "relative",
    overflow: "hidden",
  },
  accentRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: CHAT_ACCENT,
    opacity: 0.85,
  },
  cornerDot: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAT_ACCENT,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.55,
  },
  headline: {
    fontSize: 12,
    color: CHAT_TEXT_PRIMARY,
    fontWeight: "600",
    lineHeight: 16,
    marginTop: 1,
  },
  detail: {
    fontSize: 11,
    color: CHAT_TEXT_SECONDARY,
    lineHeight: 15,
    fontWeight: "500",
    marginTop: 1,
  },
  detailStrong: {
    color: CHAT_TEXT_PRIMARY,
    fontWeight: "600",
  },
  revisedStrong: {
    color: "#b45309",
  },
  delayLine: {
    fontSize: 11,
    color: CHAT_TEXT_SECONDARY,
    lineHeight: 15,
    fontWeight: "500",
    marginTop: 1,
  },
  delayStrong: {
    color: "#be123c",
    fontWeight: "700",
  },
  paceHint: {
    color: CHAT_TEXT_MUTED,
    fontWeight: "500",
    fontSize: 10,
  },
  footer: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E9EDEF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: Theme.cardWhite,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CHAT_ACCENT,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.45,
  },
  time: {
    fontSize: 10,
    color: CHAT_TEXT_MUTED,
    fontWeight: "500",
    letterSpacing: 0.15,
  },
});
