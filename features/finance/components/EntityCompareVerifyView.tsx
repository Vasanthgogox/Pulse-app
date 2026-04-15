/**
 * Compare & Verify — trip-level shared ledger audit for a single partner (client/supplier).
 * Shows Trip | Sales (My Book / Partner) | Paid (My Book / Partner) with expandable
 * reconciliation statement and Raise Dispute. Matches reference UX; uses Theme and app terms.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getClientById } from "@/features/clients/services/clients.service";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import {
    createConnectionRequest,
    getConnectionInviteeByPhone,
    getConnectionRequestsSent,
    type ConnectionInviteeByPhone,
} from "@/features/network/services/connection-requests.service";
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
} from "@/features/finance/services/shared-ledger.service";
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
import { formatINR } from "@/lib/format";
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

/** Build internal per-trip from trips + transactions (O(n)). */
function buildInternalTrips(
  trips: TripRow[],
  transactions: LedgerRow[],
  entityId: string,
  entityType: "CLIENT" | "SUPPLIER",
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
    // CLIENT = what we charged them (client_price).
    // SUPPLIER = what we owe them (supplier_rate). client_price only as last-resort fallback.
    const tripSales = Number(
      entityType === "CLIENT"
        ? (t.client_price ?? 0)
        : (t.supplier_rate ?? t.client_price ?? 0),
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
      const weHaveEntry = int.sales > 0 || int.paid > 0 || int.paidOut > 0;
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

const RESOLUTION_OPTIONS = [
  "Partner needs to update Sales amount",
  "Partner missed payment entry",
  "Invalid Ghost Trip",
];

export function EntityCompareVerifyView({
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
  const myBookLabel = viewAsPartner ? entity.name : "My Book";
  const partnerLabel = viewAsPartner ? "Your Company" : entity.name;
  /** Short labels for compact table headers so column names are not truncated */
  const myBookShort = "MY";
  const partnerShort = "PTNR";
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

  // Non-integrated partner: resolve phone → invitee in app or not → Request vs Invite
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
  const sharedLedgerTrips = useMemo(
    () => trips.filter((trip) => isLoadBasedTrip(trip)),
    [trips],
  );

  const internalMap = useMemo(
    () =>
      sharedLedgerTrips.length && txs.length >= 0
        ? buildInternalTrips(sharedLedgerTrips, txs, entity.id, entityType)
        : new Map(),
    [sharedLedgerTrips, txs, entity.id, entityType],
  );

  // When partner is non-integrated: fetch contact phone, then check if they're in app (by phone lookup).
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
    getSharedLedgerTripSummary(organizationId, entity.id).then(
      ({ error, rows }) => {
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
          getSharedLedgerEntriesForPartner(organizationId, entity.id).then(
            ({ error: e2, entries }) => {
              if (cancelled) return;
              setLoadingShared(false);
              const byTrip = new Map<string, number>();
              if (!e2 && entries?.length) {
                const partnerPaidFromOut = entityType === "CLIENT"; // client pays us = their amount_out
                for (const e of entries) {
                  const ref = (e.reference_id ?? e.id ?? "")
                    .toString()
                    .trim()
                    .toLowerCase();
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
                const paid =
                  r.paid === 0 && entryPaid != null ? entryPaid : r.paid;
                return { ...r, paid };
              });
              setSharedTrips(merged);
            },
          );
          return;
        }
        // Fallback: aggregate entries (bilateral-only after backend migration; else legacy all-entries).
        getSharedLedgerEntriesForPartner(organizationId, entity.id).then(
          ({ error: e2, entries }) => {
            if (cancelled) return;
            setLoadingShared(false);
            if (e2 || !entries?.length) return;
            const byTrip = new Map<string, { in: number; out: number }>();
            for (const e of entries) {
              const ref = (e.reference_id ?? e.id ?? "")
                .toString()
                .trim()
                .toLowerCase();
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
            //   Use v.out for sales (agreed amount client pays us), NOT v.in (client_price).
            // When contact is SUPPLIER (we're client): partner is supplier → their received = amount_in; sales = v.in.
            const partnerIsSupplier = entityType === "SUPPLIER";
            byTrip.forEach((v, tripId) => {
              const sales = partnerIsSupplier ? v.in : v.out;
              const paid = partnerIsSupplier ? v.in : v.out;
              arr.push({ tripId, sales, paid });
            });
            setSharedTrips(arr);
          },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    integrated,
    entity.id,
    entityType,
    sharedTripsProp?.length,
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

  const reconciledRows = useMemo(() => {
    const rows = buildReconciledRows(
      internalMap,
      sharedTrips ?? sharedTripsProp,
      entity.name ?? "—",
      entityType,
    );
    // Sort descending by trip ID so newest trips appear first (e.g. TRP019 → TRP005).
    return [...rows].sort((a, b) =>
      (b.tripId ?? "").localeCompare(a.tripId ?? "", undefined, { numeric: true }),
    );
  }, [internalMap, sharedTrips, sharedTripsProp, entity.name, entityType]);

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
      setSelectedDispute(null);
      setResolution("");
      setRemarks("");
      refetchDisputes();
      onRefresh?.();
      Alert.alert(
        "Dispute raised",
        `Dispute for ${selectedDispute.missionId} has been submitted. Notification sent to ${entity.name}.`,
      );
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

  const renderExpandedReconCard = (
    row: ReconciledRow,
    salesVar: number,
    paidVar: number,
    intPaidDisplay: number,
    netInt: number,
    isPending: boolean,
    hasDisputeSent: boolean,
    hasDisputeReceived: boolean,
    receivedDispute: any
  ) => (
    <View style={styles.expandedWrap}>
      <View style={styles.reconHeader}>
        <Text style={styles.reconTitle}>Reconciliation Statement</Text>
        <Text style={styles.reconRef}>REF: {row.missionId}</Text>
      </View>
      <View style={styles.reconCardsContainer}>
        <View style={styles.valueCard}>
          <Text style={styles.valueCardTitle}>{entityType === "CLIENT" ? "Sale Value" : "Cost Value"}</Text>
          <View style={styles.valueCardRowHeader}>
            <Text style={[styles.valueCardColHeader, styles.valueCardColLeft]}>My Book</Text>
            <Text style={[styles.valueCardColHeader, styles.valueCardColCenter]}>Partner</Text>
            <Text style={[styles.valueCardColHeader, styles.valueCardColRight]}>Var</Text>
          </View>
          <View style={styles.valueCardRowValues}>
            <View style={[styles.valueCardColValueContainer, styles.valueCardColLeft]}>
              <Text style={styles.valueCardValue}>{row.internal ? formatINR(row.intSales) : "—"}</Text>
              <Text style={styles.valueCardDate}>{row.internal?.date ?? "—"}</Text>
            </View>
            <View style={[styles.valueCardColValueContainer, styles.valueCardColCenter]}>
              <Text style={styles.valueCardValue}>{isPending ? "—" : row.external ? formatINR(row.extSales) : "—"}</Text>
              <Text style={styles.valueCardDate}>{isPending ? "—" : row.internal?.date ?? "—"}</Text>
            </View>
            <View style={[styles.valueCardColValueContainer, styles.valueCardColRight]}>
              <Text style={[styles.valueCardVar, !isPending && salesVar !== 0 && styles.varianceRed]}>
                {isPending ? "Wait" : salesVar === 0 ? "—" : `${salesVar > 0 ? "+" : ""}${formatINR(salesVar)}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.valueCard}>
          <Text style={styles.valueCardTitle}>Transaction Value</Text>
          <View style={styles.valueCardRowHeader}>
            <Text style={[styles.valueCardColHeader, styles.valueCardColLeft]}>My Book</Text>
            <Text style={[styles.valueCardColHeader, styles.valueCardColCenter]}>Partner</Text>
            <Text style={[styles.valueCardColHeader, styles.valueCardColRight]}>Var</Text>
          </View>
          <View style={styles.valueCardRowValues}>
            <View style={[styles.valueCardColValueContainer, styles.valueCardColLeft]}>
              <Text style={[styles.valueCardValue, styles.textPaid]}>{row.internal ? formatINR(intPaidDisplay) : "—"}</Text>
              <Text style={styles.valueCardDate}>{row.internal?.date ?? "—"}</Text>
            </View>
            <View style={[styles.valueCardColValueContainer, styles.valueCardColCenter]}>
              <Text style={[styles.valueCardValue, !isPending && paidVar !== 0 && styles.varianceRed]}>
                {isPending ? "—" : row.external ? formatINR(row.extPaid) : "—"}
              </Text>
              <Text style={styles.valueCardDate}>{isPending ? "—" : row.internal?.date ?? "—"}</Text>
            </View>
            <View style={[styles.valueCardColValueContainer, styles.valueCardColRight]}>
              <Text style={[styles.valueCardVar, !isPending && paidVar !== 0 && styles.varianceRed]}>
                {isPending ? "Wait" : paidVar === 0 ? "—" : `${paidVar > 0 ? "+" : ""}${formatINR(paidVar)}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.netDueCard}>
          <Text style={styles.netDueTitle}>Net Trip Due</Text>
          <Text
            style={[
              styles.netDueValue,
              netInt < 0 ? styles.netDueValueNegative : styles.netDueValueNonNegative,
            ]}
          >
            {isPending ? "Wait" : row.internal ? formatINR(netInt) : "—"}
          </Text>
        </View>
      </View>
      {hasDisputeReceived && receivedDispute && (
        <View style={styles.receivedBar}>
          <Text style={styles.receivedLabel}>Dispute received from partner</Text>
          <View style={styles.receivedActions}>
            <TouchableOpacity
              style={[styles.acceptBtn, actionLoading && styles.btnDisabled]}
              onPress={() => handleAcceptReceivedDispute(receivedDispute)}
              disabled={actionLoading}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Accept and auto-update ledger"
            >
              <FontAwesome name="check" size={12} color={Theme.textOnDark} />
              <Text style={styles.acceptBtnText}>Accept & Auto-Update Ledger</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.declineBtn, actionLoading && styles.btnDisabled]}
              onPress={() => handleDeclineReceivedDispute(receivedDispute)}
              disabled={actionLoading}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decline dispute"
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {(row.status === "MISMATCH" || row.status === "PENDING" || row.status === "UNRECOGNIZED") && !hasDisputeSent && row.external && (
        <View style={styles.varianceBar}>
          <Text style={styles.varianceBarLabel} numberOfLines={1}>
            {row.issue ?? "Data Variance Detected"}
          </Text>
          <View style={styles.varianceBarActions}>
            <TouchableOpacity
              style={[styles.updateMyBookBtn, actionLoading && styles.btnDisabled]}
              onPress={() => handleUpdateMyBook(row)}
              disabled={actionLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Update my book"
            >
              <FontAwesome name="edit" size={12} color="#16A34A" />
              <Text style={styles.updateMyBookBtnText}>Update My Book</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.raiseDisputeBtn, actionLoading && styles.btnDisabled]}
              onPress={() => setSelectedDispute(row)}
              disabled={actionLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Raise dispute"
            >
              <FontAwesome name="exclamation-triangle" size={10} color="#111827" />
              <Text style={styles.raiseDisputeBtnText}>Raise Dispute</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {(row.status === "MISMATCH" || row.status === "PENDING" || row.status === "UNRECOGNIZED") && !hasDisputeSent && !row.external && (
        <View style={styles.varianceBar}>
          <Text style={styles.varianceBarLabel} numberOfLines={1}>
            {row.issue ?? "Data Variance Detected"}
          </Text>
          <View style={styles.varianceBarActions}>
            <TouchableOpacity
              style={[styles.raiseDisputeBtn, actionLoading && styles.btnDisabled]}
              onPress={() => setSelectedDispute(row)}
              disabled={actionLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Raise dispute"
            >
              <FontAwesome name="exclamation-triangle" size={10} color="#111827" />
              <Text style={styles.raiseDisputeBtnText}>Raise Dispute</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

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

  /** Full-page when embedded: no bottom gap; scroll content gets bottom padding for FAB clearance */
  const containerStyle = [
    styles.container,
    embeddedInOverlay && styles.containerFullPage,
  ];

  return (
    <View style={containerStyle}>
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

          <View
            style={[
              styles.tableWrap,
              embeddedInOverlay && styles.tableWrapNoScroll,
            ]}
          >
            {!embeddedInOverlay && (
              <Text style={styles.sectionTitle}>COMPARE BY MISSION</Text>
            )}
            <View style={styles.tableHeaderWrap}>
              <View style={styles.tableHeader}>
                <View style={styles.thMissionWrap}>
                  <Text style={[styles.th, styles.thMissionText]} numberOfLines={1}>
                    MISSION
                  </Text>
                </View>
                <View style={[styles.thColWrap, styles.thBorderLeft]}>
                  <Text style={[styles.th, styles.thAmountLabel]} numberOfLines={1}>
                    MY SALES
                  </Text>
                </View>
                <View style={[styles.thColWrap, styles.thBorderLeft]}>
                  <Text style={[styles.th, styles.thAmountLabel]} numberOfLines={1}>
                    MY PAID
                  </Text>
                </View>
                <View style={[styles.thColWrap, styles.thBorderLeft]}>
                  <Text style={[styles.th, styles.thAmountLabel]} numberOfLines={1}>
                    PTNR SALES
                  </Text>
                </View>
                <View
                  style={[
                    styles.thColWrap,
                    styles.thBorderLeft,
                    styles.thColWrapLast,
                  ]}
                >
                  <Text style={[styles.th, styles.thAmountLabel]} numberOfLines={1}>
                    PTNR PAID
                  </Text>
                </View>
                <View style={styles.thRowActionSpacer} />
              </View>
            </View>
            <View
              style={[
                styles.tableBodyWrap,
                embeddedInOverlay && styles.tableBodyWrapNoScroll,
              ]}
            >
              {embeddedInOverlay ? (
                <View style={styles.tableBodyContent}>
                  {filteredRows.length === 0 ? (
                    <View style={styles.emptyTable}>
                      <FontAwesome
                        name="exchange"
                        size={28}
                        color={Theme.textMuted}
                      />
                      <Text style={styles.emptyTableText}>
                        No trips to compare yet.
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
                        entityType === "SUPPLIER"
                          ? row.intPaidOut
                          : row.intPaid;
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
                      const receivedDispute =
                        disputeReceivedByTripId.get(rowKey);

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
                              <Text style={styles.missionId} numberOfLines={1}>
                                {row.missionId}
                              </Text>
                              <View style={styles.badgeRow}>
                                {hasDisputeReceived ? (
                                  <>
                                    <Text style={styles.badgePending}>
                                      PENDING
                                    </Text>
                                    <Text style={styles.badgeReceived}>
                                      DISPUTE RECEIVED
                                    </Text>
                                  </>
                                ) : hasDisputeSent ? (
                                  <Text style={styles.badgeSent}>
                                    DISPUTE SENT
                                  </Text>
                                ) : (
                                  <>
                                    {row.status === "VERIFIED" && (
                                      <Text style={styles.badgeMatched}>
                                        MATCHED
                                      </Text>
                                    )}
                                    {row.status === "PENDING" && (
                                      <Text style={styles.badgePending}>
                                        PENDING
                                      </Text>
                                    )}
                                    {row.status === "MISMATCH" && (
                                      <Text style={styles.badgeVariance}>
                                        VARIANCE
                                      </Text>
                                    )}
                                    {row.status === "UNRECOGNIZED" && (
                                      <Text style={styles.badgeGhost}>
                                        GHOST
                                      </Text>
                                    )}
                                  </>
                                )}
                              </View>
                            </View>
                            <Text
                              style={[styles.cellAmount, styles.cellSales]}
                              numberOfLines={1}
                            >
                              {row.internal ? formatINR(row.intSales) : "—"}
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
                              style={[
                                styles.cellAmount,
                                styles.cellAmountLast,
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
                            <View style={styles.cellRowAction}>
                              <FontAwesome
                                name={
                                  isExpanded ? "chevron-up" : "chevron-down"
                                }
                                size={10}
                                color={Theme.textMuted}
                              />
                            </View>
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedWrap}>
                              <View style={styles.reconHeader}>
                                <Text style={styles.reconTitle}>Reconciliation Statement</Text>
                                <Text style={styles.reconRef}>REF: {row.missionId}</Text>
                              </View>
                              <View style={styles.reconCardsContainer}>
                                <View style={styles.valueCard}>
                                  <Text style={styles.valueCardTitle}>{entityType === "CLIENT" ? "Sale Value" : "Cost Value"}</Text>
                                  <View style={styles.valueCardRowHeader}>
                                    <Text style={[styles.valueCardColHeader, styles.valueCardColLeft]}>My Book</Text>
                                    <Text style={[styles.valueCardColHeader, styles.valueCardColCenter]}>Partner</Text>
                                    <Text style={[styles.valueCardColHeader, styles.valueCardColRight]}>Var</Text>
                                  </View>
                                  <View style={styles.valueCardRowValues}>
                                    <View style={[styles.valueCardColValueContainer, styles.valueCardColLeft]}>
                                      <Text style={styles.valueCardValue}>{row.internal ? formatINR(row.intSales) : "—"}</Text>
                                      <Text style={styles.valueCardDate}>{row.internal?.date ?? "—"}</Text>
                                    </View>
                                    <View style={[styles.valueCardColValueContainer, styles.valueCardColCenter]}>
                                      <Text style={styles.valueCardValue}>{isPending ? "—" : row.external ? formatINR(row.extSales) : "—"}</Text>
                                      <Text style={styles.valueCardDate}>{isPending ? "—" : row.internal?.date ?? "—"}</Text>
                                    </View>
                                    <View style={[styles.valueCardColValueContainer, styles.valueCardColRight]}>
                                      <Text style={[styles.valueCardVar, !isPending && salesVar !== 0 && styles.varianceRed]}>
                                        {isPending ? "Wait" : salesVar === 0 ? "—" : `${salesVar > 0 ? "+" : ""}${formatINR(salesVar)}`}
                                      </Text>
                                    </View>
                                  </View>
                                </View>

                                <View style={styles.valueCard}>
                                  <Text style={styles.valueCardTitle}>Transaction Value</Text>
                                  <View style={styles.valueCardRowHeader}>
                                    <Text style={[styles.valueCardColHeader, styles.valueCardColLeft]}>My Book</Text>
                                    <Text style={[styles.valueCardColHeader, styles.valueCardColCenter]}>Partner</Text>
                                    <Text style={[styles.valueCardColHeader, styles.valueCardColRight]}>Var</Text>
                                  </View>
                                  <View style={styles.valueCardRowValues}>
                                    <View style={[styles.valueCardColValueContainer, styles.valueCardColLeft]}>
                                      <Text style={[styles.valueCardValue, styles.textPaid]}>{row.internal ? formatINR(intPaidDisplay) : "—"}</Text>
                                      <Text style={styles.valueCardDate}>{row.internal?.date ?? "—"}</Text>
                                    </View>
                                    <View style={[styles.valueCardColValueContainer, styles.valueCardColCenter]}>
                                      <Text style={[styles.valueCardValue, !isPending && paidVar !== 0 && styles.varianceRed]}>
                                        {isPending ? "—" : row.external ? formatINR(row.extPaid) : "—"}
                                      </Text>
                                      <Text style={styles.valueCardDate}>{isPending ? "—" : row.internal?.date ?? "—"}</Text>
                                    </View>
                                    <View style={[styles.valueCardColValueContainer, styles.valueCardColRight]}>
                                      <Text style={[styles.valueCardVar, !isPending && paidVar !== 0 && styles.varianceRed]}>
                                        {isPending ? "Wait" : paidVar === 0 ? "—" : `${paidVar > 0 ? "+" : ""}${formatINR(paidVar)}`}
                                      </Text>
                                    </View>
                                  </View>
                                </View>

                                <View style={styles.netDueCard}>
                                  <Text style={styles.netDueTitle}>Net Trip Due</Text>
                                  <Text
                                    style={[
                                      styles.netDueValue,
                                      netInt < 0
                                        ? styles.netDueValueNegative
                                        : styles.netDueValueNonNegative,
                                    ]}
                                  >
                                    {isPending ? "Wait" : row.internal ? formatINR(netInt) : "—"}
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
                              {(row.status === "MISMATCH" ||
                                row.status === "PENDING" ||
                                row.status === "UNRECOGNIZED") &&
                                !hasDisputeSent &&
                                row.external && (
                                  <View style={styles.varianceBar}>
                                    <Text style={styles.varianceBarLabel} numberOfLines={1}>
                                      {row.issue ?? "Data Variance Detected"}
                                    </Text>
                                    <View style={styles.varianceBarActions}>
                                      <TouchableOpacity
                                        style={[
                                          styles.updateMyBookBtn,
                                          actionLoading && styles.btnDisabled,
                                        ]}
                                        onPress={() => handleUpdateMyBook(row)}
                                        disabled={actionLoading}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityLabel="Update my book"
                                      >
                                        <FontAwesome
                                          name="edit"
                                          size={12}
                                          color="#16A34A"
                                        />
                                        <Text
                                          style={styles.updateMyBookBtnText}
                                        >
                                          Update My Book
                                        </Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={[
                                          styles.raiseDisputeBtn,
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
                                          color="#111827"
                                        />
                                        <Text
                                          style={styles.raiseDisputeBtnText}
                                        >
                                          Raise Dispute
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : (
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
                        No trips to compare yet.
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
                      const intPaidDisplay =
                        entityType === "SUPPLIER"
                          ? row.intPaidOut
                          : row.intPaid;
                      const isPaidMismatchDisplay =
                        row.status === "MISMATCH" &&
                        intPaidDisplay !== row.extPaid;
                      const salesVar = row.extSales - row.intSales;
                      const paidVar = row.extPaid - intPaidDisplay;
                      const netInt = row.intSales - intPaidDisplay;
                      const rowKey = String(row.tripId).trim().toLowerCase();
                      const hasDisputeSent = disputeSentByTripId.has(rowKey);
                      const hasDisputeReceived =
                        disputeReceivedByTripId.has(rowKey);
                      const receivedDispute =
                        disputeReceivedByTripId.get(rowKey);
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
                              <Text style={styles.missionId} numberOfLines={1}>
                                {row.missionId}
                              </Text>
                              <View style={styles.badgeRow}>
                                {hasDisputeReceived ? (
                                  <>
                                    <Text style={styles.badgePending}>
                                      PENDING
                                    </Text>
                                    <Text style={styles.badgeReceived}>
                                      DISPUTE RECEIVED
                                    </Text>
                                  </>
                                ) : hasDisputeSent ? (
                                  <Text style={styles.badgeSent}>
                                    DISPUTE SENT
                                  </Text>
                                ) : (
                                  <>
                                    {row.status === "VERIFIED" && (
                                      <Text style={styles.badgeMatched}>
                                        MATCHED
                                      </Text>
                                    )}
                                    {row.status === "PENDING" && (
                                      <Text style={styles.badgePending}>
                                        PENDING
                                      </Text>
                                    )}
                                    {row.status === "MISMATCH" && (
                                      <Text style={styles.badgeVariance}>
                                        VARIANCE
                                      </Text>
                                    )}
                                    {row.status === "UNRECOGNIZED" && (
                                      <Text style={styles.badgeGhost}>
                                        GHOST
                                      </Text>
                                    )}
                                  </>
                                )}
                              </View>
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
                                styles.cellAmountLast,
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
                            <View style={styles.cellRowAction}>
                              <FontAwesome
                                name={
                                  isExpanded ? "chevron-up" : "chevron-down"
                                }
                                size={10}
                                color={Theme.textMuted}
                              />
                            </View>
                          </TouchableOpacity>
                          {isExpanded && renderExpandedReconCard(
                            row,
                            salesVar,
                            paidVar,
                            intPaidDisplay,
                            netInt,
                            isPending,
                            hasDisputeSent,
                            hasDisputeReceived,
                            receivedDispute
                          )}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </>
      )}

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
              <Text style={styles.modalTitle}>Dispute Audit</Text>
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
                <Text style={styles.modalVarianceLabel}>
                  Identified Variance
                </Text>
                <Text style={styles.modalVarianceText}>
                  {selectedDispute.issue}
                </Text>
                {!selectedDispute.external && (
                  <Text style={styles.modalVarianceHint}>
                    Partner data not yet synced. You can still raise a dispute;
                    partner will be notified.
                  </Text>
                )}
              </View>
              <View style={styles.modalForm}>
                <Text style={styles.modalLabel}>Proposed Resolution</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.resolutionScroll}
                >
                  {RESOLUTION_OPTIONS.map((opt) => (
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
                      Submit Dispute
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
  },
  /** Embedded in overlay: no flex so outer ScrollView scrolls full content; FAB clearance via overlay contentContainerStyle */
  containerFullPage: {
    paddingBottom: 0,
    flex: 0,
  },
  notIntegratedWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  notIntegratedIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  notIntegratedTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  notIntegratedText: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 24,
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
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  notIntegratedBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  notIntegratedBtnSecondary: {
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
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
    borderRadius: 4,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  auditHeaderLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cardWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 0,
  },
  /** Lighter typography to match Ledger; was 800 */
  sectionTitle: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    letterSpacing: 2,
    marginBottom: 4,
    paddingHorizontal: 4,
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
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
    minHeight: 0,
  },
  /** When embedded: no flex so outer ScrollView scrolls; table height = content */
  tableWrapNoScroll: {
    flex: 0,
    minHeight: undefined,
  },
  /** Ledger-style header bar: matches FinanceScreen.styles tableHeaderWrap / overlay ledger */
  tableHeaderWrap: {
    width: "100%",
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  /** Lighter to match Ledger header; no vertical padding (wrapper controls row height) */
  th: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
  },
  /** Trip column: same row height and layout as amount columns */
  thMissionWrap: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingLeft: 0,
    paddingRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  thMissionText: {
    textAlign: "center" as const,
  },
  thBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 10,
    justifyContent: "center",
  },
  expandedWrapV2: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
    overflow: "hidden",
  },
  reconHeaderV2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161616",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reconTitleV2: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  reconRefV2: { 
    fontSize: 10, 
    color: "#FFFFFF", 
    fontFamily: "monospace" 
  },
  reconCardsContainerV2: {
    padding: 16,
    gap: 12,
  },
  valueCardV2: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
  },
  valueCardTitleV2: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: "uppercase",
  },
  valueCardRowHeaderV2: {
    flexDirection: "row",
    marginBottom: 12,
  },
  valueCardColHeaderV2: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  valueCardColLeftV2: {
    flex: 1,
    textAlign: "left",
    alignItems: "flex-start",
  },
  valueCardColCenterV2: {
    flex: 1,
    textAlign: "center",
    alignItems: "center",
  },
  valueCardColRightV2: {
    flex: 0.8,
    textAlign: "right",
    alignItems: "flex-end",
  },
  valueCardRowValuesV2: {
    flexDirection: "row",
    alignItems: "center",
  },
  valueCardColValueContainerV2: {
    justifyContent: "center",
  },
  valueCardValueV2: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  valueCardDateV2: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 4,
  },
  valueCardVarV2: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  netDueCardV2: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netDueTitleV2: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  netDueValueV2: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  netDueValueNegativeV2: {
    color: Theme.teslaRed,
  },
  netDueValueNonNegativeV2: {
    color: Theme.textPrimaryDark,
  },
  thCol: {
    flex: 0.1875,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  thColLast: {
    flex: 0.1875,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  /** Header column wrap: same flex as cellAmount so headers align with data; same row height as thMissionWrap */
  thColWrap: {
    flex: 0.1875,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    paddingLeft: 8,
    justifyContent: "center",
    alignItems: "stretch",
  },
  thColWrapLast: { paddingRight: 12 },
  /** Right-align header label to match amount column below */
  thAmountLabel: {
    textAlign: "right" as const,
    alignSelf: "stretch",
  },
  thSub: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    marginTop: 1,
  },
  tableBodyWrap: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftColor: Theme.borderLight,
    borderRightColor: Theme.borderLight,
    borderBottomColor: Theme.borderLight,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: Theme.screenBackground,
    marginTop: -1,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  /** When embedded: no inner scroll; outer ScrollView scrolls the table body content */
  tableBodyWrapNoScroll: {
    flex: 0,
    minHeight: undefined,
  },
  tableBodyContent: {},
  tableScroll: { flex: 1 },
  /** Row style matches FinancialRow / Ledger tab */
  dataRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    minWidth: 0,
  },
  dataRowExpanded: { backgroundColor: Theme.screenBackground },
  dataRowGhost: { backgroundColor: Theme.positiveMuted },
  dataRowPending: { backgroundColor: Theme.surfaceForm },
  /** Last column: expand/collapse chevron (matches Ledger rowActionHint width) */
  thRowActionSpacer: { width: 22, minWidth: 22 },
  cellRowAction: {
    width: 22,
    minWidth: 22,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  cellMission: {
    flex: 0.25,
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  /** Matches FinancialRow cellNodeMain (500) for lighter Ledger feel */
  missionId: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textTransform: "uppercase",
  },
  /** Ultra-compact: flex-col, tiny gap; stacked badges (PENDING + DISPUTE RECEIVED) align neatly */
  badgeRow: {
    flexDirection: "column",
    marginTop: 3,
    gap: 2,
    alignSelf: "flex-start",
  },
  badgeMatched: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  badgePending: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.driverGold,
    backgroundColor: "rgba(245,158,11,0.14)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  badgeVariance: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.teslaRed,
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: "rgba(232,33,39,0.5)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  badgeGhost: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textSecondary,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  badgeSent: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.primary,
    backgroundColor: "rgba(26,35,126,0.1)",
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.4)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  badgeReceived: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.driverGold,
    backgroundColor: "rgba(245,158,11,0.14)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  /** Amount column: lighter to match Ledger */
  cellAmount: {
    flex: 0.1875,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.1,
    textAlign: "right" as const,
    color: Theme.textPrimaryDark,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 10,
  },
  /** Last amount column: extra padding so value is not against chevron */
  cellAmountLast: { paddingRight: 12 },
  cellSales: { color: Theme.textPrimaryDark },
  cellPaid: { color: Theme.darkGreen },
  cellMismatch: { color: Theme.teslaRed },
  cellPending: { color: Theme.driverGold, fontStyle: "italic" },
  expandedWrap: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
    overflow: "hidden",
  },
  reconHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161616",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reconTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
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
  valueCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
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
    color: Theme.textPrimaryDark,
  },
  valueCardDate: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 4,
  },
  valueCardVar: {
    fontSize: 15,
    fontWeight: "500",
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
    color: Theme.textPrimaryDark,
  },
  netDueValueNegative: {
    color: Theme.teslaRed,
  },
  netDueValueNonNegative: {
    color: Theme.textPrimaryDark,
  },
  reconCard: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: "hidden",
  },
  reconRowHeader: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reconColLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  reconColHeader: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  reconColRight: {
    width: 65,
    fontSize: 11,
    fontWeight: "400",
    textAlign: "right" as const,
    color: Theme.textPrimaryDark,
  },
  reconColRightHeader: {
    width: 65,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right" as const,
    color: Theme.textPrimaryDark,
  },
  reconColMy: {},
  reconColPartner: {},
  reconDataGroup: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  reconGroupTitle: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  reconDataRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reconDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 16,
  },
  varianceRed: { color: Theme.teslaRed },
  varianceAmber: { color: Theme.driverGold, fontStyle: "italic" },
  varianceMatch: { color: Theme.darkGreen },
  textPaid: { color: Theme.darkGreen },
  btnDisabled: { opacity: 0.7 },
  disputeBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    padding: 10,
    backgroundColor: Theme.negativeMuted,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  varianceBar: {
    marginTop: 10,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  varianceBarLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C62828",
    marginBottom: 12,
  },
  varianceBarActions: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
  },
  disputeIssue: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.teslaRed,
    flex: 1,
    marginRight: 8,
  },
  raiseDisputeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderColor: "#111827",
    borderWidth: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  raiseDisputeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  receivedBar: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.driverGold,
  },
  receivedLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.driverGold,
    marginBottom: 10,
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
  updateMyBookBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    padding: 10,
    backgroundColor: Theme.positiveMuted,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  updateMyBookBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderColor: "#16A34A",
    borderWidth: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  updateMyBookBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },
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
    borderRadius: 4,
    padding: 12,
    marginBottom: 20,
  },
  modalVarianceLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.teslaRed,
    letterSpacing: 1,
    marginBottom: 4,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
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
    borderRadius: 4,
    padding: 12,
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
    borderRadius: 4,
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
    borderRadius: 4,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTableText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    marginTop: 8,
    textAlign: "center",
  },
});
