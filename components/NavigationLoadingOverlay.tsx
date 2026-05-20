/**
 * Covers the main content area during client-side route transitions (especially
 * while Metro lazy-bundles a screen). Works with expo `loading.tsx` on each segment.
 */
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { ROUTES } from '@/lib/routes';
import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, View } from 'react-native';

const MIN_VISIBLE_MS = 120;

/** Stack routes outside tab/driver/modal groups — overlay while Metro bundles. */
function shouldShowNavigationOverlay(
  pathname: string,
  segments: string[],
): boolean {
  if (!pathname || pathname === '/') return false;
  const root = segments[0] ?? '';
  if (root === '(tabs)' || root === '(driver)' || root === '(modals)') return false;
  if (
    pathname === ROUTES.SIGN_IN_DIRECT ||
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname === '/welcome' ||
    pathname === '/terminal-website' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/auth/')
  ) {
    return false;
  }
  return true;
}

export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef(0);

  useEffect(() => {
    if (!shouldShowNavigationOverlay(pathname, segments)) {
      setVisible(false);
      return;
    }

    setVisible(true);
    shownAt.current = Date.now();

    if (hideTimer.current) clearTimeout(hideTimer.current);

    const interaction = InteractionManager.runAfterInteractions(() => {
      const elapsed = Date.now() - shownAt.current;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimer.current = setTimeout(() => setVisible(false), delay);
    });

    return () => {
      interaction.cancel();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname, segments]);

  if (!visible) return null;

  return (
    <View
      style={styles.overlay}
      pointerEvents="auto"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppLoadingSplash variant="preparing" style={styles.splash} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 9998,
    ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
  },
  splash: {
    flex: 1,
  },
});
