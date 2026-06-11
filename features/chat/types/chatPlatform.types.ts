/**
 * Pulse Chat Platform — unified chat_* schema types (Phase 0 foundation).
 *
 * These map 1:1 to the `chat_conversations` / `chat_messages` tables and the
 * platform RPCs (`send_chat_message`, `get_chat_inbox`, `get_chat_messages`,
 * `ensure_direct_chat`, `ensure_chat_channel`, …).
 *
 * Legacy `trip_messages` / `network_messages` rows are mirrored into
 * `chat_messages` by DB triggers with identical uuids, so ids are stable
 * across both stores during the migration window.
 */

export type ChatConversationType =
  | "direct" // user ↔ user DM (same org)
  | "direct_org" // legacy network org ↔ org thread
  | "trip" // unified trip room (Phase 2)
  | "trip_lane" // legacy 1:1 trip lane bridge
  | "customer"
  | "supplier"
  | "channel" // named group channel (ops / finance / branch)
  | "system"; // auto-generated event feed

export type ChatPlatformMessageType =
  | "text"
  | "image"
  | "document"
  | "voice"
  | "location"
  | "action_card"
  | "reference"
  | "system";

export type ChatSenderType = "user" | "system" | "integration";

export interface ChatConversationRow {
  id: string;
  organization_id: string;
  conversation_type: ChatConversationType;
  title: string | null;
  trip_id: string | null;
  client_id: string | null;
  supplier_id: string | null;
  driver_id: string | null;
  channel_key: string | null;
  created_by: string | null;
  is_archived: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  message_count: number;
  metadata: Record<string, unknown>;
  legacy_trip_conversation_id: string | null;
  legacy_network_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape returned by the `get_chat_inbox` RPC. */
export interface ChatInboxItem {
  id: string;
  organization_id: string;
  conversation_type: ChatConversationType;
  title: string | null;
  trip_id: string | null;
  client_id: string | null;
  supplier_id: string | null;
  driver_id: string | null;
  channel_key: string | null;
  is_archived: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  message_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  my_last_read_at: string | null;
  unread_count: number;
}

export interface ChatPlatformMessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_user_id: string | null;
  sender_type: ChatSenderType;
  sender_name: string;
  sender_role: string | null;
  message_type: string;
  content: string;
  metadata: Record<string, unknown>;
  reply_to_id: string | null;
  client_message_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  legacy_source: "trip" | "network" | null;
  created_at: string;
}

export interface SendChatMessageParams {
  conversationId: string;
  content: string;
  messageType?: ChatPlatformMessageType;
  metadata?: Record<string, unknown>;
  /** Idempotency key — auto-generated when omitted. */
  clientMessageId?: string;
  replyToId?: string;
  mentionUserIds?: string[];
}

/** Persisted outbox entry for offline-first send retry. */
export interface ChatOutboxEntry {
  clientMessageId: string;
  conversationId: string;
  content: string;
  messageType: ChatPlatformMessageType;
  metadata: Record<string, unknown>;
  replyToId: string | null;
  mentionUserIds: string[];
  queuedAt: string;
  attempts: number;
}

/** emoji → user ids, as returned by `toggle_chat_reaction`. */
export type ChatReactionMap = Record<string, string[]>;
