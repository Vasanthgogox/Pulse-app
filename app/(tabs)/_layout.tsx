/**
 * Demo layout: 3 tabs (FISCAL | TRIPS | NETWORK) + custom footer. Ops Agent via floating icon.
 */
import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { DemoTabBar, type DemoTabId } from '@/components/demo';

function DemoCustomTabBar(props: BottomTabBarProps) {
  const router = useRouter();
  const { state, navigation } = props;
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

  // Ops Agent (index) is full-screen with back button — no bottom nav
  if (routeName === 'index') {
    return null;
  }

  return (
    <View style={styles.tabBarWrap}>
      <DemoTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLoadBoardPress={onLoadBoardPress}
        showLoadFab={false}
      />
    </View>
  );
}

export const unstable_settings = { initialRouteName: 'index' };

export default function TabLayout() {
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
