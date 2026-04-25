/**
 * Demo layout: 3 tabs (FISCAL | TRIPS | NETWORK) + floating bottom dock (web + native).
 * Ops Agent via floating icon. Dock hides while scrolling; resets when idle or tab changes.
 */
import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { DemoTabBar, type DemoTabId } from '@/components/demo';
import {
  DemoTabBarAutoHideShell,
  DemoTabBarScrollProvider,
  useDemoTabBarScroll,
} from '@/contexts/DemoTabBarScrollContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveLastTabRoute } from '@/lib/lastRoute';
import { ROUTES } from '@/lib/routes';

function DemoCustomTabBar(props: BottomTabBarProps) {
  const router = useRouter();
  const { resetBarVisible } = useDemoTabBarScroll();
  const { state, navigation } = props;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const routeName = state.routes[state.index]?.name;
  const activeTab: DemoTabId =
    routeName === 'finance' ? 'finance'
    : routeName === 'trips' ? 'trips'
    : routeName === 'network' ? 'network'
    : routeName === 'resources' ? 'resources'
    : 'trips';

  const onTabChange = (tab: DemoTabId) => {
    if (tab === 'loadCenter') {
      router.push(ROUTES.PULSE_LOADS);
      return;
    }
    navigation.navigate(tab);
  };

  const onProfilePress = () => {
    router.push('/(tabs)/profile');
  };

  useEffect(() => {
    // Persist the active tab so cold-start can restore it via getLastTabRoute().
    const tabRoute =
      routeName === 'finance' ? ROUTES.TABS.FINANCE
      : routeName === 'trips'   ? ROUTES.TABS.TRIPS
      : routeName === 'network' ? ROUTES.TABS.NETWORK
      : routeName === 'resources' ? ROUTES.TABS.RESOURCES
      : null;
    if (tabRoute) saveLastTabRoute(tabRoute);
    resetBarVisible();
  }, [routeName, resetBarVisible]);

  // Ops Agent is full-screen with back button — no bottom nav
  if (routeName === 'ops-agent') {
    return null;
  }

  const shellStyle = [
    styles.tabBarWrap,
    isDesktopWeb && {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      zIndex: 100,
      width: '100%' as const,
    },
    !isDesktopWeb && {
      paddingBottom: insets.bottom > 0 ? 0 : 4,
    },
  ];

  if (isDesktopWeb) {
    return (
      <View style={shellStyle}>
        <DemoTabBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          onProfilePress={onProfilePress}
        />
      </View>
    );
  }

  return (
    <DemoTabBarAutoHideShell style={shellStyle}>
      <DemoTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onProfilePress={onProfilePress}
      />
    </DemoTabBarAutoHideShell>
  );
}

export const unstable_settings = { initialRouteName: 'trips' };

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  return (
    <DemoTabBarScrollProvider>
      <Tabs
        backBehavior="history"
        tabBar={(props) => <DemoCustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: { display: 'none' },
          sceneStyle: isDesktopWeb ? { paddingTop: 68 } : undefined,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="ops-agent" options={{ href: null }} />
        <Tabs.Screen name="finance" options={{ title: 'Fiscal' }} />
        <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
        <Tabs.Screen name="network" options={{ title: 'Network' }} />
        <Tabs.Screen name="indents" options={{ href: null }} />
        <Tabs.Screen name="resources" options={{ href: null }} />
      </Tabs>
    </DemoTabBarScrollProvider>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    width: '100%',
    paddingHorizontal: 0,
  },
});
