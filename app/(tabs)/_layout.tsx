/**
 * Demo layout: 3 tabs (FISCAL | TRIPS | NETWORK) + custom header. Ops Agent via floating icon.
 */
import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, Platform } from 'react-native';
import { DemoTabBar, type DemoTabId } from '@/components/demo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function DemoCustomTabBar(props: BottomTabBarProps) {
  const router = useRouter();
  const { state, navigation } = props;
  const insets = useSafeAreaInsets();
  const routeName = state.routes[state.index]?.name;
  const activeTab: DemoTabId =
    routeName === 'finance' ? 'finance'
    : routeName === 'trips' ? 'trips'
    : routeName === 'network' ? 'network'
    : 'finance';

  const onTabChange = (tab: DemoTabId) => {
    navigation.navigate(tab);
  };

  const onLoadBoardPress = () => {
    router.push('/load-board');
  };

  const onProfilePress = () => {
    router.push('/(tabs)/profile');
  };

  const onNotificationPress = () => {
    // TODO: implement notifications screen; currently redirects to network as a placeholder
    router.push('/(tabs)/network');
  };

  const onLogoPress = () => {
    router.navigate('/');
  };

  // Ops Agent (index) is full-screen with back button — no bottom nav
  if (routeName === 'index') {
    return null;
  }

  // Web rendering: use absolute positioning at the top to simulate top nav
  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.tabBarWrap, isWeb && { position: 'absolute', top: 0, zIndex: 10, width: '100%' }]}>
      <DemoTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLoadBoardPress={onLoadBoardPress}
        onProfilePress={onProfilePress}
        onNotificationPress={onNotificationPress}
        onLogoPress={onLogoPress}
        showLoadFab={false}
      />
    </View>
  );
}

export const unstable_settings = { initialRouteName: 'index' };

export default function TabLayout() {
  const isWeb = Platform.OS === 'web';
  return (
    <Tabs
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
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    width: '100%',
    paddingHorizontal: 0,
  },
});
