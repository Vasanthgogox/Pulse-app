import { FloatingOpsAgentButton } from '@/components/FloatingOpsAgentButton';
import { DemoTabBar, type DemoTabId } from '@/components/demo';
import Theme from '@/constants/Theme';
import { ROUTES } from '@/lib/routes';
import {
  DemoTabBarAutoHideShell,
  DemoTabBarScrollProvider,
  useDemoTabBarScroll,
} from '@/contexts/DemoTabBarScrollContext';
import * as authService from '@/features/auth';
import { isSessionExpiredError } from '@/features/auth';
import { makeQueryClient } from '@/lib/queryClient';
import { hasSupabaseConfig, SUPABASE_CONFIG_MISSING_MESSAGE } from '@/lib/supabase';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef } from 'react';
import { LogBox, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider, tGlobal } from '@/contexts/LanguageContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { WalletProvider } from '@/contexts/WalletContext';

function isNetworkError(error: Error): boolean {
  const msg = error.message;
  return (
    msg === 'Network request failed' ||
    /network|fetch.*failed/i.test(msg) ||
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
      router.replace('/sign-in');
    }
  }, [sessionExpired, router]);

  if (sessionExpired) {
    return null;
  }

  const configMissing = isConfigMissingError(error);
  const network = isNetworkError(error);
  return (
    <View
      style={[
        errorStyles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={errorStyles.title}>
        {configMissing ? tGlobal('appNotConfigured') : network ? tGlobal('connectionErrorShort') : tGlobal('somethingWentWrong')}
      </Text>
      <Text style={errorStyles.message}>
        {configMissing
          ? 'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env in the project root, then restart: npx expo start'
          : network
            ? "Cannot reach server. If you're on home or office WiFi, try mobile data or a different network—some routers block or slow cloud services."
            : error.message}
      </Text>
      {!configMissing && (
        <TouchableOpacity style={errorStyles.button} onPress={retry}>
          <Text style={errorStyles.buttonText}>{tGlobal('tryAgain')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: Theme.darkBackground,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: Theme.textOnDark,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: Theme.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: Theme.buttonPrimary,
    padding: 16,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: Theme.buttonPrimaryText,
    fontSize: 16,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  rootTabBarWrap: {
    width: '100%',
    paddingHorizontal: 0,
  },
});

export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

// Stale refresh token (e.g. from another device) is handled by clearing local session and showing sign-in.
// Suppress the library's error log so users don't see a scary red error on app open.
LogBox.ignoreLogs([
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'AuthApiError',
  'No native splash screen registered',
]);

export default function RootLayout() {
  const splashHidden = useRef(false);
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const queryClient = useMemo(() => makeQueryClient(), []);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!loaded || splashHidden.current) return;
    splashHidden.current = true;
    // Defer so the active view controller has the splash registered (avoids "No native splash screen registered" in dev client).
    const id = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {
        // Ignore: "No native splash screen registered" can occur when VC has changed (e.g. dev client, simulator).
      });
    }, 0);
    return () => clearTimeout(id);
  }, [loaded]);

  if (!loaded) {
    return null;
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
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <LanguageProvider>
            <AuthProvider>
              <OrganizationProvider>
                <WalletProvider>
                  <RootLayoutNav />
                </WalletProvider>
              </OrganizationProvider>
            </AuthProvider>
          </LanguageProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function ConfigErrorScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        errorStyles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={errorStyles.title}>App not configured</Text>
      <Text style={errorStyles.message}>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env in the project root, then restart the dev server: npx expo start
      </Text>
    </View>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DemoTabBarScrollProvider>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
            <Stack.Screen name="sign-up" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(driver)" />
            <Stack.Screen name="add-trip" />
            <Stack.Screen name="network" />
            <Stack.Screen name="load-board" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="create-indent" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="log-incoming-pods" options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="invoicing-execute" options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
          </Stack>
          <RootOverlayTabBar />
          <FloatingOpsAgentButton />
        </View>
      </DemoTabBarScrollProvider>
    </ThemeProvider>
  );
}

function RootOverlayTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resetBarVisible } = useDemoTabBarScroll();
  const { width } = useWindowDimensions();

  const showOnRootScreens =
    pathname === '/pod-reconciliation' ||
    pathname === '/invoicing-execute' ||
    pathname === '/log-incoming-pods';

  useEffect(() => {
    if (showOnRootScreens) resetBarVisible();
  }, [pathname, resetBarVisible, showOnRootScreens]);

  if (!showOnRootScreens) return null;

  // These screens are reached from the Finance tab, so Finance stays active in the dock.
  const activeTab: DemoTabId = 'finance';
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  const shellStyle = [
    styles.rootTabBarWrap,
    isDesktopWeb && {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      zIndex: 100,
      width: '100%',
    },
  ];

  if (isDesktopWeb) {
    return (
      <View style={shellStyle}>
        <DemoTabBar
          activeTab={activeTab}
          onTabChange={(tab) =>
            router.push(
              (tab === 'finance'
                ? ROUTES.TABS.FINANCE
                : tab === 'trips'
                  ? ROUTES.TABS.TRIPS
                  : tab === 'network'
                    ? ROUTES.TABS.NETWORK
                    : ROUTES.TABS.RESOURCES) as '/'
            )
          }
          onProfilePress={() => router.push('/(tabs)/profile')}
        />
      </View>
    );
  }

  return (
    <DemoTabBarAutoHideShell style={shellStyle}>
      <DemoTabBar
        activeTab={activeTab}
        onTabChange={(tab) =>
          router.push(
            (tab === 'finance'
              ? ROUTES.TABS.FINANCE
              : tab === 'trips'
                ? ROUTES.TABS.TRIPS
                : tab === 'network'
                  ? ROUTES.TABS.NETWORK
                  : ROUTES.TABS.RESOURCES) as '/'
          )
        }
        onProfilePress={() => router.push('/(tabs)/profile')}
      />
    </DemoTabBarAutoHideShell>
  );
}
