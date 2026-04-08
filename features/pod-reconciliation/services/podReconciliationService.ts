/**
 * POD Reconciliation service — maps to cashflow PodReconciliation.tsx.
 * Same DB as Q-unified-base; RLS applies.
 */
import { supabase } from '@/lib/supabase';
import { expandLR } from '@/lib/utils/lr';

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
    let query = supabase()
      .from('trips')
      .select('*');
      
    // Note: Removed .eq('organization_id', orgId) to match cashflow-catalyst, 
    // which relies on RLS and doesn't filter by orgId on the trips table explicitly.

    // Apply DB-side tab filtering to ensure we fetch the right subset, avoiding 1000-limit truncation
    if (activeTab === 'invoiced') {
      query = query.not('invoice_no', 'is', null);
    } else if (activeTab === 'approved') {
      query = query.is('invoice_no', null).or('invoice_status_1.ilike.%Pending%,invoice_status_1.ilike.%Data Shared%');
    } else if (activeTab === 'received') {
      query = query.is('invoice_no', null).ilike('pod_status', '%received%');
    } else if (activeTab === 'pod_pending') {
      // In CF catalyst it was: query = query.is('invoice_no', null).ilike('invoice_status_2', '%Unbilled%');
      // For q-web, we query for no invoice and rely on JS filtering for the rest to avoid dropping nulls
      query = query.is('invoice_no', null);
    }

    if (searchTerm) {
      const q = searchTerm.trim();
      query = query.or(`trip_id.ilike.%${q}%,client_name.ilike.%${q}%,lr_no.ilike.%${q}%`);
    }

    if (regionFilter && regionFilter !== 'All') {
      query = query.ilike('pp_location', `${regionFilter}%`);
    }

    query = query.order('created_at', { ascending: false }).limit(1000);

    const { data: ownerData, error: ownerError } = await query;

    if (ownerError) {
      console.error("[podReconciliation] query error:", ownerError);
      return { error: new Error(ownerError.message), trips: [] };
    }

    let merged = ownerData || [];

    // Precise filtering in JS (matches cashflow-catalyst end-to-end)
    const filtered = merged.filter(trip => {
      const inv1 = str(trip.invoice_status_1).toLowerCase();
      const inv2 = str(trip.invoice_status_2).toLowerCase();
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
        // Explicitly align with cashflow-catalyst invoicing/api.ts isPending logic
        // "const isPending = isNoInvoice && (podStatus.includes("pending") || podStatus.includes("i-bond") || podStatus === "" || podStatus === "partial");"
        
        if (inv2.includes('unbilled')) return true; // Keep old explicit check just in case
        
        return isNoInvoice && (podS.includes('pending') || podS.includes('i-bond') || podS === '' || podS === 'partial');
      }
      return true;
    });

    const internalIds = filtered.map(t => str(t.id)).filter(Boolean);
    const supplierIds = Array.from(new Set(filtered.map(t => str(t.supplier_id)).filter(Boolean)));

    let lrByTripId = new Map<string, Record<string, unknown>[]>();
    let supplierNameById = new Map<string, string>();

    if (supplierIds.length > 0) {
      const { data: supData } = await supabase()
        .from('suppliers')
        .select('id, name, company_name')
        .in('id', supplierIds);
      
      (supData || []).forEach(s => {
        supplierNameById.set(s.id, str(s.name || s.company_name));
      });
    }

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
        vendor_name: str(supplierNameById.get(str(trip.supplier_id)) || trip.vendor_name || trip.supplier_name),
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
