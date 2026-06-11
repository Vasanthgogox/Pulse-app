/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 *
 * Providers + ChatScreen are imported statically on this route so `/chat` never
 * depends on root lazy-provider timing or dynamic-import races (web dev/HMR).
 *
 * Driver guard: drivers must NEVER land here (they have their own screen at
 * `/(driver)/chat`). Redirect before rendering any dispatcher-only providers.
 */
import { ChatScreen } from '@/features/chat/components/ChatScreen';
import { IntegratedChatProvider } from '@/features/chat/contexts/IntegratedChatContext';
import { TripChatProvider } from '@/features/chat/contexts/TripChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

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
    <TripChatProvider isActive>
      <IntegratedChatProvider isActive>
        <ChatScreen />
      </IntegratedChatProvider>
    </TripChatProvider>
  );
}
