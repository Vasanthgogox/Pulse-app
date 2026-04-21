/**
 * Compare & Verify — trip-level shared ledger audit for a single partner (client/supplier).
 * Shows Trip | Sales (My Book / Partner) | Paid (My Book / Partner) with expandable
 * reconciliation statement and Raise Dispute. Matches reference UX; uses Theme and app terms.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getClientById } from "@/features/clients/services/clients.service";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import {
  createTrip,
  getTripDisplayNumber,
  type CreateTripData,
  type TripRow,
} from "@/features/trips";
import {
    createConnectionRequest,
    getConnectionInviteeByPhone,
    getConnectionRequestsSent,
    type ConnectionInviteeByPhone,
} from "@/services/connectionRequestsService";
import {
    acceptPartnerView,
    createDispute,
    getDisputesForPartner,
    getDisputesReceived,
    getSharedLedgerConnections,
    getSharedLedgerEntriesForPartner,
    getSharedLedgerTripSummary,
    resolveDispute,
    resolveDisputeTableOnly,
    type DisputeRow,
    type SharedLedgerEntry,
} from "@/services/sharedLedgerService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createLedgerEntry, type LedgerRow } from "../services/finance.service";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import {
  SHARED_LEDGER_AWAITING_PARTNER_UPDATE,
  SHARED_LEDGER_PARTNER_PENDING_LABEL,
  inferSharedTxnLineKind,
  type InternalTrip,
  type ReconciledRow,
  type ReconStatus,
} from "./sharedLedgerTypes";
import {
  SharedLedgerCommandCenter,
  type CommandTxnRow,
} from "./SharedLedgerCommandCenter";
import { LedgerReportModal } from "./LedgerReportModal";

export interface SharedTripData {
  tripId: string;
  sales: number;
  paid: number;
}

export interface EntityCompareVerifyViewProps {
  entity: {
    id: string;
    name: string;
    linked_organization_id?: string | null;
    /** Optional; when set, shared-ledger hub shows partner photo (public URL) or initials. */
    avatar_url?: string | null;
  };
  entityType: "CLIENT" | "SUPPLIER";
  trips: TripRow[];
  transactions: LedgerRow[] | null | undefined;
  organizationId: string | null;
  /** Whether partner has shared-ledger connection; when false show "Partner Not Integrated". */
  integrated?: boolean;
  /** Optional partner view per trip; when absent we fetch from API or show PENDING. */
  sharedTrips?: SharedTripData[];
  /** Called after Update My Book, Accept, Decline, or Submit Dispute so parent can refetch. */
  onRefresh?: () => void;
  /** When true, labels show partner perspective (e.g. "My Book" = partner's book). */
  viewAsPartner?: boolean;
  /** When true, header/tabs/summary are provided by overlay; hide "SHARED LEDGER AUDIT" and summary card here. */
  embeddedInOverlay?: boolean;
  /** Callback to trigger connection invitation logic. */
  onRequestInvite?: () => void;
  /** Optional callback to trigger a connection request for a partner already in the app. */
  onRequestConnection?: () => void;
  /** Optional callback to trigger an invitation to join the app for a partner not yet in the app. */
  onInviteToApp?: () => void;
  /**
   * Increment from parent (e.g. party detail header download) to open the same PDF/Excel
   * flow as Trips tab — while Shared tab is active.
   */
  externalDownloadRequest?: number;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function formatTxnShortDate(iso: string | undefined | null): string {
  if (iso == null || !String(iso).trim()) return "";
  const raw = String(iso).trim();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function normTripKey(s: string | null | undefined): string {
  return s == null ? "" : String(s).trim().toLowerCase();
}

function tripStatusLabelForReport(r: ReconciledRow): string {
  if (r.status === "VERIFIED") return "Same";
  if (r.status === "PENDING") return SHARED_LEDGER_PARTNER_PENDING_LABEL;
  if (r.status === "MISMATCH") return "Different";
  return "New";
}

function txnStatusLabelForReport(
  s: "matched" | "no_entry" | "pending" | "conflict",
): string {
  if (s === "matched") return "Same";
  if (s === "no_entry") return "Add to yours";
  if (s === "pending") return SHARED_LEDGER_PARTNER_PENDING_LABEL;
  return "Different";
}

function partnerBookLine(row: ReconciledRow): string {
  return row.external ? "In partner book" : SHARED_LEDGER_AWAITING_PARTNER_UPDATE;
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function compactLedgerRef(
  paymentRef: string | null | undefined,
  idFallback: string,
): string {
  const p = (paymentRef ?? "").trim();
  if (p) return p.length > 24 ? `${p.slice(0, 24)}…` : p;
  const id = idFallback.trim();
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

function modeLabel(raw: string | null | undefined): string {
  const m = (raw ?? "").trim();
  return m ? m.toUpperCase() : "—";
}

/** Build internal per-trip from trips + transactions (O(n)).
 * viewerOrgId: when set, trips owned by a different org are supplier-view trips — use supplier_rate
 * for both CLIENT and SUPPLIER entity types to show the amount this org earns/owes (not client's billing). */
function buildInternalTrips(
  trips: TripRow[],
  transactions: LedgerRow[],
  entityId: string,
  entityType: "CLIENT" | "SUPPLIER",
  viewerOrgId?: string | null,
): Map<string, InternalTrip> {
  const norm = (id: string | null | undefined) =>
    id == null ? "" : String(id).trim().toLowerCase();
  const linkedTripIds = new Set(trips.map((t) => norm(t.id)));
  const paidByTripId: Record<string, number> = {};
  const outByTripId: Record<string, number> = {};
  const contactType = entityType === "CLIENT" ? "client" : "supplier";
  const isEntityLinked = (tx: LedgerRow) =>
    tx.contact_type === contactType &&
    tx.contact_id != null &&
    tx.contact_id === entityId;
  const firstTripKey = trips.length ? norm(trips[0].id) : "";

  for (const t of trips) {
    const key = norm(t.id);
    paidByTripId[key] = 0;
    outByTripId[key] = 0;
  }
  // Only count bilateral client-supplier flows. Exclude driver payments, vehicle expenses, etc.
  for (const tx of transactions) {
    let key: string | undefined =
      norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
        ? norm(tx.trip_id)
        : undefined;
    if (key === undefined && isEntityLinked(tx) && firstTripKey)
      key = firstTripKey;
    if (key !== undefined && isEntityLinked(tx)) {
      paidByTripId[key] = (paidByTripId[key] ?? 0) + Number(tx.amount_in ?? 0);
      outByTripId[key] = (outByTripId[key] ?? 0) + Number(tx.amount_out ?? 0);
    }
  }

  const map = new Map<string, InternalTrip>();
  for (const t of trips) {
    const key = norm(t.id);
    const outAmt = outByTripId[key] ?? 0;
    // Determine whether this trip is a cross-org supplier-view trip (we are the supplier, not the owner).
    // When viewerOrgId is provided and the trip belongs to another org, use supplier_rate (our earning/payable),
    // not client_price (what the shipper charges their customer — not our data).
    const isCrossOrgSupplierTrip =
      viewerOrgId != null &&
      t.organization_id != null &&
      t.organization_id !== viewerOrgId;
    const tripSales = isCrossOrgSupplierTrip
      ? Number(t.supplier_rate ?? 0)
      : Number(
          entityType === "CLIENT"
            ? (t.client_price ?? 0)
            : (t.supplier_rate ?? 0),  // SUPPLIER: always use supplier_rate (what we owe them, not what they charge the end client)
        );
    // For supplier: if trip has no rate, use amount we paid so Total Billing reflects it.
    const sales =
      entityType === "SUPPLIER" && tripSales === 0 && outAmt > 0
        ? outAmt
        : tripSales;
    const paid = (paidByTripId[key] ?? 0) - outAmt;
    // Match Detail: supplier due = max(0, sales - outByTrip); client keeps existing formula.
    const due =
      entityType === "SUPPLIER"
        ? Math.max(0, sales - outAmt)
        : Math.max(0, tripSales - paid) + outAmt;
    const date = (t.pickup_date ?? t.created_at ?? "").slice(0, 10) || "—";
    map.set(key, {
      tripId: t.id,
      missionId: getTripDisplayNumber(t),
      date,
      sales,
      paid,
      paidOut: outAmt,
      due,
    });
  }
  return map;
}

/** Build reconciled rows (O(n+m)): internal map + shared map, then merge. */
function buildReconciledRows(
  internalMap: Map<string, InternalTrip>,
  sharedTrips: SharedTripData[] | undefined,
  partnerName: string,
  entityType: "CLIENT" | "SUPPLIER",
): ReconciledRow[] {
  const sharedMap = new Map<string, { sales: number; paid: number }>();
  if (sharedTrips?.length) {
    for (const s of sharedTrips) {
      const key = s.tripId.trim().toLowerCase();
      sharedMap.set(key, { sales: s.sales, paid: s.paid });
    }
  }
  const results: ReconciledRow[] = [];
  const norm = (id: string) => String(id).trim().toLowerCase();

  for (const [key, int] of internalMap) {
    const ext = sharedMap.get(key);
    if (!ext) {
      results.push({
        tripId: int.tripId,
        missionId: int.missionId,
        status: "PENDING",
        issue: "Missing in Partner Book",
        internal: int,
        external: null,
        intSales: int.sales,
        intPaid: int.paid,
        intPaidOut: int.paidOut,
        extSales: 0,
        extPaid: 0,
      });
    } else {
      // Partner has shared data for this trip. If partner reported 0,0 and we have internal data,
      // treat as PENDING (partner has not yet added any entry) — do not show variance.
      const partnerHasNoEntry = ext.sales === 0 && ext.paid === 0;
      const weHaveEntry =
        int.sales > 0 || int.paid > 0 || int.paidOut > 0;
      if (partnerHasNoEntry && weHaveEntry) {
        results.push({
          tripId: int.tripId,
          missionId: int.missionId,
          status: "PENDING",
          issue: "Partner has not reported this trip",
          internal: int,
          external: ext,
          intSales: int.sales,
          intPaid: int.paid,
          intPaidOut: int.paidOut,
          extSales: 0,
          extPaid: 0,
        });
      } else {
        // Relationship-paid depends on which side we are:
        // - As SUPPLIER (we are client): our payment is amount_out (paidOut).
        // - As CLIENT (we are supplier): our payment is amount_in (paid).
        const internalPaidForCompare =
          entityType === "SUPPLIER" ? int.paidOut : int.paid;
        // Partner's "sales" = payables/receivables (supplier_rate) only, never client_price.
        // If backend returns ext > int, it's likely client_price; use int (supplier_rate) for both CLIENT and SUPPLIER views.
        const extSalesResolved =
          ext.sales === 0 && int.sales > 0
            ? int.sales
            : ext.sales > int.sales && int.sales > 0
              ? int.sales
              : ext.sales;
        const salesMatch = int.sales === extSalesResolved;
        const paidMatch = internalPaidForCompare === ext.paid;
        // If sales are already aligned but partner payment is still zero while ours is present,
        // treat it as awaiting partner update (not a hard mismatch).
        const awaitingPartnerPaymentEntry =
          salesMatch && internalPaidForCompare > 0 && ext.paid === 0;
        const isMatch = salesMatch && paidMatch;
        results.push({
          tripId: int.tripId,
          missionId: int.missionId,
          status: isMatch
            ? "VERIFIED"
            : awaitingPartnerPaymentEntry
              ? "PENDING"
              : "MISMATCH",
          issue: isMatch
            ? null
            : awaitingPartnerPaymentEntry
              ? "Partner has not reported payment entry"
              : "Data Variance Detected",
          internal: int,
          external: ext,
          intSales: int.sales,
          intPaid: int.paid,
          intPaidOut: int.paidOut,
          extSales: extSalesResolved,
          extPaid: ext.paid,
        });
      }
    }
  }
  for (const [key, ext] of sharedMap) {
    if (!internalMap.has(key)) {
      results.push({
        tripId: key,
        missionId: key,
        status: "UNRECOGNIZED",
        issue: "Ghost Trip Logged by Partner",
        internal: null,
        external: ext,
        intSales: 0,
        intPaid: 0,
        intPaidOut: 0,
        extSales: ext.sales,
        extPaid: ext.paid,
      });
    }
  }
  return results;
}

/**
 * PENDING = partner book missing or not yet reported for this trip → notify-style UX.
 * MISMATCH / UNRECOGNIZED → numeric or ghost conflict → dispute-style UX.
 * Same backend (`createDispute`); only labels and success copy differ.
 */
function getLedgerEscalationKind(
  row: ReconciledRow,
): "notify_partner" | "raise_dispute" {
  if (row.status === "PENDING") return "notify_partner";
  return "raise_dispute";
}

/* ──────────────────────────────────────────────────────────────────────────
 *  StatusFilter UI helpers — colors + labels for chips / pills / icons.
 *  Keeping them as module-level pure functions so they don't re-create on
 *  every render and are easy to unit test.
 *
 *  (Shared across the By-Trip and By-Transaction views in the shared-ledger.)
 * ────────────────────────────────────────────────────────────────────────── */

function filterChipDotStyle(key: "matched" | "no_entry" | "pending" | "conflict") {
  switch (key) {
    case "matched":
      return { backgroundColor: Theme.darkGreen };
    case "no_entry":
      return { backgroundColor: Theme.primary };
    case "pending":
      return { backgroundColor: Theme.driverGold };
    case "conflict":
      return { backgroundColor: Theme.teslaRed };
  }
}

function txnStatusLabel(s: "matched" | "no_entry" | "pending" | "conflict") {
  if (s === "matched") return "Same";
  if (s === "no_entry") return "Add to yours";
  if (s === "pending") return "Awaiting partner";
  return "Doesn’t match";
}

function txnStatusPillStyle(s: "matched" | "no_entry" | "pending" | "conflict") {
  switch (s) {
    case "matched":
      return {
        backgroundColor: Theme.positiveMuted,
        borderColor: Theme.darkGreen,
      };
    case "no_entry":
      return {
        backgroundColor: Theme.surfaceLight,
        borderColor: Theme.primary,
      };
    case "pending":
      return {
        backgroundColor: Theme.surfaceLight,
        borderColor: Theme.driverGold,
      };
    case "conflict":
      return {
        backgroundColor: Theme.negativeMuted,
        borderColor: Theme.teslaRed,
      };
  }
}

function txnStatusPillTextStyle(
  s: "matched" | "no_entry" | "pending" | "conflict",
) {
  switch (s) {
    case "matched":
      return { color: Theme.darkGreen };
    case "no_entry":
      return { color: Theme.primary };
    case "pending":
      return { color: Theme.driverGold };
    case "conflict":
      return { color: Theme.teslaRed };
  }
}

function txnIconColor(s: "matched" | "no_entry" | "pending" | "conflict") {
  switch (s) {
    case "matched":
      return Theme.darkGreen;
    case "no_entry":
      return Theme.primary;
    case "pending":
      return Theme.driverGold;
    case "conflict":
      return Theme.teslaRed;
  }
}

function txnIconWrapStyle(s: "matched" | "no_entry" | "pending" | "conflict") {
  switch (s) {
    case "matched":
      return { backgroundColor: Theme.positiveMuted };
    case "no_entry":
      return { backgroundColor: Theme.surfaceLight };
    case "pending":
      return { backgroundColor: Theme.surfaceLight };
    case "conflict":
      return { backgroundColor: Theme.negativeMuted };
  }
}

export function SharedLedgerContent({
  entity,
  entityType,
  trips,
  transactions,
  organizationId,
  integrated = false,
  sharedTrips: sharedTripsProp,
  onRefresh,
  viewAsPartner = false,
  embeddedInOverlay = false,
  onRequestInvite,
  onRequestConnection,
  onInviteToApp,
  externalDownloadRequest,
}: EntityCompareVerifyViewProps) {
  const resolutionOptions = entityType === "CLIENT" ? [
    "Partner needs to update Sales amount",
    "Partner missed payment entry",
    "Invalid Ghost Trip",
  ] : [
    "Partner needs to update Cost amount",
    "Partner missed payment entry",
    "Invalid Ghost Trip",
  ];
  // Column headers should always be generic: "My Book" and "Partner"
  const myBookLabel = "My Book";
  const partnerLabel = "Partner";
  const [sharedTrips, setSharedTrips] = useState<SharedTripData[] | undefined>(
    sharedTripsProp,
  );
  const [loadingShared, setLoadingShared] = useState(
    !!organizationId && integrated && !sharedTripsProp?.length,
  );
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<ReconciledRow | null>(
    null,
  );
  const [resolution, setResolution] = useState("");
  const [remarks, setRemarks] = useState("");
  const [partnerOrgId, setPartnerOrgId] = useState<string | null>(null);
  const [disputesRaised, setDisputesRaised] = useState<DisputeRow[]>([]);
  const [disputesReceived, setDisputesReceived] = useState<DisputeRow[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingAcceptDispute, setPendingAcceptDispute] =
    useState<DisputeRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const partnerProfileImageUrl = useMemo(
    () => resolveAvatarPublicUrl(entity.avatar_url),
    [entity.avatar_url],
  );

  /**
   * Party-level shared-ledger view has two modes:
   *  - "trip": existing mission-level comparison (one row per trip).
   *  - "txn":  transaction-level feed, including entries the partner has
   *           logged but that are not yet in our books ("No entry from my side").
   * Both modes are filtered by a common status chip — all, matched,
   * no_entry (partner only), pending (we only), conflict (amounts disagree).
   */
  type ViewMode = "trip" | "txn";
  type StatusFilter = "all" | "matched" | "no_entry" | "pending" | "conflict";
  const [viewMode, setViewMode] = useState<ViewMode>("trip");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /** Raw partner entries used to build the "By Transaction" view. */
  const [partnerEntries, setPartnerEntries] = useState<SharedLedgerEntry[]>([]);

  // Manual partner (not integrated): resolve phone → invitee in app or not → Request vs Invite
  type InviteeStatus =
    | "idle"
    | "loading"
    | "in_app"
    | "not_in_app"
    | "no_phone"
    | "error";
  const [inviteeStatus, setInviteeStatus] = useState<InviteeStatus>("idle");
  const [invitee, setInvitee] = useState<ConnectionInviteeByPhone | null>(null);
  const [pendingRequestSent, setPendingRequestSent] = useState(false);
  const [requestInviteLoading, setRequestInviteLoading] = useState(false);
  const [inviteeRetryKey, setInviteeRetryKey] = useState(0);
  const [sharedReportVisible, setSharedReportVisible] = useState(false);
  const [pendingOpenSharedReport, setPendingOpenSharedReport] = useState(false);
  const prevExternalDownloadRequest = useRef(0);

  const insets = useSafeAreaInsets();

  const refetchDisputes = useCallback(() => {
    if (!organizationId || !partnerOrgId) return;
    getDisputesForPartner(organizationId, partnerOrgId).then(({ disputes }) =>
      setDisputesRaised(disputes.filter((d) => d.status === "OPEN")),
    );
    getDisputesReceived(organizationId).then(({ disputes }) =>
      setDisputesReceived(
        disputes.filter((d) => d.raised_by_org_id === partnerOrgId),
      ),
    );
  }, [organizationId, partnerOrgId]);

  const txs = transactions ?? [];

  const tripByNormRef = useMemo(() => {
    const m = new Map<string, TripRow>();
    for (const t of trips) {
      m.set(normTripKey(t.id), t);
      m.set(normTripKey(getTripDisplayNumber(t)), t);
    }
    return m;
  }, [trips]);

  const resolveTripRefToCanonicalId = useCallback(
    (tripRef: string | null | undefined): string => {
      const key = normTripKey(tripRef);
      if (!key) return "";
      const t = tripByNormRef.get(key);
      return t ? normTripKey(t.id) : key;
    },
    [tripByNormRef],
  );

  const missionLabelForTripRef = useCallback(
    (tripRef: string) => {
      const t = tripByNormRef.get(normTripKey(tripRef));
      return t ? getTripDisplayNumber(t) : tripRef.slice(0, 8).toUpperCase();
    },
    [tripByNormRef],
  );

  const tripRouteForTripRef = useCallback(
    (tripRef: string) => {
      const t = tripByNormRef.get(normTripKey(tripRef));
      if (!t) return null;
      const from = (t.pickup_area ?? "").trim();
      const to = (t.drop_location ?? "").trim();
      if (!from && !to) return null;
      return [from, to].filter(Boolean).join(" → ");
    },
    [tripByNormRef],
  );

  const internalMap = useMemo(
    () =>
      trips.length && txs.length >= 0
        ? buildInternalTrips(trips, txs, entity.id, entityType, organizationId)
        : new Map(),
    [trips, txs, entity.id, entityType, organizationId],
  );

  // When partner is not integrated: fetch contact phone, then check if they're in app (by phone lookup).
  useEffect(() => {
    if (integrated || !organizationId || !entity.id) return;
    let cancelled = false;
    setInviteeStatus("loading");
    setInvitee(null);
    setPendingRequestSent(false);

    const run = async () => {
      const contactType = entityType === "CLIENT" ? "client" : "supplier";
      const phone =
        contactType === "client"
          ? (await getClientById(organizationId, entity.id)).client?.phone
          : (await getSupplierById(organizationId, entity.id)).supplier?.phone;
      const normalized = (phone ?? "").trim();
      if (cancelled) return;
      if (!normalized) {
        setInviteeStatus("no_phone");
        return;
      }
      const { error: lookupError, invitee: inv } =
        await getConnectionInviteeByPhone(normalized);
      if (cancelled) return;
      if (lookupError) {
        setInviteeStatus("error");
        return;
      }
      if (inv) {
        setInvitee(inv);
        // If the offline contact is already in our contact list and matches an app user, treat them as integrated
        setInviteeStatus("in_app");
        // Check if we already sent a pending connection request to this org
        const { requests } = await getConnectionRequestsSent(organizationId);
        if (cancelled) return;
        const already = requests.some(
          (r) =>
            r.to_organization_id === inv.organization_id &&
            r.status === "pending",
        );
        setPendingRequestSent(already);
      } else {
        setInviteeStatus("not_in_app");
      }
    };

    run().catch(() => {
      if (!cancelled) setInviteeStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [integrated, organizationId, entity.id, entityType, inviteeRetryKey]);

  useEffect(() => {
    if (!organizationId || !integrated) return;
    // Prefer linked_organization_id when available — most reliable for this specific contact's partner org.
    if (entity.linked_organization_id) {
      setPartnerOrgId(entity.linked_organization_id);
      return;
    }
    getSharedLedgerConnections(organizationId).then(
      ({ error, connections }) => {
        if (error) return;
        const conn = connections.find((c) => c.contact_id === entity.id);
        if (conn) setPartnerOrgId(conn.partner_org_id);
        else if (connections.length === 1)
          setPartnerOrgId(connections[0].partner_org_id);
      },
    );
  }, [
    organizationId,
    integrated,
    entity.id,
    entityType,
    entity.linked_organization_id,
  ]);

  // Fallback: set partnerOrgId from linked_organization_id when still null so the other user
  // sees "Dispute received" and can Accept/Decline. Client viewing supplier: partner = supplier org.
  // Supplier viewing client: partner = client org.
  useEffect(() => {
    if (!organizationId || !integrated || !entity.linked_organization_id)
      return;
    if (entityType !== "SUPPLIER" && entityType !== "CLIENT") return;
    setPartnerOrgId((prev) => prev ?? entity.linked_organization_id ?? null);
  }, [organizationId, integrated, entityType, entity.linked_organization_id]);

  useEffect(() => {
    if (!organizationId || !integrated || sharedTripsProp?.length) return;
    let cancelled = false;
    setLoadingShared(true);
    // Prefer trip summary (partner_sales from trip row, partner_paid bilateral-only) so client view does not show supplier expenses.
    getSharedLedgerTripSummary(organizationId, entity.id).then(({ error, rows }) => {
      if (cancelled) return;
      if (!error && rows?.length > 0) {
        const fromSummary: SharedTripData[] = rows.map((r) => ({
          tripId: r.trip_id,
          sales: r.partner_sales,
          paid: r.partner_paid,
        }));
        // When trip summary has partner_paid = 0 (e.g. counterparty missing), merge in paid from entries
        // so partner's paid is shown for both CLIENT and SUPPLIER view (fixes "Update My Book" / Credits (Paid) staying 0).
        const needsPaidFromEntries =
          (entityType === "CLIENT" || entityType === "SUPPLIER") &&
          fromSummary.some((r) => r.paid === 0);
        if (!needsPaidFromEntries) {
          setLoadingShared(false);
          setSharedTrips(fromSummary);
          return;
        }
        getSharedLedgerEntriesForPartner(organizationId, entity.id).then(({ error: e2, entries }) => {
          if (cancelled) return;
          setLoadingShared(false);
          if (!e2 && entries) setPartnerEntries(entries);
          const byTrip = new Map<string, number>();
          if (!e2 && entries?.length) {
            const partnerPaidFromOut = entityType === "CLIENT"; // client pays us = their amount_out
            for (const e of entries) {
              const ref = resolveTripRefToCanonicalId(
                (e.reference_id ?? e.id ?? "").toString(),
              );
              if (!ref) continue;
              const amt = Number(e.amount ?? 0);
              const out = amt < 0 ? -amt : 0;
              const inAmt = amt >= 0 ? amt : 0;
              const paid = partnerPaidFromOut ? out : inAmt;
              byTrip.set(ref, (byTrip.get(ref) ?? 0) + paid);
            }
          }
          const merged = fromSummary.map((r) => {
            const key = resolveTripRefToCanonicalId(r.tripId);
            const entryPaid = byTrip.get(key);
            const paid = r.paid === 0 && entryPaid != null ? entryPaid : r.paid;
            return { ...r, paid };
          });
          setSharedTrips(merged);
        });
        return;
      }
      // Fallback: aggregate entries (bilateral-only after backend migration; else legacy all-entries).
      getSharedLedgerEntriesForPartner(organizationId, entity.id).then(({ error: e2, entries }) => {
        if (cancelled) return;
        setLoadingShared(false);
        if (!e2 && entries) setPartnerEntries(entries);
        if (e2 || !entries?.length) return;
        const byTrip = new Map<string, { in: number; out: number }>();
        for (const e of entries) {
          const ref = resolveTripRefToCanonicalId(
            (e.reference_id ?? e.id ?? "").toString(),
          );
          if (!ref) continue;
          if (!byTrip.has(ref)) byTrip.set(ref, { in: 0, out: 0 });
          const cur = byTrip.get(ref)!;
          const amt = Number(e.amount ?? 0);
          if (amt >= 0) cur.in += amt;
          else cur.out += -amt;
        }
        const arr: SharedTripData[] = [];
        // entityType = type of the contact we're viewing.
        // When contact is CLIENT (we're supplier): partner is client → their payment to us = amount_out = supplier_rate.
        //   Use v.out for sales (agreed amount client pays us), NOT v.in (client_price - what client charges end customer).
        // When contact is SUPPLIER (we're client): partner is supplier → their received = amount_in; sales = v.in.
        const partnerIsSupplier = entityType === "SUPPLIER";
        byTrip.forEach((v, tripId) => {
          const sales = partnerIsSupplier ? v.in : v.out;
          const paid = partnerIsSupplier ? v.in : v.out;
          arr.push({ tripId, sales, paid });
        });
        setSharedTrips(arr);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    integrated,
    entity.id,
    entityType,
    sharedTripsProp?.length,
    resolveTripRefToCanonicalId,
  ]);

  useEffect(() => {
    if (!organizationId || !partnerOrgId) return;
    getDisputesForPartner(organizationId, partnerOrgId).then(
      ({ error, disputes }) => {
        if (!error)
          setDisputesRaised(disputes.filter((d) => d.status === "OPEN"));
      },
    );
  }, [organizationId, partnerOrgId]);

  useEffect(() => {
    if (!organizationId || !partnerOrgId) return;
    getDisputesReceived(organizationId).then(({ error, disputes }) => {
      if (!error)
        setDisputesReceived(
          disputes.filter((d) => d.raised_by_org_id === partnerOrgId),
        );
    });
  }, [organizationId, partnerOrgId]);

  const reconciledRows = useMemo(
    () =>
      buildReconciledRows(
        internalMap,
        sharedTrips ?? sharedTripsProp,
        entity.name ?? "—",
        entityType,
      ),
    [internalMap, sharedTrips, sharedTripsProp, entity.name, entityType],
  );

  const mergePartnerLineIntoBook = useCallback(
    async (
      txn: CommandTxnRow,
    ): Promise<{ createdTrip: boolean; tripId: string }> => {
      if (!organizationId) {
        Alert.alert("Cannot merge", "Missing organization.");
        throw new Error("no org");
      }
      let resolvedTripId =
        txn.tripDbId ?? tripByNormRef.get(normTripKey(txn.tripRef))?.id;
      let createdTrip = false;

      if (!resolvedTripId) {
        const ghostRow = reconciledRows.find(
          (r) =>
            normTripKey(r.tripId) === normTripKey(txn.tripRef) &&
            r.status === "UNRECOGNIZED",
        );
        const fromSummary =
          ghostRow?.external != null
            ? Number(ghostRow.external.sales ?? 0)
            : 0;
        const fromTxnAmt = txn.partnerAmount ?? txn.amountAbs;
        const extSales = Math.max(fromSummary, fromTxnAmt);
        if (!(extSales > 0)) {
          Alert.alert("Cannot merge", "Missing partner trip amount for this entry.");
          throw new Error("no amount");
        }
        const rawDate = (txn.date ?? "").trim();
        const pickupDate =
          rawDate.length >= 10
            ? rawDate.slice(0, 10)
            : new Date().toISOString().slice(0, 10);
        const clientName = (entity.name ?? "—").trim() || "—";
        const partnerTripRef = (txn.tripRef ?? "").trim();
        const baseTrip: CreateTripData = {
          ...(isUuidString(partnerTripRef) ? { id: partnerTripRef } : {}),
          pickup_area: "Partner shared trip",
          drop_location: "—",
          client_name: clientName,
          pickup_date: pickupDate,
          notes: isUuidString(partnerTripRef)
            ? "Auto-created from partner shared ledger (align books)."
            : `Auto-created from partner shared ledger (ref: ${partnerTripRef}).`,
          client_price: extSales,
          supplier_rate: extSales,
        };
        if (entityType === "CLIENT") {
          baseTrip.client_id = entity.id;
        } else {
          baseTrip.supplier_id = entity.id;
        }
        const { error: tripErr, trip } = await createTrip(organizationId, baseTrip);
        if (tripErr || !trip) {
          Alert.alert(
            "Could not create trip",
            tripErr?.message ??
              "Create the trip manually or ask your admin to enable trip id sync, then try again.",
          );
          throw tripErr ?? new Error("create trip");
        }
        resolvedTripId = trip.id;
        createdTrip = true;
      }
      const amount = txn.partnerAmount ?? txn.amountAbs;
      if (!(amount > 0)) {
        throw new Error("bad amount");
      }
      const contactType = entityType === "CLIENT" ? "client" : "supplier";
      const rawDate = (txn.date ?? "").trim();
      const transaction_date =
        rawDate.length >= 10
          ? rawDate.slice(0, 10)
          : new Date().toISOString().slice(0, 10);
      const partnerTag =
        txn.partnerRef && txn.partnerRef !== "—"
          ? txn.partnerRef
          : `log:${txn.id.slice(0, 8)}`;
      const description = `Shared ledger sync | Partner: ${partnerTag}`;

      const { error } = await createLedgerEntry(organizationId, {
        trip_id: resolvedTripId,
        party_name: (entity.name ?? "—").trim() || "—",
        description,
        amount_in: entityType === "CLIENT" ? amount : 0,
        amount_out: entityType === "SUPPLIER" ? amount : 0,
        transaction_date,
        contact_id: entity.id,
        contact_type: contactType,
      });
      if (error) {
        Alert.alert("Merge failed", error.message);
        throw error;
      }
      onRefresh?.();
      return { createdTrip, tripId: resolvedTripId };
    },
    [
      organizationId,
      entity.id,
      entity.name,
      entityType,
      tripByNormRef,
      reconciledRows,
      onRefresh,
    ],
  );

  const searchLower = (searchQuery ?? "").trim().toLowerCase();

  /**
   * Map a reconciled-row status to the common StatusFilter vocabulary
   * shared by both the Trip and Transaction views.
   * - VERIFIED      → matched
   * - MISMATCH      → conflict
   * - PENDING       → pending (we have entry, partner hasn't)
   * - UNRECOGNIZED  → no_entry (partner logged a trip we don't have)
   */
  const tripRowFilterStatus = useCallback((r: ReconciledRow): StatusFilter => {
    if (r.status === "VERIFIED") return "matched";
    if (r.status === "MISMATCH") return "conflict";
    if (r.status === "UNRECOGNIZED") return "no_entry";
    return "pending";
  }, []);

  const filteredRows = useMemo(() => {
    let rows = reconciledRows;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => tripRowFilterStatus(r) === statusFilter);
    }
    if (searchLower) {
      rows = rows.filter((r) =>
        (r.missionId ?? "").toLowerCase().includes(searchLower),
      );
    }
    return rows;
  }, [reconciledRows, searchLower, statusFilter, tripRowFilterStatus]);

  /**
   * Transaction-level rows: merge partner entries + local entries into one
   * list, each tagged with a StatusFilter so the chip bar can filter them.
   *
   * Status resolution (per (tripRef, amount) pair):
   *  - both partner & local entry exist with equal amount → "matched"
   *  - both exist for same trip but amounts differ         → "conflict"
   *  - partner entry exists, no local entry for that trip  → "no_entry"
   *  - local entry exists, no partner entry for that trip  → "pending"
   */
  const txnRows = useMemo<CommandTxnRow[]>(() => {
    const norm = (s: string | null | undefined) =>
      s == null ? "" : String(s).trim().toLowerCase();
    const tripMap = new Map<string, TripRow>();
    for (const t of trips) {
      tripMap.set(norm(t.id), t);
    }
    const contactType = entityType === "CLIENT" ? "client" : "supplier";

    /** Only entries for this partner, bilateral (ignore driver/vehicle/etc). */
    const localRelevant = txs.filter(
      (t) =>
        t.contact_type === contactType &&
        t.contact_id != null &&
        t.contact_id === entity.id,
    );

    /** Index local entries by tripId (may have multiple per trip). */
    const localByTrip = new Map<string, typeof localRelevant>();
    for (const l of localRelevant) {
      const trip = norm(l.trip_id);
      if (!trip) continue;
      const arr = localByTrip.get(trip) ?? [];
      arr.push(l);
      localByTrip.set(trip, arr);
    }

    const rows: CommandTxnRow[] = [];
    const matchedLocalIds = new Set<string>();
    const partnerTxnCountByTrip = new Map<string, number>();

    // Trip-level fallback: when partner summary is present but entry-level rows are not yet exposed,
    // use reconciled external paid so the forensic "Entry comparison" does not stay stuck at
    // "Awaiting partner" for single-line trips.
    const partnerPaidByTripFromSummary = new Map<string, number>();
    for (const row of reconciledRows) {
      const key = norm(row.tripId);
      if (!key) continue;
      const paid = Number(row.extPaid ?? 0);
      if (paid > 0) partnerPaidByTripFromSummary.set(key, paid);
    }
    const partnerPaidRemainingByTrip = new Map(partnerPaidByTripFromSummary);

    for (const p of partnerEntries) {
      const tripRef = resolveTripRefToCanonicalId(p.reference_id);
      if (!tripRef) continue;
      partnerTxnCountByTrip.set(
        tripRef,
        (partnerTxnCountByTrip.get(tripRef) ?? 0) + 1,
      );
      const amt = Number(p.amount ?? 0);
      const amtAbs = Math.abs(amt);
      const locals = localByTrip.get(tripRef) ?? [];

      /** Try to pair partner entry with a local one on the same trip.
       *  Exact match (same absolute amount) → matched. Otherwise → conflict. */
      const exact = locals.find((l) => {
        if (matchedLocalIds.has(l.id)) return false;
        const net = (l.amount_in ?? 0) + (l.amount_out ?? 0);
        return Math.abs(net - amtAbs) < 0.5;
      });
      const nearest = locals.find((l) => !matchedLocalIds.has(l.id));

      if (exact) {
        matchedLocalIds.add(exact.id);
        rows.push({
          id: p.id || `p:${tripRef}:${amtAbs}`,
          status: "matched",
          tripRef,
          date: p.transaction_date || exact.transaction_date || "",
          amountAbs: amtAbs,
          partnerAmount: amtAbs,
          localAmount: amtAbs,
          displayDate:
            formatTxnShortDate(
              p.transaction_date || exact.transaction_date || "",
            ) || undefined,
          myRef: compactLedgerRef(exact.payment_reference, exact.id),
          partnerRef: compactLedgerRef(undefined, p.id),
          myMode: modeLabel(exact.payment_mode),
          partnerMode: modeLabel(exact.payment_mode),
          lineKind: inferSharedTxnLineKind(
            exact.primary_category,
            exact.description,
          ),
        });
      } else if (nearest) {
        matchedLocalIds.add(nearest.id);
        const localNet =
          (nearest.amount_in ?? 0) + (nearest.amount_out ?? 0);
        rows.push({
          id: p.id || `p:${tripRef}:${amtAbs}`,
          status: "conflict",
          tripRef,
          date: p.transaction_date || nearest.transaction_date || "",
          amountAbs: amtAbs,
          partnerAmount: amtAbs,
          localAmount: Math.abs(localNet),
          displayDate:
            formatTxnShortDate(
              p.transaction_date || nearest.transaction_date || "",
            ) || undefined,
          myRef: compactLedgerRef(nearest.payment_reference, nearest.id),
          partnerRef: compactLedgerRef(undefined, p.id),
          myMode: modeLabel(nearest.payment_mode),
          partnerMode: modeLabel(nearest.payment_mode),
          lineKind: inferSharedTxnLineKind(
            nearest.primary_category,
            nearest.description,
          ),
        });
      } else {
        const tripRow = tripMap.get(tripRef);
        rows.push({
          id: p.id || `p:${tripRef}:${amtAbs}`,
          status: "no_entry",
          tripRef,
          date: p.transaction_date || "",
          amountAbs: amtAbs,
          /** No local ledger line yet — keep at 0 so UI never mirrors partner into “You”. */
          localAmount: 0,
          partnerAmount: amtAbs,
          partnerSignedAmount: Number(p.amount ?? 0),
          tripDbId: tripRow?.id,
          hasLocalTrip: !!tripRow,
          displayDate: formatTxnShortDate(p.transaction_date) || undefined,
          partnerRef: compactLedgerRef(undefined, p.id),
          myMode: "—",
          partnerMode: "—",
        });
      }
    }

    /** Any local entry not matched to a partner entry is still pending. */
    for (const l of localRelevant) {
      if (matchedLocalIds.has(l.id)) continue;
      const tripRef = norm(l.trip_id);
      const amtIn = l.amount_in ?? 0;
      const amtOut = l.amount_out ?? 0;
      const net = amtIn + amtOut;
      const amtAbs = Math.abs(net);
      const partnerTripLineCount = tripRef
        ? (partnerTxnCountByTrip.get(tripRef) ?? 0)
        : 0;
      const remainingPartnerPaid = tripRef
        ? (partnerPaidRemainingByTrip.get(tripRef) ?? 0)
        : 0;
      const allocatedPartnerPaid =
        partnerTripLineCount === 0 && remainingPartnerPaid > 0
          ? Math.min(amtAbs, remainingPartnerPaid)
          : 0;

      if (allocatedPartnerPaid > 0) {
        partnerPaidRemainingByTrip.set(
          tripRef,
          Math.max(0, remainingPartnerPaid - allocatedPartnerPaid),
        );
        rows.push({
          id: `l:${l.id}`,
          status:
            Math.abs(amtAbs - allocatedPartnerPaid) < 0.5
              ? "matched"
              : "conflict",
          tripRef,
          date: l.transaction_date || "",
          amountAbs: amtAbs,
          localAmount: amtAbs,
          partnerAmount: allocatedPartnerPaid,
          displayDate: formatTxnShortDate(l.transaction_date) || undefined,
          myRef: compactLedgerRef(l.payment_reference, l.id),
          partnerRef: "Trip summary",
          myMode: modeLabel(l.payment_mode),
          partnerMode: modeLabel(l.payment_mode),
          lineKind: inferSharedTxnLineKind(l.primary_category, l.description),
        });
        continue;
      }
      rows.push({
        id: `l:${l.id}`,
        status: "pending",
        tripRef,
        date: l.transaction_date || "",
        amountAbs: amtAbs,
        localAmount: amtAbs,
        displayDate: formatTxnShortDate(l.transaction_date) || undefined,
        myRef: compactLedgerRef(l.payment_reference, l.id),
        partnerRef: "—",
        myMode: modeLabel(l.payment_mode),
        partnerMode: "—",
        lineKind: inferSharedTxnLineKind(l.primary_category, l.description),
      });
    }

    /** Most recent first. */
    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return rows;
  }, [
    partnerEntries,
    txs,
    entity.id,
    entity.name,
    entityType,
    trips,
    reconciledRows,
    resolveTripRefToCanonicalId,
  ]);

  const filteredTxnRows = useMemo(() => {
    let rows = txnRows;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (searchLower) {
      rows = rows.filter((r) =>
        (r.tripRef ?? "").toLowerCase().includes(searchLower),
      );
    }
    return rows;
  }, [txnRows, statusFilter, searchLower]);

  /** Live counts for status chips — always computed from the unfiltered sets. */
  const tripCounts = useMemo(() => {
    const c = { all: reconciledRows.length, matched: 0, no_entry: 0, pending: 0, conflict: 0 };
    for (const r of reconciledRows) {
      const s = tripRowFilterStatus(r);
      c[s] += 1;
    }
    return c;
  }, [reconciledRows, tripRowFilterStatus]);

  const txnCounts = useMemo(() => {
    const c = { all: txnRows.length, matched: 0, no_entry: 0, pending: 0, conflict: 0 };
    for (const r of txnRows) c[r.status] += 1;
    return c;
  }, [txnRows]);

  const tripTxnMetaByRefForExport = useMemo(() => {
    const map = new Map<string, { count: number; last: string | null }>();
    for (const txn of txnRows) {
      const key = normTripKey(txn.tripRef);
      if (!key) continue;
      const prev = map.get(key) ?? { count: 0, last: null };
      const candidate = (txn.displayDate ?? txn.date ?? "").trim() || null;
      const nextLast =
        !prev.last || (candidate && candidate > prev.last)
          ? candidate
          : prev.last;
      map.set(key, { count: prev.count + 1, last: nextLast });
    }
    return map;
  }, [txnRows]);

  const sharedLedgerCustomReport = useMemo(() => {
    if (viewMode === "trip") {
      const rows = filteredRows.map((row) => {
        const partnerSales = row.external ? row.extSales : null;
        const partnerPaid = row.external ? row.extPaid : null;
        const intPaidTrip =
          entityType === "SUPPLIER" ? row.intPaidOut : row.intPaid;
        const mySales = row.intSales;
        const billingConflict =
          partnerSales != null && Math.abs(partnerSales - mySales) >= 0.5;
        const paymentConflict =
          partnerPaid != null && Math.abs(partnerPaid - intPaidTrip) >= 0.5;
        const syncSafe = !billingConflict && !paymentConflict;
        const meta = tripTxnMetaByRefForExport.get(normTripKey(row.tripId));
        const route = tripRouteForTripRef(row.tripId) ?? "—";
        return {
          mission: row.missionId,
          status: tripStatusLabelForReport(row),
          route,
          partnerNote: partnerBookLine(row),
          mySales: row.internal ? formatINR(mySales) : "—",
          themSales:
            partnerSales != null ? formatINR(partnerSales) : "—",
          myReceived: formatINR(intPaidTrip),
          themReceived:
            partnerPaid != null ? formatINR(partnerPaid) : "—",
          due: formatINR(Math.max(0, mySales - intPaidTrip)),
          txns: meta?.count ?? 0,
          lastTxn: meta?.last ?? "—",
          sync: syncSafe ? "Safe" : "Fix",
        };
      });
      return {
        columns: [
          { key: "mission", label: "Mission" },
          { key: "status", label: "Status" },
          { key: "route", label: "Route" },
          { key: "partnerNote", label: "Partner" },
          { key: "mySales", label: "My book (sales)", align: "right" as const },
          {
            key: "themSales",
            label: "Partner (sales)",
            align: "right" as const,
          },
          { key: "myReceived", label: "My book (paid)", align: "right" as const },
          {
            key: "themReceived",
            label: "Partner (paid)",
            align: "right" as const,
          },
          { key: "due", label: "Due", align: "right" as const },
          { key: "txns", label: "Txns", align: "right" as const },
          { key: "lastTxn", label: "Last txn", align: "center" as const },
          { key: "sync", label: "Sync", align: "center" as const },
        ],
        rows,
      };
    }
    const rows = filteredTxnRows.map((txn) => ({
      trip: missionLabelForTripRef(txn.tripRef),
      date:
        txn.displayDate ??
        (txn.date.length >= 10 ? txn.date.slice(0, 10) : txn.date),
      status: txnStatusLabelForReport(txn.status),
      you: formatINR(txn.localAmount ?? 0),
      partner:
        txn.partnerAmount != null ? formatINR(txn.partnerAmount) : "—",
      refs: `${txn.myRef ?? "—"} · ${txn.partnerRef ?? "—"}`,
    }));
    return {
      columns: [
        { key: "trip", label: "Trip" },
        { key: "date", label: "Date" },
        { key: "status", label: "Status" },
        { key: "you", label: "You", align: "right" as const },
        { key: "partner", label: "Partner", align: "right" as const },
        { key: "refs", label: "References" },
      ],
      rows,
    };
  }, [
    viewMode,
    filteredRows,
    filteredTxnRows,
    entityType,
    tripTxnMetaByRefForExport,
    tripRouteForTripRef,
    missionLabelForTripRef,
  ]);

  const openSharedReport = useCallback(() => {
    if (!integrated) {
      Alert.alert(
        "Reports",
        "Connect with this partner on the shared ledger to export a report.",
      );
      return;
    }
    if (loadingShared) {
      setPendingOpenSharedReport(true);
      return;
    }
    setSharedReportVisible(true);
  }, [integrated, loadingShared]);

  useEffect(() => {
    if (externalDownloadRequest == null) return;
    if (externalDownloadRequest <= prevExternalDownloadRequest.current) return;
    prevExternalDownloadRequest.current = externalDownloadRequest;
    if (!integrated) {
      Alert.alert(
        "Reports",
        "Connect with this partner on the shared ledger to export a report.",
      );
      return;
    }
    if (loadingShared) setPendingOpenSharedReport(true);
    else setSharedReportVisible(true);
  }, [externalDownloadRequest, integrated, loadingShared]);

  useEffect(() => {
    if (pendingOpenSharedReport && !loadingShared) {
      setPendingOpenSharedReport(false);
      setSharedReportVisible(true);
    }
  }, [pendingOpenSharedReport, loadingShared]);

  /** Which counts drive the chip numbers depends on the active view. */
  const activeCounts = viewMode === "trip" ? tripCounts : txnCounts;

  const disputeSentByTripId = useMemo(() => {
    const m = new Map<string, DisputeRow>();
    for (const d of disputesRaised)
      m.set(String(d.transaction_id).trim().toLowerCase(), d);
    return m;
  }, [disputesRaised]);

  const disputeReceivedByTripId = useMemo(() => {
    const m = new Map<string, DisputeRow>();
    for (const d of disputesReceived)
      m.set(String(d.transaction_id).trim().toLowerCase(), d);
    return m;
  }, [disputesReceived]);

  const handleUpdateMyBook = useCallback(
    async (row: ReconciledRow) => {
      if (
        !organizationId ||
        row.status === "UNRECOGNIZED" ||
        row.external == null
      )
        return;
      const msg =
        `Update your book to match ${entity.name}?\n\n` +
        `Sales: ₹${row.extSales.toLocaleString("en-IN", { maximumFractionDigits: 0 })} | Paid: ₹${row.extPaid.toLocaleString("en-IN", { maximumFractionDigits: 0 })}\n\n` +
        "This will update your ledger for this trip.";
      Alert.alert("Confirm update", msg, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update my book",
          onPress: async () => {
            setActionLoading(true);
            const { error } = await acceptPartnerView(
              organizationId,
              row.tripId,
              row.extSales,
              row.extPaid,
              entity.id,
            );
            setActionLoading(false);
            if (error) {
              const isMissingRpc =
                /could not find the function.*schema cache|function.*accept_partner_view.*does not exist/i.test(
                  error.message,
                );
              Alert.alert(
                "Update failed",
                isMissingRpc
                  ? "The accept_partner_view function is not in your database yet. To fix: open Supabase Dashboard → SQL Editor, then run the SQL in this project's file: supabase/migrations/20250312120000_accept_partner_view.sql"
                  : error.message,
              );
              return;
            }
            refetchDisputes();
            onRefresh?.();
            setExpandedTripId(null);
            Alert.alert(
              "Ledger updated",
              "Your book has been updated to match the partner. The trip is now matched.",
            );
          },
        },
      ]);
    },
    [organizationId, entity.id, entity.name, onRefresh, refetchDisputes],
  );

  const executeAcceptReceivedDispute = useCallback(
    async (dispute: DisputeRow) => {
      if (!organizationId) return;
      setPendingAcceptDispute(null);
      setActionLoading(true);
      try {
        const { error, rpcUnavailable } = await resolveDispute(
          dispute.id,
          "ACCEPT",
          organizationId,
        );
        if (!error) {
          refetchDisputes();
          onRefresh?.();
          Alert.alert(
            "Ledger updated",
            "Your book has been updated to match the partner. The trip is now matched.",
          );
          setActionLoading(false);
          return;
        }
        if (rpcUnavailable) {
          const sales = dispute.raised_sales ?? 0;
          let paid = dispute.raised_paid ?? 0;
          if (paid === 0) {
            const row = reconciledRows.find(
              (r) =>
                String(r.tripId).toLowerCase() ===
                String(dispute.transaction_id).toLowerCase(),
            );
            if (row?.extPaid != null && row.extPaid > 0) paid = row.extPaid;
          }
          if (sales !== 0 || paid !== 0) {
            const { error: updateError } = await acceptPartnerView(
              organizationId,
              dispute.transaction_id,
              sales,
              paid,
              entity.id,
            );
            if (updateError) {
              Alert.alert("Ledger update failed", updateError.message);
              setActionLoading(false);
              return;
            }
          }
          const { error: tableError } = await resolveDisputeTableOnly(
            dispute.id,
            organizationId,
          );
          if (tableError) {
            Alert.alert("Accept failed", tableError.message);
            setActionLoading(false);
            return;
          }
          refetchDisputes();
          onRefresh?.();
          Alert.alert(
            "Ledger updated",
            "Your book has been updated to match the partner. The trip is now matched.",
          );
        } else {
          Alert.alert("Accept failed", error.message);
        }
      } catch (e) {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Something went wrong.",
        );
      } finally {
        setActionLoading(false);
      }
    },
    [organizationId, entity.id, onRefresh, refetchDisputes, reconciledRows],
  );

  const handleAcceptReceivedDispute = useCallback(
    (dispute: DisputeRow) => {
      if (!organizationId || actionLoading) return;
      if (Platform.OS === "web") {
        setPendingAcceptDispute(dispute);
        return;
      }
      Alert.alert(
        "Accept partner's view?",
        "Your ledger for this trip will be updated to match the partner's numbers. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept & update",
            onPress: () => {
              void executeAcceptReceivedDispute(dispute);
            },
          },
        ],
      );
    },
    [organizationId, actionLoading, executeAcceptReceivedDispute],
  );

  const handleDeclineReceivedDispute = useCallback(
    async (dispute: DisputeRow) => {
      if (!organizationId) return;
      setActionLoading(true);
      const { error, rpcUnavailable } = await resolveDispute(
        dispute.id,
        "DECLINE",
        organizationId,
      );
      if (error && rpcUnavailable) {
        const { error: tableError } = await resolveDisputeTableOnly(
          dispute.id,
          organizationId,
        );
        setActionLoading(false);
        if (tableError) {
          Alert.alert("Decline failed", tableError.message);
          return;
        }
      } else if (error) {
        setActionLoading(false);
        Alert.alert("Decline failed", error.message);
        return;
      } else {
        setActionLoading(false);
      }
      refetchDisputes();
      onRefresh?.();
      Alert.alert("Dispute declined", "The partner has been notified.");
    },
    [organizationId, onRefresh, refetchDisputes],
  );

  const handleSubmitDispute = useCallback(async () => {
    if (!selectedDispute || !organizationId) return;
    if (!partnerOrgId) {
      Alert.alert(
        "Could not determine partner",
        "Ensure this entity is connected for shared ledger.",
      );
      return;
    }
    const netInt =
      entityType === "SUPPLIER"
        ? selectedDispute.intSales - selectedDispute.intPaidOut
        : selectedDispute.intSales - selectedDispute.intPaid;
    const netExt = selectedDispute.extSales - selectedDispute.extPaid;
    const raisedSales = selectedDispute.intSales;
    // Must match "Total Paid (My Book)" shown in the table (intPaidDisplay) so Accept & update writes the correct value.
    const raisedPaid =
      entityType === "SUPPLIER"
        ? selectedDispute.intPaidOut
        : selectedDispute.intPaid;
    setActionLoading(true);
    const { error, disputeId, alreadyInDispute } = await createDispute({
      orgId: organizationId,
      transaction_id: selectedDispute.tripId,
      partner_org_id: partnerOrgId,
      internal_snapshot: netInt,
      partner_snapshot: netExt,
      raised_sales: raisedSales,
      raised_paid: raisedPaid,
      reason_code: resolution.trim() || undefined,
    });
    setActionLoading(false);
    if (error) {
      Alert.alert(
        alreadyInDispute ? "Already in dispute" : "Error",
        error.message,
      );
      return;
    }
    if (disputeId) {
      const kind = getLedgerEscalationKind(selectedDispute);
      const missionLabel = selectedDispute.missionId;
      setSelectedDispute(null);
      setResolution("");
      setRemarks("");
      refetchDisputes();
      onRefresh?.();
      if (kind === "notify_partner") {
        Alert.alert(
          "Submitted",
          `Follow-up for ${missionLabel} was logged. ${entity.name} will be notified.`,
        );
      } else {
        Alert.alert(
          "Dispute raised",
          `Dispute for ${missionLabel} has been submitted. Notification sent to ${entity.name}.`,
        );
      }
    }
  }, [
    selectedDispute,
    organizationId,
    partnerOrgId,
    resolution,
    entity.name,
    entityType,
    onRefresh,
    refetchDisputes,
  ]);

  const handleRequestConnection = useCallback(async () => {
    if (!organizationId || !invitee || requestInviteLoading) return;
    setRequestInviteLoading(true);
    const { error, alreadyInvited } = await createConnectionRequest(
      organizationId,
      invitee.organization_id,
      {
        requestShipperClient: entityType === "CLIENT",
        requestCarrierSupplier: entityType === "SUPPLIER",
      },
    );
    setRequestInviteLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    if (alreadyInvited) {
      setPendingRequestSent(true);
      Alert.alert(
        "Already sent",
        "A connection request was already sent to this partner.",
      );
      return;
    }
    setPendingRequestSent(true);
    onRefresh?.();
    Alert.alert(
      "Request sent",
      `${entity.name} will see your request in the app. Once they accept, you can use Compare & Verify.`,
    );
  }, [
    organizationId,
    invitee,
    entityType,
    entity.name,
    requestInviteLoading,
    onRefresh,
  ]);

  const handleInviteToApp = useCallback(() => {
    const message = `Join me on Q to sync our ledger and compare books with ${entity.name}. Download the Q app to get started.`;
    Share.share({ message, title: "Invite to Q" }).catch(() => {});
  }, [entity.name]);

  const modalEscalationKind = selectedDispute
    ? getLedgerEscalationKind(selectedDispute)
    : null;

  if (!integrated) {
    return (
      <View style={styles.notIntegratedWrap}>
        <View style={styles.notIntegratedIconWrap}>
          <FontAwesome name="lock" size={28} color={Theme.textMuted} />
        </View>
        <Text style={styles.notIntegratedTitle}>Partner Not Integrated</Text>
        <Text style={styles.notIntegratedText}>
          Compare & Verify requires a shared network connection with{" "}
          {entity.name}.
        </Text>

        {inviteeStatus === "loading" && (
          <View style={styles.notIntegratedLoading}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.notIntegratedLoadingText}>
              Checking if {entity.name} is on Q…
            </Text>
          </View>
        )}

        {inviteeStatus === "no_phone" && (
          <Text style={styles.notIntegratedHint}>
            Add a phone number for this contact (in their profile) to request
            shared ledger or invite them to the app.
          </Text>
        )}

        {inviteeStatus === "error" && (
          <>
            <Text style={styles.notIntegratedHint}>
              We couldn’t look up this contact. Check your connection and try
              again.
            </Text>
            <TouchableOpacity
              style={[
                styles.notIntegratedBtn,
                styles.notIntegratedBtnSecondary,
              ]}
              onPress={() => setInviteeRetryKey((k) => k + 1)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.notIntegratedBtnText,
                  styles.notIntegratedBtnSecondaryText,
                ]}
              >
                Retry
              </Text>
            </TouchableOpacity>
          </>
        )}

        {inviteeStatus === "in_app" && (
          <>
            <Text style={styles.notIntegratedHint}>
              {invitee?.full_name ?? entity.name} is on Q. Send a connection
              request to enable Compare & Verify.
            </Text>
            {pendingRequestSent ? (
              <View style={styles.notIntegratedSentBadge}>
                <FontAwesome name="check" size={12} color={Theme.positive} />
                <Text style={styles.notIntegratedSentText}>Request sent</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.notIntegratedBtn}
                onPress={onRequestConnection ?? onRequestInvite ?? handleRequestConnection}
                disabled={requestInviteLoading && !onRequestInvite && !onRequestConnection}
                activeOpacity={0.8}
              >
                {requestInviteLoading && !onRequestInvite && !onRequestConnection ? (
                  <ActivityIndicator size="small" color={Theme.textOnDark} />
                ) : (
                  <Text style={styles.notIntegratedBtnText}>
                    Request shared ledger
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {inviteeStatus === "not_in_app" && (
          <>
            <Text style={styles.notIntegratedHint}>
              This contact isn’t on Q yet. Invite them to the app so you can
              connect later.
            </Text>
            <TouchableOpacity
              style={styles.notIntegratedBtn}
              onPress={() => {
                if (onInviteToApp) onInviteToApp();
                else if (onRequestInvite) onRequestInvite();
                else handleInviteToApp();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.notIntegratedBtnText}>Invite to app</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, Platform.OS === "web" && styles.containerWeb]}
    >
      {loadingShared ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Theme.primary} />
          <Text style={styles.loadingText}>Loading shared data…</Text>
        </View>
      ) : (
        <>
          <SharedLedgerCommandCenter
            entityName={entity.name ?? "—"}
            partnerProfileImageUrl={partnerProfileImageUrl}
            entityType={entityType}
            embeddedInOverlay={embeddedInOverlay}
            myBookLabel={myBookLabel}
            partnerLabel={partnerLabel}
            viewMode={viewMode}
            setViewMode={setViewMode}
            tripCounts={tripCounts}
            txnCounts={txnCounts}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            filteredRows={filteredRows}
            filteredTxnRows={filteredTxnRows}
            txnRowsAll={txnRows}
            reconciledRows={reconciledRows}
            onUpdateMyBook={handleUpdateMyBook}
            onRaiseDispute={setSelectedDispute}
            actionLoading={actionLoading}
            onMergePartnerTransaction={mergePartnerLineIntoBook}
            missionLabelForTripRef={missionLabelForTripRef}
            tripRouteForTripRef={tripRouteForTripRef}
            onPressDownload={embeddedInOverlay ? undefined : openSharedReport}
          />
            </>
          )}

      <LedgerReportModal
        visible={sharedReportVisible}
        onClose={() => setSharedReportVisible(false)}
        transactions={[]}
        title={`Shared ledger · ${(entity.name ?? "Partner").trim()}`}
        customReport={sharedLedgerCustomReport}
        hideCashSummary
      />

      <Modal
        visible={Platform.OS === "web" && !!pendingAcceptDispute}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAcceptDispute(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalCard}>
            <Text style={styles.confirmModalTitle}>Accept partner&apos;s view?</Text>
            <Text style={styles.confirmModalText}>
              Your ledger for this trip will be updated to match the partner&apos;s
              numbers. This cannot be undone.
            </Text>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => setPendingAcceptDispute(null)}
                disabled={actionLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmModalConfirmBtn,
                  actionLoading && styles.btnDisabled,
                ]}
                onPress={() =>
                  pendingAcceptDispute &&
                  void executeAcceptReceivedDispute(pendingAcceptDispute)
                }
                disabled={actionLoading || !pendingAcceptDispute}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalConfirmText}>
                  Accept &amp; update
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dispute modal */}
      <Modal
        visible={!!selectedDispute}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedDispute(null)}
      >
        <View
          style={[
            styles.modalWrap,
            {
              paddingTop:
                24 + (typeof insets?.top === "number" ? insets.top : 0),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {modalEscalationKind === "notify_partner"
                  ? "Waiting on partner ledger"
                  : "Dispute audit"}
              </Text>
              <Text style={styles.modalSubtitle}>
                Trip ID: {selectedDispute?.missionId}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setSelectedDispute(null)}
              hitSlop={12}
            >
              <FontAwesome
                name="times"
                size={18}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
          </View>
          {selectedDispute && (
            <>
              <View style={styles.modalVariance}>
                <Text
                  style={[
                    styles.modalVarianceLabel,
                    modalEscalationKind === "notify_partner" &&
                      styles.modalVarianceLabelNotify,
                  ]}
                >
                  {modalEscalationKind === "notify_partner"
                    ? "Details"
                    : "Identified variance"}
                </Text>
                <Text style={styles.modalVarianceText}>
                  {selectedDispute.issue}
                </Text>
                {modalEscalationKind === "notify_partner" ? (
                  <Text style={styles.modalVarianceHint}>
                    This trip stays here until your partner adds or confirms
                    their side. Optional: submit the form below if you want a
                    follow-up logged and your partner notified (same workflow
                    as a dispute record).
                  </Text>
                ) : (
                  !selectedDispute.external && (
                    <Text style={styles.modalVarianceHint}>
                      Partner data not yet synced. You can still raise a dispute;
                      partner will be notified.
                    </Text>
                  )
                )}
              </View>
              <View style={styles.modalForm}>
                <Text style={styles.modalLabel}>Proposed Resolution</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.resolutionScroll}
                >
                  {resolutionOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.resolutionChip,
                        resolution === opt && styles.resolutionChipActive,
                      ]}
                      onPress={() => setResolution(opt)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.resolutionChipText,
                          resolution === opt && styles.resolutionChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.modalLabel}>Remarks</Text>
                <TextInput
                  style={styles.modalTextArea}
                  placeholder="Provide details…"
                  placeholderTextColor={Theme.textMuted}
                  value={remarks}
                  onChangeText={setRemarks}
                  multiline
                  numberOfLines={2}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnSecondary}
                  onPress={() => {}}
                  activeOpacity={0.8}
                >
                  <FontAwesome
                    name="cloud-upload"
                    size={14}
                    color={Theme.textPrimaryDark}
                  />
                  <Text style={styles.modalBtnSecondaryText}>Attach Proof</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnPrimary,
                    actionLoading && styles.btnDisabled,
                  ]}
                  onPress={handleSubmitDispute}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  {actionLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={Theme.textOnPrimary}
                    />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>
                      {modalEscalationKind === "notify_partner"
                        ? "Submit"
                        : "Submit dispute"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

export type SharedLedgerContentProps = EntityCompareVerifyViewProps;
export type SharedLedgerPartyRow = ReconciledRow;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 24,
    backgroundColor: Theme.screenBackground,
  },
  /** Web: stretch inside parent ScrollView so shared-ledger drill-downs get width + height. */
  containerWeb: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 1,
  },
  notIntegratedWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
  },
  notIntegratedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Theme.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  notIntegratedTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  notIntegratedText: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 18,
  },
  notIntegratedHint: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  notIntegratedLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  notIntegratedLoadingText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  notIntegratedBtn: {
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  notIntegratedBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  notIntegratedBtnSecondary: {
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 16,
  },
  notIntegratedBtnSecondaryText: {
    color: Theme.textPrimaryDark,
  },
  notIntegratedSentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.positive,
  },
  notIntegratedSentText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.positive,
  },
  auditHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  auditHeaderLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cardWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 2,
  },
  desktopShell: {
    maxWidth: 1900,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 0,
    paddingTop: 2,
    gap: 14,
  },
  desktopTopHeader: {
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  desktopTopTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  desktopTopSubTitle: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2.2,
  },
  desktopHeroCard: {
    backgroundColor: "#0F172A",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  desktopHeroLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#818CF8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  desktopHeroCaption: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  desktopHeroValue: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  desktopHeroSplit: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  desktopHeroSplitCell: {
    flex: 1,
  },
  desktopHeroSplitLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#10B981",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  desktopHeroSplitLabelDue: { color: "#F87171", textAlign: "right" as const },
  desktopHeroSplitValue: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  desktopHeroSplitValueDue: {
    color: "#F87171",
    textAlign: "right" as const,
  },
  desktopMainTabs: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  desktopMainTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopMainTabActive: {
    backgroundColor: Theme.textPrimaryDark,
  },
  desktopMainTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  desktopMainTabTextActive: {
    color: Theme.textOnDark,
  },
  desktopPlaceholder: {
    marginTop: 28,
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    backgroundColor: Theme.surface,
  },
  desktopPlaceholderTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  desktopPlaceholderText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tableWrap: {
    paddingHorizontal: 0,
    paddingTop: 8,
    overflow: "visible",
  },
  tableWrapWebDesktop: {
    paddingTop: 6,
  },
  table: {
    backgroundColor: Theme.screenBackground,
  },
  tableWebDesktop: {
    maxWidth: 1900,
    width: "100%",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Theme.surface,
    marginHorizontal: 0,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableHeaderWebDesktop: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceLight,
    borderBottomColor: Theme.borderLight,
  },
  tableSubHeader: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableSubHeaderWebDesktop: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  th: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  thMission: { width: "32%" },
  thGroup: { flex: 1, textAlign: "center" as const },
  /** On web grid, avoid flex:1 on label text — it forces line breaks ("COST" / "COMP"). */
  thGroupWebDesktop: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "center",
    maxWidth: "100%",
  },
  thGroupWrap: { flex: 1, alignItems: "center" },
  thMissionWebDesktop: { width: "44%" },
  thGroupWrapWebDesktop: {
    width: "28%",
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  thSub: {
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    textAlign: "right" as const,
    flex: 1,
  },
  thRight: { textAlign: "right" as const },
  tableScroll: { flexGrow: 1, minHeight: 500 },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  dataRowStriped: {
    backgroundColor: Theme.surfaceLight,
  },
  dataRowExpanded: { backgroundColor: Theme.screenBackground },
  dataRowGhost: { backgroundColor: Theme.positiveMuted },
  dataRowPending: { backgroundColor: Theme.screenBackground },
  chevron: { marginRight: 8 },
  cellMission: {
    width: "32%",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  cellMissionWebDesktop: {
    width: "44%",
    paddingRight: 10,
  },
  amountCol: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  amountColWebDesktop: {
    width: "14%",
    flex: 0,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
  },
  missionId: {
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  badgeMatched: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    overflow: "hidden",
    marginTop: 2,
  },
  badgePending: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.driverGold,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.driverGold,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeVariance: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.teslaRed,
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: Theme.teslaRed,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeGhost: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeSent: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.primary,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeReceived: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.driverGold,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.driverGold,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  cellAmount: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right" as const,
  },
  cellAmountWebDesktop: {
    width: "100%",
    flex: 0,
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "italic",
  },
  cellSales: { color: Theme.textPrimaryDark },
  cellPaid: { color: Theme.darkGreen },
  cellMismatch: { color: Theme.teslaRed },
  cellPending: { color: Theme.driverGold, fontStyle: "italic" },
  expandedWrap: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 6,
    overflow: "hidden",
  },
  /** Flush to table edges: same column grid as data rows, less “card in card”. */
  expandedWrapWebDesktop: {
    marginHorizontal: 0,
    marginBottom: 0,
    marginTop: 0,
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.borderMedium,
  },
  reconDesktopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.textPrimaryDark,
  },
  reconDesktopBarTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  reconDesktopBarRef: {
    fontSize: 11,
    color: "#E5E7EB",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  reconDesktopGrid: {
    paddingBottom: 4,
  },
  reconDesktopRowBase: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  reconDesktopBookRow: {
    backgroundColor: "#FFFFFF",
  },
  reconDesktopMissionCell: {
    justifyContent: "flex-start",
    paddingRight: 8,
  },
  reconDesktopSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    lineHeight: 14,
  },
  reconDesktopAmount: {
    fontSize: 14,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "right",
  },
  reconDesktopDate: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
  },
  reconDesktopVarFoot: {
    marginTop: 6,
    minHeight: 14,
    alignItems: "flex-end",
  },
  reconDesktopVarFootText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "right",
  },
  reconDesktopVarFootMuted: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
  },
  reconDesktopNetStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  reconDesktopNetLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  reconDesktopNetValue: {
    fontSize: 16,
    fontWeight: "700",
    fontStyle: "italic",
  },
  reconHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  reconTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.8,
  },
  reconRef: { 
    fontSize: 10, 
    color: "#FFFFFF", 
    fontFamily: "monospace" 
  },
  reconCardsContainer: {
    padding: 16,
    gap: 12,
  },
  reconCardsContainerWebDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  valueCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
  },
  valueCardWebDesktop: {
    flex: 1,
    minWidth: 0,
    padding: 14,
  },
  valueCardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: "uppercase",
  },
  valueCardRowHeader: {
    flexDirection: "row",
    marginBottom: 12,
  },
  valueCardColHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  valueCardColLeft: {
    flex: 1,
    textAlign: "left",
    alignItems: "flex-start",
  },
  valueCardColCenter: {
    flex: 1,
    textAlign: "center",
    alignItems: "center",
  },
  valueCardColRight: {
    flex: 0.8,
    textAlign: "right",
    alignItems: "flex-end",
  },
  valueCardRowValues: {
    flexDirection: "row",
    alignItems: "center",
  },
  valueCardColValueContainer: {
    justifyContent: "center",
  },
  valueCardValue: {
    fontSize: 15,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  valueCardDate: {
    fontSize: 10,
    fontStyle: "normal",
    color: Theme.textMuted,
    marginTop: 4,
  },
  valueCardVar: {
    fontSize: 15,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  netDueCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netDueCardWebDesktop: {
    width: 220,
    flexShrink: 0,
  },
  netDueTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  netDueValue: {
    fontSize: 15,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  netDueValueNegative: {
    color: Theme.teslaRed,
  },
  netDueValueNonNegative: {
    color: Theme.textPrimaryDark,
  },
  varianceRed: { color: Theme.teslaRed },
  varianceAmber: { color: Theme.warning, fontStyle: "italic" },
  varianceMatch: { color: Theme.darkGreen },
  textPaid: { color: Theme.darkGreen },
  varianceWait: {
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  varianceActionCard: {
    marginTop: 4,
    marginHorizontal: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  varianceActionWaitingBlock: {
    width: "100%" as const,
    alignItems: "center",
  },
  varianceActionTextCenter: {
    textAlign: "center" as const,
    alignSelf: "stretch",
  },
  varianceActionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C62828",
    marginBottom: 12,
  },
  varianceActionTitleWaiting: {
    marginBottom: 4,
  },
  varianceActionSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 10,
    marginTop: -4,
    lineHeight: 15,
  },
  /** Centered waiting stack: small gap under title (no negative overlap). */
  varianceActionSubtitleWaitingCenter: {
    marginTop: 4,
  },
  varianceActionButtons: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  varianceActionButtonsWebDesktop: {
    justifyContent: "flex-start",
    gap: 10,
  },
  varianceBtnEqual: {
    flex: 1,
    minWidth: 0,
  },
  varianceBtnDisputeFull: {
    flex: 1,
  },
  varianceBtnUpdate: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#16A34A",
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
  },
  varianceBtnUpdateText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
    marginLeft: 6,
  },
  varianceBtnDispute: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#111827",
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
  },
  varianceBtnDisputeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 6,
  },
  varianceBtnWebDesktop: {
    minWidth: 200,
    flex: 0,
  },
  receivedBar: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.driverGold,
  },
  receivedBarWebDesktop: {
    marginTop: 12,
    marginHorizontal: 12,
  },
  receivedLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.driverGold,
    marginBottom: 12,
  },
  receivedActions: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.darkGreen,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  acceptBtnWebDesktop: {
    maxWidth: 220,
    flex: 0,
  },
  acceptBtnText: { fontSize: 12, fontWeight: "800", color: Theme.textOnDark },
  declineBtn: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    justifyContent: "center",
  },
  declineBtnWebDesktop: {
    maxWidth: 180,
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  btnDisabled: { opacity: 0.7 },
  modalWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  modalClose: { padding: 8 },
  modalVariance: {
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 20,
    padding: 14,
    marginBottom: 20,
  },
  modalVarianceLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.teslaRed,
    letterSpacing: 1,
    marginBottom: 4,
  },
  modalVarianceLabelNotify: {
    color: Theme.textMutedDemo,
  },
  modalVarianceText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  modalVarianceHint: { fontSize: 10, color: Theme.textMuted, marginTop: 6 },
  modalForm: { marginBottom: 24 },
  modalLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  resolutionScroll: { marginBottom: 12, flexGrow: 0 },
  resolutionChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceLight,
    marginRight: 8,
  },
  resolutionChipActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  resolutionChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  resolutionChipTextActive: { color: Theme.primary },
  modalTextArea: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 16,
    padding: 14,
    fontSize: 12,
    color: Theme.textPrimaryDark,
    minHeight: 64,
    textAlignVertical: "top",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  modalBtnSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  modalBtnPrimary: {
    flex: 1,
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  modalBtnPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11, 16, 32, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  confirmModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  confirmModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  confirmModalText: {
    fontSize: 12,
    lineHeight: 18,
    color: Theme.textMuted,
  },
  confirmModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  confirmModalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  confirmModalCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  confirmModalConfirmBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: Theme.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  confirmModalConfirmText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  emptyTable: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyTableText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 8,
  },

  /* ─── View-mode segment (By Trip / By Transaction) ─── */
  viewModeWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  viewModeWrapWebDesktop: {
    maxWidth: 1900,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 0,
    paddingTop: 6,
  },
  viewModeTabs: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    padding: 5,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 11,
    minHeight: 46,
  },
  viewModeTabActive: {
    backgroundColor: Theme.textPrimaryDark,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  viewModeTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  viewModeTabTextActive: {
    color: Theme.textOnDark,
  },
  viewModeCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewModeCountActive: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  viewModeCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  viewModeCountTextActive: {
    color: Theme.textOnDark,
  },

  /* ─── Status filter chips ─── */
  filterChipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  filterChipsRowWebDesktop: {
    maxWidth: 1900,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  filterChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
  },
  filterChipTextActive: {
    color: Theme.textOnDark,
  },
  filterChipCount: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    minWidth: 14,
    textAlign: "right",
  },
  filterChipCountActive: {
    color: Theme.textOnDark,
  },

  /* ─── By-Transaction list ─── */
  txnListWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  txnCard: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 1,
  },
  txnHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  txnLeftCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  txnRightCol: {
    alignItems: "flex-end",
    gap: 6,
  },
  txnIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  txnTripRef: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
  },
  txnMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  txnAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  txnStatusPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  txnStatusPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  txnCompareRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  txnCompareCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 3,
  },
  txnCompareDivider: {
    width: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 2,
  },
  txnCompareLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  txnCompareValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  txnCompareValueAccent: {
    color: Theme.teslaRed,
  },
  txnHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  txnHintText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    flex: 1,
  },
  txnHintTextPositive: {
    color: Theme.darkGreen,
  },
});
