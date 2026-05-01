export type ConversationPartyType = "client" | "supplier" | "driver";
export type MessageSenderRole = "dispatcher" | "client" | "supplier" | "driver" | "system";
export type MessageType = "text" | "update" | "question" | "challenge" | "system" | "ledger_event" | "document_share";

// ── Ledger event metadata ─────────────────────────────────────────────────────

export interface LedgerEventMetadata {
  transaction_id: string;
  amount: number;
  flow: "in" | "out";
  category: string;
  payment_mode: string;
  reference_number?: string | null;
  notes?: string | null;
  sender_org_id: string;
  sender_org_name: string;
  receiver_org_id: string;
  receiver_org_name: string;
  acknowledged_at?: string | null;
  disputed?: boolean;
}

// ── Document share metadata ───────────────────────────────────────────────────

export interface DocumentShareMetadata {
  document_type: string;
  storage_path: string;
  document_name: string;
  /** From trip_documents.mime_type — improves image preview when file_name has no extension. */
  mime_type?: string | null;
  entity_type: "vehicle" | "driver";
  entity_id: string;
}

// ── Trip conversation ─────────────────────────────────────────────────────────

export interface TripConversationRow {
  id: string;
  organization_id: string;
  trip_id: string;
  party_type: ConversationPartyType;
  party_name: string;
  client_id: string | null;
  supplier_id: string | null;
  driver_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_dispatcher_count: number;
  created_at: string;
  updated_at: string;
}

export interface TripMessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_user_id: string | null;
  sender_role: MessageSenderRole;
  sender_name: string;
  content: string;
  message_type: MessageType;
  metadata?: LedgerEventMetadata | DocumentShareMetadata | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface TripConversation extends TripConversationRow {
  trip_number: string;
  pickup_area: string;
  drop_location: string;
  messages: TripMessageRow[];
}

// ── Network (org-to-org) chat ─────────────────────────────────────────────────────

export interface NetworkConversationRow {
  id: string;
  org_a_id: string;
  org_b_id: string;
  org_a_name: string;
  org_b_name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_a: number;
  unread_count_b: number;
  created_at: string;
  updated_at: string;
}

export interface NetworkMessageRow {
  id: string;
  conversation_id: string;
  sender_org_id: string;
  sender_user_id: string | null;
  sender_name: string;
  content: string;
  is_read_by_other: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NetworkConversation extends NetworkConversationRow {
  partner_org_id: string;
  partner_name: string;
  unread_count: number;
  messages: NetworkMessageRow[];
}

export interface NetworkPartner {
  org_id: string;
  name: string;
}

// ── Shareable document item ───────────────────────────────────────────────────

export interface ShareableDocument {
  key: string;
  label: string;
  storage_path: string;
  entity_type: "vehicle" | "driver";
  entity_id: string;
}
