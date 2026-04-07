/**
 * Compare & Verify — trip-level shared ledger audit for a single partner (client/supplier).
 * Shows Mission | Sales (My Book / Partner) | Paid (My Book / Partner) with expandable
 * reconciliation statement and Raise Dispute. Matches reference UX; uses Theme and app terms.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getClientById } from "@/features/clients/services/clients.service";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips";
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
} from "@/services/sharedLedgerService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { LedgerRow } from "../services/finance.service";
import { TreasurySummaryCard } from "./TreasurySummaryCard";

export interface SharedTripData {
  tripId: string;
  sales: number;
  paid: number;
}

export interface EntityCompareVerifyViewProps {
  entity: { id: string; name: string; linked_organization_id?: string | null };
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
}

type ReconStatus = "VERIFIED" | "PENDING" | "MISMATCH" | "UNRECOGNIZED";

interface InternalTrip {
  tripId: string;
  missionId: string;
  date: string;
  sales: number;
  paid: number;
  /** Amount we paid out (amount_out) for this trip; used for supplier Net Trip Due. */
  paidOut: number;
  due: number;
}

interface ReconciledRow {
  tripId: string;
  missionId: string;
  status: ReconStatus;
  issue: string | null;
  internal: InternalTrip | null;
  external: { sales: number; paid: number } | null;
  intSales: number;
  intPaid: number;
  /** Amount we paid out (for supplier); used for entity-aware Net Trip Due. */
  intPaidOut: number;
  extSales: number;
  extPaid: number;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
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
        const paidMatch = internalPaidForCompare === ext.paid;
        // Partner's "sales" = payables/receivables (supplier_rate) only, never client_price.
        // If backend returns ext > int, it's likely client_price; use int (supplier_rate) for both CLIENT and SUPPLIER views.
        const extSalesResolved =
          ext.sales === 0 && int.sales > 0
            ? int.sales
            : ext.sales > int.sales && int.sales > 0
              ? int.sales
              : ext.sales;
        const isMatch = int.sales === extSalesResolved && paidMatch;
        results.push({
          tripId: int.tripId,
          missionId: int.missionId,
          status: isMatch ? "VERIFIED" : "MISMATCH",
          issue: isMatch ? null : "Data Variance Detected",
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
  const [searchQuery, setSearchQuery] = useState("");

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
          const byTrip = new Map<string, number>();
          if (!e2 && entries?.length) {
            const partnerPaidFromOut = entityType === "CLIENT"; // client pays us = their amount_out
            for (const e of entries) {
              const ref = (e.reference_id ?? e.id ?? "").toString().trim().toLowerCase();
              if (!ref) continue;
              const amt = Number(e.amount ?? 0);
              const out = amt < 0 ? -amt : 0;
              const inAmt = amt >= 0 ? amt : 0;
              const paid = partnerPaidFromOut ? out : inAmt;
              byTrip.set(ref, (byTrip.get(ref) ?? 0) + paid);
            }
          }
          const merged = fromSummary.map((r) => {
            const key = r.tripId.trim().toLowerCase();
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
        if (e2 || !entries?.length) return;
        const byTrip = new Map<string, { in: number; out: number }>();
        for (const e of entries) {
          const ref = (e.reference_id ?? e.id ?? "").toString().trim().toLowerCase();
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
  }, [organizationId, integrated, entity.id, entityType, sharedTripsProp?.length]);

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

  const searchLower = (searchQuery ?? "").trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      searchLower
        ? reconciledRows.filter((r) =>
            (r.missionId ?? "").toLowerCase().includes(searchLower),
          )
        : reconciledRows,
    [reconciledRows, searchLower],
  );

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

  const totalBilling = useMemo(
    () => reconciledRows.reduce((s, r) => s + r.intSales, 0),
    [reconciledRows],
  );
  const totalDue = useMemo(
    () =>
      reconciledRows.reduce(
        (s, r) =>
          s +
          (entityType === "SUPPLIER"
            ? Math.max(0, r.intSales - r.intPaidOut)
            : r.intSales - r.intPaid),
        0,
      ),
    [reconciledRows, entityType],
  );

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

  const handleAcceptReceivedDispute = useCallback(
    (dispute: DisputeRow) => {
      if (!organizationId) return;
      Alert.alert(
        "Accept partner's view?",
        "Your ledger for this trip will be updated to match the partner's numbers. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept & update",
            onPress: () => {
              setTimeout(async () => {
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
                        (r) => String(r.tripId).toLowerCase() === String(dispute.transaction_id).toLowerCase(),
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
              }, 100);
            },
          },
        ],
      );
    },
    [organizationId, entity.id, onRefresh, refetchDisputes, reconciledRows],
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
    <View style={styles.container}>
      {loadingShared ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Theme.primary} />
          <Text style={styles.loadingText}>Loading shared data…</Text>
        </View>
      ) : (
        <>
          {!embeddedInOverlay && (
            <>
              <View style={styles.auditHeader}>
                <Text style={styles.auditHeaderLabel}>SHARED LEDGER AUDIT</Text>
              </View>
              <View style={styles.cardWrap}>
                <TreasurySummaryCard
                  totalIn={totalBilling}
                  totalOut={totalDue}
                  labelIn="Total Billing"
                  labelOut="Total Balance"
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search mission…"
                  onReportPress={() => {}}
                  hideReportInToolbar
                />
              </View>
            </>
          )}

          <View style={styles.tableWrap}>
            <Text style={styles.sectionTitle}>COMPARE BY MISSION</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thMission]}>MISSION</Text>
                <Text style={[styles.th, styles.thGroup]}>
                  {entityType === "CLIENT" ? "SALES COMP" : "COST COMP"}
                </Text>
                <Text style={[styles.th, styles.thGroup]}>PAID COMP</Text>
              </View>
              <View style={styles.tableSubHeader}>
                <View style={styles.thMission} />
                <Text style={[styles.thSub, styles.thRight]} numberOfLines={1}>
                  {myBookLabel}
                </Text>
                <Text style={[styles.thSub, styles.thRight]} numberOfLines={1}>
                  {partnerLabel}
                </Text>
                <Text style={[styles.thSub, styles.thRight]} numberOfLines={1}>
                  {myBookLabel}
                </Text>
                <Text style={[styles.thSub, styles.thRight]} numberOfLines={1}>
                  {partnerLabel}
                </Text>
              </View>

              <ScrollView
                style={styles.tableScroll}
                showsVerticalScrollIndicator={true}
              >
                {filteredRows.length === 0 ? (
                  <View style={styles.emptyTable}>
                    <FontAwesome
                      name="exchange"
                      size={28}
                      color={Theme.textMuted}
                    />
                    <Text style={styles.emptyTableText}>
                      No missions to compare yet.
                    </Text>
                  </View>
                ) : (
                  filteredRows.map((row) => {
                    const isExpanded = expandedTripId === row.tripId;
                    const isSalesMismatch =
                      row.status === "MISMATCH" &&
                      row.intSales !== row.extSales;
                    const isGhost = row.status === "UNRECOGNIZED";
                    const isPending = row.status === "PENDING";
                    const salesVar = row.extSales - row.intSales;
                    // Total Paid: amount moved in this relationship.
                    // - When entityType === 'SUPPLIER', we are the client paying them → use amount_out (intPaidOut).
                    // - When entityType === 'CLIENT', we are the supplier receiving from them → use amount_in (intPaid).
                    const intPaidDisplay =
                      entityType === "SUPPLIER" ? row.intPaidOut : row.intPaid;
                    const paidVar = row.extPaid - intPaidDisplay;
                    const isPaidMismatchDisplay =
                      row.status === "MISMATCH" &&
                      intPaidDisplay !== row.extPaid;
                    // Net Trip Due: sales minus what has moved in this relationship.
                    // For both client and supplier, use the same relationship-paid figure shown above.
                    const netInt = row.intSales - intPaidDisplay;
                    const netExt = row.extSales - row.extPaid;
                    const netVar = netExt - netInt;
                    const rowKey = String(row.tripId).trim().toLowerCase();
                    const hasDisputeSent = disputeSentByTripId.has(rowKey);
                    const hasDisputeReceived =
                      disputeReceivedByTripId.has(rowKey);
                    const receivedDispute = disputeReceivedByTripId.get(rowKey);
                    const showUpdateMyBook =
                      (row.status === "MISMATCH" || row.status === "PENDING") &&
                      !!row.external;
                    const escalationKind = getLedgerEscalationKind(row);
                    const isNotifyPartnerFlow = escalationKind === "notify_partner";

                    return (
                      <View key={row.tripId}>
                        <TouchableOpacity
                          style={[
                            styles.dataRow,
                            isExpanded && styles.dataRowExpanded,
                            isGhost && styles.dataRowGhost,
                            isPending && styles.dataRowPending,
                          ]}
                          onPress={() =>
                            setExpandedTripId(isExpanded ? null : row.tripId)
                          }
                          activeOpacity={0.7}
                        >
                          <View style={styles.cellMission}>
                            <FontAwesome
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={10}
                              color={Theme.textMuted}
                              style={styles.chevron}
                            />
                            <Text style={styles.missionId} numberOfLines={1}>
                              {row.missionId}
                            </Text>
                            {row.status === "VERIFIED" && (
                              <Text style={styles.badgeMatched}>MATCHED</Text>
                            )}
                            {row.status === "PENDING" && !hasDisputeSent && (
                              <Text style={styles.badgePending}>PENDING</Text>
                            )}
                            {row.status === "MISMATCH" && !hasDisputeSent && (
                              <Text style={styles.badgeVariance}>VARIANCE</Text>
                            )}
                            {row.status === "UNRECOGNIZED" &&
                              !hasDisputeSent && (
                                <Text style={styles.badgeGhost}>GHOST</Text>
                              )}
                            {hasDisputeSent && (
                              <Text style={styles.badgeSent}>DISPUTE SENT</Text>
                            )}
                            {hasDisputeReceived && (
                              <Text style={styles.badgeReceived}>
                                DISPUTE RECEIVED
                              </Text>
                            )}
                          </View>
                          <Text
                            style={[styles.cellAmount, styles.cellSales]}
                            numberOfLines={1}
                          >
                            {row.internal ? formatINR(row.intSales) : "—"}
                          </Text>
                          <Text
                            style={[
                              styles.cellAmount,
                              styles.cellSales,
                              (isSalesMismatch || isGhost) &&
                                styles.cellMismatch,
                              isPending && styles.cellPending,
                            ]}
                            numberOfLines={1}
                          >
                            {isPending
                              ? "Wait"
                              : row.external
                                ? formatINR(row.extSales)
                                : "—"}
                          </Text>
                          <Text
                            style={[styles.cellAmount, styles.cellPaid]}
                            numberOfLines={1}
                          >
                            {row.internal ? formatINR(intPaidDisplay) : "—"}
                          </Text>
                          <Text
                            style={[
                              styles.cellAmount,
                              styles.cellPaid,
                              (isPaidMismatchDisplay || isGhost) &&
                                styles.cellMismatch,
                              isPending && styles.cellPending,
                            ]}
                            numberOfLines={1}
                          >
                            {isPending
                              ? "Wait"
                              : row.external
                                ? formatINR(row.extPaid)
                                : "—"}
                          </Text>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.expandedWrap}>
                            <View style={styles.reconHeader}>
                              <Text style={styles.reconTitle}>
                                Reconciliation Statement
                              </Text>
                              <Text style={styles.reconRef}>
                                REF: {row.missionId}
                              </Text>
                            </View>
                            <View style={styles.reconCard}>
                              <View style={styles.reconRowHeader}>
                                <Text style={styles.reconColLabel}>
                                  Description
                                </Text>
                                <Text
                                  style={[
                                    styles.reconColRight,
                                    styles.reconColMy,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {myBookLabel}
                                </Text>
                                <Text
                                  style={[
                                    styles.reconColRight,
                                    styles.reconColPartner,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {partnerLabel}
                                </Text>
                                <Text style={styles.reconColRight}>
                                  Variance
                                </Text>
                              </View>
                              <View style={styles.reconSectionLabel}>
                                <Text style={styles.reconSectionText}>
                                  {entityType === "CLIENT" ? "Charges (Sales)" : "Charges (Cost)"}
                                </Text>
                              </View>
                              <View style={styles.reconDataRow}>
                                <Text style={styles.reconColLabel}>
                                  {entityType === "CLIENT" ? "Total Sales" : "Total Cost"}
                                </Text>
                                <Text style={styles.reconColRight}>
                                  {row.internal ? formatINR(row.intSales) : "—"}
                                </Text>
                                <Text style={styles.reconColRight}>
                                  {isPending
                                    ? "—"
                                    : row.external
                                      ? formatINR(row.extSales)
                                      : "—"}
                                </Text>
                                <Text
                                  style={[
                                    styles.reconColRight,
                                    salesVar !== 0 &&
                                      !isPending &&
                                      styles.varianceRed,
                                    isPending && styles.varianceWait,
                                  ]}
                                >
                                  {isPending
                                    ? "Wait"
                                    : salesVar === 0
                                      ? "—"
                                      : (salesVar > 0 ? "+" : "") +
                                        formatINR(salesVar)}
                                </Text>
                              </View>
                              <View style={styles.reconSectionLabelPaid}>
                                <Text style={styles.reconSectionTextPaid}>
                                  Credits (Paid)
                                </Text>
                              </View>
                              <View style={styles.reconPaidCompactRow}>
                                <Text style={styles.reconPaidCompactLabel}>
                                  Total Paid
                                </Text>
                                <View style={styles.reconPaidCompactValues}>
                                  <Text
                                    style={[
                                      styles.reconPaidCompactAmt,
                                      styles.textPaid,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {row.internal
                                      ? formatINR(intPaidDisplay)
                                      : "—"}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.reconPaidCompactAmt,
                                      styles.textPaid,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {isPending
                                      ? "—"
                                      : row.external
                                        ? formatINR(row.extPaid)
                                        : "—"}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.reconPaidCompactAmt,
                                      paidVar !== 0 &&
                                        !isPending &&
                                        styles.varianceAmber,
                                      isPending && styles.varianceWait,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {isPending
                                      ? "Wait"
                                      : paidVar === 0
                                        ? "—"
                                        : (paidVar > 0 ? "+" : "") +
                                          formatINR(paidVar)}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.reconNetBar}>
                                <Text style={styles.reconNetBarLabel}>
                                  Net Trip Due
                                </Text>
                                <Text
                                  style={[
                                    styles.reconNetBarAmount,
                                    isPending && styles.varianceWait,
                                    !isPending &&
                                      row.internal &&
                                      netInt < 0 &&
                                      styles.reconNetBarAmountNegative,
                                    !isPending &&
                                      row.internal &&
                                      netInt >= 0 &&
                                      styles.reconNetBarAmountNonNegative,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {isPending
                                    ? "Wait"
                                    : row.internal
                                      ? formatINR(netInt)
                                      : "—"}
                                </Text>
                              </View>
                            </View>
                            {hasDisputeReceived && receivedDispute && (
                              <View style={styles.receivedBar}>
                                <Text style={styles.receivedLabel}>
                                  Dispute received from partner
                                </Text>
                                <View style={styles.receivedActions}>
                                  <TouchableOpacity
                                    style={[
                                      styles.acceptBtn,
                                      actionLoading && styles.btnDisabled,
                                    ]}
                                    onPress={() =>
                                      handleAcceptReceivedDispute(
                                        receivedDispute,
                                      )
                                    }
                                    disabled={actionLoading}
                                    activeOpacity={0.8}
                                    hitSlop={{
                                      top: 12,
                                      bottom: 12,
                                      left: 8,
                                      right: 8,
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Accept and auto-update ledger"
                                  >
                                    <FontAwesome
                                      name="check"
                                      size={12}
                                      color={Theme.textOnDark}
                                    />
                                    <Text style={styles.acceptBtnText}>
                                      Accept & Auto-Update Ledger
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.declineBtn,
                                      actionLoading && styles.btnDisabled,
                                    ]}
                                    onPress={() =>
                                      handleDeclineReceivedDispute(
                                        receivedDispute,
                                      )
                                    }
                                    disabled={actionLoading}
                                    activeOpacity={0.8}
                                    hitSlop={{
                                      top: 12,
                                      bottom: 12,
                                      left: 8,
                                      right: 8,
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Decline dispute"
                                  >
                                    <Text style={styles.declineBtnText}>
                                      Decline
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}
                            {!hasDisputeSent &&
                              (row.status === "MISMATCH" ||
                                row.status === "PENDING" ||
                                row.status === "UNRECOGNIZED") && (
                                <View style={styles.varianceActionCard}>
                                  {isNotifyPartnerFlow ? (
                                    <View style={styles.varianceActionWaitingBlock}>
                                      <Text
                                        style={[
                                          styles.varianceActionTitle,
                                          styles.varianceActionTextCenter,
                                          row.issue && styles.varianceActionTitleWaiting,
                                        ]}
                                        numberOfLines={2}
                                      >
                                        Waiting on partner ledger
                                      </Text>
                                      {row.issue ? (
                                        <Text
                                          style={[
                                            styles.varianceActionSubtitle,
                                            styles.varianceActionSubtitleWaitingCenter,
                                            styles.varianceActionTextCenter,
                                          ]}
                                          numberOfLines={2}
                                        >
                                          {row.issue}
                                        </Text>
                                      ) : null}
                                    </View>
                                  ) : (
                                    <Text
                                      style={styles.varianceActionTitle}
                                      numberOfLines={2}
                                    >
                                      {row.issue ?? "Data Variance Detected"}
                                    </Text>
                                  )}
                                  {(showUpdateMyBook || !isNotifyPartnerFlow) && (
                                    <View style={styles.varianceActionButtons}>
                                      {showUpdateMyBook && (
                                        <TouchableOpacity
                                          style={[
                                            styles.varianceBtnUpdate,
                                            !isNotifyPartnerFlow
                                              ? styles.varianceBtnEqual
                                              : styles.varianceBtnDisputeFull,
                                            actionLoading && styles.btnDisabled,
                                          ]}
                                          onPress={() => handleUpdateMyBook(row)}
                                          disabled={actionLoading}
                                          activeOpacity={0.8}
                                        >
                                          <FontAwesome
                                            name="edit"
                                            size={12}
                                            color={Theme.textOnDark}
                                          />
                                          <Text style={styles.varianceBtnUpdateText}>
                                            Update My Book
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                      {!isNotifyPartnerFlow && (
                                        <TouchableOpacity
                                          style={[
                                            styles.varianceBtnDispute,
                                            showUpdateMyBook
                                              ? styles.varianceBtnEqual
                                              : styles.varianceBtnDisputeFull,
                                            actionLoading && styles.btnDisabled,
                                          ]}
                                          onPress={() => setSelectedDispute(row)}
                                          disabled={actionLoading}
                                          activeOpacity={0.8}
                                          accessibilityRole="button"
                                          accessibilityLabel="Raise dispute"
                                        >
                                          <FontAwesome
                                            name="exclamation-triangle"
                                            size={12}
                                            color={Theme.textOnDark}
                                          />
                                          <Text style={styles.varianceBtnDisputeText}>
                                            Raise Dispute
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  )}
                                </View>
                              )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </>
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 24,
    backgroundColor: Theme.screenBackground,
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
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 2,
    marginBottom: 16,
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
    paddingTop: 16,
    overflow: "visible",
  },
  table: {
    backgroundColor: Theme.screenBackground,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
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
  th: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  thMission: { width: "32%" },
  thGroup: { flex: 1, textAlign: "center" as const },
  thSub: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textAlign: "right" as const,
    flex: 1,
  },
  thRight: { textAlign: "right" as const },
  tableScroll: { flexGrow: 1, minHeight: 500 },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
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
  missionId: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  badgeMatched: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
    overflow: "hidden",
    marginTop: 2,
  },
  badgePending: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.driverGold,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.driverGold,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeVariance: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.teslaRed,
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: Theme.teslaRed,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeGhost: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeSent: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  badgeReceived: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.driverGold,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.driverGold,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  cellAmount: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right" as const,
  },
  cellSales: { color: Theme.textPrimaryDark },
  cellPaid: { color: Theme.darkGreen },
  cellMismatch: { color: Theme.teslaRed },
  cellPending: { color: Theme.driverGold, fontStyle: "italic" },
  expandedWrap: {
    paddingVertical: 16,
    paddingHorizontal: 0,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reconHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  reconTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1.5,
  },
  reconRef: { fontSize: 10, color: Theme.textMuted, fontFamily: "monospace" },
  reconCard: {
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  reconRowHeader: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reconColLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMutedDemo,
  },
  reconColRight: {
    width: 72,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right" as const,
    color: Theme.textPrimaryDark,
  },
  reconColMy: { color: Theme.textPrimaryDark },
  reconColPartner: { color: Theme.primary },
  reconSectionLabel: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reconSectionText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
  },
  reconSectionLabelPaid: {
    backgroundColor: Theme.positiveMuted,
    paddingVertical: 5,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reconSectionTextPaid: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.darkGreen,
    letterSpacing: 1,
  },
  reconDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  reconPaidCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
    gap: 10,
  },
  reconPaidCompactLabel: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMutedDemo,
  },
  reconPaidCompactValues: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    minWidth: 0,
  },
  reconPaidCompactAmt: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right" as const,
  },
  varianceRed: { color: Theme.teslaRed },
  varianceAmber: { color: Theme.driverGold, fontStyle: "italic" },
  varianceMatch: { color: Theme.darkGreen },
  textPaid: { color: Theme.darkGreen },
  reconNetBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.ledgerNetBarBg,
  },
  reconNetBarLabel: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  reconNetBarAmount: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right" as const,
    color: Theme.textOnDark,
    marginLeft: 12,
  },
  reconNetBarAmountNegative: {
    color: Theme.ledgerNetDueAccent,
  },
  reconNetBarAmountNonNegative: {
    color: Theme.textOnDark,
  },
  varianceWait: {
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  varianceActionCard: {
    marginTop: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
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
    fontSize: 12,
    fontWeight: "800",
    color: Theme.warning,
    marginBottom: 10,
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
    gap: 6,
    backgroundColor: Theme.darkGreen,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    minHeight: 44,
  },
  varianceBtnUpdateText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  varianceBtnDispute: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Theme.ledgerNetBarBg,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    minHeight: 44,
  },
  varianceBtnDisputeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
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
});
