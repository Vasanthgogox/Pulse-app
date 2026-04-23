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
  const { user, profile, roleVerified, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // React Navigation mounts this screen in the background when deep-linking to
  // any other route (unstable_settings.initialRouteName keeps it in the stack).
  // Without this guard, the useEffect below would fire and redirect away from
  // the intended deep-link destination.
  const isFocused = useIsFocused();

  const logRouteDecision = (event: string, details: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info('[RouteGuard:index]', event, details);
  };

  useEffect(() => {
    if (!isFocused) return;
    if (loading) return;
    if (Platform.OS === 'web' && pathname !== '/') {
      // On web deep links (e.g. /network), do not let the index guard hijack refresh.
      return;
    }
    if (!user) {
      logRouteDecision('redirect_sign_in', { pathname });
      router.replace(Platform.OS === 'web' ? '/terminal-website' : '/sign-in');
      return;
    }
    if (!profile) return;
    if (profile.role === 'driver') {
      // Security-first: only enter driver app after server-backed role verification.
      if (!roleVerified) {
        logRouteDecision('block_driver_redirect_unverified_role', {
          uid: user.uid,
          pathname,
          role: profile.role,
        });
        return;
      }
      logRouteDecision('redirect_driver_root', { uid: user.uid, pathname });
      router.replace(DEFAULT_DRIVER_ROUTE as '/');
      return;
    }
    // Restore the last visited tab so cold-start lands where the user left off,
    // rather than always defaulting to the Cash/Finance tab.
    getLastTabRoute().then((route) => {
      logRouteDecision('redirect_dispatcher_last_tab', {
        uid: user.uid,
        pathname,
        route,
      });
      router.replace(route as '/');
    });
  }, [user, profile, roleVerified, loading, pathname, router, isFocused]);

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
