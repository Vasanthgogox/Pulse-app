/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 */
import { LazyRouteScreen } from "@/components/LazyRouteScreen";

export default function ChatRoute() {
  return (
    <LazyRouteScreen
      fallback="inline"
      message="Loading chat…"
      loader={() =>
        import("@/features/chat/components/ChatScreen").then((m) => ({
          default: m.ChatScreen,
        }))
      }
    />
  );
}
