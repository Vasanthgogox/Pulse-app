/**
 * Clean, professional Treasury/Finance FAB.
 * Positioning: this component is presentational only. The parent screen
 * should wrap it in an absolutely positioned container.
 */
import Layout from "@/constants/Layout";
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
  iconSize = 20,
  showPlusSuffix = true,
  testID,
  style,
  size = Layout.fabSize,
}: FinanceFABProps) {
  const pressScale = React.useRef(new Animated.Value(1)).current;
  const idlePulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idlePulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(idlePulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [idlePulse]);

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

  const fabBgColor = Theme.darkBackground;
  const fabIconColor = "#ffffff";
  const IconComponent = getLucideIcon(icon);
  const shouldShowPlus = showPlusSuffix && icon !== "plus";

  const MainIcon = icon === "receipt-text" || icon === "credit-card" ? Receipt : IconComponent;
  const idleScale = idlePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });
  const ringOpacity = idlePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.28],
  });

  return (
    <View style={[styles.container, { width: size, height: size }, style, { pointerEvents: 'box-none' }]}>
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
              transform: [{ scale: Animated.multiply(pressScale, idleScale) }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.innerRing,
              {
                width: size - 10,
                height: size - 10,
                borderRadius: (size - 10) / 2,
                opacity: ringOpacity,
              },
            ]}
          />
          <MainIcon size={Math.max(18, iconSize)} color={fabIconColor} strokeWidth={2.4} />
          {shouldShowPlus ? (
            <View style={styles.addBadge}>
              <CirclePlus size={14} color={fabIconColor} strokeWidth={2.5} />
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
  fab: {
    width: Layout.fabSize,
    height: Layout.fabSize,
    borderRadius: Layout.fabBorderRadius,
    borderWidth: 2.5,
    borderColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 10,
  },
  innerRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  addBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: "#0f172a",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
});
