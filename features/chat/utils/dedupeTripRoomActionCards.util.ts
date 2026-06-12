/**
 * Trip room action_cards are mirrored once per legacy party lane (client, supplier,
 * driver). Each lane gets a distinct legacy_trip_message_id, so DB dedupe alone
 * leaves duplicates. Collapse to one card per operational event for display.
 */
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

function minuteBucket(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/** Stable fingerprint for cross-lane operational duplicates. */
export function tripRoomActionCardDedupKey(msg: ChatPlatformMessageRow): string {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const eventType = String(meta.event_type ?? "")
    .trim()
    .toLowerCase();
  const body =
    (typeof meta.body === "string" ? meta.body.trim() : "") ||
    (typeof msg.content === "string" ? msg.content.trim() : "");
  const minute = minuteBucket(msg.created_at);

  const txId = meta.transaction_id ?? meta.transactionId;
  if (txId) return `ledger:${String(txId)}`;

  const payload = meta.event_payload as Record<string, unknown> | undefined;
  const newStatus = meta.new_status ?? payload?.new_status;
  if (eventType === "status_change" && newStatus != null) {
    return `status:${String(newStatus)}:${minute}:${body.slice(0, 120)}`;
  }

  const lat = meta.lat ?? meta.latitude;
  const lng = meta.lng ?? meta.longitude;
  if (lat != null && lng != null) {
    return `loc:${Number(lat).toFixed(4)}:${Number(lng).toFixed(4)}:${minute}`;
  }

  return `${eventType}:${minute}:${body.slice(0, 160)}`;
}

/** Newest-first list with duplicate action_cards removed (keeps earliest copy). */
export function dedupeTripRoomActionCards(
  messages: ChatPlatformMessageRow[],
): ChatPlatformMessageRow[] {
  const keeperByKey = new Map<string, ChatPlatformMessageRow>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.message_type !== "action_card") continue;
    const key = tripRoomActionCardDedupKey(msg);
    if (!keeperByKey.has(key)) keeperByKey.set(key, msg);
  }

  const emitted = new Set<string>();
  const out: ChatPlatformMessageRow[] = [];

  for (const msg of messages) {
    if (msg.message_type !== "action_card") {
      out.push(msg);
      continue;
    }
    const key = tripRoomActionCardDedupKey(msg);
    const keeper = keeperByKey.get(key);
    if (!keeper || keeper.id !== msg.id || emitted.has(key)) continue;
    emitted.add(key);
    out.push(msg);
  }

  return out;
}
