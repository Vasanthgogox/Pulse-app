/**
 * Clean, professional Treasury/Finance FAB.
 * Positioning: this component is presentational only. The parent screen
 * should wrap it in an absolutely positioned container.
 */
import { SemanticAddIcon } from "@/components/navigation/SemanticAddIcon";
import Theme from "@/constants/Theme";
import {
  Building2,
  Package,
  Plus,
  ReceiptText,
  Route,
  Truck,
  User,
  Warehouse,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import {
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
}: FinanceFABProps) {
  const handlePress = () => {
    triggerHapticMedium();
    onPress();
  };

  const fabBgColor = Theme.fabBackground ?? Theme.buttonMatteBlack ?? "#151515";
  const fabIconColor = Theme.fabText ?? Theme.buttonMatteBlackText ?? "#FFFFFF";
  const IconComponent = getLucideIcon(icon);
  const shouldShowPlus = showPlusSuffix && icon !== "plus";

  const content = shouldShowPlus ? (
    <SemanticAddIcon
      IconComponent={IconComponent}
      iconSize={iconSize}
      iconColor={fabIconColor}
      badgeBackgroundColor={Theme.fabText ?? "#FFFFFF"}
      badgeIconColor={fabBgColor}
    />
  ) : (
    <IconComponent size={iconSize} color={fabIconColor} strokeWidth={2.5} />
  );

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <TouchableOpacity
        testID={testID}
        onPress={handlePress}
        activeOpacity={0.9}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.fab, { backgroundColor: fabBgColor }]}>
          {content}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Presentational only: no position/absolute/bottom/right — Screen wraps this and sets position.
  container: {
    justifyContent: "center",
    alignItems: "center",
    // Keep wrapper equal to actual button size so parent right/bottom
    // offsets anchor the visible FAB exactly at screen corner.
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: Theme.fabBackground,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
});
