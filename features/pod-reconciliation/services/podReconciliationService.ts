/**
 * POD Reconciliation service — maps to cashflow PodReconciliation.tsx.
 * Same DB as Q-unified-base; RLS applies.
 */
import { supabase } from '@/lib/supabase';
import { expandLR } from '@/lib/utils/lr';
import { 
  getTripsWhereOrgIsClient, 
  getTripsWhereOrgIsSupplier, 
  type TripRow 
} from '@/features/trips/services/trips.service';

export type PodTab = 'pod_pending' | 'received' | 'approved' | 'invoiced';

export interface PodReconciliationTripView {
  id: string; // trip_id (sequence)
  internal_id: string; // uuid
  client_name: string;
  vendor_name: string;
  trip_date: string;
  pp_location: string;
  drop_point: string;
  total_client_value: number;
  trip_status: string;
  pod_status: string;
  pod_received_date: string | null;
  invoice_status_1: string;
  invoice_no: string | null;
  invoice_status_display: string;
  lr_numbers: string[];
  trip_pods: string[];
  amount: number;
  date: string;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchReconciliationTrips(
  orgId: string,
  activeTab: PodTab,
  searchTerm: string = '',
  regionFilter: string = 'All'
): Promise<{ error: Error | null; trips: PodReconciliationTripView[] }> {
  try {
    const [ownerRes, supRes, cliRes] = await Promise.all([
      supabase()
        .from('trips')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1000),
      getTripsWhereOrgIsSupplier(orgId),
      getTripsWhereOrgIsClient(orgId),
    ]);

    if (ownerRes.error) {
      console.error("[podReconciliation] ownerRes error:", ownerRes.error);
      return { error: new Error(ownerRes.error.message), trips: [] };
    }
    if (supRes.error) {
      console.error("[podReconciliation] supRes error:", supRes.error);
      return { error: supRes.error, trips: [] };
    }
    if (cliRes.error) {
      console.error("[podReconciliation] cliRes error:", cliRes.error);
      return { error: cliRes.error, trips: [] };
    }

    const ownerRows = (ownerRes.data ?? []) as any[];
    const supRows = (supRes.trips ?? []) as any[];
    const cliRows = (cliRes.trips ?? []) as any[];

    const map = new Map<string, any>();
    for (const t of [...ownerRows, ...supRows, ...cliRows]) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
    
    let merged = Array.from(map.values());

    if (searchTerm) {
      const q = searchTerm.toLowerCase().trim();
      merged = merged.filter(t => 
        str(t.trip_id).toLowerCase().includes(q) || 
        str(t.display_trip_id).toLowerCase().includes(q) || 
        str(t.trip_number).toLowerCase().includes(q) || 
        str(t.client_name).toLowerCase().includes(q) || 
        str(t.lr_no).toLowerCase().includes(q)
      );
    }

    if (regionFilter !== 'All') {
      merged = merged.filter(t => 
        str(t.pp_location || t.pickup_area).toLowerCase().startsWith(regionFilter.toLowerCase())
      );
    }

    // Precise filtering in JS
    const filtered = merged.filter(trip => {
      const inv1 = str(trip.invoice_status_1).toLowerCase();
      const podS = str(trip.pod_status).toLowerCase();
      const isNoInvoice = !trip.invoice_no && !inv1.includes('raised');
      const isApproved = inv1.includes('pending') || inv1.includes('data shared');

      if (activeTab === 'invoiced') {
        return trip.invoice_no || inv1.includes('raised');
      } else if (activeTab === 'approved') {
        return isNoInvoice && podS === 'received' && isApproved;
      } else if (activeTab === 'received') {
        return isNoInvoice && podS === 'received' && !isApproved;
      } else if (activeTab === 'pod_pending') {
        return isNoInvoice && (podS.includes('pending') || podS.includes('i-bond') || podS === '' || podS === 'partial');
      }
      return true;
    });

    const internalIds = filtered.map(t => str(t.id)).filter(Boolean);
    let lrByTripId = new Map<string, any[]>();

    if (internalIds.length > 0) {
      const { data: lrData } = await supabase()
        .from('trip_lrs')
        .select('*')
        .in('trip_id', internalIds);
      
      (lrData || []).forEach(lr => {
        const tid = str(lr.trip_id);
        const list = lrByTripId.get(tid) ?? [];
        list.push(lr);
        lrByTripId.set(tid, list);
      });
    }

    const mapped = filtered.map(trip => {
      let invoice_status_display = 'Invoice Pending';
      const inv1 = str(trip.invoice_status_1).toLowerCase();
      const podS = str(trip.pod_status).toLowerCase();
      const isRaised = inv1.includes('raised') || trip.invoice_no;
      const isApproved = (inv1.includes('pending') || inv1.includes('data shared')) && podS === 'received';
      const isReceived = podS === 'received' && !isApproved && !isRaised;
      
      if (isRaised) invoice_status_display = 'Invoiced';
      else if (isApproved) invoice_status_display = 'Ready for Invoice';
      else if (isReceived) invoice_status_display = 'Received';

      const lrs = lrByTripId.get(str(trip.id)) || [];
      const allLrNumbers = lrs.length > 0 
        ? Array.from(new Set(lrs.flatMap(lr => expandLR(str(lr.lr_number)))))
        : (trip.lr_no ? expandLR(str(trip.lr_no)) : []);
      
      const receivedLRs = Array.from(new Set(
        lrs
          .filter(lr => lr.pod_received === true || str(lr.pod_status).toLowerCase() === 'received')
          .flatMap(lr => expandLR(str(lr.lr_number)))
      ));

      let finalReceivedLRs = receivedLRs;
      if (lrs.length === 0 && podS === 'received' && allLrNumbers.length > 0) {
        finalReceivedLRs = allLrNumbers;
      }

      const tripDisplayId = str(trip.display_trip_id || trip.trip_number || trip.trip_id || trip.id);
      const tripDate = str(trip.pickup_date || trip.trip_date || trip.created_at);

      return {
        ...trip,
        id: tripDisplayId,
        internal_id: str(trip.id),
        client_name: str(trip.client_name),
        vendor_name: str(trip.vendor_name || trip.supplier_name),
        pp_location: str(trip.pickup_area || trip.pp_location),
        drop_point: str(trip.drop_location || trip.drop_point),
        amount: num(trip.client_price || trip.total_client_value),
        date: tripDate,
        trip_date: tripDate,
        invoice_status_display,
        lr_numbers: allLrNumbers,
        trip_pods: finalReceivedLRs
      } as PodReconciliationTripView;
    });

    return { error: null, trips: mapped };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: [] };
  }
}
