import { memo } from 'react';
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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Theme from '@/constants/Theme';
import { WEB_TOP_NAV_ICON } from '@/components/demo/webTopNavIcon.tokens';
import { TAB_PRESS_SCALE_ACTIVE, TAB_PRESS_SCALE_REST, TAB_PRESS_TIMING_MS } from '@/lib/mobileTabNav/constants';

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
  const pressSV = useSharedValue(TAB_PRESS_SCALE_REST);

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
      {active ? (
        <View style={[styles.underline, pe('none')]} />
      ) : (
        <View style={styles.underlineSpacer} />
      )}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
    paddingTop: 4,
    paddingBottom: 2,
  },
  iconWrap: {
    position: 'relative',
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconForeground: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -7,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 2,
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
    marginTop: 2,
    fontSize: 10,
    fontWeight: '500',
    color: WEB_TOP_NAV_ICON.muted,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  labelCompact: {
    fontSize: 9,
  },
  labelActive: {
    color: WEB_TOP_NAV_ICON.active,
    fontWeight: '600',
  },
  underline: {
    marginTop: 4,
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: WEB_TOP_NAV_ICON.active,
  },
  underlineSpacer: {
    marginTop: 4,
    height: 2,
  },
});
