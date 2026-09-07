/**
 * Ledger party-name resolution + trip/party map types shared by the
 * Client, Supplier, and Finance Cash ledger tabs.
 */
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";

export type LedgerTripDetailsMap = Record<
  string,
  {
    trip_number: string;
    drop_location?: string;
    pickup_area?: string;
    client_name?: string;
    pickup_date?: string | null;
    vehicle_number?: string | null;
    client_price?: number | null;
    supplier_rate?: number | null;
    driver_commission?: number | null;
    supplier_id?: string | null;
    supplier_display_name?: string | null;
  }
>;

export type LedgerTripPartyMap = Record<
  string,
  {
    client_id?: string | null;
    supplier_id?: string | null;
    driver_id?: string | null;
  }
>;

export function isPlaceholderLedgerPartyName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n === "—" || n === "-") return true;
  return (
    n === "supplier" ||
    n === "client" ||
    n === "driver" ||
    n === "unknown client" ||
    n === "misc / unlinked" ||
    n.startsWith("misc /")
  );
}

/** Entry date e.g. "5 Mar 2025". */
export function formatLedgerEntryDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  try {
    const s = iso.slice(0, 10);
    const [, m, day] = s.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const mi = parseInt(m ?? "0", 10) - 1;
    return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]} ${s.slice(0, 4)}` : s;
  } catch {
    return iso.slice(0, 10);
  }
}

export type ResolveLedgerPartyNameParams = {
  clientById: Map<string, ClientRow>;
  supplierById: Map<string, SupplierRow>;
  tripPartyMap: LedgerTripPartyMap;
  tripDetailsMap: LedgerTripDetailsMap;
};

export function resolveLedgerPartyName(
  row: LedgerRow,
  params: ResolveLedgerPartyNameParams,
): string {
  const { clientById, supplierById, tripPartyMap, tripDetailsMap } = params;
  const contactType = row.contact_type;
  const tripId = row.trip_id;

  if (contactType === "client" && row.contact_id) {
    return clientById.get(row.contact_id)?.name || row.party_name || "—";
  }
  if (contactType === "supplier" && row.contact_id) {
    const direct = supplierById.get(row.contact_id)?.name;
    if (direct) return direct;
    if (tripId && tripPartyMap[tripId]?.supplier_id) {
      const viaTrip = supplierById.get(
        tripPartyMap[tripId]!.supplier_id!,
      )?.name;
      if (viaTrip) return viaTrip;
    }
    const detailNm =
      tripId && tripDetailsMap[tripId]?.supplier_display_name
        ? tripDetailsMap[tripId]!.supplier_display_name!.trim()
        : "";
    if (detailNm) return detailNm;
    const pn = row.party_name;
    if (pn && !isPlaceholderLedgerPartyName(pn)) return pn;
    return "—";
  }
  if (contactType === "driver") {
    return row.driver_name || row.party_name || "—";
  }

  if (tripId && tripPartyMap[tripId]) {
    const pm = tripPartyMap[tripId];
    if (row.amount_in && pm.client_id) {
      return clientById.get(pm.client_id)?.name || row.party_name || "—";
    }
    if (row.amount_out && pm.supplier_id) {
      const nm = supplierById.get(pm.supplier_id)?.name;
      if (nm) return nm;
    }
  }

  if (tripId && tripDetailsMap[tripId]) {
    const d = tripDetailsMap[tripId];
    if ((row.amount_out ?? 0) > 0 && d.supplier_display_name?.trim()) {
      return d.supplier_display_name.trim();
    }
  }

  const fallbackPn = row.party_name;
  if (fallbackPn && !isPlaceholderLedgerPartyName(fallbackPn)) return fallbackPn;
  return "—";
}
