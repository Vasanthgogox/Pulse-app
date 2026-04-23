/**
 * Clean, professional Treasury/Finance FAB.
 * Positioning: this component is presentational only. The parent screen
 * should wrap it in an absolutely positioned container.
 */
import Theme from "@/constants/Theme";
import {
  Building2,
  CirclePlus,
  Package,
  Plus,
  Receipt,
  ReceiptText,
  Route,
  Truck,
  User,
  Warehouse,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
  type StyleProp,
} from "react-native";

const FAB_SIZE = 56;

export type FABIconName =
  | "plus"
  | "receipt-text"
  | "credit-card"
  | "user"
  | "user-plus"
  | "building"
  | "warehouse"
  | "truck"
  | "road"
  | "package";

export interface FinanceFABProps {
  onPress: () => void;
  accessibilityLabel: string;
  /** Semantic add icon for the current action context. */
  icon?: FABIconName;
  iconSize?: number;
  /** When true (default), shows a small plus suffix so users understand it's an add action. */
  showPlusSuffix?: boolean;
  testID?: string;
  /** Optional style merge (e.g. from parent); do not use for positioning — Screen owns position. */
  style?: StyleProp<ViewStyle>;
  /** Optional larger visible action button size (default 56). */
  size?: number;
}

function triggerHapticMedium() {
  try {
    const Haptics = require("expo-haptics");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch {
    // expo-haptics not installed or unavailable
  }
}

function getLucideIcon(name: FABIconName): LucideIcon {
  switch (name) {
    case "receipt-text":
    case "credit-card":
      return ReceiptText;
    case "user":
    case "user-plus":
      return User;
    case "building":
      return Building2;
    case "warehouse":
      return Warehouse;
    case "truck":
      return Truck;
    case "road":
      return Route;
    case "package":
      return Package;
    case "plus":
    default:
      return Plus;
  }
}

export function FinanceFAB({
  onPress,
  accessibilityLabel,
  icon = "plus",
  iconSize = 24,
  showPlusSuffix = true,
  testID,
  style,
  size = FAB_SIZE,
}: FinanceFABProps) {
  const pulseA = React.useRef(new Animated.Value(0)).current;
  const pulseB = React.useRef(new Animated.Value(0)).current;
  const pressScale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const mkPulse = (anim: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }),
        ]),
      );

    const a = mkPulse(pulseA, 0);
    const b = mkPulse(pulseB, 380);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [pulseA, pulseB]);

  const handlePress = () => {
    triggerHapticMedium();
    onPress();
  };
  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.94,
      friction: 7,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const fabBgColor = Theme.fabBackground ?? Theme.buttonMatteBlack ?? "#111827";
  const fabIconColor = Theme.fabText ?? Theme.buttonMatteBlackText ?? "#FFFFFF";
  const IconComponent = getLucideIcon(icon);
  const shouldShowPlus = showPlusSuffix && icon !== "plus";
  const pulseStyleA = {
    opacity: pulseA.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0] }),
    transform: [{ scale: pulseA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
  } as const;
  const pulseStyleB = {
    opacity: pulseB.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0] }),
    transform: [{ scale: pulseB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  } as const;

  const MainIcon = icon === "receipt-text" || icon === "credit-card" ? Receipt : IconComponent;

  return (
    <View style={[styles.container, { width: size, height: size }, style, { pointerEvents: 'box-none' }]}>
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, backgroundColor: `${fabBgColor}30` },
          pulseStyleA,
        ]}
      />
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2, backgroundColor: `${fabBgColor}1F` },
          pulseStyleB,
        ]}
      />
      <TouchableOpacity
        testID={testID}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        accessibilityLabel={accessibilityLabel}
      >
        <Animated.View
          style={[
            styles.fab,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fabBgColor,
              transform: [{ scale: pressScale }],
            },
          ]}
        >
          <View style={[styles.fabOuterRing, { borderRadius: size / 2 }]} />
          <View style={[styles.fabInnerDisc, { borderRadius: (size - 10) / 2 }]}>
            <MainIcon size={Math.max(20, iconSize)} color={fabIconColor} strokeWidth={2.5} />
          </View>
          {shouldShowPlus ? (
            <View style={styles.addBadge}>
              <CirclePlus size={18} color={fabIconColor} strokeWidth={2.6} />
            </View>
          ) : null}
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Presentational only: no position/absolute/bottom/right — Screen wraps this and sets position.
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  pulseRing: {
    position: "absolute",
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
  },
  fabOuterRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
  },
  fabInnerDisc: {
    width: FAB_SIZE - 10,
    height: FAB_SIZE - 10,
    borderRadius: (FAB_SIZE - 10) / 2,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  addBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
