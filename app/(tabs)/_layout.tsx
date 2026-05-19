/**
 * Demo layout: 3 tabs (FISCAL | TRIPS | NETWORK) + floating bottom dock (web + native).
 * Ops Agent via floating icon. Dock hides on scroll (native + mobile web); fixed to viewport on mobile web.
 */
import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { DemoTabBar, type DemoTabId } from '@/components/demo';
import {
  DemoTabBarAutoHideShell,
  DemoTabBarScrollProvider,
  useDemoTabBarScroll,
} from '@/contexts/DemoTabBarScrollContext';
import { saveLastTabRoute } from '@/lib/lastRoute';
import { useLayoutInsets } from '@/lib/layoutInsets';
import { preloadPulseLoadsRoute, preloadTabScreen } from '@/lib/preloadRoutes';
import type { PreloadableTab } from '@/lib/preloadRoutes';
import { ROUTES } from '@/lib/routes';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileMenuDrawerProvider, useProfileMenuDrawer } from '@/contexts/ProfileMenuDrawerContext';

function DemoCustomTabBar(
  props: BottomTabBarProps & { onOpenProfileDrawer: () => void },
) {
  const router = useRouter();
  const { resetBarVisible } = useDemoTabBarScroll();
  const { onOpenProfileDrawer } = props;
  const { state, navigation } = props;
  const layout = useLayoutInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const isMobileWeb = Platform.OS === 'web' && !isDesktopWeb;
  const routeName = state.routes[state.index]?.name;
  const activeTab: DemoTabId =
    routeName === 'finance' ? 'finance'
    : routeName === 'trips' ? 'trips'
    : routeName === 'network' ? 'network'
    : routeName === 'resources' ? 'resources'
    : 'trips';

  const onTabChange = (tab: DemoTabId) => {
    if (tab === 'loadCenter') {
      preloadPulseLoadsRoute();
      router.push(ROUTES.PULSE_LOADS);
      return;
    }
    if (tab === 'trips' || tab === 'network' || tab === 'finance') {
      preloadTabScreen(tab as PreloadableTab);
    }
    navigation.navigate(tab);
  };

  const onProfilePress = () => {
    onOpenProfileDrawer();
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
    // Mobile web: fixed to visual viewport (not 100vh flex box) so dock isn't clipped by Chrome UI.
    !isDesktopWeb && Platform.OS === 'web' && {
      position: 'fixed' as const,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },
    !isDesktopWeb && Platform.OS !== 'web' && {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
      elevation: 100,
      backgroundColor: 'transparent',
      paddingBottom: layout.bottom > 0 ? 0 : 4,
    },
    !isDesktopWeb &&
      Platform.OS === 'web' && {
        backgroundColor: 'transparent',
        paddingBottom: 0,
      },
  ];

  const tabBar = (
    <DemoTabBar
      activeTab={activeTab}
      onTabChange={onTabChange}
      onProfilePress={onProfilePress}
      onNotificationsPress={() => router.push("/notifications")}
    />
  );

  // Desktop web: top nav only. Mobile web + native: fixed/absolute shell with scroll auto-hide.
  if (isDesktopWeb) {
    return <View style={shellStyle}>{tabBar}</View>;
  }

  return (
    <DemoTabBarAutoHideShell style={shellStyle}>{tabBar}</DemoTabBarAutoHideShell>
  );
}

export const unstable_settings = { initialRouteName: 'trips' };

export default function TabLayout() {
  const { user, profile, roleVerified, loading } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(ROUTES.SIGN_IN_DIRECT);
      return;
    }
    if (!profile || !roleVerified) {
      router.replace(ROUTES.SIGN_IN_DIRECT);
      return;
    }
    if (profile.role === 'driver') {
      router.replace(ROUTES.DRIVER_ROOT);
    }
  }, [loading, user, profile, roleVerified, router]);

  if (loading || !user || !profile || !roleVerified || profile.role === 'driver') {
    return (
      <AppLoadingSplash
        variant={loading ? 'session' : 'verify'}
        style={styles.gate}
      />
    );
  }

  return (
    <ProfileMenuDrawerProvider>
      <DemoTabBarScrollProvider>
        <TabsWithProfileDrawer isDesktopWeb={isDesktopWeb} />
      </DemoTabBarScrollProvider>
    </ProfileMenuDrawerProvider>
  );
}

function TabsWithProfileDrawer({ isDesktopWeb }: { isDesktopWeb: boolean }) {
  const { open: openProfileDrawer } = useProfileMenuDrawer();

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => (
        <DemoCustomTabBar {...props} onOpenProfileDrawer={openProfileDrawer} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: {
          flex: 1,
          backgroundColor: Theme.screenBackground,
          ...(isDesktopWeb
            ? { paddingTop: Layout.desktopTopNavOffset }
            : null),
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="ops-agent" options={{ href: null }} />
      <Tabs.Screen name="finance" options={{ title: 'Fiscal' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="network" options={{ title: 'Home' }} />
      <Tabs.Screen name="indents" options={{ href: null }} />
      <Tabs.Screen name="resources" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.screenBackground,
  },
  tabBarWrap: {
    width: '100%',
    paddingHorizontal: 0,
  },
});
