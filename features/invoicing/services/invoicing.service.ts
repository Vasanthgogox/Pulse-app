/**
 * Invoicing execute service — maps to cashflow InvoicingCenter / api.ts.
 * Same DB as pulse-unified-base; RLS applies.
 */
import {
  getTripsWhereOrgIsSupplier,
  supplierRowToTripRow,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import {
  computePodReconciliationSummaryFromTrips,
  mergeTripsForPodOrg,
} from "@/features/pod-reconciliation/services/podReconciliationService";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import { supabase } from "@/lib/supabase";
import { recordTripWorkflowEvent } from "@/features/trips/services/tripWorkflow.service";

export type TripStatus =
  | "approved"
  | "received"
  | "pending"
  | "warning"
  | "blocked";

export interface TripChecks {
  poMatch: boolean;
  idConfirmed: boolean;
  podReceived: boolean;
}

export interface InvoicingTripView {
  id: string;
  internal_id: string;
  client: string;
  supplier_name: string;
  route: string;
  date: string;
  amount: number;
  status: TripStatus;
  details: string;
  checks: TripChecks;
}

export interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
  tripId?: string;
}

export interface InvoiceConfig {
  includeGst: boolean;
  gstRate: number;
  includeFuel: boolean;
  fuelRate: number;
  additionalCharges: AdditionalCharge[];
}

export interface PodReconciliationSummary {
  pod_pending_count: number;
  pod_pending_sum: number;
  received_count: number;
  received_sum: number;
  approved_count: number;
  approved_sum: number;
  invoiced_count: number;
  invoiced_sum: number;
}

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
  // DB columns not in TripRow (accessed via dynamic cast in mapping functions)
  trip_id?: string | null;
  lr_no?: string | null;
  pod_status?: string | null;
  invoice_no?: string | null;
  invoice_status_1?: string | null;
  vendor_name?: string | null;
  total_client_value?: number | null;
  trip_status?: string | null;
  trip_date?: string | null;
  pp_location?: string | null;
  drop_point?: string | null;
  remarks?: string | null;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function resolveSupplierName(
  row: TripRecord,
  supplierNameById?: Map<string, string>,
): string {
  const supplierId = str((row as { supplier_id?: string | null }).supplier_id);
  const byId = supplierId ? str(supplierNameById?.get(supplierId)) : "";
  return (
    byId ||
    str((row as { vendor_name?: string | null }).vendor_name) ||
    str((row as { supplier_name?: string | null }).supplier_name) ||
    "Unknown Supplier"
  );
}

export function getTripStringId(row: TripRecord): string {
  const r = row as {
    booking_ref?: string | null;
    trip_operational_code?: string;
    trip_code?: string;
    trip_id?: string;
    display_trip_id?: string;
    trip_number?: string;
    id?: string;
  };
  if (r.booking_ref?.trim()) return r.booking_ref.trim();
  const operationalRef = getTripOperationalDisplay({
    trip_operational_code: r.trip_operational_code ?? null,
    trip_code: r.trip_code ?? null,
    display_trip_id: r.display_trip_id ?? null,
    trip_number: r.trip_number ?? null,
  });
  return str(operationalRef !== "—" ? operationalRef : r.trip_id || r.id);
}

function passesInvoicingFilter(t: TripRecord): boolean {
  const invoiceNo = str((t as { invoice_no?: string | null }).invoice_no);
  if (invoiceNo.trim() !== "") return false;

  const inv1 = str(
    (t as { invoice_status_1?: string | null }).invoice_status_1,
  ).toLowerCase();
  if (inv1.includes("raised")) return false;

  return true;
}

function mapRowToView(
  row: TripRecord,
  supplierNameById?: Map<string, string>,
): InvoicingTripView {
  const podStatus = str(
    (row as { pod_status?: string | null }).pod_status,
  ).toLowerCase();
  const invStatus1 = str(
    (row as { invoice_status_1?: string | null }).invoice_status_1,
  ).toLowerCase();

  const isPodReceived = podStatus === "received";
  const isApproved =
    isPodReceived &&
    (invStatus1.includes("pending") || invStatus1.includes("data shared"));
  const isReceivedOnly = isPodReceived && !isApproved;
  const isPending =
    podStatus.includes("pending") ||
    podStatus.includes("i-bond") ||
    podStatus === "" ||
    podStatus === "partial";

  let status: TripStatus = "pending";
  if (isApproved) status = "approved";
  else if (isReceivedOnly) status = "received";
  else if (isPending) status = "pending";

  const tripDate = str(
    (row as { trip_date?: string | null }).trip_date ??
      (row as { pickup_date?: string | null }).pickup_date,
  );

  const ppLocation = str(
    (row as { pp_location?: string | null }).pp_location ??
      (row as { pickup_area?: string | null }).pickup_area,
  );
  const dropPoint = str(
    (row as { drop_point?: string | null }).drop_point ??
      (row as { drop_location?: string | null }).drop_location,
  );
  const route = `${ppLocation || "Unknown"} ➔ ${dropPoint || "Unknown"}`;

  return {
    internal_id: str(row.id),
    id: getTripStringId(row),
    client: str((row as { client_name?: string | null }).client_name) || "—",
    supplier_name: resolveSupplierName(row, supplierNameById),
    route,
    date: tripDate,
    amount:
      num((row as { total_client_value?: unknown }).total_client_value) ||
      num((row as { client_price?: unknown }).client_price) ||
      0,
    status,
    details:
      str((row as { remarks?: string | null }).remarks) ||
      str((row as { notes?: string | null }).notes),
    checks: {
      poMatch: true,
      idConfirmed: true,
      podReceived: isPodReceived,
    },
  };
}

export async function fetchInvoicingTrips(
  orgId: string,
): Promise<{ error: Error | null; trips: InvoicingTripView[] }> {
  try {
    const [ownerRes, supRes] = await Promise.all([
      supabase()
        .from("trips")
        .select(
          "id, organization_id, trip_operational_code, trip_code, display_trip_id, trip_number, trip_id, booking_ref, lr_no, pod_status, invoice_no, invoice_status_1, supplier_id, vendor_name, supplier_name, client_name, total_client_value, client_price, trip_status, status, trip_date, pickup_date, pp_location, pickup_area, drop_point, drop_location, remarks, notes, created_at",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3000),
      getTripsWhereOrgIsSupplier(orgId),
    ]);

    if (ownerRes.error)
      return { error: new Error(ownerRes.error.message), trips: [] };
    if (supRes.error) return { error: supRes.error, trips: [] };

    const ownerRows = (ownerRes.data ?? []) as TripRecord[];
    const supRows = (supRes.trips ?? []).map(supplierRowToTripRow) as TripRecord[];

    const map = new Map<string, TripRecord>();
    for (const t of [...ownerRows, ...supRows]) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
    const merged = Array.from(map.values()).filter(passesInvoicingFilter);

    const supplierIds = Array.from(
      new Set(
        merged
          .map((trip) =>
            str((trip as { supplier_id?: string | null }).supplier_id),
          )
          .filter(Boolean),
      ),
    );
    const supplierNameById = new Map<string, string>();

    if (supplierIds.length > 0) {
      const { data: supData } = await supabase()
        .from("suppliers")
        .select("id, name, company_name")
        .in("id", supplierIds);

      for (const s of supData ?? []) {
        const id = str((s as { id?: string | null }).id);
        if (!id) continue;
        const name =
          str((s as { name?: string | null }).name) ||
          str((s as { company_name?: string | null }).company_name);
        if (name) supplierNameById.set(id, name);
      }
    }

    const views = merged.map((row) => mapRowToView(row, supplierNameById));
    return { error: null, trips: views };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: [] };
  }
}

export async function syncInvoicingTripsWithCache(
  orgId: string,
  currentRows: InvoicingTripView[],
): Promise<{ error: Error | null; trips: InvoicingTripView[] }> {
  try {
    const trips = await syncDomainRows<InvoicingTripView>({
      domain: "invoicing",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await fetchInvoicingTrips(orgId);
        if (res.error) throw res.error;
        return res.trips;
      },
      getDelta: async () => {
        const res = await fetchInvoicingTrips(orgId);
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

export async function fetchPodReconciliationSummary(
  organizationId?: string | null,
): Promise<{
  error: Error | null;
  summary: PodReconciliationSummary | null;
}> {
  try {
    if (!organizationId) {
      return { error: null, summary: null };
    }
    const { error, trips } = await mergeTripsForPodOrg(organizationId);
    if (error) throw error;
    const s = computePodReconciliationSummaryFromTrips(trips);
    return {
      error: null,
      summary: {
        pod_pending_count: s.pod_pending_count,
        pod_pending_sum: s.pod_pending_sum,
        received_count: s.received_count,
        received_sum: s.received_sum,
        approved_count: s.approved_count,
        approved_sum: s.approved_sum,
        invoiced_count: s.invoiced_count,
        invoiced_sum: s.invoiced_sum,
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      summary: null,
    };
  }
}

export interface InvoicePayload {
  invoiceNo?: string;
  [key: string]: unknown;
}

export async function executeInvoiceCreation(
  internalIds: string[],
  payload?: InvoicePayload,
): Promise<{ error: Error | null }> {
  try {
    const sanitizedIds = Array.from(new Set(internalIds.filter(Boolean)));
    if (sanitizedIds.length === 0) {
      throw new Error("No approved trips selected for invoice issuance.");
    }

    const { data: candidates, error: candidateError } = await supabase()
      .from("trips")
      .select("id, organization_id, trip_number, display_trip_id, pod_status, invoice_status_1, invoice_no")
      .in("id", sanitizedIds);

    if (candidateError) throw candidateError;

    const rows = (candidates ?? []) as unknown as TripRecord[];
    const nonInvoiceable = rows.filter((row) => {
      const podStatus = str((row as { pod_status?: string | null }).pod_status).toLowerCase();
      const inv1 = str((row as { invoice_status_1?: string | null }).invoice_status_1).toLowerCase();
      const invoiceNo = str((row as { invoice_no?: string | null }).invoice_no);
      const approved =
        podStatus === "received" &&
        (inv1.includes("pending") || inv1.includes("data shared"));
      const alreadyRaised = inv1.includes("raised") || invoiceNo.trim() !== "";
      return !approved || alreadyRaised;
    });

    if (rows.length !== sanitizedIds.length || nonInvoiceable.length > 0) {
      const blockedIds = nonInvoiceable
        .map((row) => getTripStringId(row))
        .filter(Boolean);
      throw new Error(
        blockedIds.length > 0
          ? `Only approved trips can be issued. Not invoiceable: ${blockedIds.join(", ")}`
          : "Some selected trips are no longer available for invoicing. Please refresh.",
      );
    }

    // Use atomic DB sequence for GST-compliant consecutive invoice numbering.
    // Manual override allowed for credit notes / corrected invoices.
    let invoiceNo: string;
    const candidateInvoiceNo =
      payload && typeof payload.invoiceNo === "string" ? payload.invoiceNo.trim() : "";
    if (candidateInvoiceNo) {
      invoiceNo = candidateInvoiceNo;
    } else {
      const { data: seqData, error: seqError } = await supabase().rpc("allocate_invoice_number", {
        p_org_id: (rows[0] as { organization_id?: string }).organization_id ?? null,
      });
      if (seqError || !seqData) {
        // Fallback: timestamp-based with high uniqueness (not sequential — will show warning)
        invoiceNo = `INV-${Date.now()}`;
        console.warn("[invoicing] allocate_invoice_number RPC failed, using fallback:", seqError?.message);
      } else {
        invoiceNo = String(seqData);
      }
    }

    // Note: Due to Pulse standards preventing schema changes in this repo,
    // the full payload (taxes, fuel surcharge, additional charges) is securely persisted
    // as a structured JSON object in the activity_logs table via the log_activity RPC.
    const { error } = await supabase()
      .from("trips")
      .update({
        invoice_no: invoiceNo,
        invoice_status_1: "Raised",
      })
      .in("id", sanitizedIds);

    if (error) throw error;

    const orgIdByTripId = new Map(
      rows.map((row) => [
        (row as { id?: string }).id ?? "",
        (row as { organization_id?: string | null }).organization_id ?? null,
      ]),
    );

    // Bounded-concurrency fan-out instead of an unbounded Promise.all over all
    // selected trips. A large bulk invoice previously fired 2N simultaneous DB
    // ops (log_activity RPC + a detached, un-awaited workflow write per trip),
    // bursting the connection pool. We cap concurrency and await the workflow
    // writes so nothing outlives the request unbatched.
    const LOG_CONCURRENCY = 5;
    const runOne = async (id: string) => {
      const { error: logError } = await supabase().rpc("log_activity", {
        p_action: "INVOICE_GENERATED",
        p_entity_type: "trip",
        p_entity_id: id,
        p_details: { invoice_no: invoiceNo, payload },
      });
      if (logError) {
        console.warn("[invoicing] log_activity RPC failed for trip", id, logError.message);
      }
      const orgId = orgIdByTripId.get(id);
      if (orgId) {
        await recordTripWorkflowEvent({
          tripId: id,
          orgId,
          eventType: "invoice.generated",
          payload: { invoice_no: invoiceNo },
        }).catch((err) => {
          console.warn("[invoicing] recordTripWorkflowEvent failed for trip", id, err);
        });
      }
    };
    for (let i = 0; i < sanitizedIds.length; i += LOG_CONCURRENCY) {
      const chunk = sanitizedIds.slice(i, i + LOG_CONCURRENCY);
      await Promise.all(chunk.map(runOne));
    }

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
