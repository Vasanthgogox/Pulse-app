/**
 * Demo layout: 3 tabs (FISCAL | TRIPS | NETWORK) + floating bottom dock (web + native).
 * Ops Agent via floating icon. Dock hides while scrolling; resets when idle or tab changes.
 */
import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, Platform } from 'react-native';
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
  const routeName = state.routes[state.index]?.name;
  const activeTab: DemoTabId =
    routeName === 'finance' ? 'finance'
    : routeName === 'trips' ? 'trips'
    : routeName === 'network' ? 'network'
    : 'trips';

  const onTabChange = (tab: DemoTabId) => {
    navigation.navigate(tab);
  };

  const onLoadBoardPress = () => {
    router.push('/load-board');
  };

  const onProfilePress = () => {
    router.push('/(tabs)/profile');
  };

  const onLogoPress = () => {
    router.navigate('/');
  };

  useEffect(() => {
    // Persist the active tab so cold-start can restore it via getLastTabRoute().
    const tabRoute =
      routeName === 'finance' ? ROUTES.TABS.FINANCE
      : routeName === 'trips'   ? ROUTES.TABS.TRIPS
      : routeName === 'network' ? ROUTES.TABS.NETWORK
      : null;
    if (tabRoute) saveLastTabRoute(tabRoute);
    resetBarVisible();
  }, [routeName, resetBarVisible]);

  // Ops Agent (index) is full-screen with back button — no bottom nav
  if (routeName === 'index') {
    return null;
  }

  const isWeb = Platform.OS === 'web';

  return (
    <DemoTabBarAutoHideShell
      style={[
        styles.tabBarWrap,
        isWeb && {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          width: '100%',
        },
        !isWeb && {
          paddingBottom: insets.bottom > 0 ? 0 : 4,
        },
      ]}
    >
      <DemoTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLoadBoardPress={onLoadBoardPress}
        onProfilePress={onProfilePress}
        onLogoPress={onLogoPress}
        showLoadFab={false}
      />
    </DemoTabBarAutoHideShell>
  );
}

export const unstable_settings = { initialRouteName: 'index' };

export default function TabLayout() {
  return (
    <DemoTabBarScrollProvider>
      <Tabs
        backBehavior="history"
        tabBar={(props) => <DemoCustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Ops' }} />
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
