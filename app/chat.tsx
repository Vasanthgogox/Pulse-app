/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 *
 * Providers + ChatScreen are imported statically on this route so `/chat` never
 * depends on root lazy-provider timing or dynamic-import races (web dev/HMR).
 */
import { ChatScreen } from '@/features/chat/components/ChatScreen';
import { IntegratedChatProvider } from '@/features/chat/contexts/IntegratedChatContext';
import { TripChatProvider } from '@/features/chat/contexts/TripChatContext';

export default function ChatRoute() {
  return (
    <TripChatProvider isActive>
      <IntegratedChatProvider isActive>
        <ChatScreen />
      </IntegratedChatProvider>
    </TripChatProvider>
  );
}
