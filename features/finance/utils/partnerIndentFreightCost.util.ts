/**
 * Integrated carrier (non-owner) on an indent trip: freight-side supplier cost for P&L / payables.
 *
 * Revenue stays `trips.supplier_rate` (winning bid). Freight cost mirrors manual asset trips:
 * **0** unless a **subcontract** rate is recorded (sub-supplier). No fallback to the bid amount.
 */
export function computePartnerIndentFreightCost(
  subcontractRate?: number | null,
): number {
  if (subcontractRate != null && subcontractRate !== undefined) {
    return Number(subcontractRate) || 0;
  }
  return 0;
}
