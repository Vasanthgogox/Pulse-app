import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { FinanceFAB } from "@/components/FinanceFAB";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  LedgerReportModal,
  SharedLedgerContent,
  getTransactionsByOrganization,
  type LedgerEntry,
  type LedgerRow,
} from "@/features/finance";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import { TreasuryDetailLayout } from "@/features/finance/components/TreasuryDetailLayout";
import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";
import {
  getTripDisplayNumber,
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import {
  canAccessFinance,
  getCapabilitiesFromProfile,
} from "@/lib/capabilities";
import { formatINR, formatLedgerDate } from "@/lib/format";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  getClientDetails,
  getClientsByOrganization,
  getLinkedOrgProfile,
  updateClient,
  type ClientRow,
  type UpdateClientData,
} from "../services/clients.service";

/** Treat linked-org placeholder (linked-<uuid>) as empty for display. */
function isPlaceholderPhone(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!s) return true;
  if (/^linked-/i.test(s)) return true;
  if (s.toLowerCase().includes("linked-")) return true;
  return false;
}

export interface ClientDetailScreenProps {
  clientId: string;
  onBack: () => void;
}

export default function ClientDetailScreen({
  clientId,
  onBack,
}: ClientDetailScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const capabilities = getCapabilitiesFromProfile(
    profile
      ? {
          role: profile.role,
          aggregated: profile.aggregated,
          asset: profile.asset,
        }
      : null,
  );
  const canAddTransaction = canAccessFinance(capabilities);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [orgTrips, setOrgTrips] = useState<TripRow[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [detailSubTab, setDetailSubTab] = useState<"trips" | "cash" | "shared">("trips");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("NODE_SYNCED");
  const [isLinked, setIsLinked] = useState(false);
  const insets = useSafeAreaInsets();
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [editOrgName, setEditOrgName] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editGstin, setEditGstin] = useState("");
  const [editPan, setEditPan] = useState("");
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [isInApp, setIsInApp] = useState(false);
  
  useEffect(() => {
    if (client?.phone) {
      import("@/services/connectionRequestsService").then(({ getConnectionInviteeByPhone }) => {
        getConnectionInviteeByPhone(client.phone).then(({ invitee }) => {
          if (invitee) setIsInApp(true);
        });
      });
    }
  }, [client?.phone]);

  const load = useCallback(() => {
    if (!clientId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    Promise.all([
      getClientDetails(clientId),
      getTripsByOrganization(orgId),
      getTripsWhereOrgIsSupplier(orgId),
      getClientsByOrganization(orgId),
      getTransactionsByOrganization(orgId),
    ])
      .then(([clientRes, tripsRes, supplierTripsRes, clientsRes, txRes]) => {
        if (clientRes.error) {
          setError(clientRes.error.message);
          setClient(null);
        } else {
          setClient(clientRes.client ?? null);
        }
        const ownerTrips = tripsRes.error ? [] : (tripsRes.trips ?? []);
        const supplierTrips = supplierTripsRes.error
          ? []
          : (supplierTripsRes.trips ?? []);
        const byId = new Map<string, TripRow>();
        for (const t of ownerTrips) byId.set(t.id, t);
        for (const t of supplierTrips) if (!byId.has(t.id)) byId.set(t.id, t);
        const allTrips = Array.from(byId.values());
        setOrgTrips(allTrips);
        const clientDisplayName = (
          clientRes.client?.name ||
          clientRes.client?.contact_person ||
          ""
        )
          .toLowerCase()
          .trim();
        const normId = (id: string | null | undefined) =>
          id == null ? "" : String(id).trim().toLowerCase();
        const linkedOrgId = clientRes.client?.linked_organization_id ?? null;
        const linkedClientIdByOrgId = buildUniqueLinkedOrgIdMap(
          clientsRes.error ? [] : (clientsRes.clients ?? []),
        );
        const allTx = txRes.error ? [] : (txRes.transactions ?? []);
        // Include trips by client_id/name OR by any client transaction (so DUE shows even if trip.client_id is wrong)
        const tripIdsFromClientTx = new Set(
          allTx
            .filter(
              (tx) =>
                tx.contact_type === "client" &&
                tx.contact_id === clientId &&
                tx.trip_id != null,
            )
            .map((tx) => normId(tx.trip_id)),
        );
        const forClient = allTrips.filter((t) => {
          const matchesDirect =
            t.client_id === clientId ||
            (clientDisplayName !== "" &&
              (t.client_name || "").toLowerCase().trim() ===
                clientDisplayName);
          const matchesTx = tripIdsFromClientTx.has(normId(t.id));
          const matchesLinkedOrg =
            clientRes.client?.is_integrated === true &&
            linkedOrgId &&
            isLoadBasedTrip(t) &&
            t.organization_id &&
            t.organization_id === linkedOrgId &&
            linkedClientIdByOrgId.get(linkedOrgId) === clientId;
          return matchesDirect || matchesTx || matchesLinkedOrg;
        });
        setTrips(forClient);
        const tripIds = new Set(forClient.map((t) => normId(t.id)));
        const forClientTx = allTx.filter((tx) => {
          const linkedToClient =
            tx.contact_type === "client" &&
            tx.contact_id != null &&
            tx.contact_id === clientId;
          const linkedToClientTrip =
            tx.trip_id != null && tripIds.has(normId(tx.trip_id));
          const partyMatches =
            clientDisplayName !== "" &&
            (tx.party_name || "").toLowerCase().trim() === clientDisplayName;
          return linkedToClient || linkedToClientTrip || partyMatches;
        });
        setTransactions(forClientTx);
      })
      .finally(() => {
        setLoading(false);
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [clientId, currentOrganization?.id]);

  useEffect(() => load(), [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (client) {
      setEditOrgName(client.name ?? "");
      setEditContactPerson(client.contact_person ?? "");
      setEditPhone(isPlaceholderPhone(client.phone) ? "" : client.phone ?? "");
      setEditEmail(client.email ?? "");
      setEditAddress(client.address ?? "");
      setEditGstin(client.gstin ?? "");
      setEditPan(client.pan_number ?? "");
    }
  }, [client]);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!client?.linked_organization_id) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      const { profile } = await getLinkedOrgProfile(client.linked_organization_id);
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatarUrl?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatarUrl);
        return;
      }
      if (profile.avatarUrl?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatarUrl.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatarSeed?.trim()) {
        if (mounted) setProfileAvatarUri(getUser2DAvatarUriForSeed(profile.avatarSeed.trim()));
        return;
      }
      if (mounted) setProfileAvatarUri(null);
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [client?.linked_organization_id]);

  const ledgerEntries: LedgerEntry[] = useMemo(() => {
    const rows: LedgerEntry[] = transactions.map((tx) => {
      const amountIn = Number(tx.amount_in ?? 0);
      const amountOut = Number(tx.amount_out ?? 0);
      const isIn = amountIn > 0;
      const amount = isIn ? amountIn : amountOut;
      const desc =
        (tx.party_name || "—").trim() +
        (tx.trip_number ? ` · ${tx.trip_number}` : "");
      return {
        id: tx.id,
        desc: desc || "ENTRY",
        date: formatLedgerDate(tx.transaction_date || tx.created_at),
        amount,
        isCredit: isIn,
      };
    });
    rows.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    return rows;
  }, [transactions]);

  const tripOptions = useMemo(
    () =>
      trips.map((t) => ({
        id: t.id,
        trip_number: getTripDisplayNumber(t),
        client_id: t.client_id ?? null,
        client_name: t.client_name ?? null,
        supplier_id: t.supplier_id ?? null,
        driver_id: t.driver_id ?? null,
        vehicle_id: t.vehicle_id ?? null,
        indent_id: t.indent_id ?? null,
        route_label:
          [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
        trip_date: formatLedgerDate(t.pickup_date || t.created_at),
      })),
    [trips],
  );

  /** Trip details map for Cash Flow list (same shape as Finance Cash page). */
  const clientTripDetailsMap = useMemo(() => {
    const m: Record<
      string,
      {
        trip_number: string;
        drop_location?: string;
        pickup_area?: string;
        client_name?: string;
        pickup_date?: string | null;
      }
    > = {};
    trips.forEach((t) => {
      m[t.id] = {
        trip_number: getTripDisplayNumber(t),
        drop_location: t.drop_location ?? undefined,
        pickup_area: t.pickup_area ?? undefined,
        client_name: t.client_name ?? undefined,
        pickup_date: t.pickup_date ?? undefined,
      };
    });
    return m;
  }, [trips]);

  const handleExportLedger = () => {
    Alert.alert(t("exportLedger"), t("exportComingSoon"));
  };

  const handleEditSave = async (patch: UpdateClientData) => {
    if (!currentOrganization?.id || !client) return;
    const { error: err, client: updated } = await updateClient(
      currentOrganization.id,
      client.id,
      patch,
    );
    if (!err && updated) {
      setClient(updated);
      load();
    }
  };

  const handleInlineSaveProfile = async () => {
    if (!client) return;
    await handleEditSave({
      organization_name: editOrgName,
      contact_person: editContactPerson,
      phone: editPhone,
      email: editEmail,
      address: editAddress,
      gstin: editGstin,
      pan_number: editPan,
    });
    setProfileEditMode(false);
    triggerSuccess();
  };

  const handleSyncLatestFromPlatform = async () => {
    if (!currentOrganization?.id || !client) return;
    const linkedId = client.linked_organization_id ?? undefined;
    if (linkedId) {
      const { error: profileErr, profile } = await getLinkedOrgProfile(linkedId);
      if (!profileErr && profile) {
        const { organizationName, contactPerson, phone } = profile;
        const { error: updateErr, client: updated } = await updateClient(
          currentOrganization.id,
          client.id,
          {
            organization_name: organizationName,
            contact_person: contactPerson || undefined,
            phone: phone || undefined,
          },
        );
        if (!updateErr && updated) {
          setClient(updated);
          return {
            organizationName: updated.name,
            contactPerson: updated.contact_person ?? "",
            phone: updated.phone ?? "",
          };
        }
      }
    }
    const { error: err, client: latest } = await getClientDetails(client.id);
    if (err || !latest) return;
    setClient(latest);
    return {
      organizationName: latest.name,
      contactPerson: latest.contact_person ?? "",
      phone: latest.phone ?? "",
    };
  };

  const triggerSuccess = useCallback((title = "NODE_SYNCED") => {
    setSuccessTitle(title);
    setShowSuccess(true);
    const t = setTimeout(() => setShowSuccess(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // ENTITY LEDGER PROTOCOL — Aggressive consolidation & tally, O(n). Must run before any early return (Rules of Hooks).
  const {
    rows: ledgerProtocolRows,
    totalBilledConsolidated,
    totalPendingConsolidated,
    tripIdToDue,
    paidByTripId,
  } = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    const linkedTripIds = new Set(trips.map((t) => norm(t.id)));
    const paidByTripId: Record<string, number> = {};
    const outByTripId: Record<string, number> = {};
    const isClientLinked = (tx: LedgerRow) =>
      tx.contact_type === "client" &&
      tx.contact_id != null &&
      tx.contact_id === clientId;

    // Pass 1a: Init paid/out from trip.amount_paid; attribute tx with trip_id to that trip.
    for (const t of trips) {
      const key = norm(t.id);
      paidByTripId[key] = Number(t.amount_paid ?? 0);
      outByTripId[key] = 0;
    }
    const linkedTxIds = new Set<string>();
    const unlinkedClientTx: typeof transactions = [];
    for (const tx of transactions) {
      const txTripKey =
        norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
          ? norm(tx.trip_id)
          : undefined;
      if (txTripKey !== undefined && isClientLinked(tx)) {
        paidByTripId[txTripKey] =
          (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_in ?? 0);
        outByTripId[txTripKey] =
          (outByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
        linkedTxIds.add(tx.id);
      } else if (txTripKey !== undefined) {
        linkedTxIds.add(tx.id);
      } else if (isClientLinked(tx)) {
        unlinkedClientTx.push(tx);
      }
    }
    // Pass 1b: Attribute unlinked client payments to the trip with the largest due (so payment applies to the trip that needs it most).
    // For client receivables, only amount_in (receipts) counts as paid; we do not add amount_out here.
    const allocatedPaidByTripId = allocateAmountsToLargestDueTrips(
      trips.map((t) => {
        const key = norm(t.id);
        return {
          tripId: key,
          sales: Number(t.client_price ?? 0),
          paid: paidByTripId[key] ?? 0,
        };
      }),
      unlinkedClientTx.map((tx) => Number(tx.amount_in ?? 0)),
    );
    if (trips.length > 0) {
      for (const tx of unlinkedClientTx) {
        linkedTxIds.add(tx.id);
      }
    }

    const tripIdToDue: Record<string, number> = {};
    const byMissionKey: Record<
      string,
      {
        missionId: string;
        dest: string;
        sales: number;
        paid: number;
        due: number;
      }
    > = {};

    // Pass 2: For client, paid = only amount_in (receipts from client). Do NOT subtract trip expenses (amount_out);
    // expenses are our costs, not the customer's payments — so they must not inflate "due".
    const linkedOrgId = client?.linked_organization_id ?? null;
    for (const t of trips) {
      const key = norm(t.id);
      const isIntegratedShipperClient =
        client?.is_integrated === true &&
        linkedOrgId != null &&
        isLoadBasedTrip(t) &&
        t.organization_id != null &&
        t.organization_id === linkedOrgId;
      const sales = Number(
        isIntegratedShipperClient ? t.supplier_rate ?? 0 : t.client_price ?? 0,
      );
      const paid = allocatedPaidByTripId[key] ?? 0;
      const due = Math.max(0, sales - paid);
      tripIdToDue[t.id] = due;

      const rawId = getTripDisplayNumber(t) || "—";
      const missionKey =
        String(rawId)
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase() || "EMPTY";

      if (byMissionKey[missionKey]) {
        byMissionKey[missionKey].sales += sales;
        byMissionKey[missionKey].paid += paid;
        byMissionKey[missionKey].due = Math.max(
          0,
          byMissionKey[missionKey].sales - byMissionKey[missionKey].paid,
        );
      } else {
        byMissionKey[missionKey] = {
          missionId: String(rawId).trim() || "—",
          dest: t.drop_location || "—",
          sales,
          paid,
          due,
        };
      }
    }

    const finalRows = Object.entries(byMissionKey).map(
      ([key, data], index) => ({
        ...data,
        id: `mission-${key}-${index}`,
      }),
    );

    // Pass 3: Unlinked = transactions not attributed to any trip. For client, only show receipts (amount_in) as ADJ;
    // do not show expense-only entries (amount_out) as "due" — those are our costs, not customer balance.
    const unlinkedTx = transactions.filter((tx) => !linkedTxIds.has(tx.id));
    for (const tx of unlinkedTx) {
      const amountIn = Number(tx.amount_in ?? 0);
      const amountOut = Number(tx.amount_out ?? 0);
      if (amountIn > 0) {
        finalRows.push({
          id: `adj-${tx.id}`,
          missionId: "ADJ",
          dest:
            tx.description && tx.description !== "ENTRY"
              ? tx.description
              : "GENERAL",
          sales: amountIn,
          paid: amountIn,
          due: 0,
        });
      }
    }

    // Pass 4: Final Totals from consolidated data
    const totalSales = finalRows.reduce(
      (s, r) => s + (r.missionId !== "ADJ" ? r.sales : 0),
      0,
    );
    const totalPaid = finalRows.reduce((s, r) => s + r.paid, 0);
    const totalPending = finalRows.reduce((s, r) => s + r.due, 0);

    if (finalRows.length === 0) {
      finalRows.push({
        id: "none",
        missionId: "—",
        dest: "—",
        sales: 0,
        paid: 0,
        due: 0,
      });
    }

    return {
      rows: finalRows,
      totalBilledConsolidated: totalSales,
      totalPendingConsolidated: totalPending,
      tripIdToDue,
      paidByTripId: allocatedPaidByTripId,
    };
  }, [trips, transactions, clientId]);

  const missionRows = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    const linkedOrgId = client?.linked_organization_id ?? null;
    return trips.map((t) => {
      const isIntegratedShipperClient =
        client?.is_integrated === true &&
        linkedOrgId != null &&
        isLoadBasedTrip(t) &&
        t.organization_id != null &&
        t.organization_id === linkedOrgId;
      return {
        trip: t,
        missionId: getTripDisplayNumber(t),
        route:
          `${t.pickup_area ?? ""} → ${t.drop_location ?? ""}`.trim() || "—",
        sales: isIntegratedShipperClient
          ? Number(t.supplier_rate ?? 0)
          : Number(t.client_price ?? 0),
        paid: paidByTripId[norm(t.id)] ?? 0,
        due: tripIdToDue[t.id] ?? 0,
      };
    });
  }, [trips, paidByTripId, tripIdToDue, client?.linked_organization_id, client?.is_integrated]);

  const sortedTx = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const da = a.transaction_date ?? a.created_at ?? "";
        const db = b.transaction_date ?? b.created_at ?? "";
        return db.localeCompare(da);
      }),
    [transactions],
  );

  const tripReportTransactions = useMemo(
    () =>
      [...missionRows]
        .sort((a, b) => {
          const da = a.trip.pickup_date ?? a.trip.created_at ?? "";
          const db = b.trip.pickup_date ?? b.trip.created_at ?? "";
          return db.localeCompare(da);
        })
        .map((row) => ({
          id: `report-${row.trip.id}`,
          organization_id: currentOrganization?.id ?? "",
          trip_id: row.trip.id,
          trip_number: row.missionId,
          party_name: client?.name || client?.contact_person || t("client"),
          description:
            `${row.route} • Sales ${formatINR(row.sales)}`.trim() || "—",
          amount_in: row.paid,
          amount_out: row.due,
          transaction_date: row.trip.pickup_date ?? row.trip.created_at ?? "",
          created_at: row.trip.created_at ?? "",
          contact_id: clientId,
          contact_type: "client" as const,
        })),
    [client?.contact_person, client?.name, clientId, currentOrganization?.id, missionRows, t],
  );

  const reportTransactions = useMemo(
    () => (detailSubTab === "trips" ? tripReportTransactions : sortedTx),
    [detailSubTab, sortedTx, tripReportTransactions],
  );

  if (loading) {
    return (
      <CenteredLoadingView message={t("loadingClient")} color={Theme.teslaRed} />
    );
  }

  const clientName = client?.name || client?.contact_person || t("client");

  if (error || !client) {
    return (
      <TreasuryDetailLayout title={t("client")} onBack={onBack}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || t("clientNotFound")}</Text>
        </View>
      </TreasuryDetailLayout>
    );
  }

  const sales = totalBilledConsolidated;
  const paid = sales - totalPendingConsolidated;
  const due = totalPendingConsolidated;
  const health = sales > 0 ? Math.round((paid / sales) * 100) : 0;

  const tabConfig = [
    { id: "trips" as const, label: "Missions" },
    { id: "cash" as const, label: "Cash Flow" },
    { id: "shared" as const, label: "Shared" },
  ];

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <FontAwesome name="chevron-left" size={20} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {clientName}
          </Text>
          <Text style={styles.headerSubtitle}>DEEP ENTITY INTEL</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => setShowProfileModal(true)}
            activeOpacity={0.8}
            accessibilityLabel="Client profile"
          >
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.headerAvatarImage} />
            ) : (
              <FontAwesome name="user" size={16} color={Theme.textPrimaryDark} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={() => setShowReportModal(true)}
            activeOpacity={0.8}
          >
            <FontAwesome name="cloud-download" size={18} color={Theme.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: canAddTransaction && detailSubTab !== "shared"
              ? Layout.fabBottomOffset + Layout.fabSize + insets.bottom
              : Layout.fabBottomOffset + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              isRefreshingRef.current = true;
              setRefreshing(true);
              load();
            }}
            tintColor={Theme.teslaRed}
          />
        }
      >
        {/* Scorecard */}
        <View style={styles.scorecard}>
          <View style={styles.scorecardTop}>
            <View style={styles.scorecardLeft}>
              <Text style={styles.scorecardLabel}>GRID FISCAL DNA</Text>
              <Text style={styles.scorecardSalesLabel}>TOTAL SALES</Text>
              <Text style={styles.scorecardAmount}>
                {formatINR(sales)}
              </Text>
            </View>
            <View style={styles.healthCircle}>
              <View
                style={[
                  styles.healthCircleFill,
                  { height: `${Math.min(100, health)}%` },
                ]}
              />
              <Text style={styles.healthCircleText}>{health}%</Text>
            </View>
          </View>
          <View style={styles.scorecardGrid}>
            <View>
              <Text style={styles.scorecardGridLabelPaid}>RECEIVED</Text>
              <Text style={styles.scorecardGridPaid}>{formatINR(paid)}</Text>
            </View>
            <View style={styles.scorecardGridRight}>
              <Text style={styles.scorecardGridLabelDue}>DUE</Text>
              <Text style={styles.scorecardGridDue}>{formatINR(due)}</Text>
            </View>
          </View>
        </View>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          {tabConfig.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, detailSubTab === tab.id && styles.tabItemActive]}
              onPress={() => setDetailSubTab(tab.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  detailSubTab === tab.id && styles.tabItemTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab: Missions — Sales, Received, Due; tap row to open trip detail */}
        {detailSubTab === "trips" && (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.thMission]}>Mission</Text>
              <Text style={[styles.th, styles.thSales]}>Sales</Text>
              <Text style={[styles.th, styles.thRight]}>Received</Text>
              <Text style={[styles.th, styles.thRight]}>Due</Text>
            </View>
            {missionRows.length > 0 ? (
            missionRows.map((row) => (
                <TouchableOpacity
                key={row.trip.id}
                style={styles.tableRow}
                onPress={() => {
                  const q = new URLSearchParams();
                  q.set("entryContext", "client");
                  q.set("clientIdFromContext", client.id);
                  q.set(
                    "clientNameFromContext",
                    clientName,
                  );
                  router.push(`/trip/${row.trip.id}?${q.toString()}`);
                }}
                activeOpacity={0.7}
                >
                  <View style={styles.tdMission}>
                    <Text style={styles.tdMissionId}>{row.missionId}</Text>
                    <Text style={styles.tdRoute} numberOfLines={1}>
                      {row.route}
                    </Text>
                  </View>
                  <Text style={[styles.td, styles.tdSales]}>
                    {formatINR(row.sales)}
                  </Text>
                  <Text style={[styles.td, styles.tdRight, styles.tdGreen]}>
                    {formatINR(row.paid)}
                  </Text>
                  <Text style={[styles.td, styles.tdRight, styles.tdRed]}>
                    {formatINR(row.due)}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyRowText}>No missions</Text>
              </View>
            )}
          </View>
        )}

        {/* Tab: Cash Flow — same card layout as Finance Cash page, only transactions relevant to this client */}
        {detailSubTab === "cash" && (
          <View style={styles.cashSection}>
            <LedgerTransactionListView
              transactions={transactions}
              tripDetailsMap={clientTripDetailsMap}
              tripOptions={tripOptions.map((t) => ({
                id: t.id,
                trip_number: t.trip_number,
                route: t.route_label ?? undefined,
                trip_date: t.trip_date ?? undefined,
              }))}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
            />
          </View>
        )}

        {/* Tab: Shared */}
        {detailSubTab === "shared" && client && (
          <View style={styles.sharedSection}>
            <SharedLedgerContent
              entity={{
                id: client.id,
                name: clientName,
                linked_organization_id: client.linked_organization_id ?? undefined,
              }}
              entityType="CLIENT"
              trips={trips}
              transactions={transactions}
              organizationId={currentOrganization?.id ?? null}
              integrated={Boolean(client.is_integrated || client.linked_organization_id)}
              embeddedInOverlay={true}
              onRefresh={load}
              onRequestConnection={() => {
                setIsLinked(true);
                triggerSuccess("CONNECTION_REQUESTED");
              }}
              onInviteToApp={() => {
                const message = `Join me on Q to sync our ledger and compare books with ${clientName}. Download the Q app to get started.`;
                Share.share({ message, title: "Invite to Q" })
                  .then(() => {
                    triggerSuccess("INVITE_SENT");
                  })
                  .catch(() => {});
              }}
            />
          </View>
        )}
      </ScrollView>

      {/* Success overlay */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <FontAwesome name="check" size={24} color={Theme.textOnPrimary} />
            </View>
            <Text style={styles.successTitle}>{successTitle}</Text>
          </View>
        </View>
      )}

      {canAddTransaction && detailSubTab !== "shared" && (
        <View
          style={[
            styles.fabWrap,
            { bottom: Layout.fabBottomOffset + insets.bottom },
          ]}
        >
          <FinanceFAB
            onPress={() => {
              const q = new URLSearchParams({
                entityType: "CLIENT",
                entityId: clientId,
                partyName: (client?.name || client?.contact_person || t("client")).trim() || t("client"),
                partyContext: "customers",
                partyId: clientId,
                defaultType: "in",
              });
              if (due > 0) q.set("dueAmountIn", String(due));
              router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
            }}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
        </View>
      )}

      <LedgerReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        transactions={reportTransactions}
        title={clientName ? `${t("ledgerFor")}${clientName}` : t("ledgerReport")}
      />
      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={[styles.profileModalWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Client Profile</Text>
              <TouchableOpacity
                onPress={() => setShowProfileModal(false)}
                style={styles.profileModalCloseBtn}
                hitSlop={12}
              >
                <FontAwesome name="times" size={18} color={Theme.textPrimaryDark} />
              </TouchableOpacity>
            </View>
          <ScrollView
            style={styles.profileModalScroll}
            contentContainerStyle={styles.profileModalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.profileCard}>
              <View style={styles.profileCardTop}>
                <View style={styles.profileAvatarWrap}>
                  {profileAvatarUri ? (
                    <Image source={{ uri: profileAvatarUri }} style={styles.profileAvatarImage} />
                  ) : (
                    <FontAwesome name="building" size={30} color={Theme.primary} />
                  )}
                </View>
                <View style={styles.profileCardTopText}>
                  <Text style={styles.profileEntityName} numberOfLines={2}>
                    {client?.name || client?.contact_person || "—"}
                  </Text>
                  {client?.contact_person ? (
                    <Text style={styles.profileEntitySub} numberOfLines={1}>
                      {client.contact_person}
                    </Text>
                  ) : null}
                  <View style={styles.profileBadges}>
                    <View style={styles.profileBadge}>
                      <Text style={styles.profileBadgeText}>Verified</Text>
                    </View>
                    {client?.is_integrated || client?.linked_organization_id || isInApp ? (
                      <View style={[styles.profileBadge, { backgroundColor: Theme.positive + '20', borderColor: Theme.positive }]}>
                        <Text style={[styles.profileBadgeCoreText, { color: Theme.positive }]}>Integrated</Text>
                      </View>
                    ) : (
                      <View style={[styles.profileBadge, styles.profileBadgeCore]}>
                        <Text style={styles.profileBadgeCoreText}>Core Node</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.profileGrid}>
                <View style={styles.profileGridItem}>
                  <Text style={styles.profileGridLabel}>Avg Payment</Text>
                  <Text style={styles.profileGridValue}>—</Text>
                </View>
                <View style={styles.profileGridItem}>
                  <Text style={styles.profileGridLabel}>Grid Volume</Text>
                  <Text style={styles.profileGridValue}>{formatINR(sales)}</Text>
                </View>
              </View>
              <Text style={styles.profileSectionTitle}>Contact Protocol</Text>
              <View style={styles.profileContactRow}>
                <View style={styles.profileContactIcon}>
                  <FontAwesome name="phone" size={14} color={Theme.textMuted} />
                </View>
                <View style={styles.profileContactText}>
                  <Text style={styles.profileContactLabel}>Phone Registry</Text>
                  <Text style={styles.profileContactValue}>
                    {(client?.phone ?? "").trim() || "—"}
                  </Text>
                </View>
              </View>
              <View style={styles.profileContactRow}>
                <View style={styles.profileContactIcon}>
                  <FontAwesome name="envelope" size={14} color={Theme.textMuted} />
                </View>
                <View style={styles.profileContactText}>
                  <Text style={styles.profileContactLabel}>Email Link</Text>
                  <Text style={styles.profileContactValue}>
                    {(client?.email ?? "").trim() || "—"}
                  </Text>
                </View>
              </View>
              <View style={styles.profileContactRow}>
                <View style={styles.profileContactIcon}>
                  <FontAwesome name="map-marker" size={14} color={Theme.textMuted} />
                </View>
                <View style={styles.profileContactText}>
                  <Text style={styles.profileContactLabel}>Billing Node</Text>
                  <Text style={styles.profileContactValue} numberOfLines={2}>
                    {(client?.address ?? "").trim() || "—"}
                  </Text>
                </View>
              </View>
              <Text style={styles.profileSectionTitle}>Fiscal Identity</Text>
              <View style={styles.profileFiscalRow}>
                <Text style={styles.profileFiscalLabel}>GSTIN Registry</Text>
                <Text style={styles.profileFiscalValue}>
                  {(client?.gstin ?? "").trim() || "—"}
                </Text>
              </View>
              <View style={styles.profileFiscalRow}>
                <Text style={styles.profileFiscalLabel}>PAN Registry</Text>
                <Text style={styles.profileFiscalValue}>
                  {(client?.pan_number ?? "").trim() || "—"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.profileEditBtn}
              onPress={() => {
                setShowProfileModal(false);
                if (!client?.id) return;
                router.push({
                  pathname: "/(modals)/edit-client",
                  params: { clientId: client.id },
                });
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="refresh" size={14} color={Theme.textOnPrimary} />
              <Text style={styles.profileEditBtnText}>Edit Node Profile</Text>
            </TouchableOpacity>
            {!client?.linked_organization_id && !isInApp && (
              <TouchableOpacity
                style={[
                  styles.profileEditBtn,
                  { backgroundColor: Theme.surface, borderWidth: 1, borderColor: Theme.borderLight, marginTop: 12 }
                ]}
                onPress={() => {
                  const message = `Join me on Q to sync our ledger and compare books with ${clientName}. Download the Q app to get started.`;
                  Share.share({ message, title: "Invite to Q" });
                }}
                activeOpacity={0.8}
              >
                <FontAwesome name="link" size={14} color={Theme.textPrimaryDark} />
                <Text style={[styles.profileEditBtnText, { color: Theme.textPrimaryDark }]}>{t("linkToAppAccount")}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  errorWrap: { padding: 16 },
  wrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  downloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  fabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 100,
    elevation: 10,
  },
  profileModalWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  profileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  profileModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  profileModalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  profileModalScroll: { flex: 1 },
  profileModalContent: {
    padding: Layout.screenPaddingHorizontal,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 18,
    marginBottom: 16,
  },
  profileCardTop: {
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  profileAvatarWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: Theme.avatarIndigo,
    borderWidth: 2,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 37,
  },
  profileCardTopText: { flex: 0, minWidth: 0, alignItems: "center" },
  profileEntityName: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
    textAlign: "center",
  },
  profileEntityNameInput: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  profileEntitySub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 6,
    textAlign: "center",
  },
  profileEntitySubInput: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  profileBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  profileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  profileBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  profileBadgeCore: {
    backgroundColor: Theme.fiscalTabActiveBg ?? "#e8eaf6",
    borderColor: Theme.primary,
  },
  profileBadgeCoreText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  profileGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
  },
  profileGridItem: {
    flex: 1,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
  },
  profileGridLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    marginBottom: 4,
    textAlign: "center",
  },
  profileGridValue: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  profileSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  profileContactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  profileContactIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  profileContactText: { flex: 1, minWidth: 0 },
  profileContactLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  profileContactValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  profileContactValueInput: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  profileFiscalRow: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  profileFiscalLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  profileFiscalValue: {
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  profileFiscalValueInput: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  profileEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    backgroundColor: Theme.primary,
    borderRadius: 14,
  },
  profileEditBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileEditRow: {
    marginTop: 4,
    gap: 8,
  },
  profileEditBtnSecondary: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  profileEditBtnSecondaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
  },
  scorecard: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 40,
    padding: 32,
    marginBottom: 24,
    overflow: "hidden",
  },
  scorecardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  scorecardLeft: { flex: 1 },
  scorecardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.aggregatePillText,
    letterSpacing: 1.2,
  },
  scorecardSalesLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1,
    marginTop: 6,
    textTransform: "uppercase",
  },
  scorecardAmount: {
    fontSize: 28,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  healthCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  healthCircleFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Theme.darkGreen,
  },
  healthCircleText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    zIndex: 1,
  },
  scorecardGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  scorecardGridRight: { alignItems: "flex-end" },
  scorecardGridLabelPaid: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.darkGreen,
    letterSpacing: 0.6,
  },
  scorecardGridLabelDue: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.6,
  },
  scorecardGridPaid: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  scorecardGridDue: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.teslaRed,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 4,
    borderRadius: 16,
    marginBottom: 24,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  tabItemActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabItemText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  tabItemTextActive: {
    color: Theme.textPrimaryDark,
  },
  tableCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 32,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  thMission: { flex: 1.5, minWidth: 0 },
  thSales: { width: 80, textAlign: "right" as const },
  thRight: { width: 72, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  td: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 1.5, minWidth: 0 },
  tdMissionId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tdRoute: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 4,
  },
  tdSales: { width: 80, textAlign: "right" as const },
  tdRight: { width: 72, textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  emptyRow: { paddingVertical: 24, alignItems: "center" },
  emptyRowText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  cashSection: { marginBottom: 24 },
  cashCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  cashCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cashCardIconIn: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  cashCardIconOut: {
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: Theme.teslaRed,
  },
  cashCardBody: { flex: 1, minWidth: 0, marginLeft: 12, justifyContent: "center" },
  cashCardWhy: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  cashCardMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  cashCardAmount: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.darkGreen,
  },
  sharedSection: { marginBottom: 24 },
  sharedCard: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  sharedSyncRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sharedSyncTitle: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  sharedMismatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  sharedMismatchText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#ea580c",
  },
  sharedGrid: {
    flexDirection: "row",
    gap: 1,
    backgroundColor: Theme.borderLight,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  sharedGridCell: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.screenBackground,
  },
  sharedGridLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  sharedGridValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sharedGridValueMismatch: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  sharedActions: { flexDirection: "row", gap: 12 },
  sharedBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: Theme.darkBackground,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sharedBtnPrimaryText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.6,
  },
  sharedBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Theme.teslaRed,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sharedBtnSecondaryText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.6,
  },
  inviteCard: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Theme.borderMedium,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
  },
  inviteIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inviteTitle: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  inviteDesc: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  inviteCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 16,
    backgroundColor: Theme.darkBackground,
    borderRadius: 20,
    marginBottom: 16,
  },
  inviteCtaText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  inviteSecure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.5,
  },
  inviteSecureText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    paddingHorizontal: 40,
  },
  successCard: {
    backgroundColor: Theme.darkBackground,
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 24,
    alignItems: "center",
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  successIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.darkGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
