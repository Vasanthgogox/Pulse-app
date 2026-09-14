/**
 * Offline outbox sync — replays queued chat sends when connectivity returns.
 *
 * Flush points:
 *   • offline → online transition (NetInfo)
 *   • app background → foreground (AppState)
 *   • mount (app cold start with messages still queued)
 *
 * Replay is idempotent server-side (`client_message_id` dedupe in
 * `send_chat_message`), so overlapping flushes cannot duplicate messages;
 * a module-level in-flight latch avoids redundant RPC bursts anyway.
 */
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { flushChatOutbox } from "../services/chatPlatform.service";

/** Match `useIsOnline`: unknown connectivity is treated as online so flush can try. */
function isOnlineFromNetInfo(state: NetInfoState | null): boolean {
  if (state?.isConnected === false) return false;
  if (state?.isConnected === true && state.isInternetReachable === false) return false;
  return true;
}

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
  // Subscribe to NetInfo here instead of NetworkContext. TripChatProvider is
  // loaded via dynamic import; Metro can then instantiate a second
  // NetworkContext, so useNetwork() throws even when NetworkProvider is an ancestor.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isOnlineFromNetInfo(state));
    });
    NetInfo.fetch()
      .then((state) => setOnline(isOnlineFromNetInfo(state)))
      .catch(() => {
        /* non-fatal; listener still drives later updates */
      });
    return unsubscribe;
  }, []);

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
