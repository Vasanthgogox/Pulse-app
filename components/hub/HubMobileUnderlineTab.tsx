import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";


import { HUB_MOBILE_ACCENT, hubMobileChromeStyles as styles } from "./hubMobileChrome";

export interface HubMobileUnderlineTabProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Metric / secondary row — smaller type and tighter padding. */
  compact?: boolean;
  /** Override active tab accent (e.g. load center yellow tabs). */
  accentColor?: string;
}

export const HubMobileUnderlineTab = memo(function HubMobileUnderlineTab({
  label,
  isActive,
  onPress,
  accessibilityLabel,
  compact = false,
  accentColor = HUB_MOBILE_ACCENT,
}: HubMobileUnderlineTabProps) {
  const activeColor = accentColor || HUB_MOBILE_ACCENT;

  return (
    <TouchableOpacity
      style={[styles.tabItem, compact && styles.tabItemCompact]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.tabLabel,
          compact && styles.tabLabelCompact,
          isActive && styles.tabLabelActive,
          isActive && { color: activeColor },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isActive ? (
        <View
          style={[
            styles.tabUnderline,
            compact && styles.tabUnderlineCompact,
            { backgroundColor: activeColor },
          ]}
        />
      ) : null}
    </TouchableOpacity>
  );
});
