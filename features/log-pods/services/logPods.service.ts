/**
 * Log incoming PODs — Supabase operations aligned with cashflow LogIncomingPodsPage.
 * Same DB as pulse-unified-base; RLS applies.
 */
import {
    getTripsWhereOrgIsClient,
    getTripsWhereOrgIsSupplier,
    getShipperDisplayNamesForSupplierTrips,
    supplierRowToTripRow,
    type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import { supabase } from "@/lib/supabase";
import {
  loadLrPodIndexByTripIds,
  receivedLrNumbersForTrip,
  tripPodIsReceived,
  type TripLrPodIndex,
} from "@/features/trips/services/tripDocumentLrPod.service";

export interface LogPodsTripView {
  /** User-facing trip id. */
  id: string;
  internal_id: string;
  client: string;
  supplier_name: string;
  from: string;
  to: string;
  amount: number | null;
  status: string;
  lrNumbers: string[];
  receivedLRs: string[];
  date: string;
}

export type CourierPartnerRow = {
  label: string;
  value: string;
  category: string;
  active?: boolean | null;
  is_custom?: boolean | null;
};

type TripRecord = Pick<
  TripRow,
  | "id"
  | "organization_id"
  | "trip_operational_code"
  | "trip_code"
  | "display_trip_id"
  | "trip_number"
  | "client_name"
  | "client_price"
  | "supplier_id"
  | "supplier_name"
  | "status"
  | "pickup_date"
  | "pickup_area"
  | "drop_location"
  | "notes"
  | "created_at"
  | "booking_ref"
> & {
  // Live trips columns used for POD list (cashflow lr_no / pod_status are retired).
  pod_received_at?: string | null;
  pod_required?: boolean | null;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Public trip id for list rows (operational code, else uuid). */
export function getTripStringId(row: TripRecord): string {
  const r = row as {
    trip_operational_code?: string;
    trip_code?: string;
    trip_id?: string;
    display_trip_id?: string;
    trip_number?: string;
    id?: string;
  };
  const operationalRef = getTripOperationalDisplay({
    trip_operational_code: r.trip_operational_code ?? null,
    trip_code: r.trip_code ?? null,
    display_trip_id: r.display_trip_id ?? null,
    trip_number: r.trip_number ?? null,
  });
  return str(operationalRef !== "—" ? operationalRef : r.trip_id || r.id);
}

function mergeTripsById(lists: TripRecord[][]): TripRecord[] {
  const map = new Map<string, TripRecord>();
  for (const list of lists) {
    for (const t of list) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
  }
  return [...map.values()];
}

function passesLogPodsRow(t: TripRecord): boolean {
  return !tripPodIsReceived({
    pod_received_at: t.pod_received_at ?? null,
    pod_status: (t as { pod_status?: string | null }).pod_status,
  });
}

function mapRowToView(
  t: TripRecord,
  lrByTripId: Map<string, TripLrPodIndex>,
  shipperNameByTripId: Record<string, string>,
  supplierNameById: Map<string, string>,
): LogPodsTripView {
  const tripKey = getTripStringId(t);
  const internalId = str(t.id);
  const docs = lrByTripId.get(internalId);
  const allLrNumbers = docs?.lrNumbers ?? [];
  const tripReceived = tripPodIsReceived({
    pod_received_at: t.pod_received_at ?? null,
    pod_status: (t as { pod_status?: string | null }).pod_status,
  });
  const finalReceived = receivedLrNumbersForTrip(allLrNumbers, {
    tripReceived,
    hasPodDocument: docs?.hasPodDocument ?? false,
  });

  const tripDate =
    (t as { trip_date?: string | null }).trip_date ??
    (t as { pickup_date?: string | null }).pickup_date;
  const dateLabel = tripDate
    ? new Date(tripDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";

  const from =
    str((t as { pp_location?: string | null }).pp_location) ||
    str((t as { pickup_area?: string | null }).pickup_area) ||
    "Unknown";
  const to =
    str((t as { drop_point?: string | null }).drop_point) ||
    str((t as { drop_location?: string | null }).drop_location) ||
    "Unknown";

  return {
    id: tripKey,
    internal_id: str(t.id),
    client: shipperNameByTripId[internalId] || str((t as { client_name?: string | null }).client_name) || "—",
    supplier_name:
      supplierNameById.get(str((t as { supplier_id?: string | null }).supplier_id)) ||
      str((t as { vendor_name?: string | null }).vendor_name) ||
      str((t as { supplier_name?: string | null }).supplier_name) ||
      "Unknown Supplier",
    from,
    to,
    amount:
      num((t as { total_client_value?: unknown }).total_client_value) ??
      num((t as { client_price?: unknown }).client_price),
    status:
      str((t as { trip_status?: string | null }).trip_status) ||
      str((t as { status?: string | null }).status) ||
      "—",
    lrNumbers: Array.from(new Set(allLrNumbers)),
    receivedLRs: finalReceived,
    date: dateLabel,
  };
}

export async function fetchTripsForLogPods(
  orgId: string,
): Promise<{ error: Error | null; trips: LogPodsTripView[] }> {
  try {
    const [ownerRes, supRes, cliRes, shipperNamesRes] = await Promise.all([
      supabase()
        .from("trips")
        .select(
          "id, organization_id, trip_operational_code, trip_code, display_trip_id, trip_number, supplier_id, supplier_name, client_name, client_price, status, pickup_date, pickup_area, drop_location, created_at, pod_received_at, pod_required, notes, booking_ref",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3000),
      getTripsWhereOrgIsSupplier(orgId),
      getTripsWhereOrgIsClient(orgId),
      getShipperDisplayNamesForSupplierTrips(orgId),
    ]);

    if (ownerRes.error)
      return { error: new Error(ownerRes.error.message), trips: [] };
    if (supRes.error) return { error: supRes.error, trips: [] };
    if (cliRes.error) return { error: cliRes.error, trips: [] };

    const ownerRows = (ownerRes.data ?? []) as TripRecord[];
    const supRows = (supRes.trips ?? []).map(supplierRowToTripRow) as TripRecord[];
    const cliRows = (cliRes.trips ?? []) as TripRecord[];
    const shipperNameByTripId = shipperNamesRes.shipperNameByTripId ?? {};

    const merged = mergeTripsById([ownerRows, supRows, cliRows]).filter(
      passesLogPodsRow,
    );

    const internalIds = merged.map(t => str(t.id)).filter(Boolean);
    const supplierIds = Array.from(new Set(merged.map(t => str((t as {supplier_id?: string | null}).supplier_id)).filter(Boolean)));

    let lrByTripId = new Map<string, TripLrPodIndex>();
    let supplierNameById = new Map<string, string>();

    if (supplierIds.length > 0) {
      const { data: supData, error: supErr } = await supabase()
        .from("suppliers")
        .select("id, name, company_name")
        .in("id", supplierIds);
      
      if (supErr) {
        console.warn("[logPods] suppliers fetch:", supErr.message);
      } else {
        for (const row of supData ?? []) {
          if (row.id) {
            supplierNameById.set(row.id, str(row.name || row.company_name));
          }
        }
      }
    }

    if (internalIds.length > 0) {
      lrByTripId = await loadLrPodIndexByTripIds(internalIds);
    }

    const views = merged.map((t) => mapRowToView(t, lrByTripId, shipperNameByTripId, supplierNameById));
    return { error: null, trips: views };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: [] };
  }
}

export async function syncLogPodsTripsWithCache(
  orgId: string,
  currentRows: LogPodsTripView[],
): Promise<{ error: Error | null; trips: LogPodsTripView[] }> {
  try {
    const trips = await syncDomainRows<LogPodsTripView>({
      domain: "log-pods",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await fetchTripsForLogPods(orgId);
        if (res.error) throw res.error;
        return res.trips;
      },
      getDelta: async () => {
        const res = await fetchTripsForLogPods(orgId);
        if (res.error) throw res.error;
        return {
          changed: res.trips,
          deletedIds: [],
          nextCursor: { updatedAt: new Date().toISOString() },
        };
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) => b.date.localeCompare(a.date),
        }),
    });
    return { error: null, trips };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: currentRows };
  }
}

export async function fetchCourierPartners(): Promise<{
  error: Error | null;
  partners: CourierPartnerRow[];
}> {
  const { data, error } = await supabase()
    .from("courier_partners")
    .select("label, value, category, active, is_custom")
    .eq("active", true)
    .order("label", { ascending: true });

  if (error) return { error: new Error(error.message), partners: [] };
  return { error: null, partners: (data ?? []) as CourierPartnerRow[] };
}

export interface MappedPodAttachment {
  trip_id: string;
  lr_number: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export interface LogPodsPayload {
  selectedLRs: Record<string, string[]>;
  allTrips: LogPodsTripView[];
  courierValue: string;
  customCourierName: string;
  trackingId: string;
  dbCourierPartners: CourierPartnerRow[];
  mappedAttachments: MappedPodAttachment[];
}

export async function ensureCustomCourierPartner(
  courierValue: string,
  customCourierName: string,
): Promise<{ error: Error | null; partner: CourierPartnerRow | null }> {
  if (courierValue !== "custom" || !customCourierName.trim())
    return { error: null, partner: null };
  const value = customCourierName.toLowerCase().replace(/\s+/g, "_");
  const { data: existing, error: existingErr } = await supabase()
    .from("courier_partners")
    .select("label, value, category, active, is_custom")
    .eq("value", value)
    .maybeSingle();

  if (existingErr) return { error: new Error(existingErr.message), partner: null };
  if (existing) return { error: null, partner: existing as CourierPartnerRow };

  const partnerData = {
    label: customCourierName.trim(),
    value,
    category: "other",
    is_custom: true,
  };

  const { error } = await supabase().from("courier_partners").insert(partnerData);

  if (error) return { error: new Error(error.message), partner: null };
  return { error: null, partner: partnerData as CourierPartnerRow };
}

function resolveCourierName(
  courierValue: string,
  customCourierName: string,
  partners: CourierPartnerRow[],
): string {
  const selected = partners.find((cp) => cp.value === courierValue);
  if (courierValue === "custom") return customCourierName.trim();
  return selected?.label || courierValue;
}

/** Executes POD logging: trip_documents already hold files; trips.pod_received_at is trip-level state. */
export async function executeLogIncomingPods(payload: LogPodsPayload): Promise<{
  error: Error | null;
  attachmentWarning?: string;
}> {
  const {
    selectedLRs,
    courierValue,
    customCourierName,
    trackingId,
    dbCourierPartners,
    mappedAttachments,
  } = payload;

  const finalCourierName = resolveCourierName(
    courierValue,
    customCourierName,
    dbCourierPartners,
  );

  const customErr = await ensureCustomCourierPartner(
    courierValue,
    customCourierName,
  );
  if (customErr.error) return { error: customErr.error };

  const receivedAt = new Date().toISOString();
  const tripIds = Object.entries(selectedLRs)
    .filter(([, lrs]) => lrs.length > 0)
    .map(([tripInternalId]) => tripInternalId);

  const tripResults = await Promise.all(
    tripIds.map(async (internalId) => {
      const { error } = await supabase()
        .from("trips")
        .update({ pod_received_at: receivedAt })
        .eq("id", internalId);
      if (error) {
        console.error("[logPods] trips.pod_received_at update:", error);
        return error;
      }
      return null;
    }),
  );
  const tripUpdateError = tripResults.find((err) => err != null);
  if (tripUpdateError) {
    return { error: new Error(tripUpdateError.message) };
  }

  await Promise.all(
    Object.entries(selectedLRs)
      .filter(([, lrs]) => lrs.length > 0)
      .map(async ([tripInternalId, lrs]) => {
        const attCount = mappedAttachments.filter(
          (a) => a.trip_id === tripInternalId,
        ).length;
        const { error } = await supabase().rpc("log_activity", {
          p_action: "POD_LOGGED",
          p_entity_type: "trip",
          p_entity_id: tripInternalId,
          p_details: {
            lr_numbers: lrs.filter((lr) => lr !== "N/A"),
            courier_name: finalCourierName,
            tracking_id: trackingId || null,
            attachment_count: attCount,
          },
        });
        if (error) console.warn("[logPods] log_activity:", error.message);
      }),
  );

  return { error: null };
}
