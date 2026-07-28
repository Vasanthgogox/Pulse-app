/**
 * Integrated carrier (non-owner) on an indent trip: freight-side supplier cost for P&L / payables.
 *
 * Revenue stays `trips.supplier_rate` (winning bid). Freight cost is whichever
 * way the carrier actually moved the load:
 *   - handed to a **sub-supplier** -> the recorded subcontract rate
 *   - hauled on its **own asset**  -> the driver's pay for the trip
 *
 * The own-asset branch matters because a carrier that deploys its own truck and
 * driver still has a real cost to settle. Returning 0 there overstated margin
 * (the driver's pay vanished from the spread) and, because the payable lane is
 * driven off this cost, left no way to record paying the driver at all.
 * No fallback to the bid amount in either case.
 */
export function computePartnerIndentFreightCost(
  subcontractRate?: number | null,
  driverPayInr?: number | null,
): number {
  if (subcontractRate != null && subcontractRate !== undefined) {
    return Number(subcontractRate) || 0;
  }
  const driverPay = Number(driverPayInr ?? 0) || 0;
  if (driverPay > 0) return driverPay;
  return 0;
}
