import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PULSE_CHAT } from "@/features/chat/components/mobile/chatSlackMobile.styles";

export type ChatReactions = Record<string, string[]>;

type ReactionEntry = {
  emoji: string;
  count: number;
  hasOwn: boolean;
};

function parseReactions(
  reactions: ChatReactions | null | undefined,
  selfUserId: string | null | undefined,
): ReactionEntry[] {
  if (!reactions) return [];
  return Object.entries(reactions)
    .filter(([, users]) => Array.isArray(users) && users.length > 0)
    .map(([emoji, users]) => ({
      emoji,
      count: users.length,
      hasOwn: selfUserId ? users.includes(selfUserId) : false,
    }));
}

export function ChatReactionsRow({
  reactions,
  selfUserId,
  onToggle,
  avatarOffset = 36,
  variant = "mobile",
}: {
  reactions: ChatReactions | null | undefined;
  selfUserId: string | null | undefined;
  onToggle: (emoji: string) => void;
  /** Left margin to align under message body (after avatar column). */
  avatarOffset?: number;
  variant?: "mobile" | "desktop";
}) {
  const entries = parseReactions(reactions, selfUserId);
  if (entries.length === 0) return null;

  return (
    <View style={[styles.row, { marginLeft: avatarOffset }]}>
      {entries.map((entry) => (
        <TouchableOpacity
          key={entry.emoji}
          style={[
            styles.chip,
            entry.hasOwn && styles.chipOwn,
            variant === "desktop" && styles.chipDesktop,
          ]}
          onPress={() => onToggle(entry.emoji)}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`${entry.emoji} ${entry.count} reaction${entry.count > 1 ? "s" : ""}`}
        >
          <Text style={styles.emoji}>{entry.emoji}</Text>
          <Text
            style={[
              styles.count,
              entry.hasOwn && styles.countOwn,
            ]}
          >
            {entry.count}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 4,
    marginBottom: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  chipOwn: {
    borderColor: "rgba(91, 94, 244, 0.45)",
    backgroundColor: "rgba(91, 94, 244, 0.08)",
  },
  chipDesktop: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  emoji: {
    fontSize: 13,
    lineHeight: 17,
  },
  count: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    lineHeight: 16,
  },
  countOwn: {
    color: PULSE_CHAT.accent,
  },
});
