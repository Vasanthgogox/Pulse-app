/**
 * Builds FinancialRowData for a ledger row — used by Finance Cash expand and entity detail Cash Flow.
 */
import { ALL_LEDGER_CATEGORY_VALUES } from "@/components/AddTransactionModal";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripOperationalDisplay } from "@/features/operations/display";

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

type LedgerTripDetailEntry = LedgerTripDetailsMap[string];

/**
 * Resolves trip block for expanded ledger UI. Uses tripDetailsMap when present;
 * otherwise builds a minimal stub from the row so "Associated Trip" is not blank
 * when the voyage exists on the entry but was omitted from the caller's trip list
 * (filtered entity screens, realtime updates, key mismatch).
 */
export function resolveLedgerTripDetailForRow(
  row: LedgerRow,
  tripDetailsMap: LedgerTripDetailsMap,
  getVehicleNumberForTripId?: (tripId: string | null) => string | null,
): LedgerTripDetailEntry | null {
  const nested = row.trips;
  const rawTid =
    row.trip_id != null && String(row.trip_id).trim() !== ""
      ? String(row.trip_id).trim()
      : "";

  if (rawTid) {
    let fromMap: LedgerTripDetailEntry | undefined = tripDetailsMap[rawTid];
    if (!fromMap) {
      const lower = rawTid.toLowerCase();
      for (const key of Object.keys(tripDetailsMap)) {
        if (key.trim().toLowerCase() === lower) {
          fromMap = tripDetailsMap[key];
          break;
        }
      }
    }
    if (fromMap) return fromMap;

    const tripLabel = getTripOperationalDisplay({
      trip_number: row["trip_number"] ?? nested?.["trip_number"] ?? null,
    });
    const tripNumber = tripLabel !== "—" ? tripLabel : "Trip";
    const vn =
      row.vehicle_number ??
      getVehicleNumberForTripId?.(rawTid) ??
      null;
    return {
      trip_number: tripNumber,
      pickup_date: null,
      vehicle_number: vn,
      client_price: null,
      supplier_rate: null,
      driver_commission: null,
      supplier_id: null,
    };
  }

  const nestedNum = getTripOperationalDisplay({
    trip_number: nested?.["trip_number"] ?? null,
  });
  if (nestedNum !== "—") {
    return {
      trip_number: nestedNum,
      pickup_date: null,
      vehicle_number: row.vehicle_number ?? null,
      client_price: null,
      supplier_rate: null,
      driver_commission: null,
      supplier_id: null,
    };
  }

  return null;
}

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

export function formatLedgerRoute(
  d:
    | {
        drop_location?: string;
        pickup_area?: string;
        client_name?: string;
        pickup_date?: string | null;
      }
    | undefined,
): string | null {
  if (!d) return null;
  if (d.pickup_area && d.drop_location)
    return `${d.pickup_area} → ${d.drop_location}`;
  if (d.drop_location) return d.drop_location;
  if (d.client_name) return d.client_name;
  if (d.pickup_date) {
    try {
      const [, m, day] = d.pickup_date.split("-");
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
      const mi = parseInt(m, 10) - 1;
      return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]}` : d.pickup_date;
    } catch {
      return d.pickup_date;
    }
  }
  return null;
}

export function formatLedgerTripDateForDisplay(
  iso: string | null | undefined,
): string | null {
  if (!iso || typeof iso !== "string") return null;
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

export type BuildFinancialRowDataForLedgerParams = ResolveLedgerPartyNameParams & {
  /** All ledger rows used for same-trip paid/received aggregation (typically org-wide). */
  allRows: LedgerRow[];
  driverById: Map<string, DriverRow>;
  getVehicleNumberForTripId?: (tripId: string | null) => string | null;
  linkedOrgDisplayMap: Record<string, LinkedOrgDisplay>;
  profileImages: Record<string, string>;
  driverProfileImageUrls: Record<string, string>;
  disputesByTripId: Record<string, { status: string; direction: string }>;
};

export function buildFinancialRowDataForLedgerRow(
  row: LedgerRow,
  params: BuildFinancialRowDataForLedgerParams,
): FinancialRowData {
  const {
    allRows: rows,
    tripDetailsMap,
    tripPartyMap,
    clientById,
    supplierById,
    driverById,
    getVehicleNumberForTripId,
    linkedOrgDisplayMap,
    profileImages,
    driverProfileImageUrls,
    disputesByTripId,
  } = params;

  const getResolvedPartyName = (r: LedgerRow) =>
    resolveLedgerPartyName(r, {
      clientById,
      supplierById,
      tripPartyMap,
      tripDetailsMap,
    });

  const isDriverPayment =
    row.contact_type === "driver" || (row.driver_name ?? "").trim() !== "";

  const vehicleNum =
    row.vehicle_number ??
    (row.trip_id != null && !isDriverPayment
      ? (getVehicleNumberForTripId?.(row.trip_id) ?? null)
      : null);
  const entityName = getResolvedPartyName(row);
  const tripDetail = resolveLedgerTripDetailForRow(
    row,
    tripDetailsMap,
    getVehicleNumberForTripId,
  );
  const tripPaymentSummary =
    row.trip_id != null
      ? (() => {
          const sameTrip = rows.filter(
            (r) => r.trip_id != null && r.trip_id === row.trip_id,
          );
          return {
            received: sameTrip.reduce((s, r) => s + (r.amount_in ?? 0), 0),
            paid: sameTrip.reduce((s, r) => s + (r.amount_out ?? 0), 0),
            entryCount: sameTrip.length,
          };
        })()
      : undefined;
  const sameTripTransactions =
    row.trip_id != null
      ? rows
          .filter((r) => r.trip_id != null && r.trip_id === row.trip_id)
          .map((r) => {
            const isDr =
              r.contact_type === "driver" || (r.driver_name ?? "").trim() !== "";
            const party = getResolvedPartyName(r);
            return {
              id: r.id,
              date: formatLedgerEntryDate(r.transaction_date),
              typeLabel: getDoubleEntryDisplayLabel(r) ?? "—",
              in: r.amount_in ?? 0,
              out: r.amount_out ?? 0,
              party,
            };
          })
      : undefined;

  let derivedPartyType = row.contact_type;
  if (!derivedPartyType && row.trip_id && tripPartyMap[row.trip_id]) {
    const pm = tripPartyMap[row.trip_id];
    if (row.amount_in && pm.client_id) derivedPartyType = "client";
    if (row.amount_out && pm.supplier_id) derivedPartyType = "supplier";
  }

  const ledgerPartyType =
    derivedPartyType === "client"
      ? "client"
      : derivedPartyType === "supplier"
        ? "supplier"
        : isDriverPayment
          ? "driver"
          : "vehicle";

  let profileImageUrl: string | null = null;
  let avatarSeedForRow: string | null | undefined = undefined;
  let organizationImageUrl: string | null = null;
  let organizationAvatarSeed: string | null = null;

  let counterpartyIntegrated: boolean | null = null;
  let counterpartyId: string | null = null;

  if (ledgerPartyType === "client") {
    counterpartyId =
      row.contact_id ??
      (row.trip_id ? tripPartyMap[row.trip_id]?.client_id ?? null : null);
    const clientRec = counterpartyId
      ? clientById.get(counterpartyId) ?? null
      : null;
    counterpartyIntegrated = clientRec
      ? Boolean(clientRec.is_integrated || clientRec.linked_organization_id)
      : false;
    if (clientRec) {
      const oid = (clientRec.linked_organization_id ?? "").trim();
      if (oid && linkedOrgDisplayMap[oid]) {
        organizationImageUrl =
          (linkedOrgDisplayMap[oid].avatarUrl ?? "").trim() || null;
        organizationAvatarSeed =
          (linkedOrgDisplayMap[oid].avatarSeed ?? "").trim() || null;
      }
      const cid = (row.contact_id ?? "").trim();
      profileImageUrl =
        resolveAvatarPublicUrl(clientRec.avatar_url) ??
        (cid ? profileImages[cid] ?? null : null);
      const s = (clientRec.avatar_seed ?? "").trim();
      avatarSeedForRow = s || undefined;
    } else if (row.contact_id) {
      profileImageUrl = profileImages[row.contact_id] ?? null;
    }
  } else if (ledgerPartyType === "supplier") {
    counterpartyId =
      row.contact_id ??
      (row.trip_id ? tripPartyMap[row.trip_id]?.supplier_id ?? null : null);
    const supplierRec = counterpartyId
      ? supplierById.get(counterpartyId) ?? null
      : null;
    counterpartyIntegrated = supplierRec
      ? Boolean(
          supplierRec.linked_organization_id ||
            (supplierRec as { supplier_type?: string | null }).supplier_type ===
              "integrated",
        )
      : false;
    if (supplierRec) {
      const oid = (supplierRec.linked_organization_id ?? "").trim();
      if (oid && linkedOrgDisplayMap[oid]) {
        organizationImageUrl =
          (linkedOrgDisplayMap[oid].avatarUrl ?? "").trim() || null;
        organizationAvatarSeed =
          (linkedOrgDisplayMap[oid].avatarSeed ?? "").trim() || null;
      }
      const cid = (row.contact_id ?? "").trim();
      profileImageUrl =
        resolveAvatarPublicUrl(supplierRec.avatar_url) ??
        (cid ? profileImages[cid] ?? null : null);
      const s = (supplierRec.avatar_seed ?? "").trim();
      avatarSeedForRow = s || undefined;
    } else if (row.contact_id) {
      profileImageUrl = profileImages[row.contact_id] ?? null;
    }
  } else if (ledgerPartyType === "driver") {
    if (row.contact_id) {
      const drv = driverById.get(row.contact_id);
      profileImageUrl =
        (drv?.avatar_url ?? "").trim() ||
        driverProfileImageUrls[row.contact_id] ||
        profileImages[row.contact_id] ||
        null;
      const s = (drv?.avatar_seed ?? "").trim();
      avatarSeedForRow = s || undefined;
    }
  } else if (row.contact_id) {
    profileImageUrl = profileImages[row.contact_id] ?? null;
  }
  const categoryBase = row.primary_category ?? row.description ?? "";
  const categoryLabel = ALL_LEDGER_CATEGORY_VALUES.includes(categoryBase)
    ? categoryBase
    : "GENERAL";
  const tripMsnResolved = getTripOperationalDisplay({
    trip_number: row["trip_number"] ?? null,
  });
  return {
    id: row.id,
    name: entityName,
    subline: "",
    category: categoryLabel,
    desc: row.description,
    tripId: row.trip_id ?? null,
    msn: (tripMsnResolved !== "—" ? tripMsnResolved : "") || (row.trip_id ? "Trip" : "General"),
    tripDetail: tripDetail ?? undefined,
    vehicleNumber: isDriverPayment ? null : vehicleNum,
    driverName: row.driver_name ?? undefined,
    ledgerPartyType,
    in: row.amount_in ?? 0,
    out: row.amount_out ?? 0,
    transaction_date: row.transaction_date,
    transactionTypeLabel: getDoubleEntryDisplayLabel(row) ?? undefined,
    tripPaymentSummary: tripPaymentSummary ?? undefined,
    sameTripTransactions: sameTripTransactions ?? undefined,
    profileImageUrl: profileImageUrl,
    avatarSeed: avatarSeedForRow,
    organizationImageUrl,
    organizationAvatarSeed,
    paymentMode: row.payment_mode ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    reconciliationStatus: row.reconciliation_status ?? undefined,
    reconciliationLabel: row.reconciliation_label ?? undefined,
    reconciliationActionLabel: row.reconciliation_action_label ?? undefined,
    reconciliationHelperText: row.reconciliation_helper_text ?? undefined,
    counterpartyIntegrated,
    counterpartyId,
    disputeStatus:
      row.trip_id && disputesByTripId[row.trip_id]
        ? (disputesByTripId[row.trip_id].status as "OPEN" | "RESOLVED")
        : null,
    disputeDirection:
      row.trip_id && disputesByTripId[row.trip_id]
        ? (disputesByTripId[row.trip_id].direction as
            | "RAISED_BY_US"
            | "RECEIVED")
        : null,
  };
}
