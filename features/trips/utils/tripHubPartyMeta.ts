/**
 * Party / driver display metadata for Trips hub (cards + table).
 * Avatars: raw `avatar_url` from DB (PartyAvatar / resolvePartyDisplayUri handles public URLs).
 */
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "../services/trips.service";

export function isUuidLikeString(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export type TripHubPartyMeta = {
  displaySupplierName: string;
  clientAvatarUrl: string | null;
  clientAvatarSeed: string | null;
  supplierAvatarUrl: string | null;
  supplierAvatarSeed: string | null;
  clientFallbackSeed: string;
  supplierFallbackSeed: string;
  clientLinkedOrgId: string | null;
  supplierLinkedOrgId: string | null;
  driverAvatarUrl: string | null;
  driverAvatarSeed: string | null;
};

function resolveSupplierName(
  t: TripRow,
  entries: LedgerRow[],
  supplierById: Map<string, SupplierRow>,
): string {
  const raw = (t.supplier_name ?? "").trim();
  if (raw && !isUuidLikeString(raw)) return raw;
  const sid = (t.supplier_id ?? "").trim().toLowerCase();
  if (sid) {
    const row = supplierById.get(sid);
    const label = (
      row?.name ??
      row?.company_name ??
      row?.contact_person ??
      ""
    ).trim();
    if (label) return label;
  }
  for (const tx of entries) {
    if (tx.contact_type !== "supplier") continue;
    const pn = (tx.party_name ?? "").trim();
    if (pn && !isUuidLikeString(pn)) return pn;
  }
  return "";
}

/** Supplier / client / driver avatar fields for hub cards and table (org logos resolved in UI via linked-org map). */
export function buildTripHubPartyMetaByTripId(
  tripsList: TripRow[],
  clients: ClientRow[],
  suppliers: SupplierRow[],
  drivers: DriverRow[],
  transactions: LedgerRow[],
): Map<string, TripHubPartyMeta> {
  const clientById = new Map(
    clients.map((c) => [String(c.id).trim().toLowerCase(), c] as const),
  );
  const supplierById = new Map(
    suppliers.map((s) => [String(s.id).trim().toLowerCase(), s] as const),
  );
  const driverById = new Map(
    drivers.map((d) => [String(d.id).trim().toLowerCase(), d] as const),
  );
  const txByTripId = new Map<string, LedgerRow[]>();
  for (const tx of transactions) {
    const tid = (tx.trip_id ?? "").trim();
    if (!tid) continue;
    const k = tid.toLowerCase();
    const list = txByTripId.get(k);
    if (list) list.push(tx);
    else txByTripId.set(k, [tx]);
  }

  const meta = new Map<string, TripHubPartyMeta>();
  for (const t of tripsList) {
    const tidKey = String(t.id).trim().toLowerCase();
    const entries = txByTripId.get(tidKey) ?? [];
    const displaySupplierName = resolveSupplierName(t, entries, supplierById);

    const clientIdKey = (t.client_id ?? "").trim().toLowerCase();
    const clientRow = clientIdKey ? clientById.get(clientIdKey) : undefined;

    const supplierIdKey = (t.supplier_id ?? "").trim().toLowerCase();
    const supplierRow = supplierIdKey ? supplierById.get(supplierIdKey) : undefined;

    const driverIdKey = (t.driver_id ?? "").trim().toLowerCase();
    const driverRow = driverIdKey ? driverById.get(driverIdKey) : undefined;

    const clientFallbackSeed = clientIdKey
      ? `client-entity:${clientIdKey}`
      : `client-trip:${t.id}`;
    const supplierFallbackSeed = supplierIdKey
      ? `supplier-entity:${supplierIdKey}`
      : displaySupplierName
        ? `supplier-name:${tidKey}:${displaySupplierName}`
        : `supplier-trip:${t.id}`;

    meta.set(t.id, {
      displaySupplierName,
      clientAvatarUrl: (clientRow?.avatar_url ?? "").trim() || null,
      clientAvatarSeed: (clientRow?.avatar_seed ?? "").trim() || null,
      supplierAvatarUrl: (supplierRow?.avatar_url ?? "").trim() || null,
      supplierAvatarSeed: (supplierRow?.avatar_seed ?? "").trim() || null,
      clientFallbackSeed,
      supplierFallbackSeed,
      clientLinkedOrgId: (clientRow?.linked_organization_id ?? "").trim() || null,
      supplierLinkedOrgId: (supplierRow?.linked_organization_id ?? "").trim() || null,
      driverAvatarUrl: (driverRow?.avatar_url ?? "").trim() || null,
      driverAvatarSeed: (driverRow?.avatar_seed ?? "").trim() || null,
    });
  }
  return meta;
}
