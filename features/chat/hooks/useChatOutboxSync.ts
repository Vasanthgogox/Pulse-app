/**
 * Offline outbox sync — replays queued chat sends when connectivity returns.
 *
 * Flush points:
 *   • offline → online transition (NetworkContext / NetInfo)
 *   • app background → foreground (AppState)
 *   • mount (app cold start with messages still queued)
 *
 * Replay is idempotent server-side (`client_message_id` dedupe in
 * `send_chat_message`), so overlapping flushes cannot duplicate messages;
 * a module-level in-flight latch avoids redundant RPC bursts anyway.
 */
import { useEffect } from "react";
import { AppState } from "react-native";

import { useNetwork } from "@/contexts/NetworkContext";

import { flushChatOutbox } from "../services/chatPlatform.service";

let flushInFlight = false;

async function safeFlush(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const { sent, remaining } = await flushChatOutbox();
    if (__DEV__ && (sent > 0 || remaining > 0)) {
      console.log(`[chatOutbox] flushed sent=${sent} remaining=${remaining}`);
    }
  } catch {
    // Still offline or transient failure — entries stay queued.
  } finally {
    flushInFlight = false;
  }
}

export function useChatOutboxSync(enabled: boolean = true) {
  const { isConnected, isInternetReachable } = useNetwork();
  const online = isConnected !== false && isInternetReachable !== false;

  // Mount (cold start with queued sends) + offline → online transition.
  useEffect(() => {
    if (!enabled || !online) return;
    void safeFlush();
  }, [enabled, online]);

  // Foreground.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void safeFlush();
    });
    return () => sub.remove();
  }, [enabled]);
}
