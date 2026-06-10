import { StyleSheet, Text, View } from "react-native";
import { PULSE_CHAT } from "@/features/chat/components/mobile/chatSlackMobile.styles";

export function ChatUnreadDivider({ count }: { count?: number }) {
  const label = count ? `${count} new message${count > 1 ? "s" : ""}` : "New messages";
  return (
    <View style={styles.wrap}>
      <View style={styles.line} />
      <View style={styles.pill}>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(91, 94, 244, 0.35)",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.4)",
    backgroundColor: "rgba(91, 94, 244, 0.06)",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: PULSE_CHAT.accent,
    letterSpacing: 0.2,
  },
});
