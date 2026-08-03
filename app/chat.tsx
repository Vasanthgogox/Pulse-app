/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 *
 * ChatRouteContent (providers + ChatScreen) is lazy-loaded via React.lazy so the
 * 9K-line ChatScreen doesn't land in the entry bundle. The Suspense fallback keeps
 * the route responsive while the chunk loads.
 *
 * Driver guard: drivers must NEVER land here (they have their own screen at
 * `/(driver)/chat`). Redirect before rendering any dispatcher-only providers.
 *
 * Surface guard: `sales.chat` is checked here, before the lazy chunk mounts, so a
 * restricted member never fetches conversations. Partner chat leaks commercial
 * detail (rates, awarded trips, disputes) and links out to indent stories.
 */
import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { useAuth } from '@/contexts/AuthContext';
import { useLoadingStuck } from '@/lib/hooks/useLoadingStuck';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

const ChatRouteContent = lazy(
  () => import('@/features/chat/components/ChatRouteContent'),
);

export default function ChatRoute() {
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const isDriver = (profile as { role?: string })?.role === 'driver';
  const accessStuck = useLoadingStuck(accessLoading);

  // Drivers must leave BEFORE the surface gate below. `(driver)` is a group
  // segment, so `/(driver)/chat` and `/chat` are the same browser URL — a driver
  // re-entering chat can land on this dispatcher file. The `accessLoading` gate
  // waits on ActiveWorkspaceContext, which never resolves for a driver, so
  // gating first would splash forever with no exit. Redirect during render
  // (not in an effect) so no dispatcher-only provider ever mounts.
  if (isDriver) {
    const dest = params.tripId
      ? `/(driver)/chat?tripId=${encodeURIComponent(params.tripId)}`
      : '/(driver)/chat';
    return <Redirect href={dest as '/'} />;
  }

  // Surfaces hydrate async — deciding before they land would bounce permitted
  // members. `accessStuck` keeps a never-resolving workspace from becoming an
  // inescapable splash: fall through to the denied view instead of waiting.
  if (accessLoading && !accessStuck) {
    return <LazySuspenseInlineFallback message="Loading chat…" />;
  }

  if (!canSurface('sales.chat')) {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedText}>
          You don&apos;t have access to chat.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        { flex: 1 },
        Platform.OS === 'web' ? (WEB_APP_VIEWPORT_STYLE as object) : null,
      ]}
    >
      <Suspense fallback={<LazySuspenseInlineFallback message="Loading chat…" />}>
        <ChatRouteContent />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  denied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deniedText: {
    fontSize: 14,
    color: '#737373',
    textAlign: 'center',
  },
});
