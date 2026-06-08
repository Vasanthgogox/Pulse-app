import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import Theme from "@/constants/Theme";

type NotificationBellIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Numeric unread count — preferred over `showBadge`. */
  badgeCount?: number;
  /** Legacy dot-only indicator when `badgeCount` is not set. */
  showBadge?: boolean;
  badgeColor?: string;
  style?: ViewStyle;
};

function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Minimal outline bell — Metronic-style utility icon with optional count badge. */
export function NotificationBellIcon({
  size = 20,
  color = Theme.textSecondary,
  strokeWidth = 1.85,
  badgeCount = 0,
  showBadge = false,
  badgeColor = Theme.teslaRed,
  style,
}: NotificationBellIconProps) {
  const showNumericBadge = badgeCount > 0;
  const showDotBadge = !showNumericBadge && showBadge;

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M13.73 21a2 2 0 0 1-3.46 0"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {showNumericBadge ? (
        <View
          style={[
            styles.countBadge,
            badgeCount > 9 && styles.countBadgeWide,
            {
              backgroundColor: badgeColor,
              borderColor: Theme.cardWhite,
            },
          ]}
        >
          <Text style={styles.countBadgeText}>{formatBadgeCount(badgeCount)}</Text>
        </View>
      ) : showDotBadge ? (
        <View
          style={[
            styles.dotBadge,
            {
              backgroundColor: badgeColor,
              borderColor: Theme.cardWhite,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeWide: {
    minWidth: 22,
    paddingHorizontal: 3,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    lineHeight: 11,
  },
  dotBadge: {
    position: "absolute",
    top: 1,
    right: 0,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});
