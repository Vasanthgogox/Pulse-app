import { memo, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';

import Theme from '@/constants/Theme';
import { TAB_PRESS_SCALE_ACTIVE, TAB_PRESS_SCALE_REST, TAB_PRESS_TIMING_MS } from '@/lib/mobileTabNav/constants';
import {
  CLUSTER_PILL_INSET,
  MOBILE_CLUSTER_ICON_SIZE,
  MOBILE_CLUSTER_ICON_SIZE_COMPACT,
  TAB_MOTION,
} from './constants';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PulseClusterTab = {
  id: string;
  label: string;
  Icon: LucideIcon;
  badgeCount?: number;
};

const ClusterSegment = memo(function ClusterSegment({
  tab,
  active,
  iconSize,
  compact,
  onPress,
  onPressIn,
}: {
  tab: PulseClusterTab;
  active: boolean;
  iconSize: number;
  compact?: boolean;
  onPress: () => void;
  onPressIn?: () => void;
}) {
  const { Icon, label, badgeCount } = tab;
  const pressSV = useSharedValue(TAB_PRESS_SCALE_REST);
  const activeSV = useSharedValue(active ? 1 : 0);
  const showBadge = (badgeCount ?? 0) > 0;

  useEffect(() => {
    activeSV.value = withTiming(active ? 1 : 0, TAB_MOTION);
  }, [active, activeSV]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: activeSV.value,
    transform: [
      {
        scale: interpolate(activeSV.value, [0, 1], [0.97, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressSV.value }],
  }));

  const labelOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(activeSV.value, [0, 1], [0.72, 1], Extrapolation.CLAMP),
  }));

  return (
    <AnimatedPressable
      style={styles.segment}
      onPressIn={() => {
        pressSV.value = withTiming(TAB_PRESS_SCALE_ACTIVE, {
          duration: TAB_PRESS_TIMING_MS,
        });
        onPressIn?.();
      }}
      onPressOut={() => {
        pressSV.value = withTiming(TAB_PRESS_SCALE_REST, {
          duration: TAB_PRESS_TIMING_MS,
        });
      }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.segmentPill, pillStyle]} pointerEvents="none">
        <LinearGradient
          colors={[
            Theme.pulseTabClusterThumbGlassTop,
            Theme.pulseTabClusterThumbSolid,
            Theme.pulseTabClusterThumbGlassBottom,
          ]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.segmentPillFill}
        />
        <View style={styles.segmentPillRim} pointerEvents="none" />
      </Animated.View>
      <Animated.View style={[styles.iconStack, iconStyle]}>
        <Icon
          size={iconSize}
          color={active ? Theme.pulseTabClusterIconOnThumb : Theme.pulseTabClusterIconInactive}
          strokeWidth={active ? 2.2 : 1.65}
        />
        {showBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {(badgeCount ?? 0) > 9 ? '9+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          active && styles.labelOnPill,
          labelOpacityStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
});

export type PulseBottomTabClusterProps = {
  tabs: PulseClusterTab[];
  activeIndex: number;
  compact?: boolean;
  onPressAt: (index: number) => void;
  onWarmAt?: (index: number) => void;
};

export const PulseBottomTabCluster = memo(function PulseBottomTabCluster({
  tabs,
  activeIndex,
  compact,
  onPressAt,
  onWarmAt,
}: PulseBottomTabClusterProps) {
  const iconSize = compact ? MOBILE_CLUSTER_ICON_SIZE_COMPACT : MOBILE_CLUSTER_ICON_SIZE;

  const makePress = useCallback(
    (index: number) => () => onPressAt(index),
    [onPressAt],
  );

  const makeWarm = useCallback(
    (index: number) => () => onWarmAt?.(index),
    [onWarmAt],
  );

  return (
    <View style={[styles.track, compact && styles.trackCompact]}>
      <LinearGradient
        colors={[Theme.pulseTabClusterTrackTop, Theme.pulseTabClusterTrackBg, Theme.pulseTabClusterTrackBottom]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.trackRim} pointerEvents="none" />
      {tabs.map((tab, index) => (
        <ClusterSegment
          key={tab.id}
          tab={tab}
          active={activeIndex === index}
          iconSize={iconSize}
          compact={compact}
          onPress={makePress(index)}
          onPressIn={makeWarm(index)}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: 300,
    minWidth: 228,
    padding: CLUSTER_PILL_INSET,
    borderRadius: 28,
    backgroundColor: Theme.pulseTabClusterTrackBg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.pulseTabClusterTrackBorder,
    position: 'relative',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  trackCompact: {
    maxWidth: 280,
    minWidth: 212,
    borderRadius: 26,
  },
  trackRim: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.pulseTabClusterTrackRim,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 4,
    paddingBottom: 4,
    zIndex: 1,
  },
  segmentPill: {
    ...StyleSheet.absoluteFillObject,
    margin: 2,
    borderRadius: 22,
    overflow: 'hidden',
  },
  segmentPillFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.pulseTabClusterThumbBorder,
  },
  segmentPillRim: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.pulseTabClusterThumbSpecular,
  },
  iconStack: {
    position: 'relative',
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '500',
    color: Theme.pulseTabClusterLabelInactive,
    letterSpacing: 0.35,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  labelCompact: { fontSize: 8, letterSpacing: 0.3, marginTop: 3 },
  labelOnPill: {
    fontWeight: '800',
    color: Theme.pulseTabClusterLabelOnThumb,
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 13,
    height: 13,
    borderRadius: 7,
    paddingHorizontal: 2,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.pulseTabClusterTrackBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '600',
    color: Theme.textOnPrimary,
    lineHeight: 10,
  },
});
