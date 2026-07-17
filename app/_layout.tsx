import 'react-native-gesture-handler';
// Shadow / pointerEvents RN Web compat — must run before any StyleSheet.create in the tree.
import '@/lib/installWebRnCompatPatches';
import { ensureWebRnCompatPatches } from '@/lib/installWebRnCompatPatches';
import { ensureWebShellParity } from '@/lib/htmlShell';
// Background GPS task must be registered before any component mounts — do not move this import.
import '@/lib/tracking/backgroundTasks';
import { markStartupPhase } from '@/lib/startupMetrics';
import { AppAlertHost } from '@/components/AppAlertHost';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { initCrashReporter } from '@/lib/crashReporter';
import { ContentErrorState } from '@/components/ContentErrorState';
import { GlobalOperationsToast } from '@/components/GlobalOperationsToast';
import { DemoTabBar } from '@/components/demo/DemoTabBar';
import type { DemoTabId } from '@/components/demo/DemoTabBar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { preloadFinanceWarmup } from '@/lib/preloadFinanceWarmup';
import {
  preloadPulseLoadsRoute,
  preloadTabScreen,
  scheduleDispatcherTabPreloads,
} from '@/lib/preloadRoutes';
import type { PreloadableTab } from '@/lib/preloadRoutes';
import { pathnameHasRootTopNav } from '@/lib/rootChromeRoutes';
import { ROUTES } from '@/lib/routes';
import {
  DemoTabBarAutoHideShell,
  DemoTabBarScrollProvider,
  useDemoTabBarScrollOptional,
} from '@/contexts/DemoTabBarScrollContext';
import * as authService from '@/features/auth/services/auth.service';
import { isSessionExpiredError } from '@/features/auth/services/auth.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeQueryClient } from '@/lib/queryClient';
import { purgeEmptyEntityQueriesFromCache } from '@/lib/queries/entityListQueryOptions';
import {
  installForegroundPruning,
  installRealtimeDiagnosticsGlobalHook,
  startRealtimeDiagnosticsLogger,
  stopRealtimeDiagnosticsLogger,
} from '@/lib/realtimeRegistry';
import { hasSupabaseConfig, SUPABASE_CONFIG_MISSING_MESSAGE } from '@/lib/supabase';
import {
  installWebDeployRecoveryListener,
  isStaleWebChunkError,
  clearNativeBundleReloadGuard,
  installNativeBundleRecoveryHandler,
  isStaleNativeBundleError,
  recoverStaleNativeBundle,
  recoverStaleWebDeploy,
} from '@/lib/webDeployRecovery';
import {
  installWebViewportHeight,
} from '@/lib/webViewportHeight';
import { installDevConsoleFilters } from '@/lib/devConsoleFilters';
import type { ViewStyle } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { safePreventAutoHideAsync } from '@/lib/safeSplashScreen.util';
import { useQueryClient } from '@tanstack/react-query';
import { installDriverInviteDeepLinkListener } from '@/lib/driverInviteDeepLink.util';
import { useEffect, useMemo } from 'react';
import { AppBootGate } from '@/components/AppBootGate';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { NavigationLoadingOverlay } from '@/components/NavigationLoadingOverlay';
import { LogBox, Platform, StyleSheet, Text, View } from 'react-native';
import { useWebLayoutWidth } from '@/lib/useWebLayoutWidth';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider } from '@/contexts/AuthContext';
import { PendingOnboardingProvider } from '@/contexts/PendingOnboardingContext';
import { PendingInviteResumeGate } from '@/components/PendingInviteResumeGate';
import { PushTokenRegistration } from '@/components/PushTokenRegistration';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { NavigationPolicyShadowHost } from '@/lib/navigationPolicy/NavigationPolicyShadowHost';
import { LanguageProvider, tGlobal } from '@/contexts/LanguageContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { OrganizationProvider, useOptionalOrganization } from '@/contexts/OrganizationContext';
import { OrgVerificationReminderProvider } from '@/features/organization/components/workspace/kyc/OrgVerificationReminderProvider';
import { ActiveWorkspaceProvider } from '@/contexts/ActiveWorkspaceContext';
import { KeyboardAccessoryProvider } from '@/contexts/KeyboardAccessoryContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { LazyChatProviders } from '@/components/LazyChatProviders';
import { isFloatingChatHostRoute } from '@/lib/floatingChatHostRoute.util';
import { GlobalSyncProvider } from '@/lib/globalSync/GlobalSyncContext';

markStartupPhase('js_parse_start');

// Wire crash reporting as early as possible (no-op in dev / when no DSN is set).
initCrashReporter();

// Dev (web.output "single") skips app/+html.tsx — inject its shell CSS/JS at runtime.
ensureWebShellParity();

function isNetworkError(error: Error): boolean {
  const msg = error.message;
  return (
    msg === 'Network request failed' ||
    msg === 'Failed to fetch' ||
    /network|failed to fetch|fetch failed|load failed/i.test(msg) ||
    /AuthRetryableFetchError|network request failed/i.test(msg)
  );
}

function isConfigMissingError(error: Error): boolean {
  return error.message.includes('Missing Supabase config') || error.message === SUPABASE_CONFIG_MISSING_MESSAGE;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionExpired = isSessionExpiredError(error);

  useEffect(() => {
    if (sessionExpired) {
      authService.signOut().catch(() => {});
      router.replace(ROUTES.SIGN_IN_DIRECT);
    }
  }, [sessionExpired, router]);

  useEffect(() => {
    if (isStaleWebChunkError(error)) {
      recoverStaleWebDeploy();
      return;
    }
    if (isStaleNativeBundleError(error)) {
      recoverStaleNativeBundle();
    }
  }, [error]);

  if (sessionExpired) {
    return null;
  }

  const staleDeploy = isStaleWebChunkError(error);
  const staleNativeBundle = isStaleNativeBundleError(error);
  const configMissing = isConfigMissingError(error);
  const network = isNetworkError(error);
  const variant = configMissing
    ? 'config'
    : staleDeploy
      ? 'update'
      : network
        ? 'connection'
        : 'generic';

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <ContentErrorState
        variant={variant}
        tone="dark"
        layout="full"
        title={
          configMissing
            ? tGlobal('appNotConfigured')
            : staleDeploy
              ? undefined
              : network
                ? tGlobal('connectionErrorShort')
                : tGlobal('somethingWentWrong')
        }
        message={
          configMissing
            ? undefined
            : staleDeploy
              ? undefined
              : staleNativeBundle
                ? 'The dev bundle is out of date. Stop all Metro servers, run npm run start:clean, reopen Expo Go, and try again.'
              : network
                ? undefined
                : error.message
        }
        technicalDetails={error.stack ?? error.message}
        onRetry={
          configMissing || staleDeploy
            ? undefined
            : () => {
                if (Platform.OS === 'web' && isStaleWebChunkError(error)) {
                  recoverStaleWebDeploy();
                  return;
                }
                if (staleNativeBundle && recoverStaleNativeBundle()) {
                  return;
                }
                retry();
              }
        }
        retryLabel={tGlobal('tryAgain')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Required so RNGH components (e.g. hold-to-accept Pressable) work on Android; stabilizes iOS. */
  ghRoot: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          backgroundColor: Theme.screenBackground,
          overflow: 'hidden' as const,
        } satisfies ViewStyle)
      : null),
  },
  rootTabBarWrap: {
    width: '100%',
    paddingHorizontal: 0,
  },
  configErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
  },
  configErrorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  configErrorMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
  },
});

export const unstable_settings = {
  initialRouteName: 'index',
};

void safePreventAutoHideAsync().catch(() => {});

// Stale refresh token (e.g. from another device) is handled by clearing local session and showing sign-in.
// Suppress the library's error log so users don't see a scary red error on app open.
LogBox.ignoreLogs([
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'AuthApiError',
  'No native splash screen registered',
  // RN Web dev noise (harmless on web; native still uses shadow* props).
  '"shadow*" style props are deprecated',
  '"textShadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  // Metro allow-list — fixed via direct imports; ignore if a dev chunk still cycles.
  'Require cycle:',
  // Expo Router file is app/add-commodity-type/index.tsx (screen name includes /index).
  'No route named "add-commodity-type"',
  // React Strict Mode double-mount vs Supabase auth Web Lock (dev-only recovery).
  'Lock "lock:sb-',
  'was not released within',
  'Lock was stolen by another request',
]);

export default function RootLayout() {
  useEffect(() => {
    ensureWebRnCompatPatches();
    installDevConsoleFilters();
    clearNativeBundleReloadGuard();
    installNativeBundleRecoveryHandler();
    installWebDeployRecoveryListener();
    if (Platform.OS !== 'web') return;
    return installWebViewportHeight();
  }, []);

  useEffect(() => {
    return installDriverInviteDeepLinkListener();
  }, []);

  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const queryClient = useMemo(() => makeQueryClient(), []);
  const persister = useMemo(
    () =>
      createAsyncStoragePersister({
        storage: AsyncStorage,
        key: 'pulse-cache-v1',
        throttleTime: 10_000,  // 10s: reduces UI-thread write pressure (was 3s)
      }),
    [],
  );

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const styleId = 'pulse-input-focus-reset';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input:focus,
      input:focus-visible,
      textarea:focus,
      textarea:focus-visible,
      select:focus,
      select:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  // On web the browser handles font loading natively via CSS — blocking here
  // causes several seconds of splash while the dev server streams ~4 MB of
  // FontAwesome files.  Native still needs to wait (fonts aren't pre-bundled).
  if (!loaded && Platform.OS !== 'web') {
    return (
      <SafeAreaProvider>
        <LanguageProvider>
          <AppLoadingSplash variant="preparing" useGlobalI18n />
        </LanguageProvider>
      </SafeAreaProvider>
    );
  }

  // Avoid any Supabase call when config is missing (prevents "Network request failed" from invalid URL)
  if (!hasSupabaseConfig()) {
    return (
      <SafeAreaProvider>
        <LanguageProvider>
          <ConfigErrorScreen />
        </LanguageProvider>
      </SafeAreaProvider>
    );
  }

  markStartupPhase('providers_mount');

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AppErrorBoundary>
        <GestureHandlerRootView style={styles.ghRoot}>
          <PersistQueryClientProvider
            client={queryClient}
            onSuccess={() => {
              purgeEmptyEntityQueriesFromCache(queryClient);
            }}
            persistOptions={{
              persister,
              maxAge: 6 * 60 * 60 * 1000,  // 6h: balances cold-start speed vs memory on long-shift devices
              dehydrateOptions: {
                shouldDehydrateQuery: (query) => {
                  if (query.state.status !== 'success') return false;
                  const data = query.state.data;
                  // Never persist empty entity lists — they block refetch on cold start.
                  if (Array.isArray(data) && data.length === 0) return false;
                  return true;
                },
              },
            }}
          >
            <NetworkProvider>
              <AuthProvider>
                <PendingOnboardingProvider>
                <PushTokenRegistration />
                <OrganizationProvider>
                  <ActiveWorkspaceProvider>
                  <PendingInviteResumeGate />
                  <WalletProvider>
                    <KeyboardAccessoryProvider>
                      <GlobalSyncProvider>
                        <AppBootGate>
                          <OrgVerificationReminderProvider>
                            <RootLayoutNav />
                          </OrgVerificationReminderProvider>
                        </AppBootGate>
                      </GlobalSyncProvider>
                    </KeyboardAccessoryProvider>
                  </WalletProvider>
                  </ActiveWorkspaceProvider>
                </OrganizationProvider>
                </PendingOnboardingProvider>
              </AuthProvider>
            </NetworkProvider>
          </PersistQueryClientProvider>
        </GestureHandlerRootView>
        </AppErrorBoundary>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function ConfigErrorScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.configErrorContainer,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.configErrorTitle}>App not configured</Text>
      <Text style={styles.configErrorMessage}>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env in the project root, then restart the dev server: npx expo start
      </Text>
    </View>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const _layoutWidth = useWebLayoutWidth();
  const pathname = usePathname();
  const auth = useOptionalAuth();
  const isDriverRole = auth?.profile?.role === 'driver';
  const isChatRoute =
    pathname === ROUTES.CHAT || pathname.startsWith('/chat');
  const isDispatcherChatRouteActive =
    !isDriverRole &&
    (isFloatingChatHostRoute(pathname) || isChatRoute);
  useEffect(() => {
    installForegroundPruning();
    if (!__DEV__) return;
    installRealtimeDiagnosticsGlobalHook();
    startRealtimeDiagnosticsLogger();
    return () => {
      stopRealtimeDiagnosticsLogger();
    };
  }, []);

  return (
    <NavigationPolicyShadowHost>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DemoTabBarScrollProvider>
        {/*
          Chat providers are lazy: ~1.1k LOC of realtime + store + service stays
          out of the startup chunk. They re-wrap the tree after first idle.
        */}
        <LazyChatProviders
          isActive={isDispatcherChatRouteActive && !isChatRoute}
          skipWrap={isChatRoute && !isDriverRole}
        >
          <View style={{ flex: 1 }}>
            <GlobalOperationsToast />
            <AppAlertHost />
            <Stack screenOptions={routeStackScreenOptions}>
              <Stack.Screen name="index" />
              <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
              <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
              <Stack.Screen name="forgot-password" options={{ animation: 'fade' }} />
              <Stack.Screen name="auth/reset-password" options={{ animation: 'fade' }} />
              <Stack.Screen name="sign-up" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/index" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/business" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/driver" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding/join-team" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(driver)" />
              <Stack.Screen name="add-trip" />
              <Stack.Screen
                name="add-commodity-type/index"
                options={{ animation: "slide_from_right", headerShown: false }}
              />
              <Stack.Screen name="network" />
              <Stack.Screen name="load-board" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen
                name="chat"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_right', headerShown: false }}
              />
              <Stack.Screen name="trip" options={{ animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="create-indent" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="log-incoming-pods" options={{ presentation: 'card', animation: 'slide_from_right' }} />
              <Stack.Screen name="invoicing-execute" options={{ presentation: 'card', animation: 'slide_from_right' }} />
              <Stack.Screen name="business-pulse" options={{ presentation: 'card', animation: 'slide_from_right', headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
              <Stack.Screen
                name="workspace"
                options={{
                  presentation: "transparentModal",
                  animation: "fade",
                  headerShown: false,
                  contentStyle: { flex: 1, backgroundColor: "transparent" },
                }}
              />
              <Stack.Screen name="audit" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" options={{ headerShown: false }} />
            </Stack>
            <NavigationLoadingOverlay />
            <RootOverlayTabBar />
          </View>
        </LazyChatProviders>
      </DemoTabBarScrollProvider>
    </ThemeProvider>
    </NavigationPolicyShadowHost>
  );
}

function RootOverlayTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useOptionalAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const scrollControls = useDemoTabBarScrollOptional();
  const layoutWidth = useWebLayoutWidth();

  const showOnRootScreens = pathnameHasRootTopNav(pathname);

  useEffect(() => {
    if (showOnRootScreens) scrollControls?.resetBarVisible();
  }, [pathname, scrollControls, showOnRootScreens]);

  useEffect(() => {
    if (!showOnRootScreens || auth?.profile?.role === 'driver') return;
    scheduleDispatcherTabPreloads(undefined, { queryClient, orgId });
  }, [showOnRootScreens, orgId, queryClient, auth?.profile?.role]);

  if (!showOnRootScreens) return null;

  // These screens are reached from header actions, so keep the matching nav item active.
  const activeTab: DemoTabId = pathname === ROUTES.PULSE_LOADS ? 'loadCenter' : 'finance';
  const isDesktopWeb = Platform.OS === 'web' && layoutWidth >= Layout.webDesktopMinWidth;

  const shellStyle = [
    styles.rootTabBarWrap,
    isDesktopWeb && {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      zIndex: 100,
      width: '100%' as const,
    },
    !isDesktopWeb && Platform.OS === 'web' && {
      position: 'fixed' as const,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },
  ];

  const tabBar = (
    <DemoTabBar
      activeTab={activeTab}
      onTabChange={(tab) => {
        if (tab === 'loadCenter') preloadPulseLoadsRoute();
        else if (tab === 'finance' || tab === 'trips' || tab === 'network') {
          preloadTabScreen(tab as PreloadableTab);
          if (tab === 'finance' && orgId) {
            preloadFinanceWarmup(queryClient, orgId);
          }
        }
        router.push(
          (tab === 'finance'
            ? ROUTES.TABS.FINANCE
            : tab === 'trips'
              ? ROUTES.TABS.TRIPS
              : tab === 'network'
                ? ROUTES.TABS.NETWORK
                : tab === 'loadCenter'
                  ? ROUTES.PULSE_LOADS
                  : ROUTES.TABS.RESOURCES) as '/'
        );
      }}
      onProfilePress={() => router.push(ROUTES.WORKSPACE)}
      onNotificationsPress={() => router.push('/notifications')}
    />
  );

  if (isDesktopWeb) {
    return <View style={shellStyle}>{tabBar}</View>;
  }

  return (
    <DemoTabBarAutoHideShell style={shellStyle}>{tabBar}</DemoTabBarAutoHideShell>
  );
}
