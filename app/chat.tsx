/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 */
import { LazyRouteScreen } from "@/components/LazyRouteScreen";
import { preloadChatRoute, preloadChatScreenModule } from "@/lib/preloadChatWarmup";

void preloadChatRoute();

export default function ChatRoute() {
  return (
    <LazyRouteScreen
      fallback="inline"
      message="Loading chat…"
      loader={() =>
        preloadChatScreenModule().then((m) => ({
          default: m.ChatScreen,
        }))
      }
    />
  );
}
