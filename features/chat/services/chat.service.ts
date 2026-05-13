import type { RatedType, RatingRow } from "@/features/ratings/types";
import { supabase } from "@/lib/supabase";
import type {
  ChatTripFlow,
  ConversationPartyType,
  DocumentShareMetadata,
  MessageSenderRole,
  MessageType,
  NetworkConversation,
  NetworkConversationRow,
  NetworkMessageRow,
  NetworkPartner,
  TripConversation,
  TripConversationRow,
  TripMessageRow,
} from "../types/chat.types";
import { parseFeedbackRequestMetadata } from "../utils/feedbackRequestMeta";
import {
  extractTagsFromRatingComment,
  findTripRatingMatchingFeedbackMeta,
} from "../utils/mergeTripFeedbackMessages.util";
import type { ChatLanes } from "../utils/laneMultiplexer.util";
import {
  buildChatLanesFromConversations,
  mergeMessagesByContextIntoLanes,
  normalizeServerLanes,
} from "../utils/laneMultiplexer.util";

export interface TripForCompose {
  id: string;
  trip_number: string;
  display_trip_id: string | null;
  /** Trip lifecycle status from `trips.status` (for hub scope / unassigned merge). */
  status?: string | null;
  created_at?: string | null;
  pickup_area: string;
  drop_location: string;
  client_id: string | null;
  client_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  driver_id: string | null;
  driver_display_name: string | null;
  client_linked_organization_id: string | null;
  supplier_linked_organization_id: string | null;
}

export async function getTripsForCompose(
  organizationId: string,
): Promise<TripForCompose[]> {
  const { data, error } = await supabase()
    .from("trips")
    // Match trips hub: * only. Listing non-existent columns (e.g. supplier_name on older
    // trips tables) makes PostgREST return an error — UI showed "Could not load trips".
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const trips = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    trip_number: String(row.trip_number ?? ""),
    display_trip_id: (row.display_trip_id as string | null | undefined) ?? null,
    status: (row.status as string | null | undefined) ?? null,
    created_at: (row.created_at as string | null | undefined) ?? null,
    pickup_area: String(row.pickup_area ?? ""),
    drop_location: String(row.drop_location ?? ""),
    client_id: (row.client_id as string | null | undefined) ?? null,
    client_name: (row.client_name as string | null | undefined) ?? null,
    supplier_id: (row.supplier_id as string | null | undefined) ?? null,
    supplier_name: (row.supplier_name as string | null | undefined) ?? null,
    driver_id: (row.driver_id as string | null | undefined) ?? null,
    driver_display_name:
      (row.driver_display_name as string | null | undefined) ?? null,
    client_linked_organization_id: null,
    supplier_linked_organization_id: null,
  }));

  const clientIds = Array.from(
    new Set(trips.map((t) => t.client_id).filter((v): v is string => !!v)),
  );
  const supplierIds = Array.from(
    new Set(trips.map((t) => t.supplier_id).filter((v): v is string => !!v)),
  );
  if (clientIds.length === 0 && supplierIds.length === 0) return trips;

  const [clientsResp, suppliersResp] = await Promise.all([
    clientIds.length
      ? supabase()
          .from("clients")
          .select("id, linked_organization_id")
          .in("id", clientIds)
      : Promise.resolve({
          data: [] as { id: string; linked_organization_id: string | null }[],
        }),
    supplierIds.length
      ? supabase()
          .from("suppliers")
          .select("id, company_name, name, linked_organization_id")
          .in("id", supplierIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            company_name: string | null;
            name: string | null;
            linked_organization_id: string | null;
          }[],
        }),
  ]);

  const clientLinkedOrgById = new Map<string, string | null>();
  for (const c of clientsResp.data ?? []) {
    clientLinkedOrgById.set(c.id, c.linked_organization_id ?? null);
  }

  const supplierNameById = new Map<string, string>();
  const supplierLinkedOrgById = new Map<string, string | null>();
  for (const s of suppliersResp.data ?? []) {
    const label = (s.company_name ?? "").trim() || (s.name ?? "").trim();
    if (label) supplierNameById.set(s.id, label);
    supplierLinkedOrgById.set(s.id, s.linked_organization_id ?? null);
  }

  return trips.map((t) => ({
    ...t,
    supplier_name:
      t.supplier_name?.trim() ||
      (t.supplier_id ? (supplierNameById.get(t.supplier_id) ?? null) : null),
    client_linked_organization_id:
      t.client_id ? (clientLinkedOrgById.get(t.client_id) ?? null) : null,
    supplier_linked_organization_id:
      t.supplier_id ? (supplierLinkedOrgById.get(t.supplier_id) ?? null) : null,
  }));
}

function isGenericPartyName(name: unknown): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return n === "" || n === "supplier" || n === "client" || n === "driver";
}

async function resolveGenericPartyNamesForTrips(
  conversations: TripConversation[],
): Promise<TripConversation[]> {
  // Only fetch names for conversations whose party_name is a generic placeholder.
  // Skips the two DB calls entirely when all names are already resolved (common after setup).
  const unresolvedClientIds = Array.from(
    new Set(
      conversations
        .filter((c) => c.party_type === "client" && c.client_id && isGenericPartyName(c.party_name))
        .map((c) => c.client_id as string),
    ),
  );
  const unresolvedSupplierIds = Array.from(
    new Set(
      conversations
        .filter((c) => c.party_type === "supplier" && c.supplier_id && isGenericPartyName(c.party_name))
        .map((c) => c.supplier_id as string),
    ),
  );

  if (unresolvedClientIds.length === 0 && unresolvedSupplierIds.length === 0) {
    return conversations;
  }

  const [clientsResp, suppliersResp] = await Promise.all([
    unresolvedClientIds.length
      ? supabase()
          .from("clients")
          .select("id, name")
          .in("id", unresolvedClientIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    unresolvedSupplierIds.length
      ? supabase()
          .from("suppliers")
          .select("id, company_name, name")
          .in("id", unresolvedSupplierIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            company_name: string | null;
            name: string | null;
          }[],
        }),
  ]);

  const clientNameById = new Map<string, string>();
  for (const c of clientsResp.data ?? []) {
    const label = (c.name ?? "").trim();
    if (label) clientNameById.set(c.id, label);
  }
  const supplierNameById = new Map<string, string>();
  for (const s of suppliersResp.data ?? []) {
    const label = (s.company_name ?? "").trim() || (s.name ?? "").trim();
    if (label) supplierNameById.set(s.id, label);
  }

  return conversations.map((c) => {
    const partyRaw = String(c.party_name ?? "")
      .trim()
      .toLowerCase();
    const isGeneric =
      partyRaw === "" ||
      partyRaw === "supplier" ||
      partyRaw === "client" ||
      partyRaw === "driver";
    if (!isGeneric) return c;

    if (c.party_type === "client" && c.client_id) {
      return {
        ...c,
        party_name: clientNameById.get(c.client_id) ?? c.party_name,
      };
    }
    if (c.party_type === "supplier" && c.supplier_id) {
      return {
        ...c,
        party_name: supplierNameById.get(c.supplier_id) ?? c.party_name,
      };
    }
    return c;
  });
}

const TRIP_EMBED_FIELDS_FULL =
  "organization_id, trip_number, display_trip_id, status, pickup_area, drop_location, driver_id, supplier_id, created_at";
const TRIP_EMBED_FIELDS_LEGACY =
  "organization_id, trip_number, status, pickup_area, drop_location, driver_id, supplier_id, created_at";

const TRIP_MESSAGES_EMBED = `trip_messages ( id, conversation_id, content, sender_role, sender_name, sender_user_id, created_at, is_read, message_type, metadata )`;
/** Newest N rows per conversation embed. Keep low — bulk loads (13+ convos × limit) can spike CPU/RAM. */
const TRIP_MESSAGES_EMBED_RECENT = 20;

/** Page size for on-demand trip thread history (WhatsApp-style window; bootstrap RPC uses same cap). */
export const TRIP_CHAT_HISTORY_PAGE = 20;

function tripConversationSelect(tripEmbedFields: string): string {
  return `
      *,
      trips!inner ( ${tripEmbedFields} ),
      ${TRIP_MESSAGES_EMBED}
    `;
}

/** Conversation row + trip join only (no embedded `trip_messages`). */
function tripConversationMetaSelect(tripEmbedFields: string): string {
  return `
      *,
      trips!inner ( ${tripEmbedFields} )
    `;
}

/** PostgREST fails the whole row if an embedded column does not exist on `trips`. */
function isMissingTripsDisplayTripIdError(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null;
  if (!e) return false;
  const m = String(e.message ?? "").toLowerCase();
  if (!m.includes("display_trip_id")) return false;
  return (
    m.includes("does not exist") ||
    m.includes("unknown") ||
    m.includes("column") ||
    m.includes("schema cache")
  );
}

export async function getConversationsByOrganization(
  organizationId: string,
): Promise<TripConversation[]> {
  async function loadMerged(tripEmbedFields: string): Promise<unknown[]> {
    const selectConv = tripConversationSelect(tripEmbedFields);
    const [{ data: ownOrgRows, error: ownErr }, supplierTripIdsRes] = await Promise.all([
      supabase()
        .from("trip_conversations")
        .select(selectConv)
        .eq("organization_id", organizationId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, referencedTable: "trip_messages" })
        .limit(TRIP_MESSAGES_EMBED_RECENT, { referencedTable: "trip_messages" }),
      supabase().rpc("get_supplier_trip_ids_for_org", { p_org_id: organizationId }),
    ]);

    if (ownErr) throw ownErr;
    if (supplierTripIdsRes.error) throw supplierTripIdsRes.error;

    const supplierTripIds = ((supplierTripIdsRes.data ?? []) as { trip_id: string }[])
      .map((r) => r.trip_id)
      .filter((id): id is string => !!id);

    let supplierRows: unknown[] = [];
    if (supplierTripIds.length > 0) {
      const { data: supRows, error: supErr } = await supabase()
        .from("trip_conversations")
        .select(selectConv)
        .in("trip_id", supplierTripIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, referencedTable: "trip_messages" })
        .limit(TRIP_MESSAGES_EMBED_RECENT, { referencedTable: "trip_messages" });
      if (supErr) throw supErr;
      supplierRows = supRows ?? [];
    }

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of ownOrgRows ?? [])
      byId.set((row as unknown as { id: string }).id, row as unknown as Record<string, unknown>);
    for (const row of supplierRows)
      byId.set((row as unknown as { id: string }).id, row as unknown as Record<string, unknown>);

    return Array.from(byId.values()).sort((a, b) => {
      const ta = a.last_message_at as string | null | undefined;
      const tb = b.last_message_at as string | null | undefined;
      return (tb ? new Date(tb).getTime() : 0) - (ta ? new Date(ta).getTime() : 0);
    });
  }

  let merged: unknown[];
  try {
    merged = await loadMerged(TRIP_EMBED_FIELDS_FULL);
  } catch (err) {
    if (!isMissingTripsDisplayTripIdError(err)) throw err;
    merged = await loadMerged(TRIP_EMBED_FIELDS_LEGACY);
  }

  const conversations = (merged as Array<Record<string, unknown>>).map((row) => {
    const trips = row.trips as Record<string, unknown> | null | undefined;
    return {
      ...row,
      trip_number: (trips?.trip_number as string | undefined) ?? "",
      display_trip_id: (trips?.display_trip_id as string | null) ?? null,
      trip_status: (trips?.status as string | null) ?? null,
      trip_driver_id: (trips?.driver_id as string | null) ?? null,
      trip_supplier_id: (trips?.supplier_id as string | null) ?? null,
      trip_created_at: (trips?.created_at as string | null) ?? null,
      trip_organization_id: (trips?.organization_id as string | null | undefined) ?? null,
      pickup_area: (trips?.pickup_area as string | undefined) ?? "",
      drop_location: (trips?.drop_location as string | undefined) ?? "",
      messages: ((row.trip_messages ?? []) as TripMessageRow[]).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    };
  }) as unknown as TripConversation[];

  return resolveGenericPartyNamesForTrips(conversations);
}

/**
 * Fetches one trip thread by id (deep links, unknown-conversation recovery).
 * Default: **no** embedded `trip_messages` — hydrate bodies via {@link fetchConversationHistory} on thread open.
 */
export async function getTripConversationById(
  conversationId: string,
  opts?: { includeRecentMessages?: boolean },
): Promise<TripConversation | null> {
  const includeRecent = opts?.includeRecentMessages === true;

  function buildQuery(tripEmbed: typeof TRIP_EMBED_FIELDS_FULL | typeof TRIP_EMBED_FIELDS_LEGACY) {
    const sel = includeRecent ? tripConversationSelect(tripEmbed) : tripConversationMetaSelect(tripEmbed);
    let q = supabase().from("trip_conversations").select(sel).eq("id", conversationId);
    if (includeRecent) {
      q = q
        .order("created_at", { ascending: false, referencedTable: "trip_messages" })
        .limit(TRIP_MESSAGES_EMBED_RECENT, { referencedTable: "trip_messages" });
    }
    return q.maybeSingle();
  }

  let res = await buildQuery(TRIP_EMBED_FIELDS_FULL);

  if (res.error && isMissingTripsDisplayTripIdError(res.error)) {
    res = await buildQuery(TRIP_EMBED_FIELDS_LEGACY);
  }

  if (res.error || !res.data) return null;

  const row = res.data as unknown as {
    trips?: {
      organization_id?: string | null;
      trip_number?: string;
      display_trip_id?: string | null;
      status?: string | null;
      pickup_area?: string;
      drop_location?: string;
      driver_id?: string | null;
      supplier_id?: string | null;
      created_at?: string | null;
    };
    trip_messages?: TripMessageRow[];
  } & Record<string, unknown>;

  const base: TripConversation = {
    ...row,
    trip_number: String(row.trips?.trip_number ?? ""),
    display_trip_id: row.trips?.display_trip_id ?? null,
    trip_status: row.trips?.status ?? null,
    trip_driver_id: row.trips?.driver_id ?? null,
    trip_supplier_id: row.trips?.supplier_id ?? null,
    trip_created_at: row.trips?.created_at ?? null,
    trip_organization_id: row.trips?.organization_id ?? null,
    pickup_area: String(row.trips?.pickup_area ?? ""),
    drop_location: String(row.trips?.drop_location ?? ""),
    messages: ((row.trip_messages ?? []) as TripMessageRow[]).sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  } as TripConversation;

  const [resolved] = await resolveGenericPartyNamesForTrips([base]);
  return resolved ?? null;
}

export async function getOrCreateConversation(params: {
  tripId: string;
  partyType: ConversationPartyType;
  partyName: string;
  organizationId: string;
  partyId: string;
}): Promise<TripConversationRow> {
  const { tripId, partyType, partyName, organizationId, partyId } = params;

  const partyCol =
    partyType === "client"
      ? "client_id"
      : partyType === "supplier"
        ? "supplier_id"
        : "driver_id";

  if (partyType === "driver") {
    const { data, error } = await supabase().rpc("ensure_driver_trip_conversation", {
      p_trip_id: tripId,
      p_driver_id: partyId,
      p_party_name: partyName,
    });
    if (!error && data) return data as TripConversationRow;
    const missingRpc =
      error != null &&
      (error.code === "42883" ||
        String(error.message ?? "")
          .toLowerCase()
          .includes("ensure_driver_trip_conversation"));
    if (!missingRpc && error) throw error;
    /* Fallback until migration is applied */
  }

  if (partyType === "client") {
    const { data: client, error } = await supabase()
      .from("clients")
      .select("id, linked_organization_id")
      .eq("id", partyId)
      .maybeSingle();
    if (error) throw error;
    if (!client?.linked_organization_id) {
      throw new Error("Client is not linked to an app organization");
    }
  }

  if (partyType === "supplier") {
    const { data: supplier, error } = await supabase()
      .from("suppliers")
      .select("id, linked_organization_id")
      .eq("id", partyId)
      .maybeSingle();
    if (error) throw error;
    if (!supplier?.linked_organization_id) {
      throw new Error("Supplier is not linked to an app organization");
    }
  }

  const payload = {
    organization_id: organizationId,
    trip_id: tripId,
    party_type: partyType,
    party_name: partyName,
    [partyCol]: partyId,
  };

  const { data, error } = await supabase()
    .from("trip_conversations")
    .upsert(payload, { onConflict: "trip_id,party_type" })
    .select("id,organization_id,trip_id,party_type,party_name,client_id,supplier_id,driver_id,last_message_at,last_message_preview,unread_dispatcher_count,created_at,updated_at")
    .single();

  if (error) throw error;
  return data as TripConversationRow;
}

export async function sendChatMessage(params: {
  conversationId: string;
  organizationId: string;
  content: string;
  senderRole: MessageSenderRole;
  senderName: string;
  senderUserId: string | null;
  messageType?: MessageType;
  /** Required for `feedback_request` (and other typed system payloads). */
  metadata?: Record<string, unknown> | null;
}): Promise<TripMessageRow> {
  const {
    conversationId,
    organizationId,
    content,
    senderRole,
    senderName,
    senderUserId,
    messageType = "text",
    metadata = null,
  } = params;

  // Preferred path: DB RPC writes source message and mirrors to linked partner org.
  const rpcPayload: Record<string, unknown> = {
    p_conversation_id: conversationId,
    p_content: content,
    p_sender_role: senderRole,
    p_sender_name: senderName,
    p_sender_user_id: senderUserId,
    p_message_type: messageType,
  };
  if (metadata != null) {
    rpcPayload.p_metadata = metadata;
  }
  const { data: rpcData, error: rpcError } = await supabase().rpc(
    "send_trip_chat_message",
    rpcPayload as {
      p_conversation_id: string;
      p_content: string;
      p_sender_role: string;
      p_sender_name: string;
      p_sender_user_id: string | null;
      p_message_type: string;
      p_metadata?: Record<string, unknown> | null;
    },
  );

  if (!rpcError && rpcData) return rpcData as TripMessageRow;

  // Fallback for environments that don't have the migration yet.
  const isMissingRpc =
    rpcError != null &&
    (rpcError.code === "42883" ||
      String(rpcError.message ?? "")
        .toLowerCase()
        .includes("send_trip_chat_message"));

  // Drivers are usually not organization_members; older RPC versions rejected them.
  // Direct insert still succeeds via RLS policy "Drivers can send messages in their conversations".
  const isDriverRpcDenied =
    rpcError != null &&
    senderRole === "driver" &&
    String(rpcError.message ?? "").toLowerCase().includes("not authorized");

  if (!isMissingRpc && !isDriverRpcDenied && rpcError) throw rpcError;

  const { data: convMeta, error: convMetaErr } = await supabase()
    .from("trip_conversations")
    .select("organization_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convMetaErr) throw convMetaErr;
  const messageOrgId = (convMeta?.organization_id as string | undefined) ?? organizationId;

  const insertRow: Record<string, unknown> = {
    conversation_id: conversationId,
    organization_id: messageOrgId,
    sender_user_id: senderUserId,
    sender_role: senderRole,
    sender_name: senderName,
    content,
    message_type: messageType,
    is_read: false,
  };
  if (metadata != null) insertRow.metadata = metadata;

  const { data, error } = await supabase()
    .from("trip_messages")
    .insert(insertRow as never)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase().rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

export async function getMessagesByConversation(
  conversationId: string,
  opts?: { before?: string; limit?: number; partyType?: string | null },
): Promise<TripMessageRow[]> {
  const limit = Math.min(
    Math.max(opts?.limit ?? TRIP_CHAT_HISTORY_PAGE, 1),
    100,
  );
  const partyType =
    opts?.partyType != null && String(opts.partyType).trim() !== ""
      ? String(opts.partyType).trim()
      : null;

  const { data: rpcData, error: rpcError } = await supabase().rpc(
    "windowed_trip_message_history",
    {
      p_conversation_id: conversationId,
      p_before:          opts?.before ?? null,
      p_limit:           limit,
      p_party_type:      partyType,
    },
  );

  if (!rpcError && Array.isArray(rpcData)) {
    return [...rpcData].reverse() as TripMessageRow[];
  }

  const missingRpc =
    rpcError &&
    (String(rpcError.code ?? "") === "42883" ||
      String(rpcError.code ?? "") === "PGRST202" ||
      String(rpcError.message ?? "")
        .toLowerCase()
        .includes("windowed_trip_message_history"));
  if (rpcError && !missingRpc) throw rpcError;

  let query = supabase()
    .from("trip_messages")
    .select("id,conversation_id,organization_id,sender_user_id,sender_role,sender_name,content,message_type,metadata,is_read,read_at,created_at,sender_avatar_seed,is_delivered,delivered_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.before) {
    query = query.lt("created_at", opts.before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse();
}

// ── Network conversations ─────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getNetworkConversationsByOrg(
  orgId: string,
): Promise<NetworkConversation[]> {
  if (!UUID_RE.test(orgId)) return [];
  const { data, error } = await supabase()
    .from("network_conversations")
    .select(`*, network_messages(id, conversation_id, content, sender_org_id, sender_name, sender_user_id, created_at, is_read_by_other, read_at)`)
    .or(`org_a_id.eq.${orgId},org_b_id.eq.${orgId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, referencedTable: "network_messages" })
    .limit(100)
    .limit(50, { referencedTable: "network_messages" });

  if (error) throw error;

  return ((data ?? []) as unknown[]).map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const isA = row.org_a_id === orgId;
    return {
      ...row,
      partner_org_id: isA ? row.org_b_id : row.org_a_id,
      partner_name: isA ? row.org_b_name : row.org_a_name,
      unread_count: isA ? row.unread_count_a : row.unread_count_b,
      messages: ((row.network_messages ?? []) as NetworkMessageRow[]).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    };
  }) as unknown as NetworkConversation[];
}

export async function getOrCreateNetworkConversation(params: {
  orgId: string;
  orgName: string;
  partnerOrgId: string;
  partnerOrgName: string;
}): Promise<NetworkConversationRow> {
  const { orgId, orgName, partnerOrgId, partnerOrgName } = params;
  // Canonical ordering ensures one row per pair
  const [aId, bId] = [orgId, partnerOrgId].sort();
  const [aName, bName] =
    aId === orgId ? [orgName, partnerOrgName] : [partnerOrgName, orgName];

  const { data: existing } = await supabase()
    .from("network_conversations")
    .select("id,org_a_id,org_b_id,org_a_name,org_b_name,last_message_at,last_message_preview,unread_count_a,unread_count_b,created_at,updated_at")
    .eq("org_a_id", aId)
    .eq("org_b_id", bId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase()
    .from("network_conversations")
    .insert({
      org_a_id: aId,
      org_b_id: bId,
      org_a_name: aName,
      org_b_name: bName,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function sendNetworkMessage(params: {
  conversationId: string;
  senderOrgId: string;
  senderUserId: string | null;
  senderName: string;
  content: string;
}): Promise<NetworkMessageRow> {
  const { conversationId, senderOrgId, senderUserId, senderName, content } =
    params;

  const { data, error } = await supabase()
    .from("network_messages")
    .insert({
      conversation_id: conversationId,
      sender_org_id: senderOrgId,
      sender_user_id: senderUserId,
      sender_name: senderName,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Idempotent: inserts `feedback_request` rows for each party thread when missing (DB trigger may have been skipped). */
export async function ensureTripFeedbackPromptMessages(
  tripId: string,
): Promise<{ error: Error | null }> {
  const id = (tripId ?? "").trim();
  if (!id) return { error: null };
  try {
    const { error } = await supabase().rpc("fn_post_trip_feedback_prompt_to_chats", {
      p_trip_id: id,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Copies an existing trip-page rating into `feedback_request` message metadata when the chat row
 * was never updated, so refresh and other clients see the debrief as submitted.
 */
export async function persistTripFeedbackMessageMetadataIfRated(params: {
  tripId: string;
  messages: TripMessageRow[];
  ratings: RatingRow[];
}): Promise<void> {
  const { tripId, messages, ratings } = params;
  if (!ratings.length) return;
  for (const m of messages) {
    if (m.message_type !== "feedback_request") continue;
    const meta = parseFeedbackRequestMetadata(m);
    if (!meta?.rated_id || meta.submitted_at) continue;
    const match = findTripRatingMatchingFeedbackMeta(ratings, tripId, meta);
    if (!match) continue;
    const base =
      m.metadata != null && typeof m.metadata === "object"
        ? { ...(m.metadata as Record<string, unknown>) }
        : {};
    const nextMeta = {
      ...base,
      submitted_at: match.updated_at ?? match.created_at,
      submitted_score: match.score,
      submitted_tags: extractTagsFromRatingComment(match.comment),
    };
    await supabase()
      .from("trip_messages")
      .update({ metadata: nextMeta })
      .eq("id", m.id);
  }
  // Chat uses bootstrap + Zustand + Realtime — do not fan out a global refetch hook here.
}

/**
 * When the DB trigger / `fn_post_trip_feedback_prompt_to_chats` did not create a row for this thread,
 * insert the same `feedback_request` shape via `send_trip_chat_message` (dispatcher / system).
 */
export async function seedTripConversationFeedbackPromptIfMissing(params: {
  conversationId: string;
  organizationId: string;
  partyType: ConversationPartyType;
  partyName: string;
  clientId: string | null;
  supplierId: string | null;
  driverId: string | null;
}): Promise<{ created: boolean; error: Error | null }> {
  const convId = (params.conversationId ?? "").trim();
  if (!convId) return { created: false, error: null };

  const { data: existing, error: exErr } = await supabase()
    .from("trip_messages")
    .select("id")
    .eq("conversation_id", convId)
    .eq("message_type", "feedback_request")
    .limit(1)
    .maybeSingle();
  if (exErr) return { created: false, error: new Error(exErr.message) };
  if (existing?.id) return { created: false, error: null };

  const ratedParty = params.partyType;
  const ratedId =
    ratedParty === "client"
      ? (params.clientId ?? "").trim()
      : ratedParty === "supplier"
        ? (params.supplierId ?? "").trim()
        : (params.driverId ?? "").trim();
  if (!ratedId) return { created: false, error: null };

  const meta: Record<string, unknown> = {
    feedback_version: 1,
    rated_party_type: ratedParty,
    rated_id: ratedId,
    rated_display_name: (params.partyName ?? "").trim() || undefined,
  };
  const content = "Trip completed — rate this partner to close the mission debrief.";
  try {
    await sendChatMessage({
      conversationId: convId,
      organizationId: params.organizationId,
      content,
      senderRole: "system",
      senderName: "Trip System",
      senderUserId: null,
      messageType: "feedback_request",
      metadata: meta,
    });
    return { created: true, error: null };
  } catch (e) {
    return { created: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Atomic in-chat debrief: `confirm_trip_feedback` patches `trip_messages.metadata` (rating)
 * — no new rows; rating is returned on the next windowed bootstrap read.
 */
export async function submitTripChatFeedback(params: {
  ratingOrganizationId: string;
  tripId: string;
  message: TripMessageRow;
  score: number;
  tags: string[];
}): Promise<{ error: Error | null; submittedAt: string | null }> {
  const { message, score } = params;
  const meta = parseFeedbackRequestMetadata(message);
  if (!meta) {
    return { error: new Error("Invalid feedback message"), submittedAt: null };
  }
  if (meta.submitted_at) {
    return { error: new Error("Feedback already submitted"), submittedAt: null };
  }

  // Single atomic RPC: updates `trip_messages.metadata` (rating) via `confirm_trip_feedback`.
  const { data, error } = await supabase().rpc("confirm_trip_feedback", {
    p_msg_id:  message.id,
    p_rating:  Math.min(5, Math.max(1, score)),
  });

  if (error) return { error: new Error(error.message), submittedAt: null };

  const result = data as { ok?: boolean; error?: string; submitted_at?: string } | null;
  const errKey = typeof result?.error === "string" ? result.error.trim() : "";
  if (errKey && errKey !== "already_submitted") {
    return { error: new Error(errKey), submittedAt: null };
  }

  const submittedAt =
    typeof result?.submitted_at === "string" && result.submitted_at.trim()
      ? result.submitted_at.trim()
      : null;
  // Bootstrap & Patch: Zustand + Realtime own UI — no list-wide refetch notifier.
  return { error: null, submittedAt };
}

/**
 * Atomic feedback submission — calls submit_atomic_feedback RPC.
 * Returns the canonical metadata payload so the caller can patch the store
 * without waiting for a DB re-fetch.  The frontend patches the store first
 * (optimistic), then calls this to get the server-confirmed values.
 */
export async function submitAtomicFeedback(params: {
  organizationId: string;
  tripId:         string;
  message:        TripMessageRow;
  score:          number;
  tags:           string[];
  comment?:       string;
}): Promise<{
  submittedAt:    string;
  submittedScore: number;
  submittedTags:  string[];
  alreadySubmitted: boolean;
}> {
  const meta = parseFeedbackRequestMetadata(params.message);
  if (!meta) throw new Error("Invalid feedback message");

  const { data, error } = await supabase().rpc('submit_atomic_feedback', {
    p_organization_id: params.organizationId,
    p_trip_id:         params.tripId,
    p_message_id:      params.message.id,
    p_rated_type:      meta.rated_party_type as RatedType,
    p_rated_id:        meta.rated_id,
    p_score:           Math.min(5, Math.max(1, params.score)),
    p_tags:            params.tags,
    p_comment:         params.comment ?? null,
  });

  if (error) throw new Error(error.message);

  const result = data as {
    ok: boolean;
    already_submitted: boolean;
    submitted_at:    string;
    submitted_score: number;
    submitted_tags:  string[];
  };

  return {
    submittedAt:      result.submitted_at,
    submittedScore:   result.submitted_score,
    submittedTags:    Array.isArray(result.submitted_tags) ? result.submitted_tags : [],
    alreadySubmitted: Boolean(result.already_submitted),
  };
}

export async function markNetworkConversationRead(
  conversationId: string,
  readerOrgId: string,
): Promise<void> {
  const { error } = await supabase().rpc("mark_network_conversation_read", {
    p_conversation_id: conversationId,
    p_reader_org_id: readerOrgId,
  });
  if (error) throw error;
}

export async function getIntegratedPartners(
  orgId: string,
): Promise<NetworkPartner[]> {
  const { data, error } = await supabase().rpc("get_integrated_partners", { p_org_id: orgId });
  if (error || data == null) return [];

  const bundle = data as {
    suppliers: { company_name: string | null; name: string | null; linked_organization_id: string }[];
    clients: { name: string | null; linked_organization_id: string }[];
  };

  const seen = new Set<string>();
  const partners: NetworkPartner[] = [];

  for (const s of bundle.suppliers ?? []) {
    if (s.linked_organization_id && !seen.has(s.linked_organization_id)) {
      seen.add(s.linked_organization_id);
      partners.push({
        org_id: s.linked_organization_id,
        name: s.company_name ?? s.name ?? "Partner",
      });
    }
  }
  for (const c of bundle.clients ?? []) {
    if (c.linked_organization_id && !seen.has(c.linked_organization_id)) {
      seen.add(c.linked_organization_id);
      partners.push({
        org_id: c.linked_organization_id,
        name: c.name ?? "Partner",
      });
    }
  }
  return partners;
}

// ── Driver chat ───────────────────────────────────────────────────────────────

/** Fetches all trip conversations where the party is the driver (by driver record IDs). */
export async function getConversationsByDriverIds(
  driverIds: string[],
): Promise<TripConversation[]> {
  if (!driverIds.length) return [];

  type DriverChatTripMini = {
    id: string;
    trip_number: string | null;
    driver_display_trip_id: string | null;
    pickup_area: string | null;
    drop_location: string | null;
  };
  type DriverChatConversationRow = TripConversationRow & {
    id: string;
    trip_id: string;
    trips?: DriverChatTripMini | null;
    trip_messages?: TripMessageRow[];
  };

  const mapRows = (
    convRows: DriverChatConversationRow[],
    tripsById: Map<string, DriverChatTripMini>,
    messagesByConversationId: Map<string, TripMessageRow[]>,
  ): TripConversation[] =>
    convRows.map((row) => {
      const tr = row.trips ?? tripsById.get(String(row.trip_id ?? "")) ?? null;
      const perDriver =
        tr?.driver_display_trip_id != null && String(tr.driver_display_trip_id).trim() !== ""
          ? String(tr.driver_display_trip_id).trim()
          : "";
      return {
        ...row,
        trip_number: perDriver || tr?.trip_number || "",
        pickup_area: tr?.pickup_area ?? "",
        drop_location: tr?.drop_location ?? "",
        messages: (
          row.trip_messages ??
          messagesByConversationId.get(String(row.id ?? "")) ??
          []
        ) as TripMessageRow[],
      };
    });

  const primary = await supabase()
    .from("trip_conversations")
    .select(
      `
      *,
      trips!inner ( trip_number, driver_display_trip_id, pickup_area, drop_location ),
      trip_messages ( id, conversation_id, content, sender_role, sender_name, sender_user_id, created_at, is_read, message_type, metadata )
    `,
    )
    .in("driver_id", driverIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, referencedTable: "trip_messages" })
    .limit(TRIP_MESSAGES_EMBED_RECENT, { referencedTable: "trip_messages" });

  if (!primary.error) {
    return mapRows((primary.data ?? []) as DriverChatConversationRow[], new Map(), new Map());
  }

  // Fallback for environments where embedded select can fail (e.g. RLS recursion / PostgREST 500).
  const { data: convRows, error: convErr } = await supabase()
    .from("trip_conversations")
    .select("id,organization_id,trip_id,party_type,party_name,client_id,supplier_id,driver_id,last_message_at,last_message_preview,unread_dispatcher_count,created_at,updated_at")
    .in("driver_id", driverIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (convErr) throw convErr;

  const normalizedConvRows = (convRows ?? []) as DriverChatConversationRow[];
  const tripIds = Array.from(new Set(normalizedConvRows.map((r) => String(r.trip_id ?? "")).filter(Boolean)));
  const convIds = Array.from(new Set(normalizedConvRows.map((r) => String(r.id ?? "")).filter(Boolean)));

  const emptyTripsRes: { data: DriverChatTripMini[]; error: null } = { data: [], error: null };
  const emptyMessagesRes: { data: TripMessageRow[]; error: null } = { data: [], error: null };
  const [tripRes, msgRes] = await Promise.all([
    tripIds.length
      ? supabase()
          .from("trips")
          .select("id, trip_number, driver_display_trip_id, pickup_area, drop_location")
          .in("id", tripIds)
      : Promise.resolve(emptyTripsRes),
    convIds.length
      ? supabase()
          .from("trip_messages")
          .select("id, conversation_id, content, sender_role, sender_name, sender_user_id, created_at, is_read, message_type, metadata")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(50 * convIds.length, 500))
      : Promise.resolve(emptyMessagesRes),
  ]);

  const tripsById = new Map<string, DriverChatTripMini>();
  for (const tr of (tripRes.data ?? []) as DriverChatTripMini[]) {
    tripsById.set(String(tr.id ?? ""), tr);
  }

  const messagesByConversationId = new Map<string, TripMessageRow[]>();
  for (const msg of (msgRes.data ?? []) as TripMessageRow[]) {
    const cid = String(msg.conversation_id ?? "");
    if (!messagesByConversationId.has(cid)) messagesByConversationId.set(cid, []);
    messagesByConversationId.get(cid)?.push(msg);
  }

  return mapRows(normalizedConvRows, tripsById, messagesByConversationId);
}

/** Sends a message as the driver role. Thin wrapper for consistency. */
export async function sendDriverChatMessage(params: {
  conversationId: string;
  organizationId: string;
  content: string;
  senderName: string;
  senderUserId: string | null;
}): Promise<TripMessageRow> {
  return sendChatMessage({
    ...params,
    senderRole: "driver",
    messageType: "text",
  });
}

/** Posts a document_share message into a trip conversation. */
export async function sendDocumentShareMessage(params: {
  conversationId: string;
  organizationId: string;
  senderRole: MessageSenderRole;
  senderName: string;
  senderUserId: string | null;
  metadata: DocumentShareMetadata;
}): Promise<TripMessageRow> {
  const {
    conversationId,
    organizationId,
    senderRole,
    senderName,
    senderUserId,
    metadata,
  } = params;

  const { data, error } = await supabase()
    .from("trip_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_user_id: senderUserId,
      sender_role: senderRole,
      sender_name: senderName,
      content: `Shared document: ${metadata.document_name}`,
      message_type: "document_share",
      is_read: false,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Fetches shareable documents for a trip (vehicle + driver docs). */
export async function getShareableDocumentsForTrip(params: {
  vehicleId: string | null;
  driverId: string | null;
}): Promise<
  {
    key: string;
    label: string;
    storage_path: string;
    entity_type: "vehicle" | "driver";
    entity_id: string;
  }[]
> {
  const results: {
    key: string;
    label: string;
    storage_path: string;
    entity_type: "vehicle" | "driver";
    entity_id: string;
  }[] = [];

  if (params.vehicleId) {
    const { data: vehicle } = await supabase()
      .from("vehicles")
      .select("id, documents")
      .eq("id", params.vehicleId)
      .maybeSingle();

    if (vehicle?.documents && typeof vehicle.documents === "object") {
      const docs = vehicle.documents as Record<string, { url?: string }>;
      const LABELS: Record<string, string> = {
        rc: "Registration Certificate (RC)",
        insurance: "Insurance Policy",
        fitness: "Fitness Certificate",
        pollution: "PUC Certificate",
      };
      for (const [key, doc] of Object.entries(docs)) {
        if (doc?.url) {
          results.push({
            key,
            label: LABELS[key] ?? key.toUpperCase(),
            storage_path: doc.url,
            entity_type: "vehicle",
            entity_id: vehicle.id,
          });
        }
      }
    }
  }

  return results;
}

// ── WhatsApp-architecture bootstrap & status change ───────────────────────────

/**
 * Parse a raw JSONB conversation row (as returned by get_initial_chat_state)
 * into a typed TripConversation.  Mirrors the field mapping in
 * getConversationsByOrganization without the PostgREST embed wrapping.
 */
function normalizeInitialStateRow(row: Record<string, unknown>): TripConversation {
  const tfs = row.trip_feedback_status;
  const trip_feedback_status =
    tfs === 'pending' || tfs === 'rated' || tfs === 'none' ? tfs : ('none' as const);
  const indentRaw =
    row.indent_id != null && String(row.indent_id).trim() !== ""
      ? String(row.indent_id)
      : null;
  const ctRaw = row.conversation_type;
  const ctStr = typeof ctRaw === "string" ? ctRaw.trim() : "";
  const conversation_type: ChatTripFlow =
    ctStr === "private_trip" || ctStr === "integrated_group"
      ? ctStr
      : indentRaw
        ? "integrated_group"
        : "private_trip";
  return {
    id:                      String(row.id ?? ''),
    organization_id:         String(row.organization_id ?? ''),
    trip_id:                 String(row.trip_id ?? ''),
    party_type:              (row.party_type as ConversationPartyType) ?? 'client',
    party_name:              String(row.party_name ?? ''),
    client_id:               (row.client_id   as string | null) ?? null,
    supplier_id:             (row.supplier_id as string | null) ?? null,
    driver_id:               (row.driver_id   as string | null) ?? null,
    last_message_at:         (row.last_message_at as string | null) ?? null,
    last_message_preview:    (row.last_message_preview as string | null) ?? null,
    unread_dispatcher_count: Number(row.unread_dispatcher_count ?? 0),
    created_at:              String(row.created_at ?? ''),
    updated_at:              String(row.updated_at ?? ''),
    trip_number:             String(row.trip_number ?? ''),
    display_trip_id:         (row.display_trip_id  as string | null) ?? null,
    trip_status:             (row.trip_status       as string | null) ?? null,
    trip_driver_id:          (row.trip_driver_id    as string | null) ?? null,
    trip_supplier_id:        (row.trip_supplier_id  as string | null) ?? null,
    trip_created_at:         (row.trip_created_at   as string | null) ?? null,
    trip_source:
      row.trip_source != null && String(row.trip_source).trim() !== ""
        ? String(row.trip_source)
        : null,
    trip_organization_id:
      row.trip_organization_id != null && String(row.trip_organization_id).trim() !== ""
        ? String(row.trip_organization_id)
        : null,
    trip_organization_name:
      row.trip_organization_name != null && String(row.trip_organization_name).trim() !== ""
        ? String(row.trip_organization_name)
        : null,
    indent_id: indentRaw,
    indent_status:
      row.indent_status != null && String(row.indent_status).trim() !== ""
        ? String(row.indent_status)
        : null,
    conversation_type,
    pickup_area:             String(row.pickup_area   ?? ''),
    drop_location:           String(row.drop_location ?? ''),
    trip_feedback_status,
    messages:                (row.messages as TripMessageRow[]) ?? [],
  };
}

/**
 * Single-RPC bootstrap: fetches all non-cancelled trip conversations + last
 * N messages per conversation.  After this call the app uses only Realtime.
 */
export async function getInitialChatState(
  organizationId: string,
  messageLimit = 20,
): Promise<TripConversation[]> {
  const { data, error } = await supabase().rpc('get_initial_chat_state', {
    p_organization_id: organizationId,
    p_message_limit:   messageLimit,
  });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  const conversations = rows.map(normalizeInitialStateRow);

  // Resolve generic party names ("client" / "supplier" placeholders)
  // — reuses the same lookup already used by getConversationsByOrganization.
  return resolveGenericPartyNamesForTrips(conversations);
}

/**
 * "Bootstrap & Patch" entry point — the one DB call the chat feature makes.
 * Calls get_b2b_chat_bootstrap (50 messages per conversation) and returns all
 * non-cancelled trip conversations with full trip metadata embedded.
 * After this call the app relies exclusively on Realtime for all state updates.
 */
export async function getB2BChatBootstrap(
  organizationId: string,
): Promise<TripConversation[]> {
  const { data, error } = await supabase().rpc('get_b2b_chat_bootstrap', {
    p_organization_id: organizationId,
    p_message_limit:   TRIP_CHAT_HISTORY_PAGE,
  });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  const conversations = rows.map(normalizeInitialStateRow);
  return resolveGenericPartyNamesForTrips(conversations);
}

/**
 * Unified bootstrap — calls get_unified_b2b_bootstrap which adds visibility_tags
 * per message for multi-party routing.  Falls back to get_b2b_chat_bootstrap
 * automatically when the migration has not been applied yet (PGRST202 / 42883).
 *
 * This is the ONLY DB call the chat store is allowed to make after app start.
 * All subsequent state arrives via Realtime.
 */
export async function getUnifiedB2BChatBootstrap(
  organizationId: string,
): Promise<TripConversation[]> {
  const { data, error } = await supabase().rpc('get_unified_b2b_bootstrap', {
    p_organization_id: organizationId,
    p_message_limit:   TRIP_CHAT_HISTORY_PAGE,
  });

  // Graceful fallback: if the unified RPC doesn't exist yet, use the previous one.
  if (error) {
    const code = String(error.code ?? '');
    const msg  = String(error.message ?? '').toLowerCase();
    const isMissing =
      code === '42883' ||
      code === 'PGRST202' ||
      msg.includes('get_unified_b2b_bootstrap') ||
      msg.includes('does not exist');
    if (isMissing) return getB2BChatBootstrap(organizationId);
    throw error;
  }

  const raw = data as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : raw != null && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).conversations)
      ? ((raw as Record<string, unknown>).conversations as Array<Record<string, unknown>>)
      : [];
  const conversations = rows.map(normalizeInitialStateRow);
  return resolveGenericPartyNamesForTrips(conversations);
}

function distinctTripCount(conversations: TripConversation[]): number {
  return new Set(conversations.map((c) => String(c.trip_id ?? "").trim()).filter(Boolean)).size;
}

/** DB without `p_include_message_bodies` on bootstrap RPCs — retry without the flag. */
function bootstrapMessageBodiesFlagUnsupported(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null;
  if (!e) return false;
  const c = String(e.code ?? "");
  const m = String(e.message ?? "").toLowerCase();
  if (c === "42883" || c === "PGRST202") return true;
  if (m.includes("p_include_message_bodies")) return true;
  return false;
}

/**
 * Multi-lane bootstrap: `get_multi_lane_bootstrap` → conversations + lane maps.
 * Falls back to {@link getUnifiedB2BChatBootstrap} + client-side {@link buildChatLanesFromConversations}.
 *
 * Optional `tripLimit` / `tripOffset` map to `p_trip_limit` / `p_trip_offset` when the DB migration is applied.
 * Optional `hubTripBucket` (`active` | `history` | `all`) scopes trips by lifecycle for hub HISTORY vs ACTIVE lists.
 */
export async function fetchChatBootstrapPayload(
  organizationId: string,
  opts?: {
    tripLimit?: number | null;
    tripOffset?: number;
    hubTripBucket?: "active" | "history" | "all";
  },
): Promise<{
  conversations: TripConversation[];
  lanes: ChatLanes;
  hasMoreTrips: boolean;
}> {
  const tripLimit = opts?.tripLimit ?? null;
  const tripOffset = opts?.tripOffset ?? 0;
  const hubTripBucket = opts?.hubTripBucket ?? "active";

  let emitBodiesParam = true;

  const buildRpcArgs = (
    includeHubBucket: boolean,
    includeMessageBodies: boolean,
  ): Record<string, unknown> => {
    const a: Record<string, unknown> = {
      p_organization_id: organizationId,
      p_message_limit: TRIP_CHAT_HISTORY_PAGE,
    };
    if (emitBodiesParam) {
      a.p_include_message_bodies = includeMessageBodies;
    }
    if (includeHubBucket) {
      a.p_hub_trip_bucket = hubTripBucket;
    }
    if (tripLimit != null) {
      a.p_trip_limit = tripLimit;
      a.p_trip_offset = tripOffset;
    }
    return a;
  };

  let includeHubBucket = true;
  const includeMessageBodies = false;
  let { data, error } = await supabase().rpc(
    "get_multi_lane_bootstrap",
    buildRpcArgs(includeHubBucket, includeMessageBodies),
  );

  if (error && emitBodiesParam && bootstrapMessageBodiesFlagUnsupported(error)) {
    emitBodiesParam = false;
    ({ data, error } = await supabase().rpc(
      "get_multi_lane_bootstrap",
      buildRpcArgs(includeHubBucket, includeMessageBodies),
    ));
  }

  const msg0 = String(error?.message ?? "").toLowerCase();
  const code0 = String(error?.code ?? "");
  if (
    error &&
    includeHubBucket &&
    (code0 === "42883" ||
      code0 === "PGRST202" ||
      msg0.includes("p_hub_trip_bucket") ||
      (msg0.includes("get_multi_lane_bootstrap") && msg0.includes("does not exist")))
  ) {
    includeHubBucket = false;
    ({ data, error } = await supabase().rpc(
      "get_multi_lane_bootstrap",
      buildRpcArgs(false, includeMessageBodies),
    ));
  }

  let usedTripWindowRpc = tripLimit != null;
  const msg = String(error?.message ?? "").toLowerCase();
  const overloadMissing =
    tripLimit != null &&
    (String(error?.code ?? "") === "42883" ||
      String(error?.code ?? "") === "PGRST202" ||
      msg.includes("get_multi_lane_bootstrap") ||
      msg.includes("does not exist"));

  if (overloadMissing) {
    usedTripWindowRpc = false;
    const minimal: Record<string, unknown> = {
      p_organization_id: organizationId,
      p_message_limit: TRIP_CHAT_HISTORY_PAGE,
    };
    if (emitBodiesParam) minimal.p_include_message_bodies = includeMessageBodies;
    ({ data, error } = await supabase().rpc("get_multi_lane_bootstrap", minimal));
  }

  if (!error && data != null && typeof data === "object" && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    const rawConvs = payload.conversations;
    const rows = (Array.isArray(rawConvs) ? rawConvs : []) as Array<Record<string, unknown>>;
    let conversations = rows.map(normalizeInitialStateRow);
    conversations = await resolveGenericPartyNamesForTrips(conversations);
    const baseLanes =
      normalizeServerLanes(payload.lanes as Record<string, unknown> | undefined) ??
      buildChatLanesFromConversations(conversations);
    const lanes = mergeMessagesByContextIntoLanes(
      baseLanes,
      payload.messages_by_context ?? payload.messagesByContext,
    );
    const n = distinctTripCount(conversations);
    const hasMoreTrips = Boolean(usedTripWindowRpc && tripLimit != null && n >= tripLimit);
    return { conversations, lanes, hasMoreTrips };
  }

  const code = String(error?.code ?? "");
  const errMsg = String(error?.message ?? "").toLowerCase();
  const missing =
    code === "42883" ||
    code === "PGRST202" ||
    errMsg.includes("get_multi_lane_bootstrap") ||
    errMsg.includes("does not exist");

  if (!missing && error) throw error;

  const conversations = await getUnifiedB2BChatBootstrap(organizationId);
  return {
    conversations,
    lanes: mergeMessagesByContextIntoLanes(
      buildChatLanesFromConversations(conversations),
      null,
    ),
    hasMoreTrips: false,
  };
}

/**
 * On-demand history: same query plan as {@link getMessagesByConversation}.
 * Prefer passing `{ before: oldestMessageIso }` to page older rows; omit `before`
 * for the newest page (e.g. empty store backfill). Avoids `select *` and avoids
 * returning the wrong end of the timeline (oldest-only bug).
 */
export async function fetchConversationHistory(
  conversationId: string,
  opts?: { before?: string; limit?: number; partyType?: string | null },
): Promise<TripMessageRow[]> {
  return getMessagesByConversation(conversationId, {
    before: opts?.before,
    limit: opts?.limit ?? TRIP_CHAT_HISTORY_PAGE,
    partyType: opts?.partyType ?? null,
  });
}

// ── processB2BEvent ───────────────────────────────────────────────────────────

export interface ProcessB2BEventPayload {
  content:          string;
  newStatus?:       string | null;
  driverId?:        string | null;
  vehicleId?:       string | null;
  userId?:          string | null;
  userName?:        string;
  conversationId?:  string | null;
  extraMeta?:       Record<string, unknown>;
}

export interface ProcessB2BEventResult {
  ok:          boolean;
  messageIds:  string[];
  tripState:   import('../types/chat.types').B2BTripState;
  prevStatus:  string;
  newStatus:   string;
  eventType:   string;
}

/**
 * Single atomic DB hit: updates trips state + inserts a message with the full
 * trip-state snapshot embedded in metadata.  The Realtime INSERT delivers the
 * snapshot to all subscribers; the store extracts it and updates TripMeta
 * in-memory without a follow-up fetch.
 *
 * Event routing (when conversationId is null):
 *   ledger / ledger_event  → client + supplier conversations only
 *   tracking               → driver conversation only
 *   status_change / system → all conversations (broadcast)
 */
export async function processB2BEvent(params: {
  organizationId: string;
  tripId:         string;
  eventType:      string;
  payload:        ProcessB2BEventPayload;
}): Promise<ProcessB2BEventResult> {
  const rpcPayload: Record<string, unknown> = {
    content:   params.payload.content,
    user_name: params.payload.userName ?? 'System',
  };
  if (params.payload.newStatus    != null) rpcPayload.new_status       = params.payload.newStatus;
  if (params.payload.driverId     != null) rpcPayload.driver_id        = params.payload.driverId;
  if (params.payload.vehicleId    != null) rpcPayload.vehicle_id       = params.payload.vehicleId;
  if (params.payload.userId       != null) rpcPayload.user_id          = params.payload.userId;
  if (params.payload.conversationId != null) rpcPayload.conversation_id = params.payload.conversationId;
  if (params.payload.extraMeta)   rpcPayload.extra_meta  = params.payload.extraMeta;

  const { data, error } = await supabase().rpc('process_b2b_event', {
    p_organization_id: params.organizationId,
    p_trip_id:         params.tripId,
    p_event_type:      params.eventType,
    p_payload:         rpcPayload,
  });
  if (error) throw error;

  const r = data as {
    ok:          boolean;
    message_ids: string[];
    trip_state:  import('../types/chat.types').B2BTripState;
    prev_status: string;
    new_status:  string;
    event_type:  string;
  };
  return {
    ok:         r.ok,
    messageIds: r.message_ids,
    tripState:  r.trip_state,
    prevStatus: r.prev_status,
    newStatus:  r.new_status,
    eventType:  r.event_type,
  };
}

// ── submitBusinessEvent ───────────────────────────────────────────────────────

export interface SubmitBusinessEventParams {
  organizationId:   string;
  tripId:           string;
  eventType:        string;
  content:          string;
  metadata?:        Record<string, unknown>;
  newTripStatus?:   string | null;
  userId?:          string | null;
  userName?:        string;
  conversationId?:  string | null;
}

export interface SubmitBusinessEventResult {
  ok:          boolean;
  messageIds:  string[];
  updatedAt:   string;
  prevStatus:  string;
  newStatus:   string;
  eventType:   string;
}

/**
 * Unified atomic event writer — validates org access, optionally updates
 * trips.status, and inserts one message per conversation (or just the targeted
 * conversation when conversationId is provided).  Returns enriched metadata
 * so the caller can patch the store without a follow-up fetch.
 */
export async function submitBusinessEvent(
  params: SubmitBusinessEventParams,
): Promise<SubmitBusinessEventResult> {
  const { data, error } = await supabase().rpc('submit_business_event', {
    p_organization_id: params.organizationId,
    p_trip_id:         params.tripId,
    p_event_type:      params.eventType,
    p_content:         params.content,
    p_metadata:        params.metadata ?? {},
    p_new_trip_status: params.newTripStatus ?? null,
    p_user_id:         params.userId ?? null,
    p_user_name:       params.userName ?? 'System',
    p_conversation_id: params.conversationId ?? null,
  });
  if (error) throw error;

  const result = data as {
    ok:          boolean;
    message_ids: string[];
    updated_at:  string;
    prev_status: string;
    new_status:  string;
    event_type:  string;
  };
  return {
    ok:         result.ok,
    messageIds: result.message_ids,
    updatedAt:  result.updated_at,
    prevStatus: result.prev_status,
    newStatus:  result.new_status,
    eventType:  result.event_type,
  };
}

/**
 * Atomic status change: updates trip.status + inserts a status_change system
 * message in every conversation for the trip.  The Realtime INSERT propagates
 * the system message to all active listeners; the caller's optimistic update
 * ensures immediate local reflection.
 */
export async function changeTripStatus(params: {
  tripId:         string;
  organizationId: string;
  newStatus:      string;
  userId:         string | null;
  userName:       string;
}): Promise<{ previousStatus: string; changedAt: string }> {
  const { data, error } = await supabase().rpc('change_trip_status_with_notification', {
    p_trip_id:         params.tripId,
    p_organization_id: params.organizationId,
    p_new_status:      params.newStatus,
    p_user_id:         params.userId,
    p_user_name:       params.userName,
  });
  if (error) throw error;
  const result = data as { ok: boolean; previous_status: string; changed_at: string };
  return { previousStatus: result.previous_status, changedAt: result.changed_at };
}
