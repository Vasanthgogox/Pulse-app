import type { IndentRow } from "@/features/indents/services/indents.service";

/** True when the viewer org owns the indent (shipper / dispatcher). */
export function isIndentOwner(
  indent: Pick<IndentRow, "organization_id">,
  viewerOrgId: string | null,
): boolean {
  return !!(viewerOrgId && indent.organization_id === viewerOrgId);
}

/**
 * "Client entity" on indent hub:
 * - Owner sees their commercial client (e.g. GOGOX).
 * - Supplier sees the shipper org only (e.g. Aiman Log) — never the shipper's client.
 */
export function resolveIndentClientEntityDisplayName(
  indent: Pick<
    IndentRow,
    "organization_id" | "client_name" | "creator_organization_name"
  >,
  viewerOrgId: string | null,
): string {
  if (isIndentOwner(indent, viewerOrgId)) {
    return (indent.client_name ?? "").trim() || "—";
  }
  return (indent.creator_organization_name ?? "").trim() || "Shipper";
}

/** Load Center Find Work / Claimed cards — shipper org label only. */
export function resolveMarketIndentShipperLabel(
  indent: Pick<IndentRow, "creator_organization_name">,
): string {
  return (indent.creator_organization_name ?? "").trim() || "Partner";
}
