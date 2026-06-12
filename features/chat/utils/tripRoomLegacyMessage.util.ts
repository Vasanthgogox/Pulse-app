/**
 * Maps unified `chat_messages` action_card rows back to legacy TripMessageRow
 * shape so trip room can reuse the existing lane UI (SystemEventCard, ledger, etc.).
 */
import type {
  MessageSenderRole,
  MessageType,
  TripMessageRow,
} from "../types/chat.types";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

function resolveLegacyMessageType(
  eventType: string,
  body: string,
  meta: Record<string, unknown>,
): MessageType {
  if (eventType === "status_change" || meta.new_status) return "status_change";
  if (
    eventType === "ledger_event" ||
    eventType === "payment_received" ||
    meta.transaction_id ||
    meta.receiver_org_id
  ) {
    return "ledger_event";
  }
  if (
    eventType === "document_shared" ||
    eventType === "pod_uploaded"
  ) {
    return "document_share";
  }
  if (eventType === "tracking") return "tracking";
  if (eventType === "assignment_update") return "assignment_update";
  if (eventType === "location_log" || /location ping/i.test(body)) {
    return "location_log";
  }
  if (
    meta.lat != null &&
    meta.lng != null &&
    Number.isFinite(Number(meta.lat)) &&
    Number.isFinite(Number(meta.lng))
  ) {
    return "tracking";
  }
  return "system";
}

/** Convert platform action_card → legacy row for SystemEventCard routing. */
export function platformActionCardToTripMessage(
  row: ChatPlatformMessageRow,
): TripMessageRow {
  const meta = { ...(row.metadata ?? {}) } as Record<string, unknown>;
  const eventType = String(meta.event_type ?? "")
    .trim()
    .toLowerCase();
  const body =
    (typeof meta.body === "string" && meta.body.trim()) ||
    (typeof row.content === "string" && row.content.trim()) ||
    "";

  const messageType = resolveLegacyMessageType(eventType, body, meta);
  const content =
    messageType === "status_change" ||
    messageType === "system" ||
    messageType === "assignment_update" ||
    messageType === "location_log"
      ? body || String(row.content ?? "")
      : body || String(row.content ?? "");

  const senderRole = String(meta.sender_role ?? "system") as MessageSenderRole;

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    organization_id: row.organization_id,
    sender_user_id: row.sender_user_id,
    sender_role: senderRole,
    sender_name: String(meta.sender_name ?? "Pulse"),
    content,
    message_type: messageType,
    metadata: meta,
    is_read: true,
    read_at: row.created_at,
    created_at: row.created_at,
  };
}
