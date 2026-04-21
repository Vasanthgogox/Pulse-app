import React from "react";
import { Plus, type LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

interface SemanticAddIconProps {
  IconComponent: LucideIcon;
  iconSize: number;
  iconColor: string;
  iconStrokeWidth?: number;
  badgeSize?: number;
  badgeIconSize?: number;
  badgeBackgroundColor?: string;
  badgeIconColor?: string;
  badgeBorderColor?: string;
  badgeOffsetX?: number;
  badgeOffsetY?: number;
}

export function SemanticAddIcon({
  IconComponent,
  iconSize,
  iconColor,
  iconStrokeWidth = 2.5,
  badgeSize = 18,
  badgeIconSize = 14,
  badgeBackgroundColor = "#FFFFFF",
  badgeIconColor = "#151515",
  badgeBorderColor = "rgba(0,0,0,0.08)",
  badgeOffsetX = -8,
  badgeOffsetY = -6,
}: SemanticAddIconProps) {
  return (
    <View style={styles.container}>
      <IconComponent
        size={iconSize}
        color={iconColor}
        strokeWidth={iconStrokeWidth}
      />
      <View
        style={[
          styles.badgeWrap,
          { right: badgeOffsetX, bottom: badgeOffsetY, pointerEvents: 'none' },
        ]}
      >
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: badgeBackgroundColor,
              borderColor: badgeBorderColor,
            },
          ]}
        >
          <Plus
            size={badgeIconSize}
            color={badgeIconColor}
            strokeWidth={3}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeWrap: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
});
