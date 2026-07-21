/**
 * Elegant party-add pill — compact capsule with icon well + label.
 * Used by Finance FAB and finance promo empty states.
 *
 * FAB (`expandOnHover`): desktop web collapses until hover; mobile / narrow
 * viewports play the same slide-open once on mount, then stay expanded.
 * Promo rows leave the chip always expanded (no collapse).
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { FABIconName } from "@/lib/fabIconAssets";
import {
  Building2,
  Plus,
  Truck,
  User,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react-native";
import { memo, useCallback, useEffect } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const MOTION_MS = 180;
const ENTRANCE_MS = 300;
const motion = { duration: MOTION_MS, easing: Easing.out(Easing.cubic) };
const entranceMotion = {
  duration: ENTRANCE_MS,
  easing: Easing.out(Easing.cubic),
};

const DESKTOP_MIN_WIDTH = 768;

export type PartyAddChipIcon = Extract<
  FABIconName,
  "building" | "warehouse" | "truck" | "user" | "user-plus" | "receipt-text"
>;

export type PartyAddChipProps = {
  label: string;
  icon?: PartyAddChipIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
  /**
   * FAB: collapse to icon until hover (desktop web), or play slide-open
   * entrance then stay expanded (mobile / narrow). Promo: leave false.
   */
  expandOnHover?: boolean;
  /** Cross-axis alignment when placed in a flex parent. */
  align?: "start" | "center" | "end";
  /** Stretch chip to parent width (mobile promo rows). */
  fullWidth?: boolean;
  disabled?: boolean;
  testID?: string;
};

function resolvePartyIcon(icon: PartyAddChipIcon | undefined): LucideIcon {
  switch (icon) {
    case "warehouse":
      return Warehouse;
    case "truck":
      return Truck;
    case "user":
    case "user-plus":
      return User;
    case "receipt-text":
      return Wallet;
    case "building":
    default:
      return Building2;
  }
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PartyAddChip = memo(function PartyAddChip({
  label,
  icon = "building",
  onPress,
  accessibilityLabel,
  expandOnHover = false,
  align = "end",
  fullWidth = false,
  disabled = false,
  testID,
}: PartyAddChipProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= DESKTOP_MIN_WIDTH;
  /** Pointer hover collapses/expands repeatedly — desktop web only. */
  const canHoverExpand = expandOnHover && isDesktop && Platform.OS === "web";
  /** Same slide morph on mobile / narrow — once on mount, then stays open. */
  const playEntranceSlide = expandOnHover && !canHoverExpand;

  const expand = useSharedValue(expandOnHover ? 0 : 1);
  const pressed = useSharedValue(0);
  const PartyIcon = resolvePartyIcon(icon);

  const chipHeight = isDesktop ? 40 : Layout.minTouchTargetSize;
  const iconWellSize = isDesktop ? 30 : 28;
  const iconSize = isDesktop ? 14 : 13;
  const labelGap = isDesktop ? 8 : 9;
  const padRight = isDesktop ? 12 : 11;
  const padLeft = isDesktop ? 5 : 6;

  useEffect(() => {
    if (!expandOnHover) {
      expand.value = 1;
      return;
    }
    if (canHoverExpand) {
      expand.value = 0;
      return;
    }
    // Mobile / narrow: plus → truck + label slide (matches desktop morph).
    expand.value = 0;
    expand.value = withDelay(70, withTiming(1, entranceMotion));
  }, [canHoverExpand, expand, expandOnHover]);

  const setExpanded = useCallback(
    (active: boolean) => {
      expand.value = withTiming(active ? 1 : 0, motion);
    },
    [expand],
  );

  const onHoverIn = useCallback(() => setExpanded(true), [setExpanded]);
  const onHoverOut = useCallback(() => {
    if (canHoverExpand) setExpanded(false);
  }, [canHoverExpand, setExpanded]);

  const onPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: 80 });
    // Touch / narrow: press also drives the morph when still collapsed.
    if (playEntranceSlide && expand.value < 0.95) {
      setExpanded(true);
    }
  }, [expand, playEntranceSlide, pressed, setExpanded]);

  const onPressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: 110 });
  }, [pressed]);

  const shellStyle = useAnimatedStyle(() => {
    const h = expandOnHover ? expand.value : 1;
    const p = pressed.value;
    const active = canHoverExpand ? h : Math.max(h, p * 0.5);
    return {
      transform: [
        { scale: 1 + active * 0.012 - p * 0.02 },
        { translateY: -active * 1.5 },
      ],
      backgroundColor: active > 0.35 ? Theme.brandBlueSoft : Theme.cardWhite,
      borderColor: active > 0.2 ? Theme.brandBlueRing : Theme.borderMedium,
      paddingRight: expandOnHover
        ? interpolate(h, [0, 1], [padLeft, padRight])
        : padRight,
      paddingLeft: padLeft,
      width: fullWidth ? "100%" : undefined,
      justifyContent: fullWidth ? "center" : undefined,
    };
  });

  const iconWellStyle = useAnimatedStyle(() => {
    const h = expandOnHover ? expand.value : 1;
    const active = canHoverExpand
      ? h
      : Math.max(h, pressed.value * 0.5);
    return {
      backgroundColor:
        active > 0.45 ? Theme.brandBlue : Theme.brandBlueWash,
      transform: [{ scale: 1 + active * 0.04 }],
    };
  });

  const partyIconStyle = useAnimatedStyle(() => {
    const h = expandOnHover ? expand.value : 1;
    if (!expandOnHover) {
      return {
        opacity: 1,
        transform: [{ scale: 1 }],
      };
    }
    return {
      opacity: interpolate(h, [0, 0.4, 1], [0, 0, 1]),
      transform: [{ scale: interpolate(h, [0, 1], [0.8, 1]) }],
    };
  });

  const plusStyle = useAnimatedStyle(() => {
    if (!expandOnHover) {
      return { opacity: 0 };
    }
    const h = expand.value;
    return {
      opacity: interpolate(h, [0, 0.35, 1], [1, 0.2, 0]),
      transform: [{ rotate: `${interpolate(h, [0, 1], [0, 90])}deg` }],
    };
  });

  const labelWrapStyle = useAnimatedStyle(() => {
    if (!expandOnHover) {
      return {
        maxWidth: fullWidth ? 9999 : isDesktop ? 148 : 132,
        opacity: 1,
        marginLeft: labelGap,
      };
    }
    const h = expand.value;
    return {
      maxWidth: interpolate(h, [0, 1], [0, isDesktop ? 148 : 132]),
      opacity: interpolate(h, [0, 0.5, 1], [0, 0.35, 1]),
      marginLeft: interpolate(h, [0, 1], [0, labelGap]),
      transform: [{ translateX: interpolate(h, [0, 1], [-6, 0]) }],
    };
  });

  const alignStyle =
    align === "center"
      ? styles.pressableCenter
      : align === "start"
        ? styles.pressableStart
        : styles.pressableEnd;

  const content = (
    <Animated.View
      style={[
        styles.chip,
        fullWidth && styles.chipFullWidth,
        {
          height: chipHeight,
          borderRadius: chipHeight / 2,
          minHeight: chipHeight,
        },
        isDesktop && styles.chipDesktop,
        shellStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.iconWell,
          {
            width: iconWellSize,
            height: iconWellSize,
            borderRadius: iconWellSize / 2,
          },
          iconWellStyle,
        ]}
      >
        <Animated.View style={[styles.iconLayer, partyIconStyle]}>
          <PartyIcon
            size={iconSize}
            color={Theme.brandBlueInk}
            strokeWidth={2.15}
          />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, plusStyle]}>
          <Plus size={iconSize} color={Theme.brandBlueInk} strokeWidth={2.4} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.labelWrap, labelWrapStyle]}>
        <Text
          style={[styles.label, isDesktop && styles.labelDesktop]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Animated.View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onHoverIn={Platform.OS === "web" && expandOnHover ? onHoverIn : undefined}
      onHoverOut={Platform.OS === "web" && expandOnHover ? onHoverOut : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed: webPressed }) => [
        styles.pressable,
        alignStyle,
        fullWidth && styles.pressableFullWidth,
        (webPressed || disabled) && styles.pressableDim,
      ]}
      hitSlop={
        !isDesktop
          ? {
              top: Layout.touchTargetHitSlop,
              bottom: Layout.touchTargetHitSlop,
              left: Layout.touchTargetHitSlop,
              right: Layout.touchTargetHitSlop,
            }
          : undefined
      }
    >
      {content}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  pressable: {
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
  },
  pressableStart: {
    alignSelf: "flex-start",
  },
  pressableCenter: {
    alignSelf: "center",
  },
  pressableEnd: {
    alignSelf: "flex-end",
  },
  pressableFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  pressableDim: {
    opacity: 0.94,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    maxWidth: "100%",
    ...Platform.select({
      web: {
        boxShadow:
          "0 1px 2px rgba(77, 54, 54, 0.06), 0 4px 12px rgba(77, 54, 54, 0.05)",
        cursor: "pointer",
      } as object,
      default: {
        shadowColor: Theme.darkBackground,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  chipFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  chipDesktop: {
    ...Platform.select({
      web: {
        boxShadow:
          "0 1px 3px rgba(77, 54, 54, 0.07), 0 6px 16px rgba(77, 54, 54, 0.06)",
      } as object,
      default: {},
    }),
  },
  iconWell: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    overflow: "hidden",
    flexShrink: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.brandBlueInk,
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  labelDesktop: {
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.15,
  },
});
