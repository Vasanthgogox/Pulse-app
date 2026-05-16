import Layout from '@/constants/Layout';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { getLastTabRoute } from '@/lib/lastRoute';
import { DEFAULT_DRIVER_ROUTE } from '@/lib/routes';
import { useIsFocused } from '@react-navigation/native';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Index() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const isOnline = useIsOnline();
  const { user, profile, roleVerified, loading, refreshSession } = useAuth();
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

  const splashMessage = useMemo(() => {
    if (loading) return t('splashRestoringSession');
    if (user && profile?.role === 'driver' && !roleVerified) return t('splashVerifyingAccount');
    if (user && !profile) return t('splashVerifyingAccount');
    return t('loading');
  }, [loading, profile, roleVerified, t, user]);

  const showOfflineHint = !loading && !isOnline;
  const showRetry = !loading && isOnline && user && profile?.role === 'driver' && !roleVerified;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LoadingIndicator size="large" color={Theme.primary} />
      <Text style={styles.splashTitle} accessibilityRole="text">
        {splashMessage}
      </Text>
      {showOfflineHint ? (
        <Text style={styles.splashHint}>{t('splashOfflineHint')}</Text>
      ) : null}
      {showRetry ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('splashRetrySession')}
          style={styles.retryButton}
          onPress={() => {
            void refreshSession();
          }}
        >
          <Text style={styles.retryLabel}>{t('splashRetrySession')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  splashTitle: {
    marginTop: Layout.spacingExtraLarge,
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
    textAlign: 'center',
    maxWidth: 320,
  },
  splashHint: {
    marginTop: Layout.spacingMedium,
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  retryButton: {
    marginTop: Layout.sectionSpacing,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: Layout.sectionSpacing,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Theme.primary,
  },
  retryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textOnPrimary,
  },
});
