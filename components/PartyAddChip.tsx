/**
 * Elegant party-add pill — compact capsule with icon well + label.
 * Used by Finance FAB, party add chip, and finance promo empty states.
 *
 * `expandOnHover`: rest as a circular icon + plus. Desktop/web expands the
 * label on hover; mobile expands on press and collapses on release.
 * `collapsedGlyph="icon"` keeps the party glyph visible with a plus badge.
 * Promo rows that should stay labeled leave `expandOnHover` false.
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
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const MOTION_MS = 180;
const motion = { duration: MOTION_MS, easing: Easing.out(Easing.cubic) };

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
   * Collapse to icon + plus at rest. Desktop/web: expand label on hover.
   * Mobile: expand on press, collapse on release. Promo always-on: leave false.
   */
  expandOnHover?: boolean;
  /**
   * When collapsed (`expandOnHover`): `"plus"` morphs a plus into the party
   * icon (default). `"icon"` keeps the party glyph visible and adds a small
   * plus badge — used when several party chips sit together as a speed dial.
   */
  collapsedGlyph?: "plus" | "icon";
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
  collapsedGlyph = "plus",
  align = "end",
  fullWidth = false,
  disabled = false,
  testID,
}: PartyAddChipProps) {
  const showIconWhenCollapsed = collapsedGlyph === "icon";
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= DESKTOP_MIN_WIDTH;
  const isWeb = Platform.OS === "web";
  /** Pointer hover expands/collapses — desktop web only. */
  const canHoverExpand = expandOnHover && isWeb && isDesktop;
  /** Mobile / narrow: press expands the label, release collapses. */
  const canPressExpand = expandOnHover && !canHoverExpand;

  const expand = useSharedValue(expandOnHover ? 0 : 1);
  const pressed = useSharedValue(0);
  const PartyIcon = resolvePartyIcon(icon);

  const chipHeight = isDesktop ? 40 : Layout.minTouchTargetSize;
  const padLeft = 5;
  const iconWellSize = chipHeight - padLeft * 2;
  const iconSize = isDesktop ? 14 : 15;
  const labelGap = isDesktop ? 8 : 8;
  const padRight = isDesktop ? 12 : 12;

  useEffect(() => {
    if (!expandOnHover) {
      expand.value = 1;
      return;
    }
    expand.value = 0;
  }, [expand, expandOnHover]);

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
    if (expandOnHover) setExpanded(true);
  }, [expandOnHover, pressed, setExpanded]);

  const onPressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: 110 });
    if (canPressExpand) setExpanded(false);
  }, [canPressExpand, pressed, setExpanded]);

  const shellStyle = useAnimatedStyle(() => {
    const h = expandOnHover ? expand.value : 1;
    const p = pressed.value;
    const active = h;
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
    const active = h;
    return {
      backgroundColor:
        active > 0.45 ? Theme.brandBlue : Theme.brandBlueWash,
      transform: [{ scale: 1 + active * 0.04 }],
    };
  });

  const partyIconStyle = useAnimatedStyle(() => {
    const h = expandOnHover ? expand.value : 1;
    if (!expandOnHover || showIconWhenCollapsed) {
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
    if (!expandOnHover || showIconWhenCollapsed) {
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
        (showIconWhenCollapsed || expandOnHover) && styles.chipOverflowVisible,
        shellStyle,
      ]}
    >
      <View style={styles.iconWellWrap}>
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
        {showIconWhenCollapsed ? (
          <View
            style={[
              styles.plusBadge,
              {
                width: isDesktop ? 14 : 15,
                height: isDesktop ? 14 : 15,
                borderRadius: isDesktop ? 7 : 8,
              },
            ]}
            pointerEvents="none"
          >
            <Plus
              size={isDesktop ? 9 : 10}
              color={Theme.brandBlueInk}
              strokeWidth={3}
            />
          </View>
        ) : null}
      </View>
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
      onHoverIn={canHoverExpand ? onHoverIn : undefined}
      onHoverOut={canHoverExpand ? onHoverOut : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed: webPressed }) => [
        styles.pressable,
        alignStyle,
        fullWidth && styles.pressableFullWidth,
        { minHeight: chipHeight },
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
    justifyContent: "center",
    overflow: "visible",
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
  chipOverflowVisible: {
    overflow: "visible",
  },
  chipFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  iconWellWrap: {
    position: "relative",
    flexShrink: 0,
  },
  plusBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    backgroundColor: Theme.accentGold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.cardWhite,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(77, 54, 54, 0.18)",
      } as object,
      default: {
        shadowColor: Theme.darkBackground,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 2,
        elevation: 3,
      },
    }),
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
