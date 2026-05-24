/**
 * Holds a full-screen branded overlay until session + workspace are ready,
 * then hides the native splash. Prevents blank flashes between splash and content.
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { safeHideSplashAsync } from '@/lib/safeSplashScreen.util';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type AppBootGateProps = {
  children: ReactNode;
};

export function AppBootGate({ children }: AppBootGateProps) {
  const { status, user, profile, roleVerified } = useAuth();
  const org = useOptionalOrganization();
  const splashHidden = useRef(false);

  const bootReady = useMemo(() => {
    if (status === 'restoring') return false;
    if (user) {
      if (!profile) return false;
      if (profile.role === 'driver' && !roleVerified) return false;
      if (org?.isLoading) return false;
    }
    return true;
  }, [status, user, profile, roleVerified, org?.isLoading]);

  const splashVariant =
    status === 'restoring'
      ? 'session'
      : user && profile && !roleVerified
        ? 'verify'
        : 'preparing';

  useEffect(() => {
    if (!bootReady || splashHidden.current) return;
    splashHidden.current = true;
    const id = requestAnimationFrame(() => {
      void safeHideSplashAsync().catch(() => {});
    });
    return () => cancelAnimationFrame(id);
  }, [bootReady]);

  return (
    <View style={styles.root}>
      {children}
      {!bootReady ? (
        <View
          style={styles.overlay}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="auto"
        >
          <AppLoadingSplash variant={splashVariant} style={styles.splash} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
  },
  splash: {
    flex: 1,
  },
});
