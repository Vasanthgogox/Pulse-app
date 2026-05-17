/**
 * Dispatcher Pulse Chat — full-screen root route (not nested under tab modal stack).
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { Suspense, lazy } from "react";

const ChatScreen = lazy(() =>
  import("@/features/chat/components/ChatScreen").then((m) => ({
    default: m.ChatScreen,
  })),
);

export default function ChatRoute() {
  return (
    <Suspense fallback={<CenteredLoadingView message="Loading chat…" />}>
      <ChatScreen />
    </Suspense>
  );
}
