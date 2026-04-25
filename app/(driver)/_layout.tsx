/**
 * Driver app layout (route group). When user has role=driver they land here after login.
 * Tabs: Dashboard, Trip, History, Wallet.
 * Not to be confused with app/driver/ which is for dispatchers (e.g. /driver/[id] = driver detail).
 */
import { DriverTabBar } from '@/components/driver/DriverTabBar';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { DriverAvatarProvider } from '@/contexts/DriverAvatarContext';
import { DriverThemeProvider } from '@/contexts/DriverThemeContext';
import { ROUTES } from '@/lib/routes';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts as usePlusJakartaFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

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

      {/* Hidden routes */}
      <Tabs.Screen name="notifications" options={{ title: 'Notifications', href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', href: null }} />
      <Tabs.Screen name="level-progression" options={{ title: 'Level progression', href: null }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      <Tabs.Screen name="passbook" options={{ title: 'Passbook', href: null }} />
      <Tabs.Screen name="salary-request" options={{ title: 'Salary Request', href: null }} />
    </Tabs>
  );
}

export default function DriverAppLayout() {
  // ✅ Keep fonts from HEAD
  const [fontsLoaded] = usePlusJakartaFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // ✅ Keep roleVerified from deepak/main
  const { user, profile, roleVerified, loading } = useAuth();

  const router = useRouter();

  const logDriverGate = (event: string, details: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info('[RouteGuard:driver]', event, details);
  };

  useEffect(() => {
    if (loading) return;

    if (!user) {
      logDriverGate('redirect_sign_in_missing_user', {});
      router.replace(ROUTES.SIGN_IN_DIRECT);
      return;
    }

    if (profile && (!roleVerified || profile.role !== 'driver')) {
      logDriverGate('redirect_tabs_non_driver_or_unverified', {
        uid: user.uid,
        role: profile.role,
        roleVerified,
      });
      router.replace(ROUTES.TABS.TRIPS as '/');
    }
  }, [loading, user, profile, roleVerified, router]);

  // ✅ Gate includes fonts + auth checks
  const gate =
    !fontsLoaded ||
    loading ||
    !user ||
    !profile ||
    !roleVerified ||
    profile.role !== 'driver';

  if (gate) {
    return (
      <View style={styles.gate}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

  return (
    <DriverThemeProvider>
      <DriverAvatarProvider>
        <DriverTabsNavigator />
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