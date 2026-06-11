/**
 * Unified trip team rooms in the Chat hub sidebar (Phase 3).
 *
 * Surfaces `conversation_type = 'trip'` rows from `get_chat_inbox` above the
 * legacy 3-lane trip hub list.
 */
import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Users } from "lucide-react-native";

import { Theme } from "@/constants/Theme";
import { useChatInboxQuery } from "@/lib/queries/useChatInboxQuery";

import type { ChatInboxItem } from "../types/chatPlatform.types";

export interface ChatTripRoomInboxSectionProps {
  organizationId: string | null;
  onOpenTripRoom: (tripId: string) => void;
  style?: StyleProp<ViewStyle>;
  maxRows?: number;
}

function TripRoomRow({
  item,
  onPress,
}: {
  item: ChatInboxItem;
  onPress: () => void;
}) {
  const unread = item.unread_count > 0;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open team chat for ${item.title ?? "trip"}`}
    >
      <View style={styles.iconWrap}>
        <Users size={16} color={Theme.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title ?? "Trip team"}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {item.last_message_preview?.trim() || "Team room · all parties"}
        </Text>
      </View>
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {item.unread_count > 99 ? "99+" : item.unread_count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ChatTripRoomInboxSection({
  organizationId,
  onOpenTripRoom,
  style,
  maxRows = 12,
}: ChatTripRoomInboxSectionProps) {
  const { data: inbox = [] } = useChatInboxQuery(organizationId);

  const tripRooms = useMemo(
    () =>
      inbox
        .filter((item) => item.conversation_type === "trip" && item.trip_id)
        .slice(0, maxRows),
    [inbox, maxRows],
  );

  if (!organizationId || tripRooms.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionLabel}>Team rooms</Text>
      {tripRooms.map((item) => (
        <TripRoomRow
          key={item.id}
          item={item}
          onPress={() => {
            if (item.trip_id) onOpenTripRoom(item.trip_id);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  rowPressed: {
    backgroundColor: Theme.pulseIndigoWash,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.pulseIndigoWash,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  preview: {
    marginTop: 2,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
});
