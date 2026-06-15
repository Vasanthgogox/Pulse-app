import { Pressable, StyleSheet, Text, View } from "react-native";

export function formatChatDividerDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: msgDay.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/** Shorter label for narrow cash-flow day dividers (e.g. "13 Jun"). */
export function formatChatDividerDateCompact(dateStr: string): string {
  const full = formatChatDividerDate(dateStr);
  if (full === "Today" || full === "Yesterday") return full;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: msgDay.getFullYear() !== now.getFullYear() ? "2-digit" : undefined,
  });
}

type Props = {
  dateStr?: string;
  /** When set, skips parsing `dateStr` (e.g. "Other"). */
  label?: string;
  variant?: "mobile" | "desktop";
  onPress?: () => void;
};

export function ChatDateDivider({
  dateStr,
  label: labelOverride,
  variant = "mobile",
  onPress,
}: Props) {
  const label = labelOverride ?? (dateStr ? formatChatDividerDate(dateStr) : "");
  if (!label) return null;

  const body = (
    <View style={[styles.wrap, variant === "desktop" && styles.wrapDesktop]}>
      <View style={styles.line} />
      <Text style={[styles.label, variant === "desktop" && styles.labelDesktop]}>
        {label}
      </Text>
      <View style={styles.line} />
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 7,
  },
  wrapDesktop: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#CBD5E1",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.25,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  labelDesktop: {
    fontSize: 10.5,
    color: "#64748B",
    borderColor: "rgba(100,116,139,0.34)",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
});
