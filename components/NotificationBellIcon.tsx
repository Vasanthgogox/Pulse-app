import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import Theme from "@/constants/Theme";

/** Metronic success green — unread dot on bell + tabs. */
const UNREAD_DOT = "#50CD89";

type NotificationBellIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** When > 0, shows a small green unread dot (no solid count pill). */
  badgeCount?: number;
  /** Legacy dot-only indicator when `badgeCount` is not set. */
  showBadge?: boolean;
  badgeColor?: string;
  style?: ViewStyle;
};

/** Minimal outline bell — Metronic-style utility icon with optional unread dot. */
export function NotificationBellIcon({
  size = 20,
  color = Theme.textSecondary,
  strokeWidth = 1.85,
  badgeCount = 0,
  showBadge = false,
  badgeColor = UNREAD_DOT,
  style,
}: NotificationBellIconProps) {
  const showUnreadDot = badgeCount > 0 || showBadge;

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
      {showUnreadDot ? (
        <View
          style={[
            styles.unreadDot,
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
  unreadDot: {
    position: "absolute",
    top: 0,
    right: -1,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});
