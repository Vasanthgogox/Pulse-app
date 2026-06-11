/**
 * Renders `action_card` messages in the unified trip room.
 * Metadata carries `event_type`, optional `body`, and `actions[]`.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Theme } from "@/constants/Theme";

import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

interface TripRoomAction {
  id: string;
  label: string;
}

export function TripChatRoomActionCard({
  message,
  onAction,
}: {
  message: ChatPlatformMessageRow;
  onAction?: (actionId: string, message: ChatPlatformMessageRow) => void;
}) {
  const meta = message.metadata ?? {};
  const body =
    typeof meta.body === "string" && meta.body.trim()
      ? meta.body.trim()
      : message.content?.trim() || "";
  const actions = Array.isArray(meta.actions)
    ? (meta.actions as TripRoomAction[]).filter(
        (a) => a && typeof a.id === "string" && typeof a.label === "string",
      )
    : [];

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Pulse</Text>
      <Text style={styles.title}>{message.content || "Update"}</Text>
      {body.length > 0 && body !== message.content ? (
        <Text style={styles.body}>{body}</Text>
      ) : null}
      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              style={styles.actionBtn}
              onPress={() => onAction?.(action.id, message)}
              accessibilityRole="button"
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    maxWidth: 340,
    width: "92%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 6,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: Theme.textSecondary,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 20,
  },
  body: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.primary,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
});
