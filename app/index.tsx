import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { getLastTabRoute } from '@/lib/lastRoute';
import { DEFAULT_DRIVER_ROUTE } from '@/lib/routes';
import { useIsFocused } from '@react-navigation/native';
import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Index() {
  const insets = useSafeAreaInsets();
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // React Navigation mounts this screen in the background when deep-linking to
  // any other route (unstable_settings.initialRouteName keeps it in the stack).
  // Without this guard, the useEffect below would fire and redirect away from
  // the intended deep-link destination.
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    if (loading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }
    if (!profile) return;
    if (Platform.OS === 'web') {
      // Preserve deep links on web, but avoid an infinite spinner when landing on root ("/").
      if (pathname !== '/') return;
    }
    if (profile.role === 'driver') {
      router.replace(DEFAULT_DRIVER_ROUTE as '/');
      return;
    }
    // Restore the last visited tab so cold-start lands where the user left off,
    // rather than always defaulting to the Cash/Finance tab.
    getLastTabRoute().then((route) => {
      router.replace(route as '/');
    });
  }, [user, profile, loading, pathname, router, isFocused]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ActivityIndicator size="large" color={Theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
  },
});
