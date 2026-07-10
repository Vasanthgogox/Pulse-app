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
const MUTED = Theme.loadStatusTabTextMuted;

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
  icon: MUTED,
};

/** Shared vertical rhythm — avatar stack + nudge track align to this. */
export const LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT = 36;
export const LOAD_CENTER_NETWORK_NUDGE_TRACK_HEIGHT_COMPACT = 32;

function IconWell({
  Icon,
  size,
  bg,
  color,
}: {
  Icon: LucideIcon;
  size: number;
  bg: string;
  color: string;
}) {
  const well = size + 10;
  return (
    <View
      style={[
        styles.iconWell,
        {
          width: well,
          height: well,
          borderRadius: well / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Icon size={size} color={color} strokeWidth={2.3} />
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
  const iconSize = compact ? 11 : 12;

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
      <Icon size={iconSize} color={colors.icon} strokeWidth={2.4} />
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

  const onPressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.985,
      tension: 280,
      friction: 18,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 220,
      friction: 16,
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
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Animated.View
        style={[
          styles.outer,
          compact && styles.outerCompact,
          { transform: [{ scale: pressScale }] },
        ]}
      >
        <View
          style={[
            styles.shell,
            compact && styles.shellCompact,
            { minHeight: trackHeight },
          ]}
        >
          <IconWell
            Icon={UserPlus}
            size={compact ? 11 : 12}
            bg={Theme.brandBlueSoft}
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
  outer: {
    minWidth: 0,
    flexShrink: 1,
    maxWidth: 480,
  },
  outerCompact: {
    maxWidth: "100%",
  },
  pressed: {
    opacity: 0.94,
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    ...platformShadow("0 2px 10px rgba(15, 23, 42, 0.06)", {
      color: Theme.primary,
      opacity: 0.06,
      radius: 10,
      offsetY: 2,
      elevation: 2,
    }),
  },
  shellCompact: {
    gap: 8,
    paddingLeft: 5,
    paddingRight: 6,
    flexWrap: "nowrap",
  },
  iconWell: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
  },
  lead: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.01,
    flexShrink: 1,
    lineHeight: 14,
    includeFontPadding: false,
  },
  leadCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  chipGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 26,
    borderWidth: 1,
    flexShrink: 0,
  },
  pillCompact: {
    paddingHorizontal: 8,
    minHeight: 24,
    gap: 4,
  },
  pillActive: {
    ...platformShadow("0 1px 4px rgba(15, 23, 42, 0.08)", {
      color: Theme.primary,
      opacity: 0.08,
      radius: 4,
      offsetY: 1,
      elevation: 1,
    }),
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.1,
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
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    flexShrink: 0,
  },
});
