/**
 * O(n) driver aggregation. due = from trips (commission); paid = from ledger only (amount_out).
 * Commission: from driver offer (client_price * commission_percent/100 or distance * commission_per_km) when available; else trip.driver_commission or 10% supplier_rate.
 */
import type { FinancialRowData, AggregationTotals } from './types';
import type { LedgerTx, TripForDriver, DriverLike, DriverOfferForAggregation, TripPartyMap } from './types';

/** Parse trip distance (km) to numeric km for per-km commission. */
function parseDistanceKm(distance: string | number | null | undefined): number | null {
  if (distance == null) return null;
  if (typeof distance === 'string' && distance.trim() === '') return null;
  const n = Number(
    typeof distance === 'number'
      ? distance
      : String(distance).replace(/,/g, '').trim(),
  );
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Compute trip-based commission for one trip. Used in TRANSACTION LEDGER table (COMMISSION column).
 * 1) Driver offer: client_price * (commission_percent/100) or distance_km * commission_per_km.
 * 2) Else trip.driver_commission.
 * 3) Else 10% of supplier_rate.
 * 4) Else 10% of client_price (trip revenue) so commission is always derived from trip when possible.
 */
export function computeDriverCommissionForTrip(
  trip: Omit<TripForDriver, 'distance'> & { distance?: string | number | null },
  offer: DriverOfferForAggregation | null | undefined
): number {
  const basePrice = Number(trip.client_price ?? 0) || 0;
  const distanceKm = parseDistanceKm(trip.distance);
  if (offer) {
    const pct = offer.commissionPercent != null && Number(offer.commissionPercent) >= 0 ? Number(offer.commissionPercent) : null;
    const perKm = offer.commissionPerKm != null && Number(offer.commissionPerKm) >= 0 ? Number(offer.commissionPerKm) : null;
    if (pct != null && basePrice > 0) return (basePrice * pct) / 100;
    if (perKm != null && distanceKm != null && distanceKm > 0) return distanceKm * perKm;
  }
  const fromTrip =
    Number(trip.driver_commission ?? 0) ||
    Number(trip.supplier_rate ?? 0) * 0.1 ||
    (basePrice > 0 ? basePrice * 0.1 : 0);
  return fromTrip;
}

export function aggregateDrivers(
  drivers: DriverLike[],
  trips: TripForDriver[],
  transactions: LedgerTx[],
  offersByDriverId?: Record<string, DriverOfferForAggregation> | null,
  tripPartyMap?: TripPartyMap | null
): { rows: FinancialRowData[]; totals: AggregationTotals } {
  const dueFromTrips: Record<string, number> = {};
  const paidFromLedger: Record<string, number> = {};
  const tripCountByDriver: Record<string, number> = {};
  const offers = offersByDriverId ?? {};

  const driverIds = new Set<string>();
  for (let i = 0; i < drivers.length; i++) {
    const id = drivers[i].id;
    driverIds.add(id);
    dueFromTrips[id] = 0;
    paidFromLedger[id] = 0;
    tripCountByDriver[id] = 0;
  }

  for (let i = 0; i < trips.length; i++) {
    const t = trips[i];
    if (!t.driver_id) continue;
    const offer = offers[t.driver_id] ?? null;
    const commission = computeDriverCommissionForTrip(t, offer);
    dueFromTrips[t.driver_id] = (dueFromTrips[t.driver_id] ?? 0) + commission;
    tripCountByDriver[t.driver_id] = (tripCountByDriver[t.driver_id] ?? 0) + 1;
  }

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const amtOut = Number(tx.amount_out ?? 0);
    if (!amtOut) continue;

    if (tx.contact_type === 'driver' && tx.contact_id) {
      paidFromLedger[tx.contact_id] =
        (paidFromLedger[tx.contact_id] ?? 0) + amtOut;
      continue;
    }

    if (tripPartyMap && tx.trip_id && tripPartyMap[tx.trip_id]) {
      const fallback = tripPartyMap[tx.trip_id]!;
      const did = fallback.supplier_id ?? fallback.driver_id ?? null;
      if (did && driverIds.has(did)) {
        paidFromLedger[did] = (paidFromLedger[did] ?? 0) + amtOut;
      }
    }
  }

  const rows: FinancialRowData[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    const id = d.id;
    const due = dueFromTrips[id] ?? 0;
    const paid = paidFromLedger[id] ?? 0;
    const pending = Math.max(0, due - paid);
    totalIn += paid + pending;
    totalOut += pending;
    const isIntegrated =
      (d.tracking_only !== true) && d.user_id != null && d.user_id !== '';
    const leftAt = d.left_at ?? null;
    const leftAtFormatted =
      leftAt != null && leftAt !== ''
        ? (() => {
            try {
              const date = new Date(leftAt);
              return isNaN(date.getTime()) ? leftAt : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch {
              return leftAt;
            }
          })()
        : null;
    const displayName = d.name ?? (d as { full_name?: string | null }).full_name ?? undefined;
    const isDisconnected = leftAt != null && leftAt !== '';
    const rawAvatar = (d.avatar_url ?? "").trim();
    const rawSeed = (d.avatar_seed ?? "").trim();
    rows.push({
      id,
      name: displayName ?? undefined,
      subline: leftAtFormatted ? `Disconnected · Left on ${leftAtFormatted}` : (d.status ?? undefined),
      status: isDisconnected ? 'DISCONNECTED' : (d.status ?? 'offline'),
      trips: tripCountByDriver[id] ?? 0,
      paid,
      pending,
      due,
      is_integrated: isIntegrated,
      left_at: leftAt ?? undefined,
      profileImageUrl: rawAvatar || undefined,
      avatarSeed: rawSeed || undefined,
    });
  }

  return {
    rows,
    totals: { totalIn, totalOut },
  };
}
