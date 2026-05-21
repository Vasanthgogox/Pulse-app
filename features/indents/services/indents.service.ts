/**
 * Indents service — Supabase only (mobile). Same DB as Q-unified-base.
 * Service-layer validation: single pass over inputs before insert.
 */
import { getClientById } from "@/features/clients/services/clients.service";
import {
  deactivatePostsForIndent,
  isIndentTerminalForStory,
} from "@/features/network/services/indentStoryPosts.service";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import type { DeltaResponse } from "@/lib/cache/deltaTypes";
import { DEFAULT_PAGE_SIZE, type PageOpts } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";
import {
    VALIDATION,
    dateISO,
    maxLength,
    nonNegativeAmount,
    positiveAmount,
    required,
    runValidators,
} from "@/lib/validation";

export type CirculationTarget =
  | "marketplace"
  | "integrated_supplier"
  | "offline"
  | "both";
export type IndentAction = "draft" | "share";

/** Input for creating an indent (UI → service). client_id only sent when valid UUID. */
export interface CreateIndentInput {
  pickup_area: string;
  drop_location: string;
  client_name: string;
  client_price: number;
  supplier_target: number;
  /** Optional: status is managed by DB default / backend logic. */
  status?: string | null;
  client_id?: string | null;
  /** Required: vehicle type (e.g. Truck). */
  vehicle_type: string;
  /** Required: load type (e.g. FMCG). */
  load_type: string;
  /** Required: weight in kg (UI converts from tons). */
  weight: number;
  pickup_date?: string | null;
  circulation_target?: CirculationTarget | null;
  routeStops?: Array<{
    type: "pickup" | "drop";
    area: string;
    address?: string;
  }>;
  /** Sequential ID owner (auth.uid). Next IND001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
}

/** Single stop for insertIndentStops (ordered by array index). */
export interface IndentStopInput {
  type: "pickup" | "drop";
  area: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface IndentRow {
  id: string;
  organization_id: string;
  /** User-facing ID; DB trigger sets from display_indent_id when null. */
  indent_number: string;
  /** Per-org sequence; set by DB trigger. Used for IND001 display. */
  sequence_number?: number | null;
  /** User-facing indent ID e.g. IND001. Set by trigger from sequence_number. */
  display_indent_id?: string | null;
  pickup_area: string;
  drop_location: string;
  client_name: string;
  client_price: number;
  supplier_target: number;
  status: string;
  client_id?: string | null;
  vehicle_type: string | null;
  load_type: string | null;
  pickup_date: string | null;
  circulation_target: string | null;
  shared_at?: string | null;
  last_saved_at?: string | null;
  weight?: number | null;
  created_at: string;
  /** Name of the organization that created the indent (who posted the load). For Find Work: show this to supplier. */
  creator_organization_name?: string | null;
  /** Sequential ID owner (auth.uid). Next IND001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
  trip_number?: string | null;
  assigned_supplier_id?: string | null;
  assigned_supplier_rate?: number | null;
  [key: string]: unknown;
}

async function ensurePublicUserRecord(userId?: string | null): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;

  const { error } = await supabase().from("users").upsert(
    {
      id,
      name: "User",
    },
    { onConflict: "id" },
  );

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    // Keep backward compatibility with DBs that do not have this table
    // or block direct writes to it.
    if (
      msg.includes("relation") ||
      msg.includes("permission denied") ||
      msg.includes("policy")
    ) {
      return;
    }
    throw new Error(error.message);
  }
}

export async function getIndentsByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; indents: IndentRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from("indents")
      .select("*, trips(trip_number)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), indents: [] };
    const indents = (data ?? []).map((row: any) => ({
      ...row,
      trip_number: row.trips?.[0]?.trip_number ?? null,
    })) as IndentRow[];
    const hasMore = indents.length > limit;
    return {
      error: null,
      indents: hasMore ? indents.slice(0, limit) : indents,
      hasMore,
    };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), indents: [] };
  const indents = (data ?? []).map((row: any) => ({
    ...row,
    trip_number: row.trips?.[0]?.trip_number ?? null,
  })) as IndentRow[];
  return { error: null, indents };
}

export async function getIndentsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<IndentRow> }> {
  const { data, error } = await supabase().rpc("get_indents_delta", {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) return { error: new Error(error.message), delta: { changed: [], deletedIds: [], nextCursor: since } };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: IndentRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as IndentRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncIndentsWithCache(orgId: string, currentRows: IndentRow[]) {
  try {
    const indents = await syncDomainRows<IndentRow>({
      domain: "indents",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 3 * 60_000, fullSyncEveryMs: 4 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getIndentsByOrganization(orgId);
        if (res.error) throw res.error;
        return res.indents;
      },
      getDelta: async (cursor) => {
        const res = await getIndentsDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        }),
    });
    return { error: null, indents };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), indents: currentRows };
  }
}

/**
 * Partner shipper org → earliest ISO time the link became active (matches market_indents_for_org).
 * Precedence per shipper: organization_relations; else suppliers (caller = linked_organization_id);
 * else clients.linked_organization_id on caller's org.
 */
async function fetchPartnerShipperLinkSinceMap(
  orgId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const mergeMin = (shipperId: string, iso: string | null | undefined) => {
    if (!shipperId || !iso) return;
    const prev = map.get(shipperId);
    if (!prev || iso < prev) map.set(shipperId, iso);
  };

  const { data: clientSupplier } = await supabase()
    .from("organization_relations")
    .select("from_organization_id, created_at")
    .eq("to_organization_id", orgId)
    .eq("relation_type", "client_supplier")
    .eq("status", "active");

  const { data: supplierClient } = await supabase()
    .from("organization_relations")
    .select("to_organization_id, created_at")
    .eq("from_organization_id", orgId)
    .eq("relation_type", "supplier_client")
    .eq("status", "active");

  for (const r of clientSupplier ?? []) {
    mergeMin(String(r.from_organization_id), r.created_at as string);
  }
  for (const r of supplierClient ?? []) {
    mergeMin(String(r.to_organization_id), r.created_at as string);
  }

  const { data: suppliers } = await supabase()
    .from("suppliers")
    .select("organization_id, updated_at")
    .eq("linked_organization_id", orgId);

  for (const s of suppliers ?? []) {
    const oid = s.organization_id as string | null;
    const ts = s.updated_at as string | null | undefined;
    if (!oid || oid === orgId || !ts) continue;
    if (map.has(oid)) continue;
    mergeMin(oid, ts);
  }

  const { data: linkedClients } = await supabase()
    .from("clients")
    .select("linked_organization_id, created_at")
    .eq("organization_id", orgId)
    .eq("status", "active");

  for (const c of linkedClients ?? []) {
    const lid = c.linked_organization_id as string | null;
    if (!lid || lid === orgId) continue;
    if (map.has(lid)) continue;
    mergeMin(lid, c.created_at as string);
  }

  return map;
}

/**
 * Ensure integrated suppliers can see currently active loads from linked shippers,
 * including rows created before the connection timestamp.
 * This is a read-merge only safety net layered above RPC/fallback paths.
 */
async function mergeLinkedShipperActiveIndents(
  orgId: string,
  baseIndents: IndentRow[],
): Promise<IndentRow[]> {
  const existing = new Map(baseIndents.map((i) => [i.id, i]));
  const linkMap = await fetchPartnerShipperLinkSinceMap(orgId);
  if (linkMap.size === 0) return baseIndents;

  const shipperIds = [...linkMap.keys()];
  const { data: rows, error } = await supabase()
    .from("indents")
    .select("*, organizations(name)")
    .in("organization_id", shipperIds)
    .in("circulation_target", ["integrated_supplier", "both"])
    .not("status", "in", '("completed","cancelled","closed","expired")')
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (error || !rows?.length) return baseIndents;

  const merged = [...baseIndents];
  for (const row of rows as Array<
    IndentRow & { organizations?: { name: string | null } | null }
  >) {
    if (existing.has(row.id)) continue;
    const { organizations, ...rest } = row;
    const normalized: IndentRow = {
      ...rest,
      creator_organization_name: organizations?.name ?? null,
    } as IndentRow;
    existing.set(normalized.id, normalized);
    merged.push(normalized);
  }
  return merged;
}

/** Market-facing indents visible to the current organization (as integrated supplier). Uses RPC (SECURITY DEFINER) then direct table fallback. */
export async function getMarketIndentsForOrganization(
  orgId: string,
): Promise<{ error: Error | null; indents: IndentRow[] }> {
  if (!orgId) return { error: new Error("orgId is required"), indents: [] };

  const { data: rpcData, error: rpcError } = await supabase().rpc(
    "market_indents_for_org",
    {
      org_id: orgId,
    },
  );
  if (!rpcError && Array.isArray(rpcData)) {
    const indents = (rpcData as Record<string, unknown>[]).map((row) => {
      const { organizations, ...rest } = row;
      const name =
        (organizations as { name?: string | null } | null)?.name ??
        (row.creator_organization_name as string | null) ??
        null;
      return { ...rest, creator_organization_name: name } as IndentRow;
    });
    const withActiveLinked = await mergeLinkedShipperActiveIndents(orgId, indents);
    const merged = await mergeQuotedIndentsForSupplier(orgId, withActiveLinked);
    return { error: null, indents: merged };
  }

  const linkMap = await fetchPartnerShipperLinkSinceMap(orgId);
  if (linkMap.size === 0) return { error: null, indents: [] };

  const shipperIds = [...linkMap.keys()];
  const { data, error } = await supabase()
    .from("indents")
    .select("*, organizations(name)")
    .in("organization_id", shipperIds)
    .in("circulation_target", ["integrated_supplier", "both"])
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) return { error: new Error(error.message), indents: [] };

  const rows = (data ?? []).filter((row) => {
    const since = linkMap.get(String(row.organization_id ?? ""));
    if (!since) return false;
    const status = String(row.status ?? "").toLowerCase();
    const isActive =
      status !== "completed" &&
      status !== "cancelled" &&
      status !== "closed" &&
      status !== "expired";
    if (isActive) return true;
    return String(row.created_at ?? "") >= since;
  }) as (IndentRow & {
    organizations?: { name: string | null } | null;
  })[];
  const indents: IndentRow[] = rows.map((row) => {
    const { organizations, ...rest } = row;
    return {
      ...rest,
      creator_organization_name: organizations?.name ?? null,
    } as IndentRow;
  });
  const merged = await mergeQuotedIndentsForSupplier(orgId, indents);
  return { error: null, indents: merged };
}

/**
 * Safety net for supplier load pages:
 * if supplier has already quoted/bid on an indent (incl. story bid -> direct_quote),
 * ensure that indent appears in market loads even when partner-link/date filters exclude it.
 */
async function mergeQuotedIndentsForSupplier(
  orgId: string,
  baseIndents: IndentRow[],
): Promise<IndentRow[]> {
  const existing = new Map(baseIndents.map((i) => [i.id, i]));

  const { data: myQuotes, error: quoteErr } = await supabase()
    .from("direct_quotes")
    .select("indent_id")
    .eq("bidder_organization_id", orgId);
  if (quoteErr || !myQuotes?.length) return baseIndents;

  const quotedIndentIds = Array.from(
    new Set(
      (myQuotes as Array<{ indent_id?: string | null }>)
        .map((q) => (q.indent_id ?? "").trim())
        .filter(Boolean),
    ),
  ).filter((id) => !existing.has(id));

  if (quotedIndentIds.length === 0) return baseIndents;

  const { data: extraRows, error: extraErr } = await supabase()
    .from("indents")
    .select("*, organizations(name)")
    .in("id", quotedIndentIds)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (extraErr || !extraRows?.length) return baseIndents;

  const extras = (extraRows as Array<
    IndentRow & { organizations?: { name: string | null } | null }
  >).map((row) => {
    const { organizations, ...rest } = row;
    return {
      ...rest,
      creator_organization_name: organizations?.name ?? null,
    } as IndentRow;
  });

  const merged = [...baseIndents];
  for (const row of extras) {
    if (!existing.has(row.id)) {
      existing.set(row.id, row);
      merged.push(row);
    }
  }
  return merged;
}

/** Fetch a single indent by id (for detail screen). */
export async function getIndentById(
  indentId: string,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const { data, error } = await supabase()
    .from("indents")
    .select("*, trips(trip_number)")
    .eq("id", indentId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), indent: null };
  const raw = data as any;
  const indent: IndentRow | null = raw
    ? {
        ...raw,
        trip_number: raw.trips?.[0]?.trip_number ?? null,
      }
    : null;
  return { error: null, indent };
}

/**
 * Fetch a single indent visible to the current organization.
 * - First tries direct owner read (`indents` table).
 * - Falls back to market-visible data via RPC for integrated suppliers.
 * Also supports display IDs (e.g. IND007) as input.
 */
export async function getVisibleIndentById(
  orgId: string | null,
  indentIdOrDisplayId: string,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const raw = (indentIdOrDisplayId ?? "").trim();
  if (!raw) return { error: null, indent: null };

  const direct = await getIndentById(raw);
  if (direct.error) return direct;
  if (direct.indent) {
    const row = direct.indent;
    if (
      orgId &&
      row.organization_id &&
      row.organization_id !== orgId &&
      !(row.creator_organization_name ?? "").trim()
    ) {
      const { data: ownerOrg, error: ownerOrgErr } = await supabase()
        .from("organizations")
        .select("name")
        .eq("id", row.organization_id)
        .maybeSingle();
      if (ownerOrgErr) {
        return { error: new Error(ownerOrgErr.message), indent: null };
      }
      return {
        error: null,
        indent: {
          ...row,
          creator_organization_name: (ownerOrg?.name ?? null) as string | null,
        },
      };
    }
    return direct;
  }

  if (!orgId) return { error: null, indent: null };

  const { error: marketErr, indents } =
    await getMarketIndentsForOrganization(orgId);
  if (marketErr) return { error: marketErr, indent: null };

  const needle = raw.toLowerCase();
  const match =
    indents.find((row) => row.id === raw) ??
    indents.find(
      (row) => (row.display_indent_id ?? "").toLowerCase() === needle,
    ) ??
    indents.find((row) => (row.indent_number ?? "").toLowerCase() === needle) ??
    null;

  return { error: null, indent: match };
}

/** Display label for an indent (IND001-style when present). */
export function getIndentDisplayNumber(row: IndentRow): string {
  return row.display_indent_id ?? row.indent_number ?? "—";
}

/** Supplier-facing target rate (not load-giver client sales price). */
export function resolveSupplierTargetDisplayRate(
  supplierTarget: number | null | undefined,
  clientPrice?: number | null | undefined,
  fallback?: number | null | undefined,
): number | null {
  const rate = supplierTarget ?? clientPrice ?? fallback ?? null;
  if (rate == null || !Number.isFinite(Number(rate))) return null;
  const n = Number(rate);
  return n > 0 ? n : null;
}

/**
 * Create a new indent (RLS enforces org membership).
 * Resolves client_name from clients when client_id is set and client_name is empty.
 * indent_number is omitted so DB trigger sets display_indent_id.
 */
export async function createIndent(
  orgId: string,
  data: CreateIndentInput,
  options?: { action?: IndentAction },
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const action = options?.action ?? "share";
  const shouldValidateShare = action === "share";
  if (shouldValidateShare) {
    const clientNameErr = runValidators((data.client_name ?? "").trim(), [
      required(),
      maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH),
    ]);
    if (clientNameErr)
      return {
        error: new Error(`Client name: ${clientNameErr}`),
        indent: null,
      };
    const pickupErr = runValidators((data.pickup_area ?? "").trim(), [
      required(),
      maxLength(255),
    ]);
    if (pickupErr)
      return { error: new Error(`Pickup area: ${pickupErr}`), indent: null };
    const dropErr = runValidators((data.drop_location ?? "").trim(), [
      required(),
      maxLength(255),
    ]);
    if (dropErr)
      return { error: new Error(`Drop location: ${dropErr}`), indent: null };
    const priceErr = positiveAmount()(data.client_price);
    if (priceErr)
      return { error: new Error(`Client price: ${priceErr}`), indent: null };
    const targetErr = nonNegativeAmount()(data.supplier_target);
    if (targetErr)
      return {
        error: new Error(`Supplier target: ${targetErr}`),
        indent: null,
      };
    const vehicleErr = runValidators((data.vehicle_type ?? "").trim(), [
      required("Vehicle is required"),
      maxLength(100),
    ]);
    if (vehicleErr)
      return { error: new Error(`Vehicle: ${vehicleErr}`), indent: null };
    const loadTypeErr = runValidators((data.load_type ?? "").trim(), [
      required("Load type is required"),
      maxLength(100),
    ]);
    if (loadTypeErr)
      return { error: new Error(`Load type: ${loadTypeErr}`), indent: null };
    if (
      data.weight == null ||
      typeof data.weight !== "number" ||
      data.weight <= 0 ||
      data.weight > 999999
    ) {
      return {
        error: new Error(
          "Weight is required and must be between 0.01 and 1,000 tons.",
        ),
        indent: null,
      };
    }
    if (data.pickup_date?.trim()) {
      const dateErr = dateISO()(data.pickup_date);
      if (dateErr)
        return { error: new Error(`Pickup date: ${dateErr}`), indent: null };
    }
  }
  let client_name = (data.client_name ?? "").trim();
  if (data.client_id && !client_name) {
    const { client } = await getClientById(orgId, data.client_id);
    if (client?.name) client_name = client.name;
  }
  if (!client_name) client_name = data.client_name || "";

  const indent_number = null;
  // Insert only columns that exist on indents table. client_id is resolved to client_name above;
  // do not send client_id if the table does not have that column (avoids "could not find client_id column").
  // Omit status on insert so the DB default is used. Works with both schemas: older (default 'open',
  // check open/closed/cancelled) and consolidated (default 'pending', check pending/quoted/awarded/...).
  const payload: Record<string, unknown> = {
    indent_number,
    owner_user_id: data.owner_user_id ?? null,
    created_by_user_id: data.created_by_user_id ?? null,
    pickup_area: data.pickup_area?.trim() ?? "",
    drop_location: data.drop_location?.trim() ?? "",
    client_name: client_name?.trim() ?? "",
    client_price: Number.isFinite(data.client_price) ? data.client_price : 0,
    supplier_target: Number.isFinite(data.supplier_target)
      ? data.supplier_target
      : 0,
    vehicle_type: data.vehicle_type?.trim() ?? "",
    load_type: data.load_type?.trim() ?? "",
    pickup_date: data.pickup_date ?? null,
    circulation_target: data.circulation_target ?? "integrated_supplier",
    weight: Number.isFinite(data.weight) ? data.weight : 0,
    status: action === "draft" ? "draft" : "broadcast",
    shared_at: action === "share" ? new Date().toISOString() : null,
    last_saved_at: action === "draft" ? new Date().toISOString() : null,
  };

  const ownerUserId =
    typeof payload.owner_user_id === "string" ? payload.owner_user_id : null;
  const creatorUserId =
    typeof payload.created_by_user_id === "string"
      ? payload.created_by_user_id
      : null;

  // Sequential indent trigger writes user_counters(user_id),
  // which references public.users(id).
  await ensurePublicUserRecord(ownerUserId);
  if (creatorUserId && creatorUserId !== ownerUserId) {
    await ensurePublicUserRecord(creatorUserId);
  }

  const { data: row, error } = await supabase()
    .from("indents")
    .insert({ ...payload, organization_id: orgId })
    .select()
    .single();

  if (error) {
    const msg =
      [error.message, error.details, error.hint].filter(Boolean).join(" — ") ||
      error.message;
    return { error: new Error(msg), indent: null };
  }
  return { error: null, indent: row as IndentRow };
}

/**
 * Insert indent_stops for an indent (multi pickup/drop). Call after createIndent when route has multiple stops.
 */
export async function insertIndentStops(
  indentId: string,
  stops: IndentStopInput[],
): Promise<{ error: Error | null }> {
  if (stops.length === 0) return { error: null };
  const rows = stops.map((s, i) => ({
    indent_id: indentId,
    stop_index: i,
    type: s.type,
    area: s.area,
    address: s.address ?? "",
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
  }));
  const { error } = await supabase().from("indent_stops").insert(rows);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Partially update an indent owned by the caller's organization.
 * Use for editing non-terminal loads (e.g. update price, route, vehicle, dates).
 */
export async function updateIndent(
  indentId: string,
  updates: Partial<
    Pick<
      IndentRow,
      | "pickup_area"
      | "drop_location"
      | "client_name"
      | "client_price"
      | "supplier_target"
      | "vehicle_type"
      | "load_type"
      | "pickup_date"
      | "circulation_target"
      | "status"
    >
  >,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const payload: Record<string, unknown> = {};
  if (updates.pickup_area !== undefined)
    payload.pickup_area = updates.pickup_area;
  if (updates.drop_location !== undefined)
    payload.drop_location = updates.drop_location;
  if (updates.client_name !== undefined)
    payload.client_name = updates.client_name;
  if (updates.client_price !== undefined)
    payload.client_price = updates.client_price;
  if (updates.supplier_target !== undefined)
    payload.supplier_target = updates.supplier_target;
  if (updates.vehicle_type !== undefined)
    payload.vehicle_type = updates.vehicle_type;
  if (updates.load_type !== undefined) payload.load_type = updates.load_type;
  if (updates.pickup_date !== undefined)
    payload.pickup_date = updates.pickup_date;
  if (updates.circulation_target !== undefined)
    payload.circulation_target = updates.circulation_target;
  if (updates.status !== undefined) payload.status = updates.status;

  if (Object.keys(payload).length === 0) {
    return { error: null, indent: null };
  }

  const { data, error } = await supabase()
    .from("indents")
    .update(payload)
    .eq("id", indentId)
    .select()
    .maybeSingle();

  if (error) return { error: new Error(error.message), indent: null };

  if (
    updates.status !== undefined &&
    isIndentTerminalForStory(updates.status)
  ) {
    const { error: storyErr } = await deactivatePostsForIndent(indentId);
    if (storyErr && __DEV__) {
      console.warn(
        '[indents] updateIndent: deactivate linked stories failed:',
        storyErr.message,
      );
    }
  }

  return { error: null, indent: (data ?? null) as IndentRow | null };
}

type DraftEditableFields = Partial<
  Pick<
    IndentRow,
    | "pickup_area"
    | "drop_location"
    | "client_name"
    | "client_price"
    | "supplier_target"
    | "vehicle_type"
    | "load_type"
    | "pickup_date"
    | "circulation_target"
    | "weight"
    | "owner_user_id"
    | "created_by_user_id"
  >
>;

function toIndentUpdateError(message: string): Error {
  const lower = message.toLowerCase();
  if (lower.includes("cannot be edited"))
    return new Error("This indent has been shared and cannot be edited");
  if (lower.includes("cannot be reverted to draft"))
    return new Error("This indent has been shared and cannot be edited");
  return new Error(message);
}

export async function updateIndentDraft(
  indentId: string,
  updates: DraftEditableFields,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const payload: Record<string, unknown> = {};
  if (updates.pickup_area !== undefined)
    payload.pickup_area = updates.pickup_area;
  if (updates.drop_location !== undefined)
    payload.drop_location = updates.drop_location;
  if (updates.client_name !== undefined)
    payload.client_name = updates.client_name;
  if (updates.client_price !== undefined)
    payload.client_price = updates.client_price;
  if (updates.supplier_target !== undefined)
    payload.supplier_target = updates.supplier_target;
  if (updates.vehicle_type !== undefined)
    payload.vehicle_type = updates.vehicle_type;
  if (updates.load_type !== undefined) payload.load_type = updates.load_type;
  if (updates.pickup_date !== undefined)
    payload.pickup_date = updates.pickup_date;
  if (updates.circulation_target !== undefined)
    payload.circulation_target = updates.circulation_target;
  if (updates.weight !== undefined) payload.weight = updates.weight;
  if (updates.owner_user_id !== undefined)
    payload.owner_user_id = updates.owner_user_id;
  if (updates.created_by_user_id !== undefined)
    payload.created_by_user_id = updates.created_by_user_id;
  payload.last_saved_at = new Date().toISOString();

  const { data, error } = await supabase()
    .from("indents")
    .update(payload)
    .eq("id", indentId)
    .eq("status", "draft")
    .select()
    .maybeSingle();

  if (error) return { error: toIndentUpdateError(error.message), indent: null };
  if (!data)
    return {
      error: new Error("This indent has been shared and cannot be edited"),
      indent: null,
    };
  return { error: null, indent: data as IndentRow };
}

export async function shareDraftIndent(
  indentId: string,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase()
    .from("indents")
    .update({ status: "broadcast", shared_at: nowIso })
    .eq("id", indentId)
    .eq("status", "draft")
    .select()
    .maybeSingle();

  if (error) return { error: toIndentUpdateError(error.message), indent: null };
  if (!data)
    return {
      error: new Error("This indent has already been shared"),
      indent: null,
    };
  return { error: null, indent: data as IndentRow };
}

/**
 * Soft-cancel an indent by setting status to 'cancelled'.
 * Caller must have permission via RLS (indent owner org).
 */
export async function cancelIndent(
  indentId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("indents")
    .update({ status: "cancelled" })
    .eq("id", indentId);

  if (error) return { error: new Error(error.message) };

  const { error: storyErr } = await deactivatePostsForIndent(indentId);
  if (storyErr && __DEV__) {
    console.warn(
      "[indents] cancelIndent: deactivate linked stories failed:",
      storyErr.message,
    );
  }

  return { error: null };
}
