import Feather from "@expo/vector-icons/Feather";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

type Props = {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  iconTint: string;
  iconBg: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

export function DriverOpsLauncherOption({
  title,
  subtitle,
  Icon,
  iconTint,
  iconBg,
  onPress,
  accessibilityLabel,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconTint} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={Theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minHeight: 68,
  },
  rowPressed: {
    opacity: 0.92,
    backgroundColor: Theme.driverEmeraldMuted,
    borderColor: "rgba(4,120,87,0.22)",
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
});
