/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 *
 * ChatRouteContent (providers + ChatScreen) is lazy-loaded via React.lazy so the
 * 9K-line ChatScreen doesn't land in the entry bundle. The Suspense fallback keeps
 * the route responsive while the chunk loads.
 *
 * Driver guard: drivers must NEVER land here (they have their own screen at
 * `/(driver)/chat`). Redirect before rendering any dispatcher-only providers.
 */
import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { useAuth } from '@/contexts/AuthContext';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useEffect } from 'react';
import { Platform, View } from 'react-native';

const ChatRouteContent = lazy(
  () => import('@/features/chat/components/ChatRouteContent'),
);

export default function ChatRoute() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

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
  if ((profile as { role?: string })?.role === 'driver') return null;

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
