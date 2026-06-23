import Layout from '@/constants/Layout';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { tGlobal } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  claimIndexBootRedirect,
  hasIndexBootRedirected,
  isPastIndexBootPath,
  resetIndexBootRedirect,
} from '@/lib/indexBootRedirect.util';
import { getLastTabRoute } from '@/lib/lastRoute';
import { preloadTabForRoute } from '@/lib/preloadRoutes';
import {
  hydrateSignupFlowFlags,
  isBusinessSignupBrandingActiveSync,
  isDriverSignupSuccessActiveSync,
} from '@/lib/onboarding/businessSignupBranding.util';
import { DEFAULT_DRIVER_ROUTE, ROUTES } from '@/lib/routes';
import { useIsFocused } from '@react-navigation/native';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIGN_IN_BOOT_KEY = '__sign_in__';

export default function Index() {
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const uid = user?.uid ?? null;
  const [brandingGateHydrated, setBrandingGateHydrated] = useState(false);

  useEffect(() => {
    void hydrateSignupFlowFlags().finally(() => {
      setBrandingGateHydrated(true);
    });
  }, []);

  const logRouteDecision = (event: string, details: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.info('[RouteGuard:index]', event, details);
  };

  useEffect(() => {
    if (!isFocused || loading || !brandingGateHydrated) return;

    if (Platform.OS === 'web' && pathname !== '/' && pathname !== '') {
      return;
    }

    if (isBusinessSignupBrandingActiveSync()) {
      if (pathname === '/' || pathname === '') {
        logRouteDecision('redirect_business_signup_branding_resume', { uid, pathname });
        router.replace(ROUTES.ONBOARDING.BUSINESS);
      }
      return;
    }

    if (isDriverSignupSuccessActiveSync()) {
      if (pathname === '/' || pathname === '') {
        logRouteDecision('redirect_driver_signup_success_resume', { uid, pathname });
        router.replace('/driver-signup' as '/');
      }
      return;
    }

    if (!uid) {
      resetIndexBootRedirect();
      if (!claimIndexBootRedirect(SIGN_IN_BOOT_KEY)) return;
      logRouteDecision('redirect_sign_in', { pathname });
      router.replace(Platform.OS === 'web' ? '/terminal-website' : '/sign-in');
      return;
    }

    if (isPastIndexBootPath(pathname)) {
      claimIndexBootRedirect(uid);
      return;
    }

    if (!profile) return;

    if (profile.role === 'driver') {
      if (isDriverSignupSuccessActiveSync()) {
        logRouteDecision('block_driver_redirect_signup_success', { uid, pathname });
        if (pathname === '/' || pathname === '') {
          router.replace('/driver-signup' as '/');
        }
        return;
      }
      if (!claimIndexBootRedirect(uid)) return;
      logRouteDecision('redirect_driver_root', { uid, pathname });
      router.replace(DEFAULT_DRIVER_ROUTE as '/');
      return;
    }

    if (hasIndexBootRedirected(uid)) return;
    if (!claimIndexBootRedirect(uid)) return;

    void getLastTabRoute().then((route) => {
      preloadTabForRoute(route);
      logRouteDecision('redirect_dispatcher_last_tab', { uid, pathname, route });
      router.replace(route as '/');
    });
  }, [uid, profile, loading, pathname, router, isFocused, brandingGateHydrated]);

  const splashVariant = useMemo(() => {
    if (loading) return 'session' as const;
    if (user && !profile) return 'verify' as const;
    return 'generic' as const;
  }, [loading, profile, user]);

  const showOfflineHint = !loading && !isOnline;

  return (
    <View style={styles.container}>
      <AppLoadingSplash variant={splashVariant} useGlobalI18n />
      {showOfflineHint ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, Layout.spacingMedium) },
          ]}
        >
          <Text style={styles.splashHint}>{tGlobal('splashOfflineHint')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  footer: {
    position: 'absolute',
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    bottom: 0,
    alignItems: 'center',
  },
  splashHint: {
    marginBottom: Layout.spacingMedium,
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  retryButton: {
    marginTop: Layout.spacingMedium,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: Layout.sectionSpacing,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  retryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textOnPrimary,
  },
});
