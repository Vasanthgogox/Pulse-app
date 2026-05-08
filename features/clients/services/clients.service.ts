/**
 * Clients service — Supabase only (mobile). Same DB as Q-unified-base.
 */
import { supabase } from '@/lib/supabase';
import { DEFAULT_PAGE_SIZE, type PageOpts } from '@/lib/pagination';
import { syncDomainRows } from '@/lib/cache/domainSync';
import { mergeDeltaRows } from '@/lib/cache/mergeDelta';
import type { DeltaResponse } from '@/lib/cache/deltaTypes';

const CLIENT_COLUMNS = [
  "id", "organization_id", "name", "contact_person", "phone", "email",
  "address", "gstin", "pan_number", "status", "created_at", "updated_at",
  "display_id", "is_integrated", "linked_organization_id",
  "contact_percent", "avatar_url", "avatar_seed", "owner_full_name",
].join(",");

export interface ClientRow {
  id: string;
  organization_id: string;
  name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan_number: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  display_id?: string;
  /** True when client is linked to another org on the platform (shared ledger). */
  is_integrated?: boolean;
  /** When set, client is another platform org (for Compare & Verify partner resolution). */
  linked_organization_id?: string | null;
  /** Optional contact/commission percent; shown in Finance customers table subline (e.g. "MANUAL · 10%"). */
  contact_percent?: number | null;
  /** Joined profile data for integrated clients (owner of linked org). */
  avatar_url?: string | null;
  avatar_seed?: string | null;
  owner_full_name?: string | null;
}

export async function getClientsByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; clients: ClientRow[]; hasMore?: boolean }> {
  try {
    // Try optimized RPC first (SECURITY DEFINER, joins profiles for avatars)
    const { data, error: rpcError } = await supabase().rpc('get_clients_with_profiles', {
      p_org_id: orgId,
    });

    if (!rpcError && data) {
      const raw = (data ?? []) as ClientRow[];
      if (opts != null) {
        const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
        const offset = opts.offset ?? 0;
        const hasMore = raw.length > offset + limit;
        return { error: null, clients: raw.slice(offset, offset + limit), hasMore };
      }
      return { error: null, clients: raw };
    }
    if (rpcError && __DEV__) {
      console.warn('[getClientsByOrganization] RPC failed, falling back to select:', rpcError.message);
    }
  } catch (e) {
    if (__DEV__) console.warn('[getClientsByOrganization] RPC exception:', e);
  }

  // Fallback to standard select if RPC fails or is missing
  const base = () =>
    supabase()
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name', { ascending: true });

  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), clients: [] };
    const raw = (data ?? []) as unknown as ClientRow[];
    const hasMore = raw.length > limit;
    return { error: null, clients: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), clients: [] };
  return { error: null, clients: (data ?? []) as unknown as ClientRow[] };
}

export async function getClientsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<ClientRow> }> {
  const { data, error } = await supabase().rpc('get_clients_delta', {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) {
    return {
      error: new Error(error.message),
      delta: { changed: [], deletedIds: [], nextCursor: since },
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: ClientRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as ClientRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncClientsWithCache(
  orgId: string,
  currentRows: ClientRow[],
): Promise<{ error: Error | null; clients: ClientRow[] }> {
  try {
    const clients = await syncDomainRows<ClientRow>({
      domain: 'clients',
      orgId,
      schemaVersion: '1',
      policy: { maxDeltaLagMs: 5 * 60_000, fullSyncEveryMs: 8 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getClientsByOrganization(orgId);
        if (res.error) throw res.error;
        return res.clients;
      },
      getDelta: async (cursor) => {
        const res = await getClientsDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) => a.name.localeCompare(b.name),
        }),
    });
    return { error: null, clients };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), clients: currentRows };
  }
}

export async function getClientById(
  orgId: string,
  clientId: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const { data, error } = await supabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('id', clientId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), client: null };
  return { error: null, client: data as ClientRow | null };
}

/**
 * Fetch client for detail/edit with integrated logic: when linked_organization_id is set,
 * name/contact_person/phone/email are COALESCE from linked org's owner profile.
 * Use this for the client detail screen and edit form so the form is pre-filled.
 */
export async function getClientDetails(
  clientId: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const { data, error } = await supabase().rpc('get_client_details', {
    p_client_id: clientId,
  });
  if (error) return { error: new Error(error.message), client: null };
  if (data == null) return { error: null, client: null };
  return { error: null, client: data as ClientRow };
}

/**
 * Fetch display profile (name, contact, phone, avatar) for a linked organization.
 * Used when syncing integrated client details from the other org's profile.
 * Uses RPC get_connection_partner_display (SECURITY DEFINER) so we can read the other org's profile.
 */
export async function getLinkedOrgProfile(linkedOrganizationId: string): Promise<{
  error: Error | null;
  profile: { organizationName: string; contactPerson: string; phone: string; avatarUrl?: string; avatarSeed?: string } | null;
}> {
  const { data, error } = await supabase().rpc('get_connection_partner_display', {
    p_linked_organization_id: linkedOrganizationId,
  });
  if (error) {
    return { error: new Error(error.message), profile: null };
  }
  if (data == null || typeof data !== 'object') {
    return { error: null, profile: null };
  }
  const raw = data as { organizationName?: string; contactPerson?: string; phone?: string; avatarUrl?: string; avatarSeed?: string };
  return {
    error: null,
    profile: {
      organizationName: (raw.organizationName ?? '').trim() || 'Connected',
      contactPerson: (raw.contactPerson ?? '').trim(),
      phone: (raw.phone ?? '').trim(),
      avatarUrl: (raw.avatarUrl ?? '').trim(),
      avatarSeed: (raw.avatarSeed ?? '').trim(),
    },
  };
}

type OrgDisplayProfile = { organizationName: string; contactPerson: string; phone: string; avatarUrl?: string; avatarSeed?: string };

/** Batch-fetch display profiles for multiple linked orgs in one RPC call. */
export async function getLinkedOrgProfilesBatch(
  linkedOrganizationIds: string[]
): Promise<Record<string, OrgDisplayProfile>> {
  if (linkedOrganizationIds.length === 0) return {};
  const { data, error } = await supabase().rpc('get_connection_partner_display_batch', {
    p_linked_organization_ids: linkedOrganizationIds,
  });
  if (error || data == null || typeof data !== 'object') return {};
  const raw = data as Record<string, { organizationName?: string; contactPerson?: string; phone?: string; avatarUrl?: string; avatarSeed?: string }>;
  const result: Record<string, OrgDisplayProfile> = {};
  for (const [oid, entry] of Object.entries(raw)) {
    if (!entry) continue;
    result[oid] = {
      organizationName: (entry.organizationName ?? '').trim() || 'Connected',
      contactPerson: (entry.contactPerson ?? '').trim(),
      phone: (entry.phone ?? '').trim(),
      avatarUrl: (entry.avatarUrl ?? '').trim(),
      avatarSeed: (entry.avatarSeed ?? '').trim(),
    };
  }
  return result;
}

/**
 * Find an active client by name within an organization (trimmed exact match).
 * Used when creating trips so client_id is set and integrated clients can see the trip (RLS).
 */
export async function getClientByName(
  orgId: string,
  name: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const normalized = name.trim();
  if (!normalized) return { error: null, client: null };
  const { data, error } = await supabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .eq('name', normalized)
    .maybeSingle();
  if (error) return { error: new Error(error.message), client: null };
  return { error: null, client: data as ClientRow | null };
}

/**
 * Find an active client by phone within an organization (idempotency / duplicate check).
 */
export async function getClientByPhone(
  orgId: string,
  phone: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const normalized = phone.trim();
  if (!normalized) return { error: null, client: null };
  const { data, error } = await supabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .eq('phone', normalized)
    .maybeSingle();
  if (error) return { error: new Error(error.message), client: null };
  return { error: null, client: data as ClientRow | null };
}

/**
 * Create client payload.
 * Mobile quick-add: contact_person + phone are enough; name is derived for DB (required column).
 * Full payload supported for web parity (organization_name, email, address, etc.).
 */
export interface CreateClientData {
  /** Contact person name (required for quick-add). Used as organization name if organization_name omitted. */
  contact_person: string;
  phone: string;
  organization_name?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan_number?: string;
  notes?: string;
  is_integrated?: boolean;
}

export async function createClient(
  orgId: string,
  clientData: CreateClientData
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const sb = supabase();
  const { data: { session }, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !session?.user) {
    return {
      error: new Error('Your session may have expired. Please sign out and sign in again.'),
      client: null,
    };
  }
  await sb.auth.refreshSession().then(() => {});
  const { data: { session: currentSession } } = await sb.auth.getSession();
  const sessionToUse = currentSession ?? session;
  try {
    await sb.auth.setSession({
      access_token: sessionToUse.access_token,
      refresh_token: sessionToUse.refresh_token,
    });
  } catch {
    return {
      error: new Error('Session invalid. Please sign out and sign in again.'),
      client: null,
    };
  }
  const name =
    (clientData.organization_name ?? '').trim() ||
    (clientData.contact_person ?? '').trim() ||
    'Client';
  const insertData = {
    organization_id: orgId,
    name,
    contact_person: (clientData.contact_person ?? '').trim() || null,
    phone: (clientData.phone ?? '').trim(),
    email: (clientData.email ?? '').trim() || null,
    address: (clientData.address ?? '').trim() || null,
    gstin: (clientData.gstin ?? '').trim() || null,
    pan_number: (clientData.pan_number ?? '').trim() || null,
    notes: (clientData.notes ?? '').trim() || null,
    is_integrated: clientData.is_integrated ?? false,
    status: 'active',
    created_by: sessionToUse.user.id,
  };
  const { data, error } = await sb
    .from('clients')
    .insert(insertData as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    const message =
      error.code === '23505'
        ? 'A client with this phone number already exists.'
        : error.code === '42501' || error.message?.toLowerCase().includes('row-level security')
          ? 'You do not have permission to add clients to this organization.'
          : error.message || 'Failed to create client';
    return { error: new Error(message), client: null };
  }
  return { error: null, client: data as ClientRow };
}

/** Patch for updating a client (e.g. after create from Ops Agent). */
export interface UpdateClientData {
  contact_person?: string;
  phone?: string;
  organization_name?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan_number?: string;
}

export async function updateClient(
  orgId: string,
  clientId: string,
  patch: UpdateClientData
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const updates: Record<string, unknown> = {};
  if (patch.contact_person !== undefined) updates.contact_person = patch.contact_person.trim() || null;
  if (patch.phone !== undefined) updates.phone = patch.phone.trim();
  if (patch.email !== undefined) updates.email = patch.email.trim() || null;
  if (patch.address !== undefined) updates.address = patch.address.trim() || null;
  if (patch.gstin !== undefined) updates.gstin = patch.gstin.trim() || null;
  if (patch.pan_number !== undefined) updates.pan_number = patch.pan_number.trim() || null;
  const name =
    (patch.organization_name ?? '').trim() ||
    (patch.contact_person ?? '').trim() ||
    'Client';
  if (patch.organization_name !== undefined || patch.contact_person !== undefined) updates.name = name;
  if (Object.keys(updates).length === 0) return { error: null, client: null };
  const { data, error } = await supabase()
    .from('clients')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', clientId)
    .select()
    .single();
  if (error) return { error: new Error(error.message), client: null };
  return { error: null, client: data as ClientRow };
}
