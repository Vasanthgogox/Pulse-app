/**
 * Holds a full-screen branded overlay until session + workspace are ready,
 * then hides the native splash. Prevents blank flashes between splash and content.
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { useAuth } from '@/contexts/AuthContext';
import { safeHideSplashAsync } from '@/lib/safeSplashScreen.util';
import { dumpStartupMetrics, markStartupPhase } from '@/lib/startupMetrics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

const BOOT_HARD_TIMEOUT_MS = 20_000;

type AppBootGateProps = {
  children: ReactNode;
};

export function AppBootGate({ children }: AppBootGateProps) {
  const { status, user, profile, roleVerified } = useAuth();
  const splashHidden = useRef(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), BOOT_HARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const bootReady = useMemo(() => {
    if (timedOut) return true;
    // Only block on auth state — workspace/org data loads behind the scenes
    // after navigation is unblocked. Each screen shows its own skeleton while
    // workspace data streams in (avoids blocking the entire app on org fetch).
    if (status === 'restoring') return false;     // no session yet — must block
    if (user && !profile) return false;           // profile needed to determine role/route
    if (user && profile?.role === 'driver' && !roleVerified) return false;
    return true;
    // Intentionally excluded: org?.isLoading — workspace loads behind the screen
  }, [status, user, profile, roleVerified, timedOut]);

  const splashVariant =
    status === 'restoring'
      ? 'session'
      : user && profile && !roleVerified
        ? 'verify'
        : 'preparing';

  useEffect(() => {
    if (!bootReady || splashHidden.current) return;
    splashHidden.current = true;
    markStartupPhase('boot_gate_open');
    const id = requestAnimationFrame(() => {
      void safeHideSplashAsync().catch(() => {});
      dumpStartupMetrics();
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
