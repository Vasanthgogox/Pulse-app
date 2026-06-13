import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { driverTabMicroLabel } from '@/constants/DriverTypography';
import { DriverTabBarOpsMenu } from '@/components/driver/DriverTabBarOpsMenu';
import { useOptionalDriverTripOps } from '@/contexts/DriverTripOpsContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Feather from '@expo/vector-icons/Feather';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const springBounce = { damping: 14, stiffness: 400 };
const springSettle = { damping: 18, stiffness: 320 };
const DOCK_HEIGHT = Layout.tabBarHeight + 5;
const FAB_RING_INSET = 3;
const FAB_INNER = DOCK_HEIGHT - FAB_RING_INSET * 2;

/** Wraps content with a pop-in animation when selected. */
function AnimatedTabIcon({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withSpring(1.15, springBounce),
        withSpring(1.05, springSettle),
      );
    } else {
      scale.value = withSpring(1, springSettle);
    }
  }, [selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[animatedStyle, styles.animatedIconWrap]}>
      {children}
    </Animated.View>
  );
}

export const TAB_CONFIG = [
  { name: 'index', label: 'Dashboard', icon: 'crosshairs' as const },
  { name: 'trip-history', label: 'History', icon: 'history' as const },
  { name: 'wallet', label: 'Earnings', icon: 'wallet' as const },
];

export function DriverTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const { isDark } = useDriverTheme();
  const tripOps = useOptionalDriverTripOps();
  const current = state.routes[state.index]?.name;
  const opsOpen = tripOps?.opsMenuOpen ?? false;

  const fabRotation = useSharedValue(0);
  const fabScale = useSharedValue(1);

  useEffect(() => {
    fabRotation.value = withSpring(opsOpen ? 45 : 0, springSettle);
    fabScale.value = withSpring(opsOpen ? 1.04 : 1, springSettle);
  }, [fabRotation, fabScale, opsOpen]);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fabScale.value },
      { rotate: `${fabRotation.value}deg` },
    ],
  }));

  const handlePress = (routeName: string) => {
    tripOps?.closeOpsMenu();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(routeName as never);
  };

  const footerPadTop = 6;
  const footerPadBottom = Math.max(Math.round(insets.bottom * 0.35), 10);
  const menuBottom = footerPadTop + DOCK_HEIGHT + footerPadBottom + 14;

  const handleOpsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    tripOps?.toggleOpsMenu();
  };

  const dockSurface = {
    backgroundColor: isDark ? 'rgba(10,10,10,0.95)' : 'rgba(255,255,255,0.96)',
    borderColor: colors.border,
  };

  const renderTab = (tab: (typeof TAB_CONFIG)[number]) => {
    const isActive = current === tab.name;
    return (
      <View key={tab.name} style={styles.dockColumn}>
        <View
          style={[
            styles.activePill,
            isActive && styles.activePillVisible,
            {
              backgroundColor: isDark ? colors.surfaceElevated : colors.whiteMuted,
              borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          <View style={[styles.activePillAccent, { backgroundColor: colors.primary }]} />
        </View>

        <TouchableOpacity
          onPress={() => handlePress(tab.name)}
          style={styles.dockButton}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: isActive }}
          hitSlop={{
            top: Layout.touchTargetHitSlop,
            bottom: Layout.touchTargetHitSlop,
            left: Layout.touchTargetHitSlop,
            right: Layout.touchTargetHitSlop,
          }}
        >
          <AnimatedTabIcon selected={isActive}>
            <FontAwesome5
              name={tab.icon}
              size={16}
              color={isActive ? colors.text : colors.textMuted}
              solid={isActive}
            />
            <Text
              style={[
                styles.dockLabel,
                { color: isActive ? colors.text : colors.textMuted },
                isActive && styles.dockLabelActive,
              ]}
              numberOfLines={1}
            >
              {tab.label.toUpperCase()}
            </Text>
          </AnimatedTabIcon>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <DriverTabBarOpsMenu bottomOffset={menuBottom} />

      <View
        style={[
          styles.footerWrap,
          { paddingTop: footerPadTop, paddingBottom: footerPadBottom },
        ]}
      >
        <View style={styles.dockRow}>
          <View style={[styles.glassDock, styles.dockMain, dockSurface]}>
            {TAB_CONFIG.map(renderTab)}
          </View>

          <View style={styles.fabSlot} pointerEvents="box-none">
            <Animated.View style={[styles.fabOuterRing, fabAnimatedStyle]}>
              <Pressable
                onPress={handleOpsPress}
                style={({ pressed }) => [
                  styles.opsFab,
                  {
                    backgroundColor: opsOpen ? colors.primary : colors.emeraldDark,
                  },
                  pressed && styles.opsFabPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  opsOpen ? 'Close trip actions menu' : 'Add expense or odometer'
                }
                accessibilityState={{ expanded: opsOpen }}
              >
                <Feather name="plus" size={22} color="#fff" strokeWidth={2.4} />
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  animatedIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    zIndex: 1000,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  glassDock: {
    height: DOCK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  dockMain: {
    flex: 1,
    justifyContent: 'space-evenly',
  },
  fabSlot: {
    width: DOCK_HEIGHT,
    height: DOCK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    zIndex: 1002,
  },
  fabOuterRing: {
    width: DOCK_HEIGHT,
    height: DOCK_HEIGHT,
    borderRadius: DOCK_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.driverEmeraldDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  opsFab: {
    width: FAB_INNER,
    height: FAB_INNER,
    borderRadius: FAB_INNER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opsFabPressed: {
    opacity: 0.92,
  },
  dockColumn: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  activePill: {
    position: 'absolute',
    top: 2.5,
    left: 2.5,
    right: 2.5,
    bottom: 2.5,
    borderRadius: 18,
    borderTopWidth: 1,
    opacity: 0,
  },
  activePillVisible: {
    opacity: 1,
  },
  activePillAccent: {
    position: 'absolute',
    bottom: 0,
    left: '28%',
    right: '28%',
    height: 3,
    borderRadius: 999,
  },
  dockButton: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Layout.minTouchTargetSize,
  },
  dockLabel: {
    ...Typography.subTabLabel,
    ...driverTabMicroLabel,
    fontSize: 7,
    letterSpacing: 1,
  },
  dockLabelActive: {
    fontWeight: '900',
  },
});
