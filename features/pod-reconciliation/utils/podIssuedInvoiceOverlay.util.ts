export type IssuedInvoiceTripLink = {
  invoice_number: string;
  trip_ids: string[];
};

/** trip UUID → invoice numbers (Pulse Invoice writes invoices.trip_ids, not trips.invoice_no). */
export function invoiceNumbersByTripId(
  invoices: readonly IssuedInvoiceTripLink[],
): Map<string, string[]> {
  const byTrip = new Map<string, string[]>();
  for (const invoice of invoices) {
    const number = invoice.invoice_number.trim();
    if (!number) continue;
    for (const tripId of invoice.trip_ids) {
      const id = tripId.trim();
      if (!id) continue;
      const current = byTrip.get(id) ?? [];
      if (!current.includes(number)) current.push(number);
      byTrip.set(id, current);
    }
  }
  return byTrip;
}

export function overlayIssuedInvoiceOnTrip<T extends Record<string, unknown>>(
  trip: T,
  numbersByTripId: Map<string, string[]>,
): T {
  const id = String(trip.id ?? "").trim();
  const numbers = id ? numbersByTripId.get(id) : undefined;
  if (!numbers?.length) return trip;
  return {
    ...trip,
    invoice_no: numbers.join(", "),
    invoice_status_1: "Raised",
  };
}

export function tripHardPodStamp(trip: Record<string, unknown>): string | null {
  const raw = trip.pod_received_at;
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed || null;
  }
  const asString = String(raw);
  return asString && asString !== "null" && asString !== "undefined"
    ? asString
    : null;
}
