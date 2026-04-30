import { supabase } from "@/lib/supabase";
import type {
  ConversationPartyType,
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

export interface TripForCompose {
  id: string;
  trip_number: string;
  display_trip_id: string | null;
  pickup_area: string;
  drop_location: string;
  client_id: string | null;
  client_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  driver_id: string | null;
  driver_display_name: string | null;
}

export async function getTripsForCompose(organizationId: string): Promise<TripForCompose[]> {
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

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    trip_number: String(row.trip_number ?? ""),
    display_trip_id: (row.display_trip_id as string | null | undefined) ?? null,
    pickup_area: String(row.pickup_area ?? ""),
    drop_location: String(row.drop_location ?? ""),
    client_id: (row.client_id as string | null | undefined) ?? null,
    client_name: (row.client_name as string | null | undefined) ?? null,
    supplier_id: (row.supplier_id as string | null | undefined) ?? null,
    supplier_name: (row.supplier_name as string | null | undefined) ?? null,
    driver_id: (row.driver_id as string | null | undefined) ?? null,
    driver_display_name: (row.driver_display_name as string | null | undefined) ?? null,
  }));
}

export async function getConversationsByOrganization(
  organizationId: string
): Promise<TripConversation[]> {
  const { data, error } = await supabase()
    .from("trip_conversations")
    .select(`
      *,
      trips!inner ( trip_number, pickup_area, drop_location ),
      trip_messages ( * )
    `)
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    trip_number: row.trips?.trip_number ?? "",
    pickup_area: row.trips?.pickup_area ?? "",
    drop_location: row.trips?.drop_location ?? "",
    messages: ((row.trip_messages ?? []) as TripMessageRow[]).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }));
}

export async function getOrCreateConversation(params: {
  tripId: string;
  partyType: ConversationPartyType;
  partyName: string;
  organizationId: string;
  partyId: string;
}): Promise<TripConversationRow> {
  const { tripId, partyType, partyName, organizationId, partyId } = params;

  const { data: existing } = await supabase()
    .from("trip_conversations")
    .select("*")
    .eq("trip_id", tripId)
    .eq("party_type", partyType)
    .maybeSingle();

  if (existing) return existing;

  const partyCol =
    partyType === "client"
      ? "client_id"
      : partyType === "supplier"
      ? "supplier_id"
      : "driver_id";

  const { data, error } = await supabase()
    .from("trip_conversations")
    .insert({
      organization_id: organizationId,
      trip_id: tripId,
      party_type: partyType,
      party_name: partyName,
      [partyCol]: partyId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function sendChatMessage(params: {
  conversationId: string;
  organizationId: string;
  content: string;
  senderRole: MessageSenderRole;
  senderName: string;
  senderUserId: string | null;
  messageType?: MessageType;
}): Promise<TripMessageRow> {
  const {
    conversationId,
    organizationId,
    content,
    senderRole,
    senderName,
    senderUserId,
    messageType = "text",
  } = params;

  const { data, error } = await supabase()
    .from("trip_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_user_id: senderUserId,
      sender_role: senderRole,
      sender_name: senderName,
      content,
      message_type: messageType,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase().rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

export async function getMessagesByConversation(
  conversationId: string
): Promise<TripMessageRow[]> {
  const { data, error } = await supabase()
    .from("trip_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ── Network conversations ─────────────────────────────────────────────────────

export async function getNetworkConversationsByOrg(
  orgId: string
): Promise<NetworkConversation[]> {
  const { data, error } = await supabase()
    .from("network_conversations")
    .select(`*, network_messages(*)`)
    .or(`org_a_id.eq.${orgId},org_b_id.eq.${orgId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const isA = row.org_a_id === orgId;
    return {
      ...row,
      partner_org_id: isA ? row.org_b_id : row.org_a_id,
      partner_name: isA ? row.org_b_name : row.org_a_name,
      unread_count: isA ? row.unread_count_a : row.unread_count_b,
      messages: ((row.network_messages ?? []) as NetworkMessageRow[]).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    };
  });
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
  const [aName, bName] = aId === orgId ? [orgName, partnerOrgName] : [partnerOrgName, orgName];

  const { data: existing } = await supabase()
    .from("network_conversations")
    .select("*")
    .eq("org_a_id", aId)
    .eq("org_b_id", bId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase()
    .from("network_conversations")
    .insert({ org_a_id: aId, org_b_id: bId, org_a_name: aName, org_b_name: bName })
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
  const { conversationId, senderOrgId, senderUserId, senderName, content } = params;

  const { data, error } = await supabase()
    .from("network_messages")
    .insert({ conversation_id: conversationId, sender_org_id: senderOrgId, sender_user_id: senderUserId, sender_name: senderName, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markNetworkConversationRead(
  conversationId: string,
  readerOrgId: string
): Promise<void> {
  const { error } = await supabase().rpc("mark_network_conversation_read", {
    p_conversation_id: conversationId,
    p_reader_org_id: readerOrgId,
  });
  if (error) throw error;
}

export async function getIntegratedPartners(orgId: string): Promise<NetworkPartner[]> {
  const [{ data: suppliers }, { data: clients }] = await Promise.all([
    supabase()
      .from("suppliers")
      .select("company_name, name, linked_organization_id")
      .eq("organization_id", orgId)
      .not("linked_organization_id", "is", null),
    supabase()
      .from("clients")
      .select("name, linked_organization_id")
      .eq("organization_id", orgId)
      .not("linked_organization_id", "is", null),
  ]);

  const seen = new Set<string>();
  const partners: NetworkPartner[] = [];

  for (const s of suppliers ?? []) {
    if (s.linked_organization_id && !seen.has(s.linked_organization_id)) {
      seen.add(s.linked_organization_id);
      partners.push({ org_id: s.linked_organization_id, name: s.company_name ?? s.name ?? "Partner" });
    }
  }
  for (const c of clients ?? []) {
    if (c.linked_organization_id && !seen.has(c.linked_organization_id)) {
      seen.add(c.linked_organization_id);
      partners.push({ org_id: c.linked_organization_id, name: c.name ?? "Partner" });
    }
  }
  return partners;
}
