import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

const FAB_SIZE = Layout.fabSize;
const FAB_GAP = 12;
const LABEL_HEIGHT = 36;

type FabAction = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  gradient: [string, string];
  onPress: () => void;
  delay: number;
};

type Props = {
  showExpense: boolean;
  showOdometer: boolean;
  onExpensePress: () => void;
  onOdometerPress: () => void;
};

function FloatingActionButton({
  action,
  bottom,
}: {
  action: FabAction;
  bottom: number;
}) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(action.delay, withSpring(1, { damping: 14, stiffness: 180 }));
    opacity.value = withDelay(action.delay, withSpring(1, { damping: 16, stiffness: 200 }));
  }, [action.delay, opacity, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      entering={FadeInRight.delay(action.delay).springify()}
      style={[styles.fabRow, { bottom }, animStyle]}
    >
      <View style={styles.labelPill}>
        <Text style={styles.labelText}>{action.label}</Text>
      </View>
      <Pressable
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => [styles.fabPress, pressed && styles.fabPressed]}
      >
        <LinearGradient
          colors={action.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Feather name={action.icon} size={20} color="#fff" />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function TripDetailFloatingActions({
  showExpense,
  showOdometer,
  onExpensePress,
  onOdometerPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const baseBottom = Math.max(insets.bottom, 12) + 20;

  const actions: FabAction[] = [];
  if (showExpense) {
    actions.push({
      id: "expense",
      label: "Add expense",
      icon: "plus-circle",
      gradient: ["#047857", "#10b981"],
      onPress: onExpensePress,
      delay: 0,
    });
  }
  if (showOdometer) {
    actions.push({
      id: "odometer",
      label: "Odometer",
      icon: "activity",
      gradient: ["#3730a3", "#6366f1"],
      onPress: onOdometerPress,
      delay: showExpense ? 80 : 0,
    });
  }

  if (actions.length === 0) return null;

  return (
    <View style={styles.cluster} pointerEvents="box-none">
      {actions.map((action, index) => (
        <FloatingActionButton
          key={action.id}
          action={action}
          bottom={baseBottom + index * (FAB_SIZE + FAB_GAP)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  fabRow: {
    position: "absolute",
    right: Layout.fabRightOffset,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  labelPill: {
    height: LABEL_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  labelText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  fabPress: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: Layout.fabBorderRadius,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: Theme.darkBackground,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  fabGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
