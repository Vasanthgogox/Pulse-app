/**
 * Offline-first chat outbox (Phase 0 foundation).
 *
 * Failed sends are persisted to AsyncStorage keyed by `client_message_id`.
 * Replaying through `send_chat_message` is idempotent server-side, so a
 * message can be retried any number of times without duplication.
 *
 * Drain is invoked by the service layer after a successful send (cheap
 * opportunistic flush) and can be wired to NetworkContext reconnect events.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ChatOutboxEntry } from "../types/chatPlatform.types";

const OUTBOX_KEY = "q-chat-outbox-v1";
const MAX_ENTRIES = 200;
const MAX_ATTEMPTS = 25;

export function generateClientMessageId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // RFC-4122-shaped fallback for runtimes without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function readChatOutbox(): Promise<ChatOutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatOutboxEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeChatOutbox(entries: ChatOutboxEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      OUTBOX_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
  } catch {
    // Storage failure must never crash a send path.
  }
}

export async function enqueueChatOutbox(entry: ChatOutboxEntry): Promise<void> {
  const entries = await readChatOutbox();
  const withoutDupe = entries.filter(
    (e) => e.clientMessageId !== entry.clientMessageId,
  );
  withoutDupe.push(entry);
  await writeChatOutbox(withoutDupe);
}

export async function removeFromChatOutbox(
  clientMessageId: string,
): Promise<void> {
  const entries = await readChatOutbox();
  const next = entries.filter((e) => e.clientMessageId !== clientMessageId);
  if (next.length !== entries.length) await writeChatOutbox(next);
}

export async function chatOutboxSize(): Promise<number> {
  return (await readChatOutbox()).length;
}

/**
 * Replay queued sends through the provided sender (the service injects the
 * RPC call to avoid a util → service import cycle). Stops on the first
 * network-level failure; entries that exceed MAX_ATTEMPTS are dropped.
 */
export async function drainChatOutbox(
  send: (entry: ChatOutboxEntry) => Promise<void>,
): Promise<{ sent: number; remaining: number }> {
  const entries = await readChatOutbox();
  if (entries.length === 0) return { sent: 0, remaining: 0 };

  let sent = 0;
  const remaining: ChatOutboxEntry[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      await send(entry);
      sent++;
    } catch {
      const attempts = (entry.attempts ?? 0) + 1;
      if (attempts < MAX_ATTEMPTS) {
        remaining.push({ ...entry, attempts });
      }
      // Network is likely still down — keep the rest untouched for later.
      remaining.push(...entries.slice(i + 1));
      break;
    }
  }

  await writeChatOutbox(remaining);
  return { sent, remaining: remaining.length };
}
