import {
    getTripsWhereOrgIsSupplier,
    type TripRow,
} from "@/features/trips/services/trips.service";
import { createRating } from "@/features/ratings/services/ratings.service";
import type { RatedType, RatingRow } from "@/features/ratings/types";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { supabase } from "@/lib/supabase";
import type {
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
} from "../utils/mergeTripFeedbackMessages";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import type { DeltaResponse } from "@/lib/cache/deltaTypes";

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

async function resolveGenericPartyNamesForTrips(
  conversations: TripConversation[],
): Promise<TripConversation[]> {
  const unresolvedClientIds = Array.from(
    new Set(
      conversations
        .filter((c) => c.party_type === "client" && c.client_id)
        .map((c) => c.client_id as string),
    ),
  );
  const unresolvedSupplierIds = Array.from(
    new Set(
      conversations
        .filter((c) => c.party_type === "supplier" && c.supplier_id)
        .map((c) => c.supplier_id as string),
    ),
  );

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
  "trip_number, display_trip_id, status, pickup_area, drop_location, driver_id, supplier_id, created_at";
const TRIP_EMBED_FIELDS_LEGACY =
  "trip_number, status, pickup_area, drop_location, driver_id, supplier_id, created_at";

const TRIP_MESSAGES_EMBED = `trip_messages ( id, conversation_id, content, sender_role, sender_name, sender_user_id, created_at, is_read, message_type, metadata )`;
/** Newest N rows per conversation embed. Keep low — bulk loads (13 convos × limit) cause statement timeouts. */
const TRIP_MESSAGES_EMBED_RECENT = 50;

function tripConversationSelect(tripEmbedFields: string): string {
  return `
      *,
      trips!inner ( ${tripEmbedFields} ),
      ${TRIP_MESSAGES_EMBED}
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

async function getConversationsByOrganizationLight(
  organizationId: string,
): Promise<TripConversation[]> {
  async function loadConversationRows(tripEmbedFields: string): Promise<{
    rows: any[];
  }> {
    const selectConv = `*, trips!inner ( ${tripEmbedFields} )`;
    const [{ data: ownOrgRows, error: ownErr }, supplierTripsRes] = await Promise.all([
      supabase()
        .from("trip_conversations")
        .select(selectConv)
        .eq("organization_id", organizationId)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      getTripsWhereOrgIsSupplier(organizationId),
    ]);

    if (ownErr) throw ownErr;

    const supplierTripIds = (supplierTripsRes.trips ?? [])
      .map((t: TripRow) => t.id)
      .filter((id): id is string => !!id);

    let supplierRows: unknown[] = [];
    if (supplierTripIds.length > 0) {
      const { data: supRows, error: supErr } = await supabase()
        .from("trip_conversations")
        .select(selectConv)
        .in("trip_id", supplierTripIds)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (supErr) throw supErr;
      supplierRows = supRows ?? [];
    }

    const byId = new Map<string, any>();
    for (const row of ownOrgRows ?? [])
      byId.set((row as unknown as { id: string }).id, row);
    for (const row of supplierRows) byId.set((row as { id: string }).id, row);

    const rows = Array.from(byId.values()).sort((a: any, b: any) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    });

    return {
      rows,
    };
  }

  let loaded: Awaited<ReturnType<typeof loadConversationRows>>;
  try {
    loaded = await loadConversationRows(TRIP_EMBED_FIELDS_FULL);
  } catch (err) {
    if (!isMissingTripsDisplayTripIdError(err)) throw err;
    loaded = await loadConversationRows(TRIP_EMBED_FIELDS_LEGACY);
  }

  const convIds = loaded.rows.map((row: any) => String(row.id ?? "")).filter(Boolean);
  const messagesByConversationId = new Map<string, TripMessageRow[]>();

  if (convIds.length > 0) {
    const { data: messageRows, error: msgErr } = await supabase()
      .from("trip_messages")
      .select("id, conversation_id, content, sender_role, sender_name, sender_user_id, created_at, is_read, message_type, metadata")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(TRIP_MESSAGES_EMBED_RECENT * convIds.length);
    if (msgErr) throw msgErr;
    for (const msg of (messageRows ?? []) as TripMessageRow[]) {
      const cid = String(msg.conversation_id ?? "");
      if (!messagesByConversationId.has(cid)) messagesByConversationId.set(cid, []);
      messagesByConversationId.get(cid)?.push(msg);
    }
    messagesByConversationId.forEach((messages) => {
      messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }

  const conversations: TripConversation[] = loaded.rows.map((row: any) => ({
    ...row,
    trip_number: row.trips?.trip_number ?? "",
    display_trip_id: row.trips?.display_trip_id ?? null,
    trip_status: row.trips?.status ?? null,
    trip_driver_id: row.trips?.driver_id ?? null,
    trip_supplier_id: row.trips?.supplier_id ?? null,
    trip_created_at: (row.trips?.created_at as string | null | undefined) ?? null,
    pickup_area: row.trips?.pickup_area ?? "",
    drop_location: row.trips?.drop_location ?? "",
    messages: messagesByConversationId.get(String(row.id ?? "")) ?? [],
  }));

  return resolveGenericPartyNamesForTrips(conversations);
}

export async function getConversationsByOrganization(
  organizationId: string,
): Promise<TripConversation[]> {
  return getConversationsByOrganizationLight(organizationId);
}

/** Fetches one trip thread by id (for deep links when the list has not loaded it yet). RLS must allow read. */
export async function getTripConversationById(
  conversationId: string,
): Promise<TripConversation | null> {
  let res = await supabase()
    .from("trip_conversations")
    .select(tripConversationSelect(TRIP_EMBED_FIELDS_FULL))
    .eq("id", conversationId)
    .order("created_at", { ascending: false, referencedTable: "trip_messages" })
    .limit(TRIP_MESSAGES_EMBED_RECENT, { referencedTable: "trip_messages" })
    .maybeSingle();

  if (res.error && isMissingTripsDisplayTripIdError(res.error)) {
    res = await supabase()
      .from("trip_conversations")
      .select(tripConversationSelect(TRIP_EMBED_FIELDS_LEGACY))
      .eq("id", conversationId)
      .order("created_at", { ascending: false, referencedTable: "trip_messages" })
      .limit(TRIP_MESSAGES_EMBED_RECENT, { referencedTable: "trip_messages" })
      .maybeSingle();
  }

  if (res.error || !res.data) return null;

  const row = res.data as unknown as {
    trips?: {
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
    p_metadata: metadata,
  };
  const { data: rpcData, error: rpcError } = await supabase().rpc(
    "send_trip_chat_message",
    rpcPayload as {
      p_conversation_id: string;
      p_content: string;
      p_sender_role: string;
      p_sender_name: string;
      p_sender_user_id: string | null;
      p_message_type: string;
      p_metadata: Record<string, unknown> | null;
    },
  );

  if (!rpcError && rpcData) return rpcData as TripMessageRow;

  throw rpcError ?? new Error("Trip chat RPC did not return a message.");
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
): Promise<TripMessageRow[]> {
  const { data, error } = await supabase()
    .from("trip_messages")
    .select("id,conversation_id,organization_id,sender_user_id,sender_role,sender_name,content,message_type,metadata,is_read,read_at,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(100);

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

  return (data ?? []).map((row: any) => {
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
  });
}

export async function getNetworkConversationsDelta(
  organizationId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<NetworkConversation> }> {
  const { data, error } = await supabase().rpc("get_network_conversations_delta", {
    p_org_id: organizationId,
    p_since: since.updatedAt,
    p_limit: 500,
  });
  if (error) {
    return {
      error: new Error(error.message),
      delta: { changed: [], deletedIds: [], nextCursor: since },
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: NetworkConversation[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as NetworkConversation[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncNetworkConversationsWithCache(
  organizationId: string,
  currentRows: NetworkConversation[],
): Promise<{ error: Error | null; conversations: NetworkConversation[] }> {
  try {
    const conversations = await syncDomainRows<NetworkConversation>({
      domain: "network-conversations",
      orgId: organizationId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 60_000, fullSyncEveryMs: 60 * 60_000 },
      currentRows,
      getFull: async () => getNetworkConversationsByOrg(organizationId),
      getDelta: async (cursor) => {
        const res = await getNetworkConversationsDelta(organizationId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) =>
            new Date(b.last_message_at ?? "").getTime() -
            new Date(a.last_message_at ?? "").getTime(),
        }),
    });
    return { error: null, conversations };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      conversations: currentRows,
    };
  }
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
  let wrote = false;
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
    const { error } = await supabase()
      .from("trip_messages")
      .update({ metadata: nextMeta })
      .eq("id", m.id);
    if (!error) wrote = true;
  }
  if (wrote) notifyTripChatMessagesChanged();
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
 * Persists `ratings` row (org → rated party) and merges submit state into the chat message metadata.
 */
export async function submitTripChatFeedback(params: {
  ratingOrganizationId: string;
  tripId: string;
  message: TripMessageRow;
  score: number;
  tags: string[];
}): Promise<{ error: Error | null }> {
  const { ratingOrganizationId, tripId, message, score, tags } = params;
  const meta = parseFeedbackRequestMetadata(message);
  if (!meta) {
    return { error: new Error("Invalid feedback message") };
  }
  if (meta.submitted_at) {
    return { error: new Error("Feedback already submitted") };
  }

  const ratedType = meta.rated_party_type as RatedType;
  const comment = JSON.stringify({
    source: "trip_chat_feedback",
    tags,
  });

  const { error: ratingErr } = await createRating(ratingOrganizationId, {
    trip_id: tripId,
    rater_type: "organization",
    rater_id: ratingOrganizationId,
    rated_type: ratedType,
    rated_id: meta.rated_id,
    score,
    comment,
  });
  if (ratingErr != null) return { error: ratingErr };

  const { data: existing, error: readErr } = await supabase()
    .from("trip_messages")
    .select("metadata")
    .eq("id", message.id)
    .maybeSingle();

  if (readErr) return { error: new Error(readErr.message) };

  const base =
    existing?.metadata != null && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const nextMeta = {
    ...base,
    submitted_at: new Date().toISOString(),
    submitted_score: score,
    submitted_tags: tags,
  };

  const { error: updErr } = await supabase()
    .from("trip_messages")
    .update({ metadata: nextMeta })
    .eq("id", message.id);

  if (updErr) return { error: new Error(updErr.message) };

  notifyTripChatMessagesChanged();
  return { error: null };
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
  const [{ data: suppliers }, { data: clients }] = await Promise.all([
    supabase()
      .from("suppliers")
      .select("company_name, name, linked_organization_id")
      .eq("organization_id", orgId)
      .not("linked_organization_id", "is", null)
      .limit(500),
    supabase()
      .from("clients")
      .select("name, linked_organization_id")
      .eq("organization_id", orgId)
      .not("linked_organization_id", "is", null)
      .limit(500),
  ]);

  const seen = new Set<string>();
  const partners: NetworkPartner[] = [];

  for (const s of suppliers ?? []) {
    if (s.linked_organization_id && !seen.has(s.linked_organization_id)) {
      seen.add(s.linked_organization_id);
      partners.push({
        org_id: s.linked_organization_id,
        name: s.company_name ?? s.name ?? "Partner",
      });
    }
  }
  for (const c of clients ?? []) {
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
  if (convErr) throw primary.error;

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
          .limit(50 * convIds.length)
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

  return sendChatMessage({
    conversationId,
    organizationId,
    senderRole,
    senderName,
    senderUserId,
    content: `Shared document: ${metadata.document_name}`,
    messageType: "document_share",
    metadata: metadata as unknown as Record<string, unknown>,
  });
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
