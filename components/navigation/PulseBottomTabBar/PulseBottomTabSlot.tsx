import { memo, useEffect } from 'react';
import { pe } from '@/lib/platformViewStyle.util';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Theme from '@/constants/Theme';
import { TAB_PRESS_SCALE_ACTIVE, TAB_PRESS_SCALE_REST, TAB_PRESS_TIMING_MS } from '@/lib/mobileTabNav/constants';
import { TAB_MOTION } from './constants';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PulseBottomTabSlotProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  onPressIn?: () => void;
  badgeCount?: number;
  compact?: boolean;
  icon: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const PulseBottomTabSlot = memo(function PulseBottomTabSlot({
  label,
  active,
  onPress,
  onPressIn,
  badgeCount,
  compact,
  icon,
  style,
}: PulseBottomTabSlotProps) {
  const activeSV = useSharedValue(active ? 1 : 0);
  const pressSV = useSharedValue(TAB_PRESS_SCALE_REST);

  useEffect(() => {
    activeSV.value = withTiming(active ? 1 : 0, TAB_MOTION);
  }, [active, activeSV]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: activeSV.value,
    transform: [
      {
        scale: interpolate(
          activeSV.value,
          [0, 1],
          [0.97, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressSV.value }],
  }));

  const showBadge = (badgeCount ?? 0) > 0;

  return (
    <AnimatedPressable
      style={[styles.slot, style]}
      onPressIn={() => {
        pressSV.value = withTiming(TAB_PRESS_SCALE_ACTIVE, { duration: TAB_PRESS_TIMING_MS });
        onPressIn?.();
      }}
      onPressOut={() => {
        pressSV.value = withTiming(TAB_PRESS_SCALE_REST, { duration: TAB_PRESS_TIMING_MS });
      }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.iconWrap, contentStyle]}>
        <Animated.View style={[styles.activePill, pillStyle, pe('none')]} />
        <View style={styles.iconForeground}>{icon}</View>
        {showBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {(badgeCount ?? 0) > 9 ? '9+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          active && styles.labelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minWidth: 56,
  },
  iconWrap: {
    position: 'relative',
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: Theme.pulseIndigo,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  iconForeground: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.tabBarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '600',
    color: Theme.textOnPrimary,
    lineHeight: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textSecondary,
    letterSpacing: -0.15,
    textAlign: 'center',
  },
  labelCompact: { fontSize: 10 },
  labelActive: {
    color: Theme.pulseIndigo,
    fontWeight: '700',
  },
});
