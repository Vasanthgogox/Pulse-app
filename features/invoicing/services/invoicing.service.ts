/**
 * Invoicing execute service — maps to cashflow InvoicingCenter / api.ts.
 * Same DB as Q-unified-base; RLS applies.
 */
import { supabase } from '@/lib/supabase';
import {
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  type TripRow,
} from '@/features/trips/services/trips.service';

export type TripStatus = 'approved' | 'received' | 'pending' | 'warning' | 'blocked';

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

type TripRecord = TripRow & Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function getTripStringId(row: TripRecord): string {
  const r = row as {
    trip_id?: string;
    display_trip_id?: string;
    trip_number?: string;
    id?: string;
  };
  return str(r.trip_id || r.display_trip_id || r.trip_number || r.id);
}

function passesInvoicingFilter(t: TripRecord): boolean {
  const invoiceNo = str((t as { invoice_no?: string | null }).invoice_no);
  if (invoiceNo.trim() !== '') return false;

  const inv1 = str((t as { invoice_status_1?: string | null }).invoice_status_1).toLowerCase();
  if (inv1.includes('raised')) return false;

  return true;
}

function mapRowToView(row: TripRecord): InvoicingTripView {
  const podStatus = str((row as { pod_status?: string | null }).pod_status).toLowerCase();
  const invStatus1 = str((row as { invoice_status_1?: string | null }).invoice_status_1).toLowerCase();

  const isPodReceived = podStatus === 'received';
  const isApproved = isPodReceived && (invStatus1.includes('pending') || invStatus1.includes('data shared'));
  const isReceivedOnly = isPodReceived && !isApproved;
  const isPending =
    podStatus.includes('pending') ||
    podStatus.includes('i-bond') ||
    podStatus === '' ||
    podStatus === 'partial';

  let status: TripStatus = 'pending';
  if (isApproved) status = 'approved';
  else if (isReceivedOnly) status = 'received';
  else if (isPending) status = 'pending';

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
  const route = `${ppLocation || 'Unknown'} ➔ ${dropPoint || 'Unknown'}`;

  return {
    internal_id: str(row.id),
    id: getTripStringId(row),
    client: str((row as { client_name?: string | null }).client_name) || '—',
    supplier_name:
      str((row as { vendor_name?: string | null }).vendor_name) ||
      str((row as { supplier_name?: string | null }).supplier_name) ||
      'Unknown Supplier',
    route,
    date: tripDate,
    amount:
      num((row as { total_client_value?: unknown }).total_client_value) ||
      num((row as { client_price?: unknown }).client_price) ||
      0,
    status,
    details: str((row as { remarks?: string | null }).remarks) || str((row as { notes?: string | null }).notes),
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
        .from('trips')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3000),
      getTripsWhereOrgIsSupplier(orgId),
    ]);

    if (ownerRes.error) return { error: new Error(ownerRes.error.message), trips: [] };
    if (supRes.error) return { error: supRes.error, trips: [] };

    const ownerRows = (ownerRes.data ?? []) as TripRecord[];
    const supRows = (supRes.trips ?? []) as TripRecord[];

    const map = new Map<string, TripRecord>();
    for (const t of [...ownerRows, ...supRows]) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
    const merged = Array.from(map.values()).filter(passesInvoicingFilter);

    const views = merged.map(mapRowToView);
    return { error: null, trips: views };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: [] };
  }
}

export async function fetchPodReconciliationSummary(): Promise<{
  error: Error | null;
  summary: PodReconciliationSummary | null;
}> {
  try {
    const { data, error } = await supabase.rpc('get_pod_reconciliation_summary');
    if (error) throw error;
    const summary = Array.isArray(data) ? data[0] : data;
    return {
      error: null,
      summary: {
        pod_pending_count: summary?.pod_pending_count || 0,
        pod_pending_sum: summary?.pod_pending_sum || 0,
        received_count: summary?.received_count || 0,
        received_sum: summary?.received_sum || 0,
        approved_count: summary?.approved_count || 0,
        approved_sum: summary?.approved_sum || 0,
        invoiced_count: summary?.invoiced_count || 0,
        invoiced_sum: summary?.invoiced_sum || 0,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), summary: null };
  }
}

export async function executeInvoiceCreation(
  internalIds: string[],
): Promise<{ error: Error | null }> {
  try {
    const invoiceNo = `#INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${Math.floor(Math.random() * 90) + 10}`;
    const { error } = await supabase
      .from('trips')
      .update({
        invoice_no: invoiceNo,
        invoice_status_1: 'Raised',
        invoice_date: new Date().toISOString().split('T')[0],
      })
      .in('id', internalIds);

    if (error) throw error;

    for (const id of internalIds) {
      await supabase.rpc('log_activity', {
        p_action: 'INVOICE_GENERATED',
        p_entity_type: 'trip',
        p_entity_id: id,
        p_details: { invoice_no: invoiceNo },
      });
    }

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
