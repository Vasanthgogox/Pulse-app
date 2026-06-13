import Feather from "@expo/vector-icons/Feather";
import { Activity, PlusCircle } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalDriverTripOps } from "@/contexts/DriverTripOpsContext";

type MenuAction = {
  id: string;
  label: string;
  hint: string;
  Icon: typeof PlusCircle;
  iconTint: string;
  iconBg: string;
  onPress: () => void;
};

type Props = {
  bottomOffset: number;
};

export function DriverTabBarOpsMenu({ bottomOffset }: Props) {
  const ops = useOptionalDriverTripOps();
  if (!ops?.opsMenuOpen) return null;

  const actions: MenuAction[] = [];
  if (ops.showExpenseOps) {
    actions.push({
      id: "expense",
      label: "Add expense",
      hint: "Fuel · toll · parking & more",
      Icon: PlusCircle,
      iconTint: Theme.driverEmeraldDark,
      iconBg: Theme.driverEmeraldMuted,
      onPress: ops.openExpense,
    });
  }
  if (ops.showOdometerOps) {
    actions.push({
      id: "odometer",
      label: "Odometer",
      hint: "Start · end · both",
      Icon: Activity,
      iconTint: "#4338ca",
      iconBg: "rgba(99,102,241,0.12)",
      onPress: ops.openOdometer,
    });
  }
  if (actions.length === 0) {
    actions.push(
      {
        id: "expense-fallback",
        label: "Add expense",
        hint: "Fuel · toll · parking & more",
        Icon: PlusCircle,
        iconTint: Theme.driverEmeraldDark,
        iconBg: Theme.driverEmeraldMuted,
        onPress: ops.openExpense,
      },
      {
        id: "odometer-fallback",
        label: "Odometer",
        hint: "Start · end · both",
        Icon: Activity,
        iconTint: "#4338ca",
        iconBg: "rgba(99,102,241,0.12)",
        onPress: ops.openOdometer,
      },
    );
  }

  return (
    <View
      style={[styles.wrap, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      <Animated.View entering={FadeInUp.springify()} style={styles.card}>
        <Text style={styles.cardKicker}>Trip actions</Text>
        {actions.map((action, index) => (
          <Pressable
            key={action.id}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowBorder,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={[styles.iconBadge, { backgroundColor: action.iconBg }]}>
              <action.Icon size={15} color={action.iconTint} strokeWidth={2.2} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.label}>{action.label}</Text>
              <Text style={styles.hint}>{action.hint}</Text>
            </View>
            <Feather name="chevron-right" size={14} color={Theme.textMuted} />
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    zIndex: 1001,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  card: {
    width: 228,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  cardKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 50,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  rowPressed: {
    backgroundColor: Theme.driverEmeraldMuted,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  hint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
