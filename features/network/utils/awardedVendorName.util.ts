/**
 * Winning vendor on an awarded Give Load indent.
 *
 * Org awards stamp `assigned_supplier_id`. DCO market-bid awards do not —
 * they create a trip with the driver and store the winning bid on
 * `trips.client_price` / `driver_commission`. The list card used to treat
 * those as unawarded (TARGET RATE, no vendor) once a trip existed.
 */

export function parsePositiveInr(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/** Winning payout for an awarded Give Load ticket. Skips indent.client_price (the sell rate). */
export function resolveGiveLoadAwardedAmountInr(options: {
  assignedSupplierRate?: unknown;
  awardedAmount?: unknown;
  indentSupplierRate?: unknown;
  acceptedQuoteAmount?: unknown;
  tripSupplierRate?: unknown;
  tripDriverCommission?: unknown;
  tripClientPrice?: unknown;
  supplierTarget?: unknown;
}): number | null {
  return (
    parsePositiveInr(options.assignedSupplierRate) ??
    parsePositiveInr(options.awardedAmount) ??
    parsePositiveInr(options.indentSupplierRate) ??
    parsePositiveInr(options.acceptedQuoteAmount) ??
    parsePositiveInr(options.tripSupplierRate) ??
    parsePositiveInr(options.tripDriverCommission) ??
    parsePositiveInr(options.tripClientPrice) ??
    parsePositiveInr(options.supplierTarget)
  );
}

export type AwardedVendorSupplier = {
  linked_organization_id?: string | null;
  name?: string | null;
  company_name?: string | null;
};

export function supplierNameByLinkedOrgId(
  suppliers: readonly AwardedVendorSupplier[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const supplier of suppliers) {
    const orgId = (supplier.linked_organization_id ?? "").trim();
    const name = (supplier.name || supplier.company_name || "").trim();
    if (orgId && name && !map[orgId]) map[orgId] = name;
  }
  return map;
}

export function resolveAwardedVendorName(options: {
  assignedSupplierOrgId?: string | null;
  sessionName?: string | null;
  supplierNameByOrgId?: Record<string, string>;
  orgDisplayNameById?: Record<string, string | undefined>;
  /** Last resort: trip.supplier_name / CRM row matched by trips.supplier_id. */
  fallbackName?: string | null;
}): string | null {
  const session = options.sessionName?.trim();
  if (session) return session;

  const orgId = (options.assignedSupplierOrgId ?? "").trim();
  if (orgId) {
    const fromSupplier = (options.supplierNameByOrgId?.[orgId] ?? "").trim();
    if (fromSupplier) return fromSupplier;
    const fromOrg = (options.orgDisplayNameById?.[orgId] ?? "").trim();
    if (fromOrg) return fromOrg;
  }

  const fallback = options.fallbackName?.trim();
  return fallback || null;
}
