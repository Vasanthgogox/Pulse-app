import 'react-native-gesture-handler';
import { AppAlertHost } from '@/components/AppAlertHost';
import { ContentErrorState } from '@/components/ContentErrorState';
import { GlobalOperationsToast } from '@/components/GlobalOperationsToast';
import { FloatingChatButton } from '@/components/FloatingChatButton';
import { DemoTabBar, type DemoTabId } from '@/components/demo';
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
  useDemoTabBarScroll,
} from '@/contexts/DemoTabBarScrollContext';
import * as authService from '@/features/auth';
import { isSessionExpiredError } from '@/features/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeQueryClient } from '@/lib/queryClient';
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
  isStaleNativeBundleError,
  recoverStaleWebDeploy,
} from '@/lib/webDeployRecovery';
import {
  installWebViewportHeight,
  WEB_APP_VIEWPORT_STYLE,
} from '@/lib/webViewportHeight';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { safePreventAutoHideAsync } from '@/lib/safeSplashScreen.util';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { AppBootGate } from '@/components/AppBootGate';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { NavigationLoadingOverlay } from '@/components/NavigationLoadingOverlay';
import { LogBox, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useWebLayoutWidth } from '@/lib/useWebLayoutWidth';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider } from '@/contexts/AuthContext';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { LanguageProvider, tGlobal } from '@/contexts/LanguageContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { OrganizationProvider, useOptionalOrganization } from '@/contexts/OrganizationContext';
import { KeyboardAccessoryProvider } from '@/contexts/KeyboardAccessoryContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { TripChatProvider } from '@/features/chat/contexts/TripChatContext';
import { IntegratedChatProvider } from '@/features/chat/contexts/IntegratedChatContext';
import { GlobalSyncProvider } from '@/lib/globalSync';

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
      ? {
          ...WEB_APP_VIEWPORT_STYLE,
          backgroundColor: Theme.screenBackground,
          overflow: 'hidden' as const,
        }
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
]);

export default function RootLayout() {
  useEffect(() => {
    installWebDeployRecoveryListener();
    if (Platform.OS !== 'web') return;
    return installWebViewportHeight();
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
        key: 'q-cache-v1',
        throttleTime: 3000,
      }),
    [],
  );

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const styleId = 'q-web-input-focus-reset';
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

  if (!loaded) {
    return (
      <SafeAreaProvider>
        <AppLoadingSplash variant="preparing" useGlobalI18n />
      </SafeAreaProvider>
    );
  }

  // Avoid any Supabase call when config is missing (prevents "Network request failed" from invalid URL)
  if (!hasSupabaseConfig()) {
    return (
      <SafeAreaProvider>
        <ConfigErrorScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.ghRoot}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) =>
                query.state.status === 'success',
            },
          }}
        >
          <NetworkProvider>
            <LanguageProvider>
              <AuthProvider>
                <OrganizationProvider>
                  <WalletProvider>
                    <KeyboardAccessoryProvider>
                      <GlobalSyncProvider>
                        <AppBootGate>
                          <RootLayoutNav />
                        </AppBootGate>
                      </GlobalSyncProvider>
                    </KeyboardAccessoryProvider>
                  </WalletProvider>
                </OrganizationProvider>
              </AuthProvider>
            </LanguageProvider>
          </NetworkProvider>
        </PersistQueryClientProvider>
      </GestureHandlerRootView>
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
  const layoutWidth = useWebLayoutWidth();
  const isDesktopWeb = Platform.OS === 'web' && layoutWidth >= Layout.webDesktopMinWidth;
  const pathname = usePathname();
  const auth = useOptionalAuth();
  const isDriverRole = auth?.profile?.role === 'driver';
  const isDispatcherChatRouteActive =
    !isDriverRole &&
    (pathname === ROUTES.TABS.TRIPS ||
      pathname === ROUTES.TABS.NETWORK ||
      pathname === ROUTES.CHAT ||
      pathname.startsWith('/chat'));

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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DemoTabBarScrollProvider>
        <TripChatProvider isActive={isDispatcherChatRouteActive}>
          <IntegratedChatProvider isActive={isDispatcherChatRouteActive}>
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
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(driver)" />
                <Stack.Screen name="add-trip" />
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
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
                <Stack.Screen name="+not-found" options={{ headerShown: false }} />
              </Stack>
              <NavigationLoadingOverlay />
              <RootOverlayTabBar />
              {isDesktopWeb ? <FloatingChatButton /> : null}
            </View>
          </IntegratedChatProvider>
        </TripChatProvider>
      </DemoTabBarScrollProvider>
    </ThemeProvider>
  );
}

function RootOverlayTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const { resetBarVisible } = useDemoTabBarScroll();
  const layoutWidth = useWebLayoutWidth();

  const showOnRootScreens = pathnameHasRootTopNav(pathname);

  useEffect(() => {
    if (showOnRootScreens) resetBarVisible();
  }, [pathname, resetBarVisible, showOnRootScreens]);

  useEffect(() => {
    if (!showOnRootScreens) return;
    scheduleDispatcherTabPreloads(undefined, { queryClient, orgId });
  }, [showOnRootScreens, orgId, queryClient]);

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
      onProfilePress={() => router.push('/(tabs)/profile')}
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
