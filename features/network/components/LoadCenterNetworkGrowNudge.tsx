/**
 * Inline header nudge — grow-network CTA with solid fills and logistics icons.
 */
import Theme from "@/constants/Theme";
import { platformShadow } from "@/lib/platformShadow";
import type { LucideIcon } from "lucide-react-native";
import { PackageSearch, Truck, UserPlus } from "lucide-react-native";
import { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type LoadCenterNetworkGrowNudgeMode = "give" | "get";

type Props = {
  mode: LoadCenterNetworkGrowNudgeMode;
  onPress: () => void;
  compact?: boolean;
};

const INK = Theme.loadAddButtonText;
const MUTED = Theme.textSecondary;

const GIVE_ACTIVE = {
  bg: Theme.accentGold,
  border: Theme.accentGoldPressed,
  text: INK,
  icon: INK,
};

const GET_ACTIVE = {
  bg: Theme.loadAddButtonBg,
  border: Theme.loadAddButtonBorder,
  text: INK,
  icon: INK,
};

const IDLE = {
  bg: Theme.surface,
  border: Theme.borderMedium,
  text: MUTED,
  icon: INK,
};

/** Shared vertical rhythm — avatar stack + nudge track align to this. */
export const LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT = 42;
export const LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT = 38;

function IconWell({
  Icon,
  iconSize,
  wellSize,
  color,
}: {
  Icon: LucideIcon;
  iconSize: number;
  wellSize: number;
  color: string;
}) {
  return (
    <View
      style={[
        styles.iconWell,
        {
          width: wellSize,
          height: wellSize,
          borderRadius: wellSize / 2,
        },
      ]}
    >
      <Icon size={iconSize} color={color} strokeWidth={2.5} />
    </View>
  );
}

function FlowPill({
  label,
  Icon,
  active,
  palette,
  compact,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  palette: typeof GIVE_ACTIVE;
  compact: boolean;
}) {
  const colors = active ? palette : IDLE;
  const iconSize = compact ? 14 : 15;

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        active && styles.pillActive,
      ]}
    >
      <Icon size={iconSize} color={colors.icon} strokeWidth={2.5} />
      <Text
        style={[
          styles.pillText,
          compact && styles.pillTextCompact,
          { color: colors.text },
          active && styles.pillTextActive,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function LoadCenterNetworkGrowNudge({
  mode,
  onPress,
  compact = false,
}: Props) {
  const trackHeight = compact
    ? LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT
    : LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT;
  const pressScale = useRef(new Animated.Value(1)).current;
  const leadIconSize = compact ? 13 : 14;
  const leadWellSize = compact ? 28 : 30;

  const onPressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.98,
      tension: 320,
      friction: 20,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 240,
      friction: 14,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Add more network to give load and get load"
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed,
        Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
      ]}
    >
      <Animated.View
        style={[
          styles.outer,
          compact && styles.outerCompact,
          { transform: [{ scale: pressScale }] },
        ]}
      >
        <View style={[styles.shell, compact && styles.shellCompact, { height: trackHeight }]}>
          <IconWell
            Icon={UserPlus}
            iconSize={leadIconSize}
            wellSize={leadWellSize}
            color={INK}
          />

          <Text
            style={[styles.lead, compact && styles.leadCompact]}
            numberOfLines={1}
          >
            Grow network for
          </Text>

          <View style={styles.chipGroup}>
            <FlowPill
              label="Give load"
              Icon={Truck}
              active={mode === "give"}
              palette={GIVE_ACTIVE}
              compact={compact}
            />
            <View style={styles.connector} />
            <FlowPill
              label="Get load"
              Icon={PackageSearch}
              active={mode === "get"}
              palette={GET_ACTIVE}
              compact={compact}
            />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minWidth: 0,
    flexShrink: 1,
  },
  outer: {
    minWidth: 0,
    flexShrink: 1,
    maxWidth: 500,
  },
  outerCompact: {
    maxWidth: "100%",
  },
  pressed: {
    opacity: 0.92,
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
    flexShrink: 1,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    ...platformShadow("0 2px 12px rgba(15, 23, 42, 0.07)", {
      color: Theme.primary,
      opacity: 0.07,
      radius: 12,
      offsetY: 3,
      elevation: 3,
    }),
  },
  shellCompact: {
    gap: 7,
    paddingLeft: 7,
    paddingRight: 8,
  },
  iconWell: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: "rgba(77, 54, 54, 0.12)",
  },
  lead: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.02,
    flexShrink: 1,
    lineHeight: 14,
    includeFontPadding: false,
    marginRight: 2,
  },
  leadCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  chipGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
    marginLeft: "auto" as const,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    minHeight: 30,
    borderWidth: 1.5,
    flexShrink: 0,
  },
  pillCompact: {
    paddingHorizontal: 9,
    minHeight: 28,
    gap: 5,
  },
  pillActive: {
    ...platformShadow("0 2px 6px rgba(15, 23, 42, 0.1)", {
      color: Theme.primary,
      opacity: 0.1,
      radius: 6,
      offsetY: 2,
      elevation: 2,
    }),
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.15,
    lineHeight: 13,
    includeFontPadding: false,
  },
  pillTextCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  pillTextActive: {
    fontWeight: "800",
  },
  connector: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    flexShrink: 0,
    opacity: 0.85,
  },
});
