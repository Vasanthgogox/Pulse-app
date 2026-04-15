/**
 * Connection requests service — org-to-org invitations (client/supplier).
 * Single bounded context: connection_requests (invite by phone, list received/sent, approve/reject).
 * Same DB as Q-unified-base; schema and RPCs live there. No driver-invite logic here.
 *
 * Data model (phone is on the person, not the org):
 * - organizations = company/org (name, slug, owner_id, etc.). No phone column.
 * - auth.users = the person; raw_user_meta_data->>'phone' (and optional ->'phone_numbers' array) stores phone on sign-up and profile edit.
 * Lookup "by phone" is by person: get_invitee_by_phone reads auth.users.raw_user_meta_data, then resolves that user's
 * organization via organization_members or organizations.owner_id, and returns organization_id, full_name, phone.
 *
 * Role semantics (one direction per request; see on_connection_request_approved trigger):
 * - Add Client (requestShipperClient: true): inviter gets invitee as CLIENT; invitee gets inviter as SUPPLIER.
 * - Add Supplier (requestCarrierSupplier: true): inviter gets invitee as SUPPLIER; invitee gets inviter as CLIENT.
 *
 * Edge cases:
 * - Duplicate invite (same from_org → to_org): UNIQUE(from_organization_id, to_organization_id) causes insert 23505;
 *   createConnectionRequest returns alreadyInvited.
 * - Mutual invites (A→B and B→A): two separate rows; each approval creates one directional relationship.
 * - Re-invite after existing connection: duplicate insert prevented as above; existing client/supplier rows are updated by trigger when linked_organization_id already exists.
 */
import { supabase } from '@/lib/supabase';
import {
  normalizePhoneForInviteeLookup,
  uniqueNormalizedPhonesForLookup,
} from '@/lib/phoneLookup';

export interface ConnectionInviteeByPhone {
  organization_id: string;
  full_name: string;
  phone: string;
  /** Matched user's organization name (organizations.name). */
  organization_name: string;
  /** Matched user's profile company (profiles.company_name), if set. */
  profile_company_name: string | null;
}

/** Prefill: prefer profile company_name, else organization display name. */
export function inviteeSuggestedCompanyName(invitee: {
  profile_company_name?: string | null;
  organization_name?: string;
}): string {
  const fromProfile = (invitee.profile_company_name ?? "").trim();
  if (fromProfile.length > 0) return fromProfile;
  return (invitee.organization_name ?? "").trim();
}

export interface ConnectionRequestRow {
  id: string;
  from_organization_id: string;
  to_organization_id: string;
  request_shipper_client: boolean;
  request_carrier_supplier: boolean;
  status: string;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
  from_org_name: string;
  to_org_name: string;
}

/**
 * Look up a person by phone, then their organization, for connection invite.
 * Phone is stored on the person (auth.users.raw_user_meta_data->>'phone' or ->'phone_numbers' array), not on organizations.
 * RPC get_invitee_by_phone finds the profile by phone, then returns that user's org id and display name. O(1).
 */
export interface ConnectionInviteeByPhoneRow {
  phone: string;
  organization_id: string;
  full_name: string | null;
  organization_name?: string | null;
  profile_company_name?: string | null;
}

export async function getConnectionInviteeByPhone(phone: string): Promise<{
  error: Error | null;
  invitee: ConnectionInviteeByPhone | null;
}> {
  const normalized = normalizePhoneForInviteeLookup(phone);
  if (!normalized) return { error: null, invitee: null };
  const { data, error } = await supabase().rpc('get_invitee_by_phone', {
    p_phone: normalized,
  });
  if (error) return { error: new Error(error.message), invitee: null };
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row?.organization_id)
    return { error: null, invitee: null };
  return {
    error: null,
    invitee: {
      organization_id: row.organization_id,
      full_name: row.full_name ?? '',
      phone: row.phone ?? normalized,
      organization_name: row.organization_name ?? '',
      profile_company_name: row.profile_company_name ?? null,
    },
  };
}

/**
 * Batch lookup: resolve invitee orgs for multiple phone numbers in one RPC call.
 * Returns a map keyed by normalized phone (digits-only, last-10 for India).
 *
 * Backend dependency: requires RPC `get_invitees_by_phones(p_phones text[])`.
 * If the RPC is not deployed yet, this function returns an empty map (no hard failure),
 * so the UI can gracefully show "Offline" until backend rollout completes.
 */
export async function getConnectionInviteesByPhones(phones: string[]): Promise<{
  error: Error | null;
  inviteesByPhone: Map<string, ConnectionInviteeByPhone>;
}> {
  const normalizedPhones = uniqueNormalizedPhonesForLookup(phones);
  const inviteesByPhone = new Map<string, ConnectionInviteeByPhone>();
  if (normalizedPhones.length === 0) return { error: null, inviteesByPhone };

  const { data, error } = await supabase().rpc('get_invitees_by_phones', {
    p_phones: normalizedPhones,
  });

  if (error) {
    const msg = error.message ?? '';
    if (/function.*get_invitees_by_phones.*does not exist/i.test(msg)) {
      return { error: null, inviteesByPhone };
    }
    return { error: new Error(msg), inviteesByPhone };
  }

  const rows = (data ?? []) as ConnectionInviteeByPhoneRow[];
  for (const r of rows) {
    const phoneKey = normalizePhoneForInviteeLookup(r?.phone ?? '');
    if (!phoneKey) continue;
    if (!r?.organization_id) continue;
    // If backend returns multiple rows for same phone, keep the first (deterministic).
    if (inviteesByPhone.has(phoneKey)) continue;
    inviteesByPhone.set(phoneKey, {
      organization_id: r.organization_id,
      full_name: r.full_name ?? '',
      phone: r.phone ?? phoneKey,
      organization_name: r.organization_name ?? '',
      profile_company_name: r.profile_company_name ?? null,
    });
  }
  return { error: null, inviteesByPhone };
}

/**
 * Create a connection request (invite another org as client and/or supplier).
 * Validates at least one role and rejects self-invite. On duplicate (23505) returns alreadyInvited.
 */
export async function createConnectionRequest(
  fromOrgId: string,
  toOrgId: string,
  options: { requestShipperClient: boolean; requestCarrierSupplier: boolean }
): Promise<{
  error: Error | null;
  requestId: string | null;
  alreadyInvited: boolean;
}> {
  const { requestShipperClient, requestCarrierSupplier } = options;
  if (!requestShipperClient && !requestCarrierSupplier)
    return {
      error: new Error('At least one of requestShipperClient or requestCarrierSupplier must be true'),
      requestId: null,
      alreadyInvited: false,
    };
  if (fromOrgId === toOrgId)
    return {
      error: new Error('You cannot invite your own organization'),
      requestId: null,
      alreadyInvited: false,
    };
  const { data, error } = await supabase()
    .from('connection_requests')
    .insert({
      from_organization_id: fromOrgId,
      to_organization_id: toOrgId,
      request_shipper_client: requestShipperClient,
      request_carrier_supplier: requestCarrierSupplier,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      const { data: existing } = await supabase()
        .from('connection_requests')
        .select('id')
        .eq('from_organization_id', fromOrgId)
        .eq('to_organization_id', toOrgId)
        .maybeSingle();
      return {
        error: null,
        requestId: existing?.id ?? null,
        alreadyInvited: true,
      };
    }
    const msg = (error as { message?: string }).message ?? '';
    const friendly =
      /permission|policy|row-level security/i.test(msg)
        ? 'You do not have permission to send this invitation.'
        : msg;
    return { error: new Error(friendly), requestId: null, alreadyInvited: false };
  }
  return {
    error: null,
    requestId: data?.id ?? null,
    alreadyInvited: false,
  };
}

export type ConnectionRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | string;

/**
 * Get the latest connection request status for a specific (from_org -> to_org).
 * Used to update UI immediately after sending an invitation (driver-style).
 */
export async function getLatestConnectionRequestStatus(
  fromOrgId: string,
  toOrgId: string,
): Promise<{ error: Error | null; status: ConnectionRequestStatus | null; requestId: string | null }> {
  const { data, error } = await supabase()
    .from("connection_requests")
    .select("id, status, created_at")
    .eq("from_organization_id", fromOrgId)
    .eq("to_organization_id", toOrgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: new Error(error.message), status: null, requestId: null };
  if (!data) return { error: null, status: null, requestId: null };
  const row = data as { id?: string | null; status?: string | null };
  return {
    error: null,
    status: (row.status ?? null) as ConnectionRequestStatus | null,
    requestId: row.id ?? null,
  };
}

/**
 * List connection requests received by the given org. Single RPC, O(n) in result size.
 */
export async function getConnectionRequestsReceived(orgId: string): Promise<{
  error: Error | null;
  requests: ConnectionRequestRow[];
}> {
  const { data, error } = await supabase().rpc('get_connection_requests_received_with_names', {
    p_org_id: orgId,
  });
  if (error) return { error: new Error(error.message), requests: [] };
  return { error: null, requests: (data ?? []) as ConnectionRequestRow[] };
}

/**
 * List connection requests sent by the given org. Single RPC, O(n) in result size.
 */
export async function getConnectionRequestsSent(orgId: string): Promise<{
  error: Error | null;
  requests: ConnectionRequestRow[];
}> {
  const { data, error } = await supabase().rpc('get_connection_requests_sent_with_names', {
    p_org_id: orgId,
  });
  if (error) return { error: new Error(error.message), requests: [] };
  return { error: null, requests: (data ?? []) as ConnectionRequestRow[] };
}

/**
 * Approve a connection request (caller must be member of to_organization_id).
 * Updates only when status is pending; trigger creates organization_relations and client/supplier rows.
 */
export async function approveConnectionRequest(requestId: string): Promise<{
  error: Error | null;
  updated: boolean;
}> {
  const { data, error: sessionError } = await supabase().auth.getSession();
  const session = data?.session;
  const userId = session?.user?.id;
  if (sessionError || !userId)
    return { error: new Error('Session expired. Please sign in again.'), updated: false };
  const { data: updateData, error } = await supabase()
    .from('connection_requests')
    .update({
      status: 'approved',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return { error: new Error(error.message), updated: false };
  const updated = Array.isArray(updateData) && updateData.length > 0;
  return { error: null, updated };
}

/**
 * Reject a connection request (caller must be member of to_organization_id).
 * Updates only when status is pending.
 */
export async function rejectConnectionRequest(requestId: string): Promise<{
  error: Error | null;
  updated: boolean;
}> {
  const { data, error: sessionError } = await supabase().auth.getSession();
  const session = data?.session;
  const userId = session?.user?.id;
  if (sessionError || !userId)
    return { error: new Error('Session expired. Please sign in again.'), updated: false };
  const { data: updateData, error } = await supabase()
    .from('connection_requests')
    .update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return { error: new Error(error.message), updated: false };
  const updated = Array.isArray(updateData) && updateData.length > 0;
  return { error: null, updated };
}

/**
 * Cancel a connection request that you have sent (caller must be member of from_organization_id).
 * Deletes the request so it can be re-sent later if needed. Only works when status is pending.
 */
export async function cancelConnectionRequest(requestId: string): Promise<{
  error: Error | null;
  deleted: boolean;
}> {
  const { data: deleteData, error } = await supabase()
    .from('connection_requests')
    .delete()
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return { error: new Error(error.message), deleted: false };
  const deleted = Array.isArray(deleteData) && deleteData.length > 0;
  return { error: null, deleted };
}
