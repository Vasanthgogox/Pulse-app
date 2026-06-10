/**
 * Supabase Realtime Presence-based typing indicator.
 *
 * Tracks whether other participants are typing in a trip conversation.
 * Emits / removes the caller's own "typing" state.
 *
 * Usage:
 *   const { typingNames, onUserTyping } = useChatTypingPresence(convId, uid, name);
 *   // Call onUserTyping() each time the user types a character.
 */

import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

/** How long we wait before broadcasting "typing" after a keystroke (ms). */
const BROADCAST_DEBOUNCE_MS = 400;
/** After this long with no keystrokes, broadcast "stopped typing" (ms). */
const STOP_TYPING_TIMEOUT_MS = 4_500;

type PresencePayload = {
  name: string;
  typing: boolean;
  ts: number;
};

export function useChatTypingPresence(
  conversationId: string | null | undefined,
  selfUserId: string | null | undefined,
  selfName: string,
): {
  /** Display names of participants currently typing (excludes self). */
  typingNames: string[];
  /** Call this on every TextInput change event to broadcast typing state. */
  onUserTyping: () => void;
} {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isTypingRef = useRef(false);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Subscribe to presence for this conversation ──────────────────────────
  useEffect(() => {
    if (!conversationId || !selfUserId) return;

    const channelName = `chat-typing:${conversationId}`;
    const ch = supabase().channel(channelName, {
      config: { presence: { key: selfUserId } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresencePayload>();
      const names: string[] = [];
      for (const [uid, presences] of Object.entries(state)) {
        if (uid === selfUserId) continue;
        const latest = (presences as PresencePayload[]).at(-1);
        if (latest?.typing) names.push(latest.name || "Someone");
      }
      setTypingNames(names);
    });

    void ch.subscribe();
    channelRef.current = ch;

    return () => {
      void ch.unsubscribe();
      channelRef.current = null;
      isTypingRef.current = false;
    };
  }, [conversationId, selfUserId]);

  // ── Broadcast "stopped typing" ──────────────────────────────────────────
  const broadcastStop = useCallback(() => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    void channelRef.current?.track({ name: selfName, typing: false, ts: 0 });
  }, [selfName]);

  // ── Call on each keystroke ───────────────────────────────────────────────
  const onUserTyping = useCallback(() => {
    if (!channelRef.current) return;

    // Debounce: delay the actual broadcast slightly to avoid spamming
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        void channelRef.current?.track({
          name: selfName,
          typing: true,
          ts: 0, // avoid Date.now() in hot path
        });
      }
      // Reset the stop-typing timeout on each keystroke
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(broadcastStop, STOP_TYPING_TIMEOUT_MS);
    }, BROADCAST_DEBOUNCE_MS);
  }, [selfName, broadcastStop]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  return { typingNames, onUserTyping };
}
