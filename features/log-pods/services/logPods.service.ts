/**
 * Log incoming PODs — Supabase operations aligned with cashflow LogIncomingPodsPage.
 * Same DB as pulse-unified-base; RLS applies.
 */
import {
    getTripsWhereOrgIsClient,
    getTripsWhereOrgIsSupplier,
    getShipperDisplayNamesForSupplierTrips,
    type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import { supabase } from "@/lib/supabase";
import { expandLR } from "@/lib/utils/lr";

export interface LogPodsTripView {
  /** User-facing trip id (trip_lrs.trip_id). */
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

type TripRecord = TripRow & Record<string, unknown>;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Public trip id for trip_lrs and trip_pods (cashflow uses trips.trip_id). */
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

function passesPodPendingFilter(podStatus: string): boolean {
  const p = podStatus.toLowerCase();
  return (
    p.includes("pending") ||
    p.includes("i-bond") ||
    p.includes("partial") ||
    p === ""
  );
}

function passesLogPodsRow(t: TripRecord): boolean {
  const invoiceNo = (t as { invoice_no?: string | null }).invoice_no;
  if (invoiceNo != null && String(invoiceNo).trim() !== "") return false;

  const inv2 = str(
    (t as { invoice_status_2?: string | null }).invoice_status_2,
  ).toLowerCase();
  const hasInv2 =
    (t as { invoice_status_2?: string | null }).invoice_status_2 != null;
  if (hasInv2 && !inv2.includes("unbilled")) return false;

  const podStatus = str((t as { pod_status?: string | null }).pod_status);
  return passesPodPendingFilter(podStatus);
}

function mapRowToView(
  t: TripRecord,
  lrByTripId: Map<string, TripLrRow[]>,
  shipperNameByTripId: Record<string, string>,
  supplierNameById: Map<string, string>,
): LogPodsTripView {
  const tripKey = getTripStringId(t);
  const internalId = str(t.id);
  const lrs = lrByTripId.get(internalId) ?? [];

  const lrNo = str((t as { lr_no?: string | null }).lr_no);
  const allLrNumbers =
    lrs.length > 0
      ? Array.from(new Set(lrs.flatMap((lr) => expandLR(str(lr.lr_number)))))
      : lrNo
        ? expandLR(lrNo)
        : [];

  const receivedLRs = Array.from(
    new Set(
      lrs
        .filter(
          (lr) =>
            lr.pod_received === true ||
            str(lr.pod_status).toLowerCase() === "received",
        )
        .flatMap((lr) => expandLR(str(lr.lr_number))),
    ),
  );

  let finalReceived = receivedLRs;
  if (
    lrs.length === 0 &&
    str((t as { pod_status?: string | null }).pod_status).toLowerCase() ===
      "received" &&
    allLrNumbers.length > 0
  ) {
    finalReceived = allLrNumbers;
  }

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

type TripLrRow = {
  trip_id: string;
  lr_number: string;
  pod_received?: boolean | null;
  pod_status?: string | null;
};

export async function fetchTripsForLogPods(
  orgId: string,
): Promise<{ error: Error | null; trips: LogPodsTripView[] }> {
  try {
    const [ownerRes, supRes, cliRes, shipperNamesRes] = await Promise.all([
      supabase()
        .from("trips")
        .select("*")
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
    const supRows = (supRes.trips ?? []) as TripRecord[];
    const cliRows = (cliRes.trips ?? []) as TripRecord[];
    const shipperNameByTripId = shipperNamesRes.shipperNameByTripId ?? {};

    const merged = mergeTripsById([ownerRows, supRows, cliRows]).filter(
      passesLogPodsRow,
    );

    const internalIds = merged.map(t => str(t.id)).filter(Boolean);
    const supplierIds = Array.from(new Set(merged.map(t => str((t as {supplier_id?: string | null}).supplier_id)).filter(Boolean)));

    let lrByTripId = new Map<string, TripLrRow[]>();
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
      const { data: lrData, error: lrErr } = await supabase()
        .from("trip_lrs")
        .select("trip_id, lr_number, pod_received, pod_status")
        .in("trip_id", internalIds);

      if (lrErr) {
        console.warn("[logPods] trip_lrs fetch:", lrErr.message);
      } else {
        lrByTripId = new Map();
        for (const row of lrData ?? []) {
          const tid = str((row as TripLrRow).trip_id);
          if (!tid) continue;
          const list = lrByTripId.get(tid) ?? [];
          list.push(row as TripLrRow);
          lrByTripId.set(tid, list);
        }
      }
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

/** Executes POD logging (trip_pods, trip_lrs, trips, pod_attachments) and activity RPC. */
export async function executeLogIncomingPods(payload: LogPodsPayload): Promise<{
  error: Error | null;
  attachmentWarning?: string;
}> {
  const {
    selectedLRs,
    allTrips,
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

  const podInserts: {
    trip_id: string;
    lr_number: string;
    courier_name: string;
    tracking_id: string;
  }[] = [];

  const lrUpdates: { trip_id: string; lr_number: string }[] = [];

  for (const [tripInternalId, lrs] of Object.entries(selectedLRs)) {
    if (lrs.length === 0) continue;
    const trip = allTrips.find((t) => t.internal_id === tripInternalId);
    const internalId = trip?.internal_id;
    // Note: trip_lrs.trip_id is the internal UUID (not the string sequence)
    // we need to use trip.internal_id for these updates!

    for (const lr of lrs) {
      podInserts.push({
        trip_id: internalId as string,
        lr_number: lr === "N/A" ? null : lr,
        courier_name: finalCourierName,
        tracking_id: trackingId,
      } as any);
      if (lr !== "N/A") {
        lrUpdates.push({ trip_id: internalId as string, lr_number: lr });
      }
    }

    if (internalId) {
      const { data: allLrsForTrip } = await supabase()
        .from("trip_lrs")
        .select("pod_received, lr_number")
        .eq("trip_id", internalId);

      const totalLrs = allLrsForTrip?.length ?? 0;
      const currentlyReceived =
        allLrsForTrip?.filter((l) => l.pod_received).length ?? 0;
      const newlyReceived = lrs.filter((lr) => lr !== "N/A").length;
      const finalReceivedCount = currentlyReceived + newlyReceived;
      const newStatus =
        totalLrs === 0 || finalReceivedCount >= totalLrs
          ? "Received"
          : "Partial";

      await supabase()
        .from("trips")
        .update({
          pod_status: newStatus,
          pod_received_date: new Date().toISOString().split("T")[0],
          invoice_status_1: "Received-Awaiting Validation",
        })
        .eq("id", internalId);
    }
  }

  const attachmentInserts = mappedAttachments.map(
    (att) => {
      const trip = allTrips.find(t => t.internal_id === att.trip_id); // the modal will return tripInternalId since we mapped them
      return {
        trip_id: att.trip_id,
        lr_number: att.lr_number === "N/A" ? null : att.lr_number,
        file_path: att.file_path,
        file_name: att.file_name,
        file_size: att.file_size,
        file_type: att.file_type,
      } as any;
    },
  );

  if (podInserts.length > 0) {
    const { error } = await supabase().from("trip_pods").insert(podInserts);
    if (error) console.error("[logPods] trip_pods insert:", error);
  }

  let attachmentWarning: string | undefined;
  if (attachmentInserts.length > 0) {
    const { error } = await supabase()
      .from("pod_attachments")
      .insert(attachmentInserts);
    if (error) {
      console.error("[logPods] pod_attachments insert:", error);
      attachmentWarning = "POD logged, but attachment records failed to save.";
    }
  }

  for (const update of lrUpdates) {
    const { error } = await supabase()
      .from("trip_lrs")
      .update({
        status: "delivered",
        pod_received: true,
        pod_status: "Received",
        invoice_status: "Received-Awaiting Validation",
      })
      .eq("trip_id", update.trip_id)
      .eq("lr_number", update.lr_number);

    if (error) console.error("[logPods] trip_lrs update:", error);
  }

  for (const [tripInternalId, lrs] of Object.entries(selectedLRs)) {
    if (lrs.length === 0) continue;
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
  }

  return attachmentWarning
    ? { error: null, attachmentWarning }
    : { error: null };
}
