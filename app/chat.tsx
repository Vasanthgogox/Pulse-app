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
import { useMemberAccess } from '@/lib/useMemberAccess';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

const ChatRouteContent = lazy(
  () => import('@/features/chat/components/ChatRouteContent'),
);

export default function ChatRoute() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const isDriver = (profile as { role?: string })?.role === 'driver';

  useEffect(() => {
    // Drivers that land here (e.g. after a refresh that lost nav state) should see
    // their own driver-chat view, not the dispatcher Pulse Chat.
    if ((profile as { role?: string })?.role === 'driver') {
      const dest = params.tripId
        ? `/(driver)/chat?tripId=${encodeURIComponent(params.tripId)}`
        : '/(driver)/chat';
      router.replace(dest as Parameters<typeof router.replace>[0]);
    }
  }, [profile, params.tripId, router]);

  // If driver role, the useEffect above redirects; render nothing while it fires.
  if (isDriver) return null;

  // Surfaces hydrate async — deciding before they land would bounce permitted members.
  if (accessLoading) {
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
