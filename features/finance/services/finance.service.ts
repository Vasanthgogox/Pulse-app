/**
 * Finance / ledger service — Supabase.
 * Uses public.transactions table (pulse schema: amount_in, amount_out, party_name, transaction_date).
 * When connected to pulse-unified-base DB with cash_entries, that table can be used instead; this keeps compatibility with pulse migrations.
 *
 * Double-entry interpretation: every row maps to a debit/credit pair per docs/CORE_ACCOUNTING_MODEL.md.
 * Use getDoubleEntryFromLedgerRow (features/finance/accounting/accountingModel.ts) for consistent interpretation.
 * Service-layer validation: amount cap, date format, string length.
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import type { DeltaResponse } from "@/lib/cache/deltaTypes";
import { getDriverProfileDisplay, getDriverProfileDisplayBatch } from "@/features/drivers/services/drivers.service";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import {
  AVATAR_BUCKET,
  extractPathFromStorageUrl,
  getSignedAvatarUrl,
  LEGACY_AVATAR_BUCKET,
  resolveAvatarPublicUrl,
} from "@/lib/avatarUpload";
import { LEDGER_PAGE_SIZE, toRange, type PageOpts } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { VALIDATION, dateISO } from "@/lib/validation";
import { getTripOperationalDisplay } from "@/features/operations/display";

/** Join trips for ledger rows; older DBs may not have `trips.display_trip_id` yet (PostgREST 400). */
const LEDGER_TX_SELECT_WITH_TRIPS =
  "*, trips(trip_number, display_trip_id, trip_code, trip_operational_code)" as const;
const LEDGER_TX_SELECT_WITH_TRIPS_LEGACY = "*, trips(trip_number)" as const;

function isMissingTripsDisplayTripIdError(
  error: {
    message?: string;
    code?: string;
  } | null,
): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  if (!msg.includes("display_trip_id")) return false;
  return (
    error.code === "42703" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("column")
  );
}

/** DB / PostgREST rejects linking a ledger row to a trip the tenant cannot anchor (cross-org, no local mirror). */
function isLedgerTripIdRejectedError(
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
): boolean {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`
    .toLowerCase()
    .trim();
  if (!msg) return false;
  if (
    msg.includes("selected trip was not found") ||
    (msg.includes("selected trip") && msg.includes("not found")) ||
    (msg.includes("trip") && msg.includes("not found") && msg.includes("selected"))
  ) {
    return true;
  }
  // Postgres FK / CHECK often surface as 23503 or "violates foreign key" / "is not present in table \"trips\"".
  if (error?.code === "23503") {
    return msg.includes("trip") || msg.includes("trips");
  }
  if (msg.includes("violates foreign key") && (msg.includes("trip") || msg.includes("trips"))) {
    return true;
  }
  if (msg.includes("is not present in table") && msg.includes("trips")) {
    return true;
  }
  return false;
}

/**
 * Resolve avatar_url (path or full URL) + avatar_seed to a single display URI.
 * Supabase storage URLs and paths use signed URLs for the private avatar bucket.
 */
async function resolveDriverAvatarFromProfileFields(
  avatarUrlRaw: string | null | undefined,
  avatarSeedRaw: string | null | undefined,
): Promise<string | null> {
  const raw = (avatarUrlRaw ?? "").trim();
  const seed = (avatarSeedRaw ?? "").trim();

  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const ref = extractPathFromStorageUrl(raw);
      if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
        const signed = await getSignedAvatarUrl(ref.path);
        if (signed) return signed;
      } else {
        return raw;
      }
    } else {
      const signed = await getSignedAvatarUrl(raw);
      if (signed) return signed;
      const publicUrl = resolveAvatarPublicUrl(raw);
      if (publicUrl) return publicUrl;
    }
  }

  if (seed) return getAvatarUriForSeed(seed);
  return null;
}

export async function getProfileImage(
  contactId: string | null | undefined,
  contactType: "client" | "supplier" | "driver" | null | undefined,
): Promise<string | null> {
  if (!contactId || !contactType) return null;
  if (contactType !== "driver") return null;
  const { profile, error } = await getDriverProfileDisplay(String(contactId).trim());
  if (error || !profile) return null;
  return resolveDriverAvatarFromProfileFields(profile.avatarUrl, profile.avatarSeed);
}

/** Batch version: fetch avatar URLs for multiple driver IDs in one RPC call. */
export async function getProfileImageBatch(
  driverIds: string[],
): Promise<Record<string, string>> {
  const ids = driverIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return {};

  const profileMap = await getDriverProfileDisplayBatch(ids);
  const result: Record<string, string> = {};
  for (const [driverId, profile] of Object.entries(profileMap)) {
    const url = await resolveDriverAvatarFromProfileFields(profile.avatarUrl, profile.avatarSeed);
    if (url) result[driverId] = url;
  }
  return result;
}

export interface LedgerRow {
  id: string;
  organization_id: string;
  profileImageUrl?: string | null;
  trip_id: string | null;
  /** Resolved from joined trips.trip_number or trip list */
  trip_number?: string | null;
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  /** From cash_entries for entity tab aggregation */
  contact_id?: string | null;
  contact_type?: "client" | "supplier" | "driver" | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: {
    trip_number: string;
    display_trip_id?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
  } | null;
  primary_category?: string | null;
  payment_mode?: string | null;
  payment_reference?: string | null;
  reconciliation_status?: "match_found" | "reconciled" | "mismatch" | null;
  reconciliation_label?: string | null;
  reconciliation_action_label?: string | null;
  reconciliation_helper_text?: string | null;
  /** Set when migration 20260423190000 is applied; else derived in UI. */
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
  /** Chat "Add to book" mirror — source transaction id (dedupe); migration 20260601100000. */
  chat_mirror_of_transaction_id?: string | null;
}

export interface CreateLedgerEntryData {
  trip_id?: string | null;
  trip_number?: string | null;
  /**
   * When true (Ledger Sync only): use pulse-unified-base / qunifiedbase-style write — no
   * `resolveTripContextForLedgerWrite`, no trip-id retry, description not augmented with QMETA.
   * For cross-org integrated getLoad (indent) flows where the DB expects the owner trip UUID as sent from the UI.
   */
  ledgerWritePassthroughTripContext?: boolean;
  /** Party display name; stored as contact_name */
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date?: string;
  /** When provided, stored on cash_entries for aggregation and auto-tag */
  contact_id?: string | null;
  contact_type?: "client" | "supplier" | "driver" | null;
  category?: string | null;
  indent_id?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
}

type LedgerContactType = "client" | "supplier" | "driver";

const GENERIC_PARTY_LABELS = new Set([
  "",
  "-",
  "—",
  "party",
  "client",
  "supplier",
  "driver",
]);

function normalizePartyName(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

function isGenericPartyName(raw: string | null | undefined): boolean {
  return GENERIC_PARTY_LABELS.has(normalizePartyName(raw).toLowerCase());
}

async function resolveContactDisplayName(
  orgId: string,
  contactType: LedgerContactType,
  contactId: string,
): Promise<string | null> {
  const trimmedContactId = contactId.trim();
  if (!trimmedContactId) return null;

  if (contactType === "client") {
    const { data } = await supabase()
      .from("clients")
      .select("name")
      .eq("organization_id", orgId)
      .eq("id", trimmedContactId)
      .maybeSingle();
    return (
      normalizePartyName((data as { name?: string | null } | null)?.name) ||
      null
    );
  }

  if (contactType === "supplier") {
    const { data } = await supabase()
      .from("suppliers")
      .select("name, company_name")
      .eq("organization_id", orgId)
      .eq("id", trimmedContactId)
      .maybeSingle();
    const row = data as {
      name?: string | null;
      company_name?: string | null;
    } | null;
    return (
      normalizePartyName(row?.name) ||
      normalizePartyName(row?.company_name) ||
      null
    );
  }

  const { data } = await supabase()
    .from("drivers")
    .select("name")
    .eq("organization_id", orgId)
    .eq("id", trimmedContactId)
    .maybeSingle();
  return (
    normalizePartyName((data as { name?: string | null } | null)?.name) || null
  );
}

async function resolveTripContextForLedgerWrite(params: {
  orgId: string;
  tripId?: string | null;
  tripNumber?: string | null;
  indentId?: string | null;
}): Promise<{ tripId: string | null; tripNumber: string | null }> {
  const { orgId } = params;
  const requestedTripId = String(params.tripId ?? "").trim();
  const requestedTripNumber = String(params.tripNumber ?? "").trim();
  const requestedIndentId = String(params.indentId ?? "").trim();
  const looksLikeUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  if (!requestedTripId) {
    return {
      tripId: null,
      tripNumber: requestedTripNumber || null,
    };
  }

  const resolveLocalTripByIndent = async (
    candidateIndentId: string,
  ): Promise<{ tripId: string | null; tripNumber: string | null }> => {
    const normalized = String(candidateIndentId ?? "").trim();
    if (!normalized) return { tripId: null, tripNumber: null };
    const { data: localTripByIndent, error: localTripByIndentError } =
      await supabase()
        .from("trips")
        .select("id, trip_number")
        .eq("organization_id", orgId)
        .eq("indent_id", normalized)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (localTripByIndentError) {
      console.warn("[finance] trip context mapping by indent failed", {
        orgId,
        indentId: normalized,
        detail: localTripByIndentError.message,
      });
      return { tripId: null, tripNumber: null };
    }
    if (!localTripByIndent) return { tripId: null, tripNumber: null };
    return {
      tripId: String((localTripByIndent as { id: string }).id),
      tripNumber: String(
        (localTripByIndent as { trip_number?: string | null }).trip_number ?? "",
      ).trim() || null,
    };
  };

  const resolveLocalTripByNumber = async (
    candidateTripNumber: string,
  ): Promise<{ tripId: string | null; tripNumber: string | null }> => {
    const normalized = String(candidateTripNumber ?? "").trim();
    if (!normalized) return { tripId: null, tripNumber: null };
    const { data: localTrip, error: localTripError } = await supabase()
      .from("trips")
      .select("id, trip_number")
      .eq("organization_id", orgId)
      .eq("trip_number", normalized)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (localTripError) {
      console.warn("[finance] trip context mapping by number failed", {
        orgId,
        tripNumber: normalized,
        detail: localTripError.message,
      });
      return { tripId: null, tripNumber: normalized };
    }
    if (!localTrip) return { tripId: null, tripNumber: normalized };
    return {
      tripId: String((localTrip as { id: string }).id),
      tripNumber: String(
        (localTrip as { trip_number?: string | null }).trip_number ?? normalized,
      ),
    };
  };

  const { data: tripById, error: tripByIdError } = await supabase()
    .from("trips")
    .select("id, organization_id, trip_number")
    .eq("id", requestedTripId)
    .maybeSingle();

  if (tripByIdError) {
    const mappedByIndent = await resolveLocalTripByIndent(requestedIndentId);
    if (mappedByIndent.tripId) return mappedByIndent;
    const mappedByNumber = await resolveLocalTripByNumber(requestedTripNumber);
    if (mappedByNumber.tripId || mappedByNumber.tripNumber) return mappedByNumber;
    if (looksLikeUuid(requestedTripId)) {
      return {
        tripId: requestedTripId,
        tripNumber: requestedTripNumber || null,
      };
    }
    return {
      tripId: null,
      tripNumber: requestedTripNumber || null,
    };
  }

  if (!tripById) {
    // Cross-org / restricted RLS: trip row may be unreadable; map by indent or trip_number in this org when possible.
    const mappedByIndent = await resolveLocalTripByIndent(requestedIndentId);
    if (mappedByIndent.tripId) return mappedByIndent;
    const mappedByNumber = await resolveLocalTripByNumber(requestedTripNumber);
    if (mappedByNumber.tripId) return mappedByNumber;
    if (mappedByNumber.tripNumber) return mappedByNumber;
    if (requestedTripNumber) {
      return {
        tripId: null,
        tripNumber: requestedTripNumber,
      };
    }
    if (looksLikeUuid(requestedTripId)) {
      return {
        tripId: requestedTripId,
        tripNumber: null,
      };
    }
    return {
      tripId: null,
      tripNumber: null,
    };
  }

  const row = tripById as {
    id: string;
    organization_id: string;
    trip_number: string | null;
  };
  if (row.organization_id === orgId) {
    return {
      tripId: row.id,
      tripNumber: requestedTripNumber || (row.trip_number ?? null),
    };
  }

  const candidateTripNumber =
    requestedTripNumber || String(row.trip_number ?? "").trim();

  const mappedByIndent = await resolveLocalTripByIndent(requestedIndentId);
  if (mappedByIndent.tripId) {
    return {
      tripId: mappedByIndent.tripId,
      tripNumber: mappedByIndent.tripNumber ?? (candidateTripNumber || null),
    };
  }

  if (!candidateTripNumber) {
    return {
      // Cross-org trips can still be the intended anchor for shared-ledger entries.
      tripId: row.id,
      tripNumber: requestedTripNumber || null,
    };
  }

  const mappedByNumber = await resolveLocalTripByNumber(candidateTripNumber);
  if (mappedByNumber.tripId) return mappedByNumber;

  // No local mirrored trip row: do not reference the owner-org trip_id from this org's ledger.
  // DB policies / checks often require transactions.trip_id to belong to organization_id; trip_number in meta preserves linkage.
  return {
    tripId: null,
    tripNumber: candidateTripNumber,
  };
}

async function syncTripAmountPaidFromLedger(
  orgId: string,
  tripId: string | null | undefined,
): Promise<void> {
  const normalizedTripId = String(tripId ?? "").trim();
  if (!normalizedTripId) return;
  const { data: sums, error: sumsError } = await supabase()
    .from("transactions")
    .select("amount_in")
    .eq("organization_id", orgId)
    .eq("trip_id", normalizedTripId);
  if (sumsError) {
    console.warn("[finance] trip amount_paid sync read failed", {
      organizationId: orgId,
      tripId: normalizedTripId,
      message: sumsError.message,
    });
    return;
  }
  const totalIn = (sums ?? []).reduce(
    (sum, row) => sum + Number((row as { amount_in?: number | null }).amount_in ?? 0),
    0,
  );
  const amountPaid = Math.max(0, Math.round(totalIn * 100) / 100);
  const { error: updateError } = await supabase()
    .from("trips")
    .update({
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedTripId)
    .eq("organization_id", orgId);
  if (updateError) {
    console.warn("[finance] trip amount_paid sync write failed", {
      organizationId: orgId,
      tripId: normalizedTripId,
      message: updateError.message,
    });
  }
}

function enrichLedgerMetaFromRow(
  entry: CreateLedgerEntryData,
): CreateLedgerEntryData {
  const s = interpretLedgerRowStructured({
    contact_id: entry.contact_id ?? null,
    contact_type: entry.contact_type ?? null,
    trip_id: entry.trip_id ?? null,
    description: entry.description ?? null,
    amount_in: entry.amount_in ?? 0,
    amount_out: entry.amount_out ?? 0,
    vehicle_number: entry.vehicle_number ?? null,
  });
  return {
    ...entry,
    ledger_entity_type: entry.ledger_entity_type ?? s.entity_type,
    ledger_flow_type: entry.ledger_flow_type ?? s.transaction_type,
    ledger_category: entry.ledger_category ?? s.category,
  };
}

type LedgerDescriptionMeta = {
  trip_number?: string | null;
  indent_id?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  payment_mode?: string | null;
  payment_reference?: string | null;
  category?: string | null;
};

const LEDGER_META_PREFIX = "[[QMETA:";
const LEDGER_META_SUFFIX = "]]";

function cleanTextValue(raw: string | null | undefined): string | null {
  const normalized = String(raw ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLedgerMeta(
  meta: LedgerDescriptionMeta,
): LedgerDescriptionMeta | null {
  const normalized: LedgerDescriptionMeta = {
    trip_number: cleanTextValue(meta.trip_number),
    indent_id: cleanTextValue(meta.indent_id),
    vehicle_number: cleanTextValue(meta.vehicle_number),
    driver_name: cleanTextValue(meta.driver_name),
    payment_mode: cleanTextValue(meta.payment_mode),
    payment_reference: cleanTextValue(meta.payment_reference),
    category: cleanTextValue(meta.category),
  };
  const hasAnyValue = Object.values(normalized).some((v) => v != null);
  return hasAnyValue ? normalized : null;
}

function stripLedgerMeta(description: string | null | undefined): string {
  const raw = String(description ?? "");
  const idx = raw.lastIndexOf(LEDGER_META_PREFIX);
  if (idx < 0) return raw.trim();
  return raw.slice(0, idx).trim();
}

function extractLedgerMeta(
  description: string | null | undefined,
): LedgerDescriptionMeta {
  const raw = String(description ?? "");
  const idx = raw.lastIndexOf(LEDGER_META_PREFIX);
  if (idx < 0) return {};
  const start = idx + LEDGER_META_PREFIX.length;
  const end = raw.indexOf(LEDGER_META_SUFFIX, start);
  if (end < 0) return {};
  const encoded = raw.slice(start, end);
  try {
    const parsed = JSON.parse(encoded) as LedgerDescriptionMeta;
    return normalizeLedgerMeta(parsed) ?? {};
  } catch {
    return {};
  }
}

function buildDescriptionWithMeta(
  baseDescription: string,
  meta: LedgerDescriptionMeta,
  maxLength?: number,
): string {
  const normalizedMeta = normalizeLedgerMeta(meta);
  const cleanDescription = stripLedgerMeta(baseDescription);
  if (!normalizedMeta) return cleanDescription;
  const metaSuffix = ` ${LEDGER_META_PREFIX}${JSON.stringify(normalizedMeta)}${LEDGER_META_SUFFIX}`;
  if (!maxLength || maxLength <= 0) return `${cleanDescription}${metaSuffix}`;
  if (metaSuffix.length >= maxLength)
    return cleanDescription.slice(0, maxLength);
  const baseAllowed = Math.max(0, maxLength - metaSuffix.length);
  return `${cleanDescription.slice(0, baseAllowed)}${metaSuffix}`;
}

/** After DB rejects trip_id: null anchor + QMETA trip_number (needed when first attempt used passthrough plain text). */
function buildUnanchoredLedgerRetryDescription(
  payloadDescription: string,
  entry: CreateLedgerEntryData,
  tripNumber: string | null | undefined,
): string {
  const clean =
    stripLedgerMeta(payloadDescription).trim() ||
    String(entry.description ?? "ENTRY").trim() ||
    "ENTRY";
  const baseLine = clean.split("|")[0]?.trim() || clean;
  return buildDescriptionWithMeta(
    baseLine,
    {
      trip_number: cleanTextValue(tripNumber),
      indent_id: entry.indent_id,
      vehicle_number: entry.vehicle_number,
      driver_name: entry.driver_name,
      payment_mode: parsePaymentMode(entry.description),
      payment_reference: parsePaymentReference(entry.description),
      category: normalizePrimaryCategory(entry.description),
    },
    VALIDATION.DESCRIPTION_MAX_LENGTH,
  );
}

function normalizePrimaryCategory(raw: string | null | undefined): string {
  const firstPart = stripLedgerMeta(raw).split("|")[0]?.trim();
  return firstPart || "ENTRY";
}

function parsePaymentMode(raw: string | null | undefined): string | null {
  const meta = extractLedgerMeta(raw);
  if (meta.payment_mode) return meta.payment_mode;
  const match = stripLedgerMeta(raw).match(/(?:^|\|)\s*Mode:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function parsePaymentReference(raw: string | null | undefined): string | null {
  const meta = extractLedgerMeta(raw);
  if (meta.payment_reference) return meta.payment_reference;
  const match = stripLedgerMeta(raw).match(/(?:^|\|)\s*UTR:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function deriveReconciliationMeta(row: {
  description?: string | null;
  /** Full description before stripLedgerMeta — used to read QMETA trip_number when trip_id is null. */
  descriptionRaw?: string | null;
  trip_id?: string | null;
  contact_id?: string | null;
  contact_type?: LedgerRow["contact_type"];
  amount_in?: number;
  amount_out?: number;
}): Pick<
  LedgerRow,
  | "reconciliation_status"
  | "reconciliation_label"
  | "reconciliation_action_label"
  | "reconciliation_helper_text"
> {
  const description = String(row.description ?? "").toLowerCase();
  if (description.includes("shared ledger sync")) {
    return {
      reconciliation_status: "reconciled",
      reconciliation_label: "Reconciled",
      reconciliation_action_label: "View linked entry",
      reconciliation_helper_text: "Linked using shared ledger reconciliation.",
    };
  }

  const hasCounterparty = !!row.contact_id && !!row.contact_type;
  const metaTrip = extractLedgerMeta(row.descriptionRaw ?? row.description ?? "");
  const hasTripAnchor =
    !!row.trip_id ||
    !!(metaTrip.trip_number && String(metaTrip.trip_number).trim());
  const hasMoney =
    Number(row.amount_in ?? 0) > 0 || Number(row.amount_out ?? 0) > 0;
  if (hasCounterparty && hasTripAnchor && hasMoney) {
    return {
      reconciliation_status: "match_found",
      reconciliation_label: "Match found",
      reconciliation_action_label:
        Number(row.amount_out ?? 0) > 0 ? "Edit & link" : "Validate & link",
      reconciliation_helper_text:
        "Trip, party, and amount are ready for reconciliation.",
    };
  }

  return {
    reconciliation_status: null,
    reconciliation_label: null,
    reconciliation_action_label: null,
    reconciliation_helper_text: null,
  };
}

function toLedgerRow(row: {
  id: string;
  organization_id: string;
  trip_id: string | null;
  trip_number?: string | null;
  party_name: string | null;
  description: string | null;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  contact_id: string | null;
  contact_type: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: {
    trip_number: string;
    display_trip_id?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
  } | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
}): LedgerRow {
  const descriptionRaw = row.description ?? "ENTRY";
  const description = stripLedgerMeta(descriptionRaw) || "ENTRY";
  const meta = extractLedgerMeta(descriptionRaw);
  const tripNumber = getTripOperationalDisplay({
    trip_operational_code: row.trips?.trip_operational_code ?? null,
    trip_code: row.trips?.trip_code ?? null,
    display_trip_id: row.trips?.display_trip_id ?? null,
    trip_number: row.trips?.trip_number ?? row.trip_number ?? meta.trip_number ?? null,
  });
  const interpreted = interpretLedgerRowStructured({
    contact_id: row.contact_id,
    contact_type: row.contact_type,
    trip_id: row.trip_id,
    description: descriptionRaw,
    amount_in: row.amount_in,
    amount_out: row.amount_out,
    vehicle_number: row.vehicle_number ?? null,
  });
  return {
    id: row.id,
    organization_id: row.organization_id,
    trip_id: row.trip_id ?? null,
    trip_number: tripNumber === "—" ? null : tripNumber,
    party_name: row.party_name ?? "—",
    description,
    amount_in: Number(row.amount_in ?? 0),
    amount_out: Number(row.amount_out ?? 0),
    transaction_date: row.transaction_date,
    created_at: row.created_at,
    contact_id: row.contact_id ?? null,
    contact_type: (row.contact_type as LedgerRow["contact_type"]) ?? null,
    vehicle_number: row.vehicle_number ?? meta.vehicle_number ?? null,
    driver_name: row.driver_name ?? meta.driver_name ?? null,
    trips: row.trips
      ? {
          trip_number: getTripOperationalDisplay({
            trip_operational_code: row.trips.trip_operational_code ?? null,
            trip_code: row.trips.trip_code ?? null,
            display_trip_id: row.trips.display_trip_id ?? null,
            trip_number: row.trips.trip_number,
          }),
          display_trip_id: getTripOperationalDisplay({
            trip_operational_code: row.trips.trip_operational_code ?? null,
            trip_code: row.trips.trip_code ?? null,
            display_trip_id: row.trips.display_trip_id ?? null,
            trip_number: row.trips.trip_number,
          }),
          trip_code: row.trips.trip_code ?? null,
          trip_operational_code: row.trips.trip_operational_code ?? null,
        }
      : null,
    profileImageUrl: null,
    primary_category:
      (row.ledger_category ?? "").trim() ||
      normalizePrimaryCategory(descriptionRaw),
    payment_mode: parsePaymentMode(descriptionRaw),
    payment_reference: parsePaymentReference(descriptionRaw),
    ...deriveReconciliationMeta({
      description,
      descriptionRaw,
      trip_id: row.trip_id,
      contact_id: row.contact_id,
      contact_type: (row.contact_type as LedgerRow["contact_type"]) ?? null,
      amount_in: row.amount_in,
      amount_out: row.amount_out,
    }),
    ledger_entity_type: row.ledger_entity_type ?? interpreted.entity_type,
    ledger_flow_type: row.ledger_flow_type ?? interpreted.transaction_type,
    ledger_category: row.ledger_category ?? interpreted.category,
  };
}

export async function getTransactionsByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{
  error: Error | null;
  transactions: LedgerRow[];
  hasMore?: boolean;
}> {
  const base = (tripSelect: string) =>
    supabase()
      .from("transactions")
      .select(tripSelect)
      .eq("organization_id", orgId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

  type Row = Parameters<typeof toLedgerRow>[0];

  if (opts != null) {
    const limit = opts.limit ?? LEDGER_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { from, to } = toRange(offset, limit);
    let { data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS).range(from, to);
    if (error && isMissingTripsDisplayTripIdError(error)) {
      ({ data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY).range(
        from,
        to,
      ));
    }
    if (error) return { error: new Error(error.message), transactions: [] };
    const rows = (data ?? []) as unknown as Row[];
    const transactions: LedgerRow[] = rows.map(toLedgerRow);
    return { error: null, transactions, hasMore: transactions.length === limit };
  }

  let { data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS).limit(500);
  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY).limit(500));
  }
  if (error) return { error: new Error(error.message), transactions: [] };

  const rows = (data ?? []) as unknown as Row[];
  const transactions: LedgerRow[] = rows.map(toLedgerRow);

  return { error: null, transactions };
}

export async function getTransactionsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<LedgerRow> }> {
  const { data, error } = await supabase().rpc("get_transactions_delta", {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) {
    return {
      error: new Error(error.message),
      delta: { changed: [], deletedIds: [], nextCursor: since },
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: LedgerRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as LedgerRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncTransactionsWithCache(
  orgId: string,
  currentRows: LedgerRow[],
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  try {
    const transactions = await syncDomainRows<LedgerRow>({
      domain: "transactions",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 4 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getTransactionsByOrganization(orgId);
        if (res.error) throw res.error;
        return res.transactions;
      },
      getDelta: async (cursor) => {
        const res = await getTransactionsDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) =>
            new Date(b.transaction_date).getTime() -
            new Date(a.transaction_date).getTime(),
        }),
    });
    return { error: null, transactions };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      transactions: currentRows,
    };
  }
}

/** Fetch ledger transactions for a specific party (client/entity level). */
export async function getTransactionsByOrganizationAndParty(
  orgId: string,
  partyName: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!partyName?.trim()) return getTransactionsByOrganization(orgId);
  let { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .eq("organization_id", orgId)
    .ilike("party_name", `%${partyName.trim()}%`)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .ilike("party_name", `%${partyName.trim()}%`)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>;
  return { error: null, transactions: rows.map(toLedgerRow) };
}

/** Fetch ledger transactions for a specific contact (client/supplier id). Used for dispute audit. */
export async function getTransactionsByOrganizationAndContactId(
  orgId: string,
  contactId: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!contactId?.trim()) return { error: null, transactions: [] };
  let { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>;
  return { error: null, transactions: rows.map(toLedgerRow) };
}

/** Fetch ledger transactions for a driver (contact_type=driver, contact_id=driverId). Used for driver LEDGER tab. */
export async function getTransactionsByOrganizationAndDriver(
  orgId: string,
  driverId: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!driverId?.trim()) return { error: null, transactions: [] };
  let { data, error } = await supabase()
    .from("transactions")
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .eq("organization_id", orgId)
    .eq("contact_type", "driver")
    .eq("contact_id", driverId.trim())
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .eq("contact_type", "driver")
      .eq("contact_id", driverId.trim())
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: { trip_number: string } | null;
  }>;
  const transactions: LedgerRow[] = rows.map(toLedgerRow);
  return { error: null, transactions };
}

type InsertedTxnRowForChat = {
  id: string;
  trip_id: string | null;
  party_name: string | null;
  description: string | null;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  contact_id: string | null;
  contact_type: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: {
    trip_number: string;
    display_trip_id?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
  } | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
};

/**
 * Integrated client/supplier: post ledger_event after insert. Errors are swallowed
 * (ledger succeeded); must run to completion — do not detach as untracked promises.
 */
async function tryNotifyLinkedPartyChatAfterLedgerInsert(
  orgId: string,
  row: InsertedTxnRowForChat,
): Promise<void> {
  const ct = (row.contact_type ?? "").toLowerCase();
  if (
    !row.trip_id ||
    !(ct === "client" || ct === "supplier") ||
    !row.contact_id
  )
    return;

  const isIn = row.amount_in > 0;
  try {
    const { data: linkedOrg, error: linkErr } =
      ct === "client"
        ? await supabase()
            .from("clients")
            .select("linked_organization_id, name")
            .eq("id", row.contact_id!)
            .maybeSingle()
        : await supabase()
            .from("suppliers")
            .select("linked_organization_id, company_name, name")
            .eq("id", row.contact_id!)
            .maybeSingle();

    if (linkErr) {
      console.warn(
        "[finance] linked party lookup failed (ledger_event skipped)",
        {
          transactionId: row.id,
          contactType: ct,
          contactId: row.contact_id,
          message: linkErr.message,
        },
      );
      return;
    }

    if (!linkedOrg?.linked_organization_id) return;

    // RLS: users can SELECT only organizations they belong to. Receiver (linked tenant) is blocked,
    // so receiver org name must fall back to the client/supplier record we already read.
    const receiverOrgId = linkedOrg.linked_organization_id;
    const receiverPartyFallback =
      ct === "client"
        ? normalizePartyName((linkedOrg as { name?: string | null }).name)
        : normalizePartyName(
            (
              linkedOrg as {
                company_name?: string | null;
                name?: string | null;
              }
            ).company_name,
          ) || normalizePartyName((linkedOrg as { name?: string | null }).name);

    const [{ data: senderOrg }, { data: receiverOrgRow }] = await Promise.all([
      supabase()
        .from("organizations")
        .select("id, name")
        .eq("id", orgId)
        .maybeSingle(),
      supabase()
        .from("organizations")
        .select("id, name")
        .eq("id", receiverOrgId)
        .maybeSingle(),
    ]);

    if (!senderOrg?.id) {
      console.warn("[finance] sender org missing for ledger_event", {
        transactionId: row.id,
      });
      return;
    }

    const receiverOrgNameResolved =
      normalizePartyName(receiverOrgRow?.name) ||
      receiverPartyFallback ||
      receiverOrgId;

    const { postLedgerEventToChat } = await import("@/features/chat/services/chatLedgerBridge.service");
    await postLedgerEventToChat({
      tripId: row.trip_id!,
      transactionId: row.id,
      amount: isIn ? row.amount_in : row.amount_out,
      flow: isIn ? "in" : "out",
      contactType: ct as "client" | "supplier",
      contactId: row.contact_id!,
      category: normalizePrimaryCategory(row.description) ?? "Payment",
      paymentMode: parsePaymentMode(row.description) ?? "Cash",
      referenceNumber: parsePaymentReference(row.description),
      notes: null,
      senderOrgId: senderOrg.id,
      senderOrgName: senderOrg.name ?? orgId,
      receiverOrgId,
      receiverOrgName: receiverOrgNameResolved,
    });
  } catch (e) {
    console.warn("[finance] ledger_event chat post failed", {
      transactionId: row.id,
      tripId: row.trip_id,
      organizationId: orgId,
      contactType: ct,
      contactId: row.contact_id,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function createLedgerEntry(
  orgId: string,
  entry: CreateLedgerEntryData,
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  const passthroughTripContext = entry.ledgerWritePassthroughTripContext === true;
  const enriched = enrichLedgerMetaFromRow(entry);
  const amountIn = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_in ?? 0),
  );
  const amountOut = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_out ?? 0),
  );
  const rawDate = (
    enriched.transaction_date ?? new Date().toISOString().slice(0, 10)
  ).slice(0, 10);
  const dateErr = dateISO()(rawDate);
  const date = dateErr ? new Date().toISOString().slice(0, 10) : rawDate;
  if (enriched.contact_type && !enriched.contact_id) {
    return {
      error: new Error("Missing contact_id for ledger contact_type entry."),
      row: null,
    };
  }
  const normalizedContactType = (enriched.contact_type ??
    null) as LedgerContactType | null;
  const normalizedContactId = normalizePartyName(enriched.contact_id);
  const fallbackPartyName =
    normalizePartyName(enriched.party_name || "—") || "—";
  const resolvedPartyName =
    normalizedContactType && normalizedContactId
      ? await resolveContactDisplayName(
          orgId,
          normalizedContactType,
          normalizedContactId,
        )
      : null;
  if (
    normalizedContactType &&
    normalizedContactId &&
    !resolvedPartyName &&
    isGenericPartyName(fallbackPartyName)
  ) {
    return {
      error: new Error(
        `Missing ${normalizedContactType} name for selected contact.`,
      ),
      row: null,
    };
  }
  const partyName = (
    (resolvedPartyName || fallbackPartyName).trim() || "—"
  ).slice(0, VALIDATION.PARTY_NAME_MAX_LENGTH);
  const tripContext = passthroughTripContext
    ? {
        tripId: enriched.trip_id ?? null,
        tripNumber: enriched.trip_number ?? null,
      }
    : await resolveTripContextForLedgerWrite({
        orgId,
        tripId: enriched.trip_id,
        tripNumber: enriched.trip_number,
        indentId: enriched.indent_id,
      });
  const description = passthroughTripContext
    ? String(enriched.description ?? "ENTRY").slice(
        0,
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      )
    : buildDescriptionWithMeta(
        entry.description ?? "ENTRY",
        {
          trip_number: tripContext.tripNumber,
          indent_id: entry.indent_id,
          vehicle_number: entry.vehicle_number,
          driver_name: entry.driver_name,
          payment_mode: parsePaymentMode(entry.description),
          payment_reference: parsePaymentReference(entry.description),
          category: normalizePrimaryCategory(entry.description),
        },
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      );
  // DB CHECK: exactly one of amount_in or amount_out must be positive
  const isCashIn = amountIn > 0;

  const payload = {
    organization_id: orgId,
    trip_id: tripContext.tripId,
    party_name: partyName,
    description,
    amount_in: isCashIn ? amountIn : 0,
    amount_out: isCashIn ? 0 : amountOut,
    transaction_date: date,
    contact_id: enriched.contact_id ?? null,
    contact_type: enriched.contact_type ?? null,
    ledger_entity_type: enriched.ledger_entity_type ?? null,
    ledger_flow_type: enriched.ledger_flow_type ?? null,
    ledger_category: enriched.ledger_category ?? null,
  };

  let { data, error } = await supabase()
    .from("transactions")
    .insert(payload)
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .single();

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .insert(payload)
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .single());
  }

  if (
    error &&
    isLedgerTripIdRejectedError(error) &&
    (enriched.contact_type === "supplier" ||
      enriched.contact_type === "client" ||
      enriched.ledger_entity_type === "vehicle") &&
    payload.trip_id != null
  ) {
    // Integrated / getLoad: trip_id may be rejected (incl. after passthrough first attempt). Retry unanchored + QMETA trip_number.
    const unanchoredPayload = {
      ...payload,
      trip_id: null,
      description: buildUnanchoredLedgerRetryDescription(
        payload.description,
        entry,
        tripContext.tripNumber ?? enriched.trip_number,
      ),
    };
    ({ data, error } = await supabase()
      .from("transactions")
      .insert(unanchoredPayload)
      .select(LEDGER_TX_SELECT_WITH_TRIPS)
      .single());
    if (error && isMissingTripsDisplayTripIdError(error)) {
      ({ data, error } = await supabase()
        .from("transactions")
        .insert(unanchoredPayload)
        .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
        .single());
    }
  }

  if (error) return { error: new Error(error.message), row: null };

  const row = data as InsertedTxnRowForChat & {
    organization_id: string;
  };

  await syncTripAmountPaidFromLedger(orgId, row.trip_id ?? null);
  await tryNotifyLinkedPartyChatAfterLedgerInsert(orgId, row);
  notifyTripChatMessagesChanged();

  return { error: null, row: toLedgerRow(row) };
}

export async function updateLedgerEntry(
  orgId: string,
  entryId: string,
  entry: CreateLedgerEntryData,
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  const passthroughTripContext = entry.ledgerWritePassthroughTripContext === true;
  const enriched = enrichLedgerMetaFromRow(entry);
  const amountIn = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_in ?? 0),
  );
  const amountOut = Math.max(
    0,
    Math.min(VALIDATION.AMOUNT_MAX, enriched.amount_out ?? 0),
  );
  const rawDate = (
    enriched.transaction_date ?? new Date().toISOString().slice(0, 10)
  ).slice(0, 10);
  const date = dateISO()(rawDate)
    ? new Date().toISOString().slice(0, 10)
    : rawDate;
  const isCashIn = amountIn > 0;
  if (enriched.contact_type && !enriched.contact_id) {
    return {
      error: new Error("Missing contact_id for ledger contact_type entry."),
      row: null,
    };
  }
  const normalizedContactType = (enriched.contact_type ??
    null) as LedgerContactType | null;
  const normalizedContactId = normalizePartyName(enriched.contact_id);
  const fallbackPartyName =
    normalizePartyName(enriched.party_name || "—") || "—";
  const resolvedPartyName =
    normalizedContactType && normalizedContactId
      ? await resolveContactDisplayName(
          orgId,
          normalizedContactType,
          normalizedContactId,
        )
      : null;
  if (
    normalizedContactType &&
    normalizedContactId &&
    !resolvedPartyName &&
    isGenericPartyName(fallbackPartyName)
  ) {
    return {
      error: new Error(
        `Missing ${normalizedContactType} name for selected contact.`,
      ),
      row: null,
    };
  }
  const partyName = (
    (resolvedPartyName || fallbackPartyName).trim() || "—"
  ).slice(0, VALIDATION.PARTY_NAME_MAX_LENGTH);
  const tripContext = passthroughTripContext
    ? {
        tripId: enriched.trip_id ?? null,
        tripNumber: enriched.trip_number ?? null,
      }
    : await resolveTripContextForLedgerWrite({
        orgId,
        tripId: enriched.trip_id,
        tripNumber: enriched.trip_number,
        indentId: enriched.indent_id,
      });
  const description = passthroughTripContext
    ? String(enriched.description ?? "ENTRY").slice(
        0,
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      )
    : buildDescriptionWithMeta(
        entry.description ?? "ENTRY",
        {
          trip_number: tripContext.tripNumber,
          indent_id: entry.indent_id,
          vehicle_number: entry.vehicle_number,
          driver_name: entry.driver_name,
          payment_mode: parsePaymentMode(entry.description),
          payment_reference: parsePaymentReference(entry.description),
          category: normalizePrimaryCategory(entry.description),
        },
        VALIDATION.DESCRIPTION_MAX_LENGTH,
      );

  const payload = {
    trip_id: tripContext.tripId,
    party_name: partyName,
    description,
    amount_in: isCashIn ? amountIn : 0,
    amount_out: isCashIn ? 0 : amountOut,
    transaction_date: date,
    contact_id: enriched.contact_id ?? null,
    contact_type: enriched.contact_type ?? null,
    ledger_entity_type: enriched.ledger_entity_type ?? null,
    ledger_flow_type: enriched.ledger_flow_type ?? null,
    ledger_category: enriched.ledger_category ?? null,
  };

  let { data, error } = await supabase()
    .from("transactions")
    .update(payload)
    .eq("id", entryId)
    .eq("organization_id", orgId)
    .select(LEDGER_TX_SELECT_WITH_TRIPS)
    .single();

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .update(payload)
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .single());
  }

  if (
    error &&
    isLedgerTripIdRejectedError(error) &&
    (enriched.contact_type === "supplier" ||
      enriched.contact_type === "client" ||
      enriched.ledger_entity_type === "vehicle") &&
    payload.trip_id != null
  ) {
    const unanchoredPayload = {
      ...payload,
      trip_id: null,
      description: buildUnanchoredLedgerRetryDescription(
        payload.description,
        entry,
        tripContext.tripNumber ?? enriched.trip_number,
      ),
    };
    ({ data, error } = await supabase()
      .from("transactions")
      .update(unanchoredPayload)
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .select(LEDGER_TX_SELECT_WITH_TRIPS)
      .single());
    if (error && isMissingTripsDisplayTripIdError(error)) {
      ({ data, error } = await supabase()
        .from("transactions")
        .update(unanchoredPayload)
        .eq("id", entryId)
        .eq("organization_id", orgId)
        .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
        .single());
    }
  }

  if (error) return { error: new Error(error.message), row: null };
  if (!data) return { error: new Error("Update returned no row"), row: null };

  const row = data as {
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: {
      trip_number: string;
      display_trip_id?: string | null;
      trip_code?: string | null;
      trip_operational_code?: string | null;
    } | null;
    ledger_entity_type?: string | null;
    ledger_flow_type?: string | null;
    ledger_category?: string | null;
  };

  await syncTripAmountPaidFromLedger(orgId, row.trip_id ?? null);
  // updateLedgerEntry intentionally does not post to chat to avoid duplicate events.
  return { error: null, row: toLedgerRow(row) };
}

/**
 * Create an opening balance entry for a client or supplier.
 * Called during onboarding when a company migrates from another system.
 *
 * For a CLIENT with outstanding RECEIVABLE: amount_in = outstanding (they owe us)
 * For a SUPPLIER with outstanding PAYABLE: amount_out = outstanding (we owe them)
 *
 * The entry is flagged is_opening_balance=true so it's excluded from normal P&L.
 */
export async function createOpeningBalance(
  orgId: string,
  params: {
    contactType: 'client' | 'supplier';
    contactId: string;
    partyName: string;
    amount: number;
    direction: 'receivable' | 'payable';  // receivable = they owe us; payable = we owe them
    asOnDate: string;  // YYYY-MM-DD
  },
): Promise<{ error: Error | null }> {
  const isReceivable = params.direction === 'receivable';
  const { data, error } = await supabase()
    .from('transactions')
    .insert({
      organization_id: orgId,
      party_name: params.partyName,
      description: `Opening balance as on ${params.asOnDate}`,
      amount_in:   isReceivable ? params.amount : 0,
      amount_out:  isReceivable ? 0 : params.amount,
      transaction_date: params.asOnDate,
      contact_id:   params.contactId,
      contact_type: params.contactType,
      ledger_flow_type: 'opening_balance',
      is_opening_balance: true,
    });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
