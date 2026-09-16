import type { SupplierRow } from "./services/suppliers.service";

/**
 * In-memory first-paint seed for Supplier Detail (not TanStack Query).
 *
 * Used by Finance's Suppliers list (`FinanceScreen.handleEntityRowSelect`)
 * to stash the already-loaded SupplierRow before navigating.
 *
 * SupplierRow is a partial seed only. `getSupplierDetails` remains the
 * authoritative hydration source — never write this seed into that cache.
 * Mirrors `features/clients/initialClientForDetail.ts` / `features/trips/initialTripForDetail.ts`.
 */
let initialSupplierById: Record<string, SupplierRow> = {};

export function setInitialSupplierForDetail(supplier: SupplierRow): void {
  if (supplier?.id) initialSupplierById[supplier.id] = supplier;
}

export function getInitialSupplierForDetail(supplierId: string): SupplierRow | null {
  const s = initialSupplierById[supplierId] ?? null;
  return s?.id === supplierId ? s : null;
}

export function clearInitialSupplierForDetail(supplierId: string): void {
  delete initialSupplierById[supplierId];
}
