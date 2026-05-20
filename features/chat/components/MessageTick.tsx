import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import type { MessageDeliveryStatus } from "../types/chat.types";

export interface MessageTickProps {
  /** When undefined, outgoing bubble shows no tick rail (e.g. non-chat types). */
  status?: MessageDeliveryStatus;
  /** Smaller footprint inside dense meta rows. */
  compact?: boolean;
}

/**
 * WhatsApp-style delivery ticks for **outgoing** chat rows.
 * Maps `delivery_status` from `useChatStore` / Realtime ACKs.
 */
export function MessageTick({ status, compact }: MessageTickProps) {
  const size = compact ? 9 : 11;
  const gap = compact ? 1 : 2;

  if (!status || status === "sending") {
    return (
      <View style={styles.wrap} accessibilityLabel="Sending">
        <FontAwesome name="clock-o" size={size} color={Theme.textMuted} />
      </View>
    );
  }

  if (status === "sent") {
    return (
      <Text
        style={[styles.tick, { fontSize: size + 2, color: Theme.textMuted }]}
        accessibilityLabel="Sent"
      >
        ✓
      </Text>
    );
  }

  if (status === "delivered") {
    return (
      <Text
        style={[
          styles.tick,
          { fontSize: size + 2, color: Theme.textMuted, letterSpacing: gap },
        ]}
        accessibilityLabel="Delivered"
      >
        ✓✓
      </Text>
    );
  }

  return (
    <Text
      style={[
        styles.tick,
        { fontSize: size + 2, color: Theme.primary, letterSpacing: gap },
      ]}
      accessibilityLabel="Read"
    >
      ✓✓
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginLeft: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  tick: {
    marginLeft: 4,
    fontWeight: "700",
  },
});
