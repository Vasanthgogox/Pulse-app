/**
 * Demo layout: 3 tabs (FISCAL | TRIPS | NETWORK) + floating bottom dock (web + native).
 * Dock hides on scroll (native + mobile web); fixed to viewport on mobile web.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { markStartupPhase, isStartupComplete } from '@/lib/startupMetrics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { DemoTabBar, type DemoTabId } from '@/components/demo';
import { DemoTabBarAutoHideShell } from '@/contexts/DemoTabBarScrollContext';
import {
  getLastTabRoute,
  resolveRestorableDispatcherRoute,
  saveLastTabRoute,
} from '@/lib/lastRoute';
import { PULSE_BOTTOM_TAB_DOCK } from '@/components/navigation/PulseBottomTabBar/dockMetrics';
import { useLayoutInsets } from '@/lib/layoutInsets';
import {
  preloadTabScreen,
  scheduleDispatcherTabPreloads,
} from '@/lib/preloadRoutes';
import { preloadChatRoute } from '@/lib/preloadChatWarmup';
import { ROUTES } from '@/lib/routes';
import { hydrateSignupFlowFlags } from '@/lib/onboarding/businessSignupBranding.util';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { AwardedIndentDeployModalProvider } from '@/contexts/AwardedIndentDeployModalContext';
import { BusinessConnectionRequestModalProvider } from '@/contexts/BusinessConnectionRequestModalContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { useMemberCapabilities } from '@/lib/useMemberCapabilities';
import { useQueryClient } from '@tanstack/react-query';

function DemoCustomTabBar(
  props: BottomTabBarProps & { onOpenProfileDrawer: () => void },
) {
  const router = useRouter();
  const pathname = usePathname();
  const _queryClient = useQueryClient();
  const _org = useOptionalOrganization();
  const { onOpenProfileDrawer } = props;
  const { state, navigation } = props;
  const layout = useLayoutInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  // Functional-role tab visibility. While access resolves, keep all tabs shown
  // (the per-tab MemberDomainGate holds the screen) so denied tabs don't flicker
  // in then out. Owner/admin see all three (org-model-gated only, as before).
  const memberAccess = useMemberCapabilities();
  const tabVisibility = {
    finance: memberAccess.isLoading || memberAccess.finance,
    trips: memberAccess.isLoading || memberAccess.tripops,
    network: memberAccess.isLoading || memberAccess.sales,
  };
  // The member's own home tab — used to highlight the dock when the current
  // route isn't a primary tab (e.g. profile), so a hidden tab is never shown active.
  const homeTab: DemoTabId = tabVisibility.trips
    ? 'trips'
    : tabVisibility.finance
      ? 'finance'
      : tabVisibility.network
        ? 'network'
        : 'trips';

  const routeName = state.routes[state.index]?.name;
  const activeTab: DemoTabId =
    routeName === 'finance' ? 'finance'
    : routeName === 'trips' ? 'trips'
    : routeName === 'network' ? 'network'
    : routeName === 'resources' ? 'resources'
    : homeTab;

  const onTabChange = useCallback(
    (tab: DemoTabId) => {
      if (tab === 'loadCenter') {
        router.push(ROUTES.PULSE_LOADS);
        return;
      }
      if (tab === 'network') {
        // Re-tapping NETWORK while already on hub must not downgrade to the feed.
        if (pathname.includes('/hub')) return;
        router.replace(ROUTES.TABS.NETWORK as Parameters<typeof router.replace>[0]);
        return;
      }
      navigation.navigate(tab);
    },
    [navigation, pathname, router],
  );

  const onProfilePress = () => {
    onOpenProfileDrawer();
  };

  useEffect(() => {
    const restorable = resolveRestorableDispatcherRoute(pathname);
    if (!restorable) return;
    void saveLastTabRoute(restorable);
    // Do not resetBarVisible() here — it runs a spring on every tab swap and feels laggy.
  }, [pathname]);

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
      zIndex: PULSE_BOTTOM_TAB_DOCK.tabBarZIndexWeb,
    },
    !isDesktopWeb && Platform.OS !== 'web' && {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: PULSE_BOTTOM_TAB_DOCK.tabBarZIndexNative,
      elevation: 100,
      backgroundColor: 'transparent',
      paddingBottom:
        layout.bottom > 0 ? 0 : PULSE_BOTTOM_TAB_DOCK.nativeZeroInsetShellPad,
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
      visibility={tabVisibility}
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
  const { user, profile, loading } = useAuth();
  const org = useOptionalOrganization();
  const queryClient = useQueryClient();
  const _router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const orgId = org?.currentOrganization?.id ?? null;
  const tabMountMarked = useRef(false);
  const tabsUnlockedRef = useRef(false);

  useEffect(() => {
    void hydrateSignupFlowFlags();
  }, []);

  useEffect(() => {
    if (!tabMountMarked.current && !isStartupComplete()) {
      tabMountMarked.current = true;
      markStartupPhase('tab_mount');
    }
     
  }, []);

  useEffect(() => {
    if (loading || !orgId || profile?.role === 'driver') return;
    void getLastTabRoute().then((route) => {
      scheduleDispatcherTabPreloads(route, { queryClient, orgId });
    });
  }, [loading, orgId, profile?.role, queryClient]);

  // Pre-warm chat providers + bootstrap as soon as auth + org are ready.
  // This runs immediately (not idle), so provider modules and the bootstrap RPC
  // are in flight well before the user taps the chat button.
  // Skipped in dev to avoid Metro parallel-import OOM.
  useEffect(() => {
    if (loading || !orgId || profile?.role === 'driver') return;
    if (__DEV__) return;
    preloadChatRoute(orgId);
  }, [loading, orgId, profile?.role]);

  /** Warm trips first (default tab), then fiscal + network — staggered to avoid Metro OOM. */
  useEffect(() => {
    if (isDesktopWeb) return;
    if (__DEV__) {
      // Staggered tab preloads + Fast Refresh → stale module IDs (unknown module errors).
      return;
    }
    preloadTabScreen('trips');
    const t0 = setTimeout(() => preloadTabScreen('finance'), 700);
    const t1 = setTimeout(() => preloadTabScreen('network'), 1400);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [isDesktopWeb]);

  if (!loading && user && profile && profile.role !== 'driver') {
    tabsUnlockedRef.current = true;
  }

  if (
    !tabsUnlockedRef.current &&
    (loading || !user || !profile || profile.role === 'driver')
  ) {
    return (
      <AppLoadingSplash
        variant={loading ? 'session' : 'verify'}
        style={styles.gate}
      />
    );
  }

  return (
    <AwardedIndentDeployModalProvider>
      <BusinessConnectionRequestModalProvider>
        <TabsWithProfileDrawer isDesktopWeb={isDesktopWeb} />
      </BusinessConnectionRequestModalProvider>
    </AwardedIndentDeployModalProvider>
  );
}

function TabsWithProfileDrawer({ isDesktopWeb }: { isDesktopWeb: boolean }) {
  const router = useRouter();
  const openWorkspace = useCallback(() => {
    router.push(ROUTES.WORKSPACE as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <View style={styles.tabsWrap}>
      <Tabs
      backBehavior="history"
      tabBar={(props) => (
        <DemoCustomTabBar {...props} onOpenProfileDrawer={openWorkspace} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { display: 'none' },
        /**
         * Desktop web: keep all primary tabs mounted (Slack-like persistence).
         * Native + mobile web: lazy mount — only the active tab loads its chunk.
         */
        lazy: !isDesktopWeb,
        freezeOnBlur: !isDesktopWeb,
        animation: 'none',
        sceneStyle: {
          flex: 1,
          backgroundColor: Theme.screenBackground,
          ...(isDesktopWeb
            ? { paddingTop: Layout.desktopTopNavOffset }
            : null),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', lazy: Platform.OS === 'web' && !isDesktopWeb }}
      />
      <Tabs.Screen
        name="finance"
        options={{ title: 'Fiscal', lazy: Platform.OS === 'web' && !isDesktopWeb }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: 'Trips', lazy: Platform.OS === 'web' && !isDesktopWeb }}
      />
      <Tabs.Screen
        name="network"
        options={{ title: 'Home', lazy: Platform.OS === 'web' && !isDesktopWeb }}
      />
      <Tabs.Screen name="indents" options={{ href: null }} />
      <Tabs.Screen name="resources" options={{ href: null }} />
      </Tabs>
    </View>
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
  tabsWrap: {
    flex: 1,
  },
});
