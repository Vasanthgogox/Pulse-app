/**
 * Trips service — Supabase only (mobile). Same DB as Q-unified-base.
 */
import {
  DEFAULT_PAGE_SIZE,
  DRIVER_TRIPS_PAGE_SIZE,
  type PageOpts,
} from "@/lib/pagination";
import { supabase } from "@/lib/supabase";

export interface TripRow {
  id: string;
  organization_id: string;
  /** User-facing ID; DB trigger sets from display_trip_id when null. */
  trip_number: string;
  /** Per-org sequence; set by DB trigger. Used for TRP001 display. */
  sequence_number?: number | null;
  /** User-facing trip ID e.g. TRP001. Set by trigger from sequence_number. */
  display_trip_id?: string | null;
  indent_id: string | null;
  source: string;
  pickup_area: string;
  drop_location: string;
  /** From place search; optional. */
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  /** Pre-calculated distance in km. Can come back from DB as numeric or string depending on serialization. */
  distance: string | number | null;
  estimated_duration: string | null;
  client_id: string | null;
  client_name: string;
  supplier_id: string | null;
  /** Optional; when set without supplier_id, used for supplier due/name matching (e.g. synced trips). */
  supplier_name?: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  /** Display name for driver when not resolved from drivers table (e.g. OTP-claimed trip, or cached at assignment). Fallback when associated driver fetch fails or is missing. */
  driver_display_name?: string | null;
  /** Cached vehicle number for display. Synced from vehicles when vehicle_id set; can be set ad-hoc when vehicle_id is null (aggregate trips). */
  vehicle_display_number?: string | null;
  client_price: number;
  supplier_rate: number;
  margin: number;
  platform_fee: number;
  driver_commission: number;
  is_guaranteed: boolean;
  payment_status: string;
  amount_paid: number;
  status: string;
  pickup_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  load_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Trip creator (auth.uid) when available. May be null for legacy rows. */
  created_by?: string | null;
  /** Sequential ID owner (auth.uid). Next TRP001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
  /** Dispatcher / user who assigned the driver (when set in DB). */
  assigned_by_user_id?: string | null;
  /** Optimistic revision for status/progress updates (monotonic). */
  status_revision?: number | null;
  /** Last actor who advanced status (auth.uid). */
  status_updated_by?: string | null;
  /** Last actor role who advanced status. */
  status_updated_role?: "driver" | "creator" | "system" | null;
  indent_number?: string | null;
}

export async function getTripsByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: TripRow[]; hasMore?: boolean }> {
  const q = supabase()
    .from("trips")
    .select("*, indents(indent_number)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const processData = (data: any[] | null) => {
    return (data ?? []).map((row: any) => ({
      ...row,
      indent_number: row.indents?.indent_number ?? null,
    })) as TripRow[];
  };

  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const from = offset;
    const to = offset + limit;
    const { data, error } = await q.range(from, to);
    if (error) return { error: new Error(error.message), trips: [] };
    const trips = processData(data);
    const hasMore = trips.length > limit;
    const resultTrips = hasMore ? trips.slice(0, limit) : trips;
    return { error: null, trips: resultTrips, hasMore };
  }

  const { data, error } = await q;
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: processData(data) };
}

/**
 * Load-based trips where the given org is the client (via clients.linked_organization_id).
 * Used when the logged-in org is the client so they can see shared load trips in Compare & Verify with the supplier (trip owner).
 * Uses RPC get_trips_where_org_is_client because clients RLS only shows clients in the caller's org; the client row
 * that represents "us" may live in the supplier's org, so we must not rely on reading clients first.
 */
export async function getTripsWhereOrgIsClient(orgId: string): Promise<{
  error: Error | null;
  trips: TripRow[];
}> {
  const { data, error } = await supabase().rpc(
    "get_trips_where_org_is_client",
    {
      p_org_id: orgId,
    },
  );
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: (data ?? []) as TripRow[] };
}

/**
 * Load-based trips where the given org is the supplier (via suppliers.linked_organization_id).
 * Used when the logged-in org is the supplier (Load Hub / Staff Handshake) so they see
 * only shared load trips they supply in Trips Control and can open trip detail.
 */
export async function getTripsWhereOrgIsSupplier(orgId: string): Promise<{
  error: Error | null;
  trips: TripRow[];
}> {
  const { data, error } = await supabase().rpc(
    "get_trips_where_org_is_supplier",
    { p_org_id: orgId },
  );
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: (data ?? []) as TripRow[] };
}

/**
 * For Trips Control when org is the supplier: map trip_id -> shipper (trip owner) display name.
 * So the supplier sees their client (e.g. Mukunt) as "Client", not the end customer (Mukunt's client).
 */
export async function getShipperDisplayNamesForSupplierTrips(
  orgId: string,
): Promise<{
  error: Error | null;
  shipperNameByTripId: Record<string, string>;
}> {
  const { data, error } = await supabase().rpc(
    "get_shipper_display_names_for_supplier_trips",
    { p_org_id: orgId },
  );
  if (error)
    return { error: new Error(error.message), shipperNameByTripId: {} };
  const rows = (data ?? []) as {
    trip_id: string;
    shipper_display_name: string | null;
  }[];
  const shipperNameByTripId: Record<string, string> = {};
  for (const r of rows) {
    if (r?.trip_id)
      shipperNameByTripId[r.trip_id] =
        (r.shipper_display_name ?? "").trim() || "Client";
  }
  return { error: null, shipperNameByTripId };
}

/** Display label for a trip (TRP001-style when present). */
export function getTripDisplayNumber(row: TripRow): string {
  return row.display_trip_id ?? row.trip_number ?? "—";
}

export async function getTripById(
  tripId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data, error } = await supabase()
    .from("trips")
    .select("*, indents(indent_number)")
    .eq("id", tripId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  const raw = data as any;
  const trip: TripRow | null = raw
    ? {
        ...raw,
        indent_number: raw.indents?.indent_number ?? null,
      }
    : null;
  return { error: null, trip };
}

/**
 * Driver rejects/declines an assigned trip.
 *
 * Backend contract: RPC `driver_reject_trip(p_trip_id uuid)` that:
 * - verifies current user owns the assigned driver row
 * - sets trips.driver_id = null (unassign)
 * - records an assignment-audit row so the fleet can see the decline
 */
export async function driverRejectTrip(
  tripId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { error } = await supabase().rpc("driver_reject_trip", {
    p_trip_id: tripId,
  });
  if (error) return { error: new Error(error.message), trip: null };
  // Fetch updated row for local UI consistency (RPC may not return the trip row).
  return await getTripById(tripId);
}

/** Trips assigned to a driver (driver app). RLS must allow driver to SELECT where driver_id = self. */
export async function getTripsByDriver(
  driverId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: TripRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from("trips")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DRIVER_TRIPS_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), trips: [] };
    const raw = (data ?? []) as TripRow[];
    const hasMore = raw.length > limit;
    return { error: null, trips: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: (data ?? []) as TripRow[] };
}

/** Trips assigned to any of the given driver ids (driver app: user may have multiple driver rows across orgs). */
export async function getTripsByDriverIds(
  driverIds: string[],
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: TripRow[]; hasMore?: boolean }> {
  if (driverIds.length === 0) return { error: null, trips: [] };
  const base = () =>
    supabase()
      .from("trips")
      .select("*")
      .in("driver_id", driverIds)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DRIVER_TRIPS_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), trips: [] };
    const raw = (data ?? []) as TripRow[];
    const hasMore = raw.length > limit;
    return { error: null, trips: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: (data ?? []) as TripRow[] };
}

/** Create trip payload. Manual trip: pickup, drop, client, prices. */
export interface CreateTripData {
  /**
   * When set (valid UUID), inserted row uses this id so shared-ledger `reference_id`
   * and local `trips.id` stay aligned (e.g. partner-only / ghost trip sync).
   */
  id?: string;
  pickup_area: string;
  drop_location: string;
  /** From place search; optional. */
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  /** Pre-calculated route distance (km) for `trips.distance` (numeric). */
  distance?: number | null;
  /** Pre-calculated ETA for `trips.estimated_duration` (interval-compatible string). */
  estimated_duration?: string | null;
  client_name: string;
  client_id?: string | null;
  client_price?: number;
  supplier_rate?: number;
  notes?: string | null;
  pickup_date?: string | null;
  supplier_id?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  /** Ad-hoc vehicle number for aggregate trips (when vehicle_id is null). */
  vehicle_display_number?: string | null;
  /** Sequential ID owner (auth.uid). Next TRP001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
}

const ONGOING_TRIP_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "done",
  "delivered",
] as const;

async function getDriverOngoingTrip(
  driverId: string,
  excludeTripId?: string,
): Promise<{
  error: Error | null;
  trip: Pick<TripRow, "id" | "trip_number"> | null;
}> {
  let q = supabase()
    .from("trips")
    // Keep this select compatible with DBs that do not expose display_trip_id yet.
    .select("id, trip_number")
    .eq("driver_id", driverId)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (excludeTripId != null && excludeTripId.trim() !== "") {
    q = q.neq("id", excludeTripId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return {
    error: null,
    trip: (data ?? null) as Pick<TripRow, "id" | "trip_number"> | null,
  };
}

function getTripIdentifierLabel(
  trip: Pick<TripRow, "trip_number"> | null | undefined,
): string {
  return trip?.trip_number ?? "another ongoing trip";
}

export interface DriverAvailabilityByPhoneResult {
  isBusy: boolean;
  driverId: string | null;
  ongoingTripId: string | null;
  ongoingTripLabel: string | null;
}

/**
 * Check if a phone maps to a driver in this org who is already on an ongoing trip.
 * Used as preflight validation for OTP/aggregate assignment flows.
 */
export async function getDriverAvailabilityByPhone(
  orgId: string,
  phone: string,
  opts?: { excludeTripId?: string | null },
): Promise<{ error: Error | null; result: DriverAvailabilityByPhoneResult }> {
  const normalized = (phone ?? "").trim().replace(/\s+/g, "");
  if (!normalized) {
    return {
      error: null,
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const last10 = normalized.replace(/\D/g, "").slice(-10);
  const { data: orgDrivers, error: driverError } = await supabase()
    .from("drivers")
    .select("id, phone")
    .eq("organization_id", orgId)
    .not("phone", "is", null);
  if (driverError) {
    return {
      error: new Error(driverError.message),
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const match = (
    (orgDrivers ?? []) as { id: string; phone: string | null }[]
  ).find((d) => {
    const p = (d.phone ?? "").replace(/\s+/g, "");
    if (!p) return false;
    if (p === normalized) return true;
    if (last10.length < 10) return false;
    return p.replace(/\D/g, "").slice(-10) === last10;
  });
  if (!match) {
    return {
      error: null,
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const { error: ongoingError, trip } = await getDriverOngoingTrip(
    match.id,
    opts?.excludeTripId ?? undefined,
  );
  if (ongoingError) {
    return {
      error: ongoingError,
      result: {
        isBusy: false,
        driverId: match.id,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }
  return {
    error: null,
    result: {
      isBusy: trip != null,
      driverId: match.id,
      ongoingTripId: trip?.id ?? null,
      ongoingTripLabel: trip ? getTripIdentifierLabel(trip) : null,
    },
  };
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function shouldRetryCreateWithFallbackTripNumber(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  const mentionsTripIdentity =
    msg.includes("trip_number") ||
    msg.includes("display_trip_id") ||
    msg.includes("sequence_number");
  const isIdentityGenerationFailure =
    msg.includes("null value") ||
    msg.includes("not-null") ||
    msg.includes("violates not-null constraint");
  const isIdentityConflict =
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    msg.includes("already exists") ||
    msg.includes("conflict");
  const isPgUniqueViolation = code === "23505";
  return (
    isPgUniqueViolation ||
    (mentionsTripIdentity && (isIdentityGenerationFailure || isIdentityConflict))
  );
}

function isTripIdentityUniqueConflict(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  const mentionsTripIdentity =
    msg.includes("trip_number") ||
    msg.includes("display_trip_id") ||
    msg.includes("sequence_number");
  const isIdentityConflict =
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    msg.includes("already exists") ||
    msg.includes("conflict");
  return code === "23505" || (mentionsTripIdentity && isIdentityConflict);
}

function isMissingColumnError(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  // PostgREST/PG can surface missing columns with different codes/messages.
  return (
    code === "42703" ||
    msg.includes("column") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

function buildFallbackTripNumber(): string {
  const stamp = Date.now().toString().slice(-10);
  const rand = Math.floor(Math.random() * 900000 + 100000).toString();
  return `TRP${stamp}${rand}`;
}

function parseTripNumberSequence(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim().toUpperCase();
  const m = /^TRP(\d+)$/.exec(raw);
  if (!m) return null;
  // Ignore legacy/random fallback ids like TRP66831046490792; keep only canonical sequence widths.
  if (m[1].length < 3 || m[1].length > 6) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatTripNumberFromSequence(seq: number): string {
  const safe = Math.max(1, Math.floor(seq));
  const digits = String(safe);
  return `TRP${digits.padStart(Math.max(3, digits.length), "0")}`;
}

function incrementTripNumber(value: string): string {
  const seq = parseTripNumberSequence(value) ?? 0;
  return formatTripNumberFromSequence(seq + 1);
}

async function getNextOrgTripSequence(orgId: string): Promise<number> {
  const seqRes = await supabase()
    .from("trips")
    .select("sequence_number")
    .eq("organization_id", orgId)
    .not("sequence_number", "is", null)
    .order("sequence_number", { ascending: false })
    .limit(1);

  if (
    seqRes.error &&
    !isMissingColumnError(seqRes.error.message, seqRes.error.code)
  ) {
    throw new Error(seqRes.error.message);
  }

  if (!seqRes.error) {
    const seqRow =
      (seqRes.data?.[0] as { sequence_number?: number | null } | undefined) ??
      null;
    const seq = Number(seqRow?.sequence_number ?? 0);
    if (Number.isFinite(seq) && seq > 0) {
      return Math.floor(seq) + 1;
    }
  }

  const tripResWithDisplay = await supabase()
    .from("trips")
    .select("trip_number, display_trip_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  let tripRows: { trip_number?: string | null; display_trip_id?: string | null }[] =
    [];
  if (tripResWithDisplay.error) {
    if (
      !isMissingColumnError(
        tripResWithDisplay.error.message,
        tripResWithDisplay.error.code,
      )
    ) {
      throw new Error(tripResWithDisplay.error.message);
    }
    const tripRes = await supabase()
      .from("trips")
      .select("trip_number")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (tripRes.error) throw new Error(tripRes.error.message);
    tripRows = (tripRes.data ?? []) as { trip_number?: string | null }[];
  } else {
    tripRows = (tripResWithDisplay.data ?? []) as {
      trip_number?: string | null;
      display_trip_id?: string | null;
    }[];
  }

  let maxSeq = 0;
  for (const row of tripRows) {
    const r = row as {
      trip_number?: string | null;
      display_trip_id?: string | null;
    };
    const fromDisplay = parseTripNumberSequence(r.display_trip_id);
    const fromTrip = parseTripNumberSequence(r.trip_number);
    const s = fromDisplay ?? fromTrip;
    if (s != null && s > maxSeq) maxSeq = s;
  }
  return maxSeq + 1;
}

export async function createTrip(
  orgId: string,
  userId: string,
  data: CreateTripData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  if (data.driver_id != null) {
    const { error: conflictCheckError, trip: ongoingTrip } =
      await getDriverOngoingTrip(data.driver_id);
    if (conflictCheckError) return { error: conflictCheckError, trip: null };
    if (ongoingTrip != null) {
      return {
        error: new Error(
          `Driver is already assigned to ${getTripIdentifierLabel(ongoingTrip)}. Complete or unassign that trip first.`,
        ),
        trip: null,
      };
    }
  }

  const clientPrice = Number(data.client_price) || 0;
  const supplierRate = Number(data.supplier_rate) || 0;
  const explicitId =
    data.id && isUuidString(data.id) ? data.id.trim() : undefined;
  const insertData = {
    ...(explicitId ? { id: explicitId } : {}),
    organization_id: orgId,
    owner_user_id: data.owner_user_id ?? null,
    created_by_user_id: data.created_by_user_id ?? null,
    trip_number: null as string | null,
    source: "manual",
    pickup_area: (data.pickup_area ?? "").trim(),
    drop_location: (data.drop_location ?? "").trim(),
    pickup_lat:
      data.pickup_lat != null && Number.isFinite(data.pickup_lat)
        ? data.pickup_lat
        : null,
    pickup_lon:
      data.pickup_lon != null && Number.isFinite(data.pickup_lon)
        ? data.pickup_lon
        : null,
    drop_lat:
      data.drop_lat != null && Number.isFinite(data.drop_lat)
        ? data.drop_lat
        : null,
    drop_lon:
      data.drop_lon != null && Number.isFinite(data.drop_lon)
        ? data.drop_lon
        : null,
    distance:
      data.distance != null && Number.isFinite(data.distance)
        ? data.distance
        : null,
    estimated_duration:
      data.estimated_duration != null ? data.estimated_duration : null,
    client_name: (data.client_name ?? "").trim() || "—",
    client_id: data.client_id ?? null,
    client_price: clientPrice,
    supplier_rate: supplierRate,
    platform_fee: 0,
    driver_commission: 0,
    payment_status: "pending",
    amount_paid: 0,
    status: "assigned",
    notes: (data.notes ?? "").trim() || null,
    pickup_date: data.pickup_date ?? null,
    supplier_id: data.supplier_id ?? null,
    driver_id: data.driver_id ?? null,
    vehicle_id: data.vehicle_id ?? null,
    vehicle_display_number: (data.vehicle_display_number ?? "").trim() || null,
  };
  const { data: row, error } = await supabase()
    .from("trips")
    .insert(insertData as Record<string, unknown>)
    .select()
    .single();
  if (error) {
    if (isTripIdentityUniqueConflict(error.message, error.code)) {
      // Keep sequential IDs DB-generated: retry with trip_number=NULL and let trigger assign next sequence.
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: retryRow, error: retryError } = await supabase()
          .from("trips")
          .insert(insertData as Record<string, unknown>)
          .select()
          .single();
        if (!retryError) return { error: null, trip: retryRow as TripRow };
        lastError = new Error(retryError.message);
        if (!isTripIdentityUniqueConflict(retryError.message, retryError.code)) {
          return { error: lastError, trip: null };
        }
      }
      // Fallback for environments where trigger uses a per-user counter while uniqueness is per-org.
      let candidateSeq = await getNextOrgTripSequence(orgId);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = formatTripNumberFromSequence(candidateSeq);
        const explicitInsertData = {
          ...insertData,
          trip_number: candidate,
          sequence_number: candidateSeq,
          display_trip_id: candidate,
        };
        const { data: explicitRow, error: explicitError } = await supabase()
          .from("trips")
          .insert(explicitInsertData as Record<string, unknown>)
          .select()
          .single();
        if (!explicitError) return { error: null, trip: explicitRow as TripRow };
        if (isMissingColumnError(explicitError.message, explicitError.code)) {
          const minimalInsertData = {
            ...insertData,
            trip_number: candidate,
          };
          const { data: minimalRow, error: minimalError } = await supabase()
            .from("trips")
            .insert(minimalInsertData as Record<string, unknown>)
            .select()
            .single();
          if (!minimalError) return { error: null, trip: minimalRow as TripRow };
          lastError = new Error(minimalError.message);
          if (
            !isTripIdentityUniqueConflict(minimalError.message, minimalError.code)
          ) {
            return { error: lastError, trip: null };
          }
          candidateSeq += 1;
          continue;
        }
        lastError = new Error(explicitError.message);
        if (!isTripIdentityUniqueConflict(explicitError.message, explicitError.code)) {
          return { error: lastError, trip: null };
        }
        candidateSeq += 1;
      }
      return {
        error:
          lastError ??
          new Error("Trip number sequence conflict. Please try again."),
        trip: null,
      };
    }

    if (!shouldRetryCreateWithFallbackTripNumber(error.message, error.code)) {
      return { error: new Error(error.message), trip: null };
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fallbackInsertData = {
        ...insertData,
        trip_number: buildFallbackTripNumber(),
      };
      const { data: retryRow, error: retryError } = await supabase()
        .from("trips")
        .insert(fallbackInsertData as Record<string, unknown>)
        .select()
        .single();
      if (!retryError) return { error: null, trip: retryRow as TripRow };
      lastError = new Error(retryError.message);
      if (!shouldRetryCreateWithFallbackTripNumber(retryError.message, retryError.code)) {
        return { error: lastError, trip: null };
      }
    }
    return {
      error:
        lastError ??
        new Error("Trip creation conflict. Please retry in a moment."),
      trip: null,
    };
  }
  return { error: null, trip: row as TripRow };
}

/** OTP result when creating an aggregate trip (for driver claim-by-OTP flow). */
export interface TripOtpInfo {
  code: string;
  expires_at: string;
}

/**
 * Create trip and, for aggregate trips (supplier_id set), generate OTP and return it.
 * Call this when the add-trip form submits with supply_source === 'aggregate' so the UI can show the OTP.
 * O(1): one insert + one RPC for OTP when aggregate.
 */
export async function createTripWithOtp(
  orgId: string,
  userId: string,
  data: CreateTripData
): Promise<{
  error: Error | null;
  trip: TripRow | null;
  otp: TripOtpInfo | null;
}> {
  const { error, trip } = await createTrip(orgId, userId, data);
  if (error || !trip) return { error: error ?? new Error('No trip returned'), trip: null, otp: null };
  const isAggregate = !!data.supplier_id;
  const hasAssignment =
    !!data.driver_id || !!data.vehicle_id || !!data.vehicle_display_number;
  if (!isAggregate || !hasAssignment) return { error: null, trip, otp: null };

  const { generateTripOtp } =
    await import("@/features/trips/services/tripOtp.service");
  const { error: otpError, code, expires_at } = await generateTripOtp(trip.id);
  if (otpError || !code || !expires_at) {
    return { error: null, trip, otp: null };
  }
  return { error: null, trip, otp: { code, expires_at } };
}

/** Update only driver and/or vehicle assignment (e.g. assign after create). */
export interface UpdateTripAssignmentData {
  driver_id?: string | null;
  vehicle_id?: string | null;
  /** Ad-hoc vehicle number when vehicle_id is null (e.g. aggregate trip). */
  vehicle_display_number?: string | null;
}

export interface UpdateTripSupplierData {
  supplier_id?: string | null;
  supplier_rate?: number;
}

/** Optional audit context for Private Book vs Shared Network (who last assigned). */
export interface UpdateTripAssignmentOptions {
  /** Current user id (profiles.id / auth.uid()). When set, an audit row is written so this trip is "Private" for this user. */
  changedBy?: string | null;
  /** Previous driver_id (for audit prev/new). Required when changedBy is set. */
  driverIdPrev?: string | null;
  /** Previous vehicle_id (for audit prev/new). Required when changedBy is set. */
  vehicleIdPrev?: string | null;
  /** When true, created driver is one-time for aggregate trip tracking; excluded from Drivers tab. */
  trackingOnly?: boolean;
  /** When true (reassignment), ensure driver row is unlinked so trip must be claimed via OTP. */
  forceOtpClaim?: boolean;
}

export async function updateTripAssignment(
  tripId: string,
  data: UpdateTripAssignmentData,
  options?: UpdateTripAssignmentOptions,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  if (data.driver_id != null) {
    const { error: conflictCheckError, trip: ongoingTrip } =
      await getDriverOngoingTrip(data.driver_id, tripId);
    if (conflictCheckError) return { error: conflictCheckError, trip: null };
    if (ongoingTrip != null) {
      return {
        error: new Error(
          `Driver is already assigned to ${getTripIdentifierLabel(ongoingTrip)}. Complete or unassign that trip first.`,
        ),
        trip: null,
      };
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.driver_id !== undefined) updates.driver_id = data.driver_id;
  if (data.vehicle_id !== undefined) updates.vehicle_id = data.vehicle_id;
  if (data.vehicle_display_number !== undefined)
    updates.vehicle_display_number = data.vehicle_display_number;
  // When assigning a driver, set status to 'assigned' so the driver app shows it as incoming.
  if (data.driver_id != null) {
    updates.status = "assigned";
  }
  const { data: row, error } = await supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };

  const updatedTrip = row as TripRow | null;
  if (options?.changedBy != null && updatedTrip) {
    const { insertTripAssignmentAudit } =
      await import("./trip-assignment-audit.service");
    const hadPrev =
      (options.driverIdPrev != null && options.driverIdPrev !== "") ||
      (options.vehicleIdPrev != null && options.vehicleIdPrev !== "");
    const { error: auditError } = await insertTripAssignmentAudit({
      trip_id: tripId,
      event_type: hadPrev ? "reassignment" : "assignment",
      driver_id_prev: options.driverIdPrev ?? null,
      driver_id_new: updatedTrip.driver_id ?? null,
      vehicle_id_prev: options.vehicleIdPrev ?? null,
      vehicle_id_new: updatedTrip.vehicle_id ?? null,
      changed_by: options.changedBy,
    });
    if (auditError && __DEV__) {
      console.warn(
        "[trips] Assignment change log not recorded:",
        auditError.message,
      );
    }
  }

  return { error: null, trip: updatedTrip };
}

/**
 * Update trip supplier link and/or supplier rate.
 * Used when load-based aggregate flow re-assigns the supplying partner at deploy time.
 */
export async function updateTripSupplier(
  tripId: string,
  data: UpdateTripSupplierData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.supplier_id !== undefined) updates.supplier_id = data.supplier_id;
  if (data.supplier_rate !== undefined) {
    const n = Number(data.supplier_rate ?? 0);
    updates.supplier_rate = Number.isFinite(n) ? n : 0;
  }
  const { data: row, error } = await supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: (row ?? null) as TripRow | null };
}

/**
 * Assign a trip to a driver by phone (ensure driver row in org, then set trip.driver_id).
 * Used for aggregate trips or post-create assign-by-phone. O(1).
 */
export async function assignTripDriverByPhone(
  tripId: string,
  orgId: string,
  phone: string,
  options?: UpdateTripAssignmentOptions,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { ensureDriverRowByPhone } =
    await import("@/features/drivers/services/drivers.service");
  const { error: driverError, driver } = await ensureDriverRowByPhone(
    orgId,
    phone,
    undefined,
    {
      trackingOnly: options?.trackingOnly ?? false,
      forceUnlinkedForOtp: options?.forceOtpClaim ?? false,
    },
  );
  if (driverError || !driver)
    return {
      error: driverError ?? new Error("Could not resolve driver"),
      trip: null,
    };
  return updateTripAssignment(tripId, { driver_id: driver.id }, options);
}

/**
 * Assign driver to an aggregate trip by phone via RPC (SECURITY DEFINER).
 * Use this when driverAssignOrgId is set (aggregate flow) so assignment always persists
 * regardless of RLS on drivers/trips.
 */
export async function assignAggregateTripDriverByPhone(
  tripId: string,
  driverOrgId: string,
  phone: string,
  vehicleDisplayNumber?: string | null,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const normalized = (phone ?? "").trim().replace(/\s+/g, "");
  if (!normalized) {
    return { error: new Error("Phone is required"), trip: null };
  }
  const { error: availabilityError, result: availability } =
    await getDriverAvailabilityByPhone(driverOrgId, normalized, {
      excludeTripId: tripId,
    });
  if (availabilityError) return { error: availabilityError, trip: null };
  if (availability.isBusy) {
    return {
      error: new Error(
        `Driver is already assigned to ${availability.ongoingTripLabel ?? "another ongoing trip"}. Complete or unassign that trip first.`,
      ),
      trip: null,
    };
  }

  const trimmedVehicleDisplay =
    vehicleDisplayNumber != null && String(vehicleDisplayNumber).trim() !== ""
      ? String(vehicleDisplayNumber).trim()
      : null;

  const { data, error } = await supabase().rpc("assign_aggregate_trip_driver", {
    p_trip_id: tripId,
    p_driver_org_id: driverOrgId,
    p_driver_phone: normalized,
    p_vehicle_display_number: trimmedVehicleDisplay,
  });
  if (error) {
    const msg = String(error.message ?? "");
    const missingDisplayColumn =
      /column\s+trip_display_trip_id\s+does\s+not\s+exist/i.test(msg) ||
      /trip_display_trip_id/i.test(msg);

    // Backward-compatible fallback for environments with stale RPC definition.
    if (!missingDisplayColumn) return { error: new Error(msg), trip: null };

    const { error: assignError, trip } = await assignTripDriverByPhone(
      tripId,
      driverOrgId,
      normalized,
      {
        trackingOnly: true,
        forceOtpClaim: true,
      },
    );
    if (assignError || !trip) {
      return {
        error:
          assignError ??
          new Error(
            "Assignment failed via RPC and fallback. Please contact support.",
          ),
        trip: null,
      };
    }
    if (trimmedVehicleDisplay) {
      const { error: vehicleError, trip: updatedTrip } = await updateTripAssignment(
        tripId,
        { vehicle_display_number: trimmedVehicleDisplay },
      );
      if (vehicleError) return { error: vehicleError, trip: null };
      return { error: null, trip: updatedTrip ?? trip };
    }
    return { error: null, trip };
  }
  const obj = data as { ok?: boolean; error?: string; trip?: TripRow } | null;
  if (!obj || obj.ok !== true) {
    return {
      error: new Error(obj?.error ?? "Assignment failed"),
      trip: null,
    };
  }
  return { error: null, trip: (obj.trip ?? null) as TripRow | null };
}

/** Trip status values allowed by DB (public.trips.status CHECK). */
const TRIP_STATUS_VALUES = [
  "draft",
  "assigned",
  "in_progress",
  "at_drop",
  "completed",
  "cancelled",
] as const;

/**
 * Returns true when the trip is completed (no reassignment or editing allowed).
 * Uses status (completed/delivered/done) or completed_at for consistency with driver app.
 */
export function isTripCompleted(
  trip: Pick<TripRow, "status" | "completed_at"> | null | undefined,
): boolean {
  if (!trip) return false;
  const s = (trip.status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") return true;
  return trip.completed_at != null && String(trip.completed_at).trim() !== "";
}

/**
 * Update trip status and optional timestamps (driver app: assigned → in_progress → completed).
 * Only DB-allowed status values are accepted. RLS "Drivers can update own trips" allows driver to UPDATE.
 */
export interface UpdateTripStatusData {
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export async function updateTripStatus(
  tripId: string,
  data: UpdateTripStatusData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const status = (data.status ?? "").trim().toLowerCase();
  if (
    !TRIP_STATUS_VALUES.includes(status as (typeof TRIP_STATUS_VALUES)[number])
  ) {
    return {
      error: new Error(
        `Invalid trip status "${data.status}". Allowed: ${TRIP_STATUS_VALUES.join(", ")}`,
      ),
      trip: null,
    };
  }
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    status,
  };
  if (data.started_at !== undefined)
    updates.started_at = data.started_at ?? null;
  if (data.completed_at !== undefined)
    updates.completed_at = data.completed_at ?? null;
  const { data: row, error } = await supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  if (row == null) {
    return {
      error: new Error(
        'Trip could not be updated. You may not have permission to update this trip, or the trip was not found. Ensure the "Drivers can update own trips" RLS policy is applied (run migrations).',
      ),
      trip: null,
    };
  }
  return { error: null, trip: row as TripRow };
}

export interface TripDriverOnlineState {
  isOnline: boolean;
  lastSeen: string | null;
}

/**
 * Returns driver online/offline state for a trip using latest driver location timestamp.
 * Backend is authoritative (SECURITY DEFINER) and uses org membership to authorize reads.
 */
export async function getTripDriverOnlineState(
  tripId: string,
  offlineAfterSeconds = 90,
): Promise<{ error: Error | null; state: TripDriverOnlineState | null }> {
  const { data, error } = await supabase().rpc("get_trip_driver_online_state", {
    p_trip_id: tripId,
    p_offline_after_seconds: offlineAfterSeconds,
  });
  if (error) return { error: new Error(error.message), state: null };

  // PostgREST returns set-returning functions as arrays
  const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  if (!row) return { error: null, state: { isOnline: false, lastSeen: null } };

  const obj = row as { is_online?: boolean; last_seen?: string | null };
  return {
    error: null,
    state: {
      isOnline: obj.is_online === true,
      lastSeen: obj.last_seen ?? null,
    },
  };
}

export type ManualAdvanceTripAction =
  | "confirm_arrival"
  | "start_transit"
  | "reach_drop"
  | "complete";

/**
 * Creator-only manual trip progression while driver is offline.
 * Uses optimistic revisioning + idempotency on the backend.
 */
export async function manualAdvanceTrip(
  tripId: string,
  params: {
    action: ManualAdvanceTripAction;
    expectedRevision: number;
    idempotencyKey: string;
  },
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data, error } = await supabase().rpc("manual_advance_trip", {
    p_trip_id: tripId,
    p_action: params.action,
    p_expected_revision: params.expectedRevision,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: (data ?? null) as TripRow | null };
}

/**
 * Claim trip creator for legacy trips where `created_by` is null.
 * Backend enforces: caller must be org member; only first claimant wins.
 */
export async function claimTripCreator(
  tripId: string,
): Promise<{ error: Error | null; createdBy: string | null }> {
  const { data, error } = await supabase().rpc("claim_trip_creator", {
    p_trip_id: tripId,
  });
  if (error) return { error: new Error(error.message), createdBy: null };
  const obj = data as {
    ok?: boolean;
    error?: string;
    created_by?: string;
  } | null;
  if (!obj || obj.ok !== true) {
    return {
      error: new Error(obj?.error ?? "Could not claim creator"),
      createdBy: null,
    };
  }
  return { error: null, createdBy: obj.created_by ?? null };
}

/** Update client payment received (amount_paid). */
export interface UpdateTripPaymentData {
  amount_paid: number;
}

export async function updateTripPayment(
  tripId: string,
  data: UpdateTripPaymentData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const amountPaid = Math.max(0, Number(data.amount_paid) ?? 0);
  const { data: row, error } = await supabase()
    .from("trips")
    .update({
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: row as TripRow | null };
}

/**
 * Returns the set of driver_ids that are currently assigned to a non-completed,
 * non-cancelled trip for the given organization. Used to prevent double-assignment
 * of a driver who is already active in another trip.
 */
export async function getActiveDriverIds(orgId: string): Promise<Set<string>> {
  const { data } = await supabase()
    .from("trips")
    .select("driver_id")
    .eq("organization_id", orgId)
    .not("driver_id", "is", null)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`);

  const ids = new Set<string>();
  (data ?? []).forEach((row: { driver_id: string | null }) => {
    if (row.driver_id) ids.add(row.driver_id);
  });
  return ids;
}
