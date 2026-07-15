/**
 * Driver app layout (route group). When user has role=driver they land here after login.
 * Tabs: Dashboard, Trip, History, Earnings. Trip chat opens from trip detail (hidden route).
 * Not to be confused with app/driver/ which is for dispatchers (e.g. /driver/[id] = driver detail).
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { DriverInviteModalProvider } from '@/contexts/DriverInviteModalContext';
import { DriverTripOpsProvider } from '@/contexts/DriverTripOpsContext';
import { DriverTabBar } from '@/components/driver/DriverTabBar';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { DriverAvatarProvider } from '@/contexts/DriverAvatarContext';
import { DriverThemeProvider } from '@/contexts/DriverThemeContext';
import { DriverCommunicationProvider } from '@/features/driver/communication';
import {
  consumePendingDriverInviteAfterAuth,
} from '@/lib/driverInviteDeepLink.util';
import { ROUTES } from '@/lib/routes';
import { beginDriverPerfSession } from '@/lib/driverPerfMetrics';
import { syncAndInvalidateLinkedDrivers } from '@/lib/syncLinkedDriversForDriverHome';
import {
  hydrateDriverSignupSuccessFlag,
  isDriverSignupSuccessActiveSync,
} from '@/lib/onboarding/businessSignupBranding.util';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts as usePlusJakartaFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

function DriverTabsNavigator() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <DriverTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="control" options={{ title: 'Trip', href: null }} />
      <Tabs.Screen name="trip-history" options={{ title: 'History' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Transactions' }} />
      {/* Not listed in DriverTabBar TAB_CONFIG; omit href: null so router.push / query params work on web */}
      <Tabs.Screen
        name="chat"
        options={{
          title: "Trip chat",
          tabBarStyle: { display: "none" },
        }}
      />

      {/* Hidden routes */}
      <Tabs.Screen name="notifications" options={{ title: 'Notifications', href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', href: null }} />
      <Tabs.Screen name="level-progression" options={{ title: 'Level progression', href: null }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      <Tabs.Screen name="passbook" options={{ title: 'Passbook', href: null }} />
      <Tabs.Screen name="salary-request" options={{ title: 'Salary Request', href: null }} />
      <Tabs.Screen name="pending-earnings" options={{ title: 'Pending Earnings', href: null }} />
    </Tabs>
  );
}

export default function DriverAppLayout() {
  // Web uses FontFaceObserver (expo-font) with a timeout; on failure we still mount so the app is usable with system fonts.
  const [fontsLoaded, fontError] = usePlusJakartaFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const fontsReady = fontsLoaded || fontError != null;

  // ✅ Keep roleVerified from deepak/main
  const { user, profile, loading } = useAuth();
  const queryClient = useQueryClient();
  const linkedDriversSyncedRef = useRef(false);

  const router = useRouter();
  const logDriverGate = (event: string, details: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info('[RouteGuard:driver]', event, details);
  };

  useEffect(() => {
    void hydrateDriverSignupSuccessFlag();
  }, []);

  useEffect(() => {
    if (loading || !user || profile?.role !== 'driver') return;
    void consumePendingDriverInviteAfterAuth();
  }, [loading, user, profile?.role]);

  useEffect(() => {
    if (loading) return;

    if (isDriverSignupSuccessActiveSync()) {
      logDriverGate('redirect_driver_signup_success', {});
      router.replace('/driver-signup');
      return;
    }

    if (!user) {
      logDriverGate('redirect_sign_in_missing_user', {});
      router.replace(ROUTES.SIGN_IN_DIRECT);
      return;
    }

    if (profile && profile.role !== 'driver') {
      logDriverGate('redirect_tabs_non_driver', {
        uid: user.uid,
        role: profile.role,
      });
      router.replace(ROUTES.TABS.TRIPS as '/');
    }
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (fontError && __DEV__ && Platform.OS === 'web') {
      console.warn(
        '[DriverAppLayout] Plus Jakarta font load failed; using system fallbacks.',
        fontError,
      );
    }
  }, [fontError]);

  // ✅ Gate includes fonts + auth checks
  const gate =
    !fontsReady ||
    loading ||
    !user ||
    !profile ||
    profile.role !== 'driver';

  // Phase 0 perf: session origin when driver shell becomes interactive.
  useEffect(() => {
    if (gate) return;
    beginDriverPerfSession();
  }, [gate]);

  // Phase 2: sync linked drivers once per driver session (login / cold restore), not on poll.
  useEffect(() => {
    if (gate) {
      linkedDriversSyncedRef.current = false;
      return;
    }
    if (!profile?.uid || linkedDriversSyncedRef.current) return;
    linkedDriversSyncedRef.current = true;
    void syncAndInvalidateLinkedDrivers(queryClient, profile.uid);
  }, [gate, profile?.uid, queryClient]);

  if (gate) {
    return (
      <AppLoadingSplash
        variant={loading ? 'session' : !fontsReady ? 'preparing' : 'generic'}
        style={styles.gate}
      />
    );
  }

  return (
    <DriverThemeProvider>
      <DriverAvatarProvider>
        <DriverCommunicationProvider>
          <DriverInviteModalProvider>
            <DriverTripOpsProvider>
              <DriverTabsNavigator />
            </DriverTripOpsProvider>
          </DriverInviteModalProvider>
        </DriverCommunicationProvider>
      </DriverAvatarProvider>
    </DriverThemeProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
});