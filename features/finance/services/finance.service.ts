/**
 * Finance / ledger service — Supabase.
 * Uses public.transactions table (q-mobile schema: amount_in, amount_out, party_name, transaction_date).
 * When connected to Q-unified-base DB with cash_entries, that table can be used instead; this keeps compatibility with q-mobile migrations.
 *
 * Double-entry interpretation: every row maps to a debit/credit pair per docs/CORE_ACCOUNTING_MODEL.md.
 * Use getDoubleEntryFromLedgerRow (features/finance/accounting/accountingModel.ts) for consistent interpretation.
 * Service-layer validation: amount cap, date format, string length.
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { postLedgerEventToChat } from "@/features/chat/services/chatLedgerBridge.service";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import { LEDGER_PAGE_SIZE, type PageOpts } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { VALIDATION, dateISO } from "@/lib/validation";

/** Join trips for ledger rows; older DBs may not have `trips.display_trip_id` yet (PostgREST 400). */
const LEDGER_TX_SELECT_WITH_TRIPS =
  "*, trips(trip_number, display_trip_id)" as const;
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

export async function getProfileImage(
  contactId: string | null | undefined,
  contactType: "client" | "supplier" | "driver" | null | undefined,
): Promise<string | null> {
  if (!contactId || !contactType) return null;

  // Only drivers have a user_id → profiles link; clients/suppliers have no direct profile connection.
  if (contactType !== "driver") return null;

  // Step 1: get user_id from the driver record
  const { data: driverData, error: driverError } = await supabase()
    .from("drivers")
    .select("user_id")
    .eq("id", contactId)
    .maybeSingle();

  if (driverError || !driverData?.user_id) return null;

  // Step 2: get avatar_url + avatar_seed from profiles
  const { data: profileData, error: profileError } = await supabase()
    .from("profiles")
    .select("avatar_url, avatar_seed")
    .eq("id", driverData.user_id)
    .maybeSingle();

  if (profileError || !profileData) return null;

  // Public bucket — resolve synchronously, no signed URL round-trip needed
  const publicUrl = resolveAvatarPublicUrl(profileData.avatar_url);
  if (publicUrl) return publicUrl;

  // Fall back to preset avatar from seed
  const seed = (profileData.avatar_seed ?? "").trim();
  if (!seed) return null;
  return getAvatarUriForSeed(seed);
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
  trips?: { trip_number: string; display_trip_id?: string | null } | null;
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
}

export interface CreateLedgerEntryData {
  trip_id?: string | null;
  trip_number?: string | null;
  /**
   * When true (Ledger Sync only): use q-unified-base / qunifiedbase-style write — no
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
}): Promise<{ tripId: string | null; tripNumber: string | null }> {
  const { orgId } = params;
  const requestedTripId = String(params.tripId ?? "").trim();
  const requestedTripNumber = String(params.tripNumber ?? "").trim();

  if (!requestedTripId) {
    return {
      tripId: null,
      tripNumber: requestedTripNumber || null,
    };
  }

  const findLocalTripByNumber = async (candidateTripNumber: string) => {
    const { data: localTrip, error: localTripError } = await supabase()
      .from("trips")
      .select("id, trip_number")
      .eq("organization_id", orgId)
      .eq("trip_number", candidateTripNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (localTripError) {
      throw new Error(`Failed to map trip context: ${localTripError.message}`);
    }
    return localTrip as { id: string; trip_number?: string | null } | null;
  };

  const { data: tripById, error: tripByIdError } = await supabase()
    .from("trips")
    .select("id, organization_id, trip_number")
    .eq("id", requestedTripId)
    .maybeSingle();

  if (tripByIdError) {
    throw new Error(`Failed to resolve trip context: ${tripByIdError.message}`);
  }

  if (!tripById) {
    if (requestedTripNumber) {
      const localTrip = await findLocalTripByNumber(requestedTripNumber);
      if (localTrip) {
        return {
          tripId: String(localTrip.id),
          tripNumber: String(localTrip.trip_number ?? requestedTripNumber),
        };
      }
      // Trip row not visible (RLS) and no local mirror: unanchored write with trip_number only.
      return {
        tripId: null,
        tripNumber: requestedTripNumber,
      };
    }
    // Last resort: keep id only when we have no trip_number to preserve in meta.
    return {
      tripId: requestedTripId,
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
  if (!candidateTripNumber) {
    throw new Error(
      "Invalid trip context: trip belongs to another organization.",
    );
  }

  const localTrip = await findLocalTripByNumber(candidateTripNumber);
  if (localTrip) {
    return {
      tripId: String((localTrip as { id: string }).id),
      tripNumber: String(
        (localTrip as { trip_number?: string | null }).trip_number ??
          candidateTripNumber,
      ),
    };
  }

  // No local mirrored trip row: do not reference the owner-org trip_id from this org's ledger.
  // DB policies / checks often require transactions.trip_id to belong to organization_id; trip_number in meta preserves linkage.
  return {
    tripId: null,
    tripNumber: candidateTripNumber,
  };
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
  trips?: { trip_number: string; display_trip_id?: string | null } | null;
  ledger_entity_type?: string | null;
  ledger_flow_type?: string | null;
  ledger_category?: string | null;
}): LedgerRow {
  const descriptionRaw = row.description ?? "ENTRY";
  const description = stripLedgerMeta(descriptionRaw) || "ENTRY";
  const meta = extractLedgerMeta(descriptionRaw);
  const tripNumber =
    row.trips?.display_trip_id ??
    row.trips?.trip_number ??
    row.trip_number ??
    meta.trip_number ??
    null;
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
    trip_number: tripNumber,
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
          trip_number: row.trips.trip_number,
          display_trip_id: row.trips.display_trip_id ?? row.trips.trip_number,
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
    let { data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS).range(
      offset,
      offset + limit,
    );
    if (error && isMissingTripsDisplayTripIdError(error)) {
      ({ data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY).range(
        offset,
        offset + limit,
      ));
    }
    if (error) return { error: new Error(error.message), transactions: [] };
    const rows = (data ?? []) as unknown as Row[];
    const transactions: LedgerRow[] = rows.slice(0, limit).map(toLedgerRow);
    return { error: null, transactions, hasMore: rows.length > limit };
  }

  let { data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS);
  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await base(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY));
  }
  if (error) return { error: new Error(error.message), transactions: [] };

  const rows = (data ?? []) as unknown as Row[];
  const transactions: LedgerRow[] = rows.map(toLedgerRow);

  return { error: null, transactions };
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
    .order("created_at", { ascending: false });

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .ilike("party_name", `%${partyName.trim()}%`)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }));
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
    .order("created_at", { ascending: false });

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }));
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
    .order("created_at", { ascending: false });

  if (error && isMissingTripsDisplayTripIdError(error)) {
    ({ data, error } = await supabase()
      .from("transactions")
      .select(LEDGER_TX_SELECT_WITH_TRIPS_LEGACY)
      .eq("organization_id", orgId)
      .eq("contact_type", "driver")
      .eq("contact_id", driverId.trim())
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }));
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
  trips?: { trip_number: string; display_trip_id?: string | null } | null;
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
    (enriched.contact_type === "supplier" || enriched.contact_type === "client") &&
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
    (enriched.contact_type === "supplier" || enriched.contact_type === "client") &&
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
    trips?: { trip_number: string; display_trip_id?: string | null } | null;
    ledger_entity_type?: string | null;
    ledger_flow_type?: string | null;
    ledger_category?: string | null;
  };

  // updateLedgerEntry intentionally does not post to chat to avoid duplicate events.
  return { error: null, row: toLedgerRow(row) };
}
