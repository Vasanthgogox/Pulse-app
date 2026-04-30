import { entityCompanionCardStyles as ecc } from "@/components/entityCompanionCard.styles";
import { entityHeroScorecardStyles as ehs } from "@/components/entityHeroScorecard.styles";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { CounterpartyProfileSystemCard } from "@/components/CounterpartyProfileSystemCard";
import { DatePresetPillBar } from "@/components/DatePresetPillBar";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { FinanceFAB } from "@/components/FinanceFAB";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    getClientsByOrganization,
    type ClientRow,
} from "@/features/clients/services/clients.service";
import { getDriversByOrganization, type DriverRow } from "@/features/drivers";
import {
    getTransactionsByOrganization,
    LedgerReportModal,
    SharedLedgerContent,
    type LedgerRow,
} from "@/features/finance";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import { ledgerDayMatchesPeriod } from "@/features/finance/lib/filterLedgerByPeriod";
import { getTripSubcontracts } from "@/features/finance/services/tripSubcontracts.service";
import type { FinancePeriodFilter } from "@/features/finance/types";
import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";
import { EditSupplierModal } from "@/features/suppliers/components/EditSupplierModal";
import {
    getTripDisplayNumber,
    getTripsByOrganization,
    getTripsWhereOrgIsClient,
    getTripsWhereOrgIsSupplier,
    type TripRow,
} from "@/features/trips";
import { adjustedCost } from "@/features/trips/services/tripAdjustments";
import {
    buildUniqueLinkedOrgIdMap,
    isLoadBasedTrip,
} from "@/features/trips/visibility/tripVisibility";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
    canAccessFinance,
    getCapabilitiesFromProfile,
} from "@/lib/capabilities";
import { tripDayIso } from "@/lib/dateRangePresets";
import { formatINR, formatLedgerDate } from "@/lib/format";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    getLinkedOrgProfileForSupplier,
    getSupplierDetails,
    getSuppliersByOrganization,
    updateSupplier,
    type SupplierRow,
    type UpdateSupplierData,
} from "../services/suppliers.service";

/** Treat DB placeholders or internal ids as empty for display. */
function normalizeContactDisplay(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s || s === "nameLabel" || s === "contactPerson" || s === "contact")
    return "";
  return s;
}

/** Treat linked-org placeholder or UUID in phone as empty for display. */
function normalizePhoneDisplay(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s || /^linked-/i.test(s) || s.toLowerCase().includes("linked-"))
    return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    return "";
  if (/^[0-9a-f-]{36,}$/i.test(s)) return "";
  return s;
}

const TRIP_TABLE_AVATAR = 24;

/** UUID-shaped strings are not valid human names (avoid showing raw ids). */
function isUuidLikeString(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export interface SupplierDetailScreenProps {
  supplierId: string;
  onBack: () => void;
  autoOpenProfile?: boolean;
}

export default function SupplierDetailScreen({
  supplierId,
  onBack,
  autoOpenProfile,
}: SupplierDetailScreenProps) {
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
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const supplierName =
    supplier?.name ||
    supplier?.company_name ||
    supplier?.contact_person ||
    t("supplier");
  const [trips, setTrips] = useState<TripRow[]>([]);
  const tripIdsForFinanceAdj = useMemo(
    () => trips.map((t) => String(t.id)).filter(Boolean),
    [trips],
  );
  const { record: tripFinanceAdjRecord } = useTripFinanceAdjustmentsMap(
    currentOrganization?.id ?? null,
    tripIdsForFinanceAdj,
  );
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [sharedLedgerDownloadSignal, setSharedLedgerDownloadSignal] =
    useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [detailSubTab, setDetailSubTab] = useState<"trips" | "cash" | "shared">(
    "trips",
  );
  const [tripDatePeriod, setTripDatePeriod] =
    useState<FinancePeriodFilter>("RANGE");
  const [tripCustomFrom, setTripCustomFrom] = useState<string | null>(null);
  const [tripCustomTo, setTripCustomTo] = useState<string | null>(null);
  const [tripDateModalVisible, setTripDateModalVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("NODE_SYNCED");
  const [isLinked, setIsLinked] = useState(false);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [isInApp, setIsInApp] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [orgDrivers, setOrgDrivers] = useState<DriverRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 640;
  const webContentGutter =
    Platform.OS === "web"
      ? windowWidth >= 1600
        ? 10
        : windowWidth >= 1280
          ? 12
          : 16
      : Layout.screenPaddingHorizontal;
  const initialLoadDoneRef = useRef(false);
  const heroDecorProgress = useRef(new Animated.Value(0)).current;

  const clientById = useMemo(() => {
    const m = new Map<string, ClientRow>();
    for (const c of clients) {
      m.set(String(c.id).trim().toLowerCase(), c);
    }
    return m;
  }, [clients]);

  const linkedOrgDisplayMap = useLinkedOrgProfileMap(clients, []);
  const hasInAppProfile = Boolean(supplier?.linked_organization_id) || isInApp || isLinked;

  useEffect(() => {
    if (autoOpenProfile) setShowProfileModal(true);
  }, [autoOpenProfile]);

  useEffect(() => {
    const phone = supplier?.phone?.trim();
    if (!phone) {
      setIsInApp(false);
      return;
    }
    import("@/services/connectionRequestsService")
      .then(({ getConnectionInviteeByPhone }) =>
        getConnectionInviteeByPhone(phone),
      )
      .then(({ invitee }) => {
        setIsInApp(Boolean(invitee));
      })
      .catch(() => {
        // Avoid unhandled promise rejections on transient lookup timeouts.
        setIsInApp(false);
      });
  }, [supplier?.phone]);

  useEffect(() => {
    if (!isWebDesktop) {
      heroDecorProgress.stopAnimation();
      heroDecorProgress.setValue(0);
      return;
    }
    const decorLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroDecorProgress, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroDecorProgress, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    decorLoop.start();
    return () => decorLoop.stop();
  }, [heroDecorProgress, isWebDesktop]);

  const handleSendInvitation = useCallback(async () => {
    if (!currentOrganization?.id || !supplier?.phone) return;
    setSendingInvitation(true);
    try {
      const { createConnectionRequest, getConnectionInviteeByPhone } =
        await import("@/services/connectionRequestsService");
      const { invitee, error: lookupError } = await getConnectionInviteeByPhone(
        supplier.phone,
      );
      if (lookupError) {
        Alert.alert("Unable to send invitation", lookupError.message);
        return;
      }
      if (!invitee?.organization_id) {
        Alert.alert(
          "Unable to send invitation",
          "This supplier is not available in the application yet.",
        );
        return;
      }
      const { error, alreadyInvited } = await createConnectionRequest(
        currentOrganization.id,
        invitee.organization_id,
        {
          requestShipperClient: false,
          requestCarrierSupplier: true,
        },
      );
      if (error) {
        Alert.alert("Unable to send invitation", error.message);
        return;
      }
      setIsLinked(true);
      setSuccessTitle(
        alreadyInvited ? "INVITATION_ALREADY_SENT" : "CONNECTION_REQUESTED",
      );
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Unable to send invitation", message);
    } finally {
      setSendingInvitation(false);
    }
  }, [currentOrganization?.id, supplier?.phone]);

  const load = useCallback(() => {
    if (!supplierId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current)
      setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    const supplierPromise = getSupplierDetails(supplierId);
    const tripsPromise = getTripsByOrganization(orgId);
    const txPromise = getTransactionsByOrganization(orgId);
    const suppliersPromise = getSuppliersByOrganization(orgId);
    const asClientPromise = supplierPromise.then((res) => {
      const sup = res.supplier;
      const linkedOrgId = sup?.linked_organization_id ?? null;
      if (!linkedOrgId) return Promise.resolve([] as TripRow[]);
      return getTripsWhereOrgIsClient(orgId).then((r) =>
        r.error ? [] : (r.trips ?? []),
      );
    });
    const subcontractsPromise = getTripsWhereOrgIsSupplier(orgId).then(
      (res) => {
        if (res.error) return { sharedTrips: [], subcontracts: [] };
        const sharedTrips = res.trips ?? [];
        const tripIds = sharedTrips.map((t) => t.id);
        if (tripIds.length === 0) return { sharedTrips, subcontracts: [] };
        return getTripSubcontracts({ viewerOrgId: orgId, tripIds }).then(
          (subRes) => {
            return {
              sharedTrips,
              subcontracts: subRes.error ? [] : subRes.rows,
            };
          },
        );
      },
    );
    const driversPromise = getDriversByOrganization(orgId);
    const clientsPromise = getClientsByOrganization(orgId);
    Promise.all([
      supplierPromise,
      tripsPromise,
      txPromise,
      asClientPromise,
      suppliersPromise,
      subcontractsPromise,
      driversPromise,
      clientsPromise,
    ])
      .then(
        ([
          res,
          tripsRes,
          txRes,
          asClientTrips,
          suppliersRes,
          subRes,
          driversRes,
          clientsRes,
        ]) => {
          if (res.error) {
            setError(res.error.message);
            setSupplier(null);
          } else {
            setSupplier(res.supplier ?? null);
          }
          const allTrips = tripsRes.error ? [] : (tripsRes.trips ?? []);
          const sup = res.supplier;
          const supplierDisplayName = sup
            ? (sup.name || sup.company_name || sup.contact_person || "")
                .trim()
                .toLowerCase()
            : "";
          const linkedOrgId = sup?.linked_organization_id ?? null;
          const linkedSupplierIdByOrgId = buildUniqueLinkedOrgIdMap(
            suppliersRes.error ? [] : (suppliersRes.suppliers ?? []),
          );
          const fromOwned = allTrips.filter(
            (t) =>
              t.supplier_id === supplierId ||
              (!t.supplier_id &&
                supplierDisplayName &&
                (t.supplier_name ?? "").trim().toLowerCase() ===
                  supplierDisplayName),
          );
          const seen = new Set(fromOwned.map((t) => t.id));
          const merged: TripRow[] = [...fromOwned];

          // Add shared trips where we are the supplier and we subcontracted to THIS supplier
          const { sharedTrips, subcontracts } = subRes;
          const tripIdToSubcontract = new Map(
            subcontracts.map((s) => [s.trip_id, s]),
          );
          for (const t of sharedTrips) {
            const sub = tripIdToSubcontract.get(t.id);
            if (sub && sub.supplier_id === supplierId) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                // Overwrite supplier_rate so the UI displays the subcontract rate
                merged.push({ ...t, supplier_rate: sub.rate });
              }
            } else if (
              t.supplier_id === supplierId ||
              (!t.supplier_id &&
                supplierDisplayName &&
                (t.supplier_name ?? "").trim().toLowerCase() ===
                  supplierDisplayName)
            ) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                merged.push(t);
              }
            }
          }

          if (linkedOrgId && Array.isArray(asClientTrips)) {
            for (const t of asClientTrips) {
              if (
                isLoadBasedTrip(t) &&
                t.organization_id === linkedOrgId &&
                linkedSupplierIdByOrgId.get(linkedOrgId) === supplierId &&
                !seen.has(t.id)
              ) {
                seen.add(t.id);
                merged.push(t);
              }
            }
          }
          setTrips(merged);
          const allTx =
            (txRes.error ? [] : ((txRes.transactions ?? []) as LedgerRow[])) ??
            [];
          const normId = (id: string | null | undefined) =>
            id == null ? "" : String(id).trim().toLowerCase();
          const forSupplierTx = allTx.filter((tx) => {
            return (
              tx.contact_type === "supplier" &&
              tx.contact_id != null &&
              normId(tx.contact_id) === normId(supplierId)
            );
          });
          setTransactions(forSupplierTx);
          setOrgDrivers(driversRes?.error ? [] : (driversRes.drivers ?? []));
          setClients(clientsRes.error ? [] : (clientsRes.clients ?? []));
        },
      )
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [supplierId, currentOrganization?.id]);

  useEffect(() => load(), [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!supplier?.linked_organization_id) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      const { profile } = await getLinkedOrgProfileForSupplier(
        supplier.linked_organization_id,
      );
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
        if (mounted)
          setProfileAvatarUri(
            getUser2DAvatarUriForSeed(profile.avatarSeed.trim()),
          );
        return;
      }
      if (mounted) setProfileAvatarUri(null);
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [supplier?.linked_organization_id]);

  const linkedOrgId = supplier?.linked_organization_id ?? null;

  const {
    rows: _ledgerProtocolRows,
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
    const isSupplierLinked = (tx: LedgerRow) =>
      tx.contact_type === "supplier" &&
      tx.contact_id != null &&
      norm(tx.contact_id) === norm(supplierId);

    for (const t of trips) {
      const key = norm(t.id);
      paidByTripId[key] = 0;
      outByTripId[key] = 0;
    }
    const linkedTxIds = new Set<string>();
    const unlinkedSupplierTx: LedgerRow[] = [];
    for (const tx of transactions) {
      const txTripKey =
        norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
          ? norm(tx.trip_id)
          : undefined;
      if (txTripKey !== undefined) {
        paidByTripId[txTripKey] =
          (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_in ?? 0);
        outByTripId[txTripKey] =
          (outByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
        linkedTxIds.add(tx.id);
      } else if (isSupplierLinked(tx)) {
        unlinkedSupplierTx.push(tx);
      }
    }
    const allocatedOutByTripId = allocateAmountsToLargestDueTrips(
      trips.map((t) => {
        const key = norm(t.id);
        const base =
          Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
        const adj = tripFinanceAdjRecord[key] ?? [];
        const sales = adjustedCost(base, adj);
        return {
          tripId: key,
          sales,
          paid: outByTripId[key] ?? 0,
        };
      }),
      unlinkedSupplierTx.map((tx) => Number(tx.amount_out ?? 0)),
    );
    if (trips.length > 0) {
      for (const tx of unlinkedSupplierTx) {
        linkedTxIds.add(tx.id);
      }
    }

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
    for (const t of trips) {
      const key = norm(t.id);
      const base = Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedCost(base, adj);
      const paid = allocatedOutByTripId[key] ?? 0;
      const due = Math.max(0, sales - paid);
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
    const unlinkedTx = transactions.filter((tx) => !linkedTxIds.has(tx.id));
    for (const tx of unlinkedTx) {
      const amountIn = Number(tx.amount_in ?? 0);
      const amountOut = Number(tx.amount_out ?? 0);
      finalRows.push({
        id: `adj-${tx.id}`,
        missionId: "ADJ",
        dest:
          tx.description && tx.description !== "ENTRY"
            ? tx.description
            : "GENERAL",
        sales: amountIn,
        paid: amountIn,
        due: amountOut,
      });
    }
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
    const tripIdToDue: Record<string, number> = {};
    for (const t of trips) {
      const key = norm(t.id);
      const base = Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedCost(base, adj);
      const paid = allocatedOutByTripId[key] ?? 0;
      tripIdToDue[t.id] = Math.max(0, sales - paid);
    }

    const totalBilledConsolidated = finalRows.reduce(
      (s, r) => s + (r.missionId !== "ADJ" ? r.sales : 0),
      0,
    );
    const totalPendingConsolidated = finalRows.reduce((s, r) => s + r.due, 0);
    return {
      rows: finalRows,
      totalBilledConsolidated,
      totalPendingConsolidated,
      tripIdToDue,
      paidByTripId: allocatedOutByTripId,
    };
  }, [trips, transactions, supplierId, linkedOrgId, tripFinanceAdjRecord]);

  const tripDateOpts = useMemo(
    () => ({ customFrom: tripCustomFrom, customTo: tripCustomTo }),
    [tripCustomFrom, tripCustomTo],
  );
  const tripsForMissionTable = useMemo(
    () =>
      trips.filter((t) =>
        ledgerDayMatchesPeriod(tripDayIso(t), tripDatePeriod, tripDateOpts),
      ),
    [trips, tripDatePeriod, tripDateOpts],
  );

  const missionRows = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    return tripsForMissionTable.map((t) => {
      const key = norm(t.id);
      const base = Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedCost(base, adj);
      const paid = paidByTripId[key] ?? 0;
      const due = tripIdToDue[t.id] ?? 0;
      return {
        trip: t,
        missionId: getTripDisplayNumber(t),
        route:
          `${t.pickup_area ?? ""} → ${t.drop_location ?? ""}`.trim() || "—",
        sales,
        paid,
        due,
      };
    });
  }, [tripsForMissionTable, paidByTripId, tripIdToDue, tripFinanceAdjRecord]);
  const tripTransactionMetaById = useMemo(() => {
    const byTrip: Record<
      string,
      { count: number; lastTxnDate: string | null }
    > = {};
    for (const tx of transactions) {
      if (!tx.trip_id) continue;
      const key = String(tx.trip_id).trim().toLowerCase();
      if (!key) continue;
      const candidateDate = tx.transaction_date ?? tx.created_at ?? null;
      const current = byTrip[key];
      if (!current) {
        byTrip[key] = { count: 1, lastTxnDate: candidateDate };
        continue;
      }
      current.count += 1;
      if (
        candidateDate &&
        (!current.lastTxnDate || candidateDate > current.lastTxnDate)
      ) {
        current.lastTxnDate = candidateDate;
      }
    }
    return byTrip;
  }, [transactions]);

  const supplierTripDetailsMap = useMemo(() => {
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

  const tripOptions = useMemo(
    () =>
      trips.map((t) => ({
        id: t.id,
        trip_number: getTripDisplayNumber(t),
        client_id: t.client_id ?? null,
        client_name: t.client_name ?? null,
        supplier_id: t.supplier_id ?? supplierId ?? null,
        driver_id: t.driver_id ?? null,
        vehicle_id: t.vehicle_id ?? null,
        indent_id: t.indent_id ?? null,
        route_label:
          [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
        trip_date: formatLedgerDate(t.pickup_date || t.created_at),
      })),
    [trips, supplierId],
  );

  const triggerSuccess = useCallback((title = "NODE_SYNCED") => {
    setSuccessTitle(title);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
  }, []);

  const handleEditSave = async (patch: UpdateSupplierData) => {
    if (!currentOrganization?.id || !supplier) return;
    const { error: err } = await updateSupplier(
      currentOrganization.id,
      supplier.id,
      patch,
    );
    if (!err) {
      load();
    }
  };

  const handleSyncLatestFromPlatform = async () => {
    if (!currentOrganization?.id || !supplier) return;
    const linkedId = supplier.linked_organization_id ?? undefined;
    if (linkedId) {
      const { error: profileErr, profile } =
        await getLinkedOrgProfileForSupplier(linkedId);
      if (!profileErr && profile) {
        const { organizationName, contactPerson, phone, email } = profile;
        const { error: updateErr, supplier: updated } = await updateSupplier(
          currentOrganization.id,
          supplier.id,
          {
            company_name: organizationName || undefined,
            contact_person: contactPerson || undefined,
            phone: phone || undefined,
            email: email || undefined,
          },
        );
        if (!updateErr && updated) {
          setSupplier(updated);
          return {
            companyName: updated.company_name ?? updated.name ?? "",
            contactPerson: updated.contact_person ?? updated.contact ?? "",
            phone: updated.phone ?? "",
            email: updated.email ?? "",
          };
        }
      }
    }
    const { error: err, supplier: latest } = await getSupplierDetails(
      supplier.id,
    );
    if (err || !latest) return;
    setSupplier(latest);
    return {
      companyName: latest.company_name ?? latest.name ?? "",
      contactPerson: latest.contact_person ?? latest.contact ?? "",
      phone: latest.phone ?? "",
      email: latest.email ?? "",
    };
  };

  const handleInviteToApp = useCallback(() => {
    const message = `Join me on Pulse to sync our ledger and compare books with ${supplierName}. Download the Q app to get started.`;
    Share.share({ message, title: "Invite to Q" })
      .then(() => {
        triggerSuccess("INVITE_SENT");
      })
      .catch(() => {});
  }, [supplierName, triggerSuccess]);

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
          party_name: supplierName,
          description:
            `${row.route} • Contract ${formatINR(row.sales)}`.trim() || "—",
          amount_in: row.paid,
          amount_out: row.due,
          transaction_date: row.trip.pickup_date ?? row.trip.created_at ?? "",
          created_at: row.trip.created_at ?? "",
          contact_id: supplierId,
          contact_type: "supplier" as const,
        })),
    [currentOrganization?.id, missionRows, supplierId, supplierName],
  );

  const reportTransactions = useMemo(
    () => (detailSubTab === "trips" ? tripReportTransactions : sortedTx),
    [detailSubTab, sortedTx, tripReportTransactions],
  );
  const tripTableReport = useMemo(() => {
    if (detailSubTab !== "trips") return undefined;
    const rows = missionRows.map((row) => {
      const key = String(row.trip.id).trim().toLowerCase();
      const meta = tripTransactionMetaById[key] ?? {
        count: 0,
        lastTxnDate: null,
      };
      const clientRevenue = Number(row.trip.client_price ?? 0);
      const pnl = clientRevenue - row.sales;
      const margin =
        clientRevenue > 0
          ? `${((pnl / clientRevenue) * 100).toFixed(1)}%`
          : "0.0%";
      return {
        trip: row.missionId,
        route: row.route,
        client:
          row.trip.client_name?.trim() || row.trip.client_id?.trim() || "—",
        contract: formatINR(row.sales),
        clientRevenue: formatINR(clientRevenue),
        pnl: formatINR(pnl),
        margin,
        paid: formatINR(row.paid),
        due: formatINR(row.due),
        txns: meta.count,
        lastTxn: meta.lastTxnDate ? formatLedgerDate(meta.lastTxnDate) : "—",
      };
    });
    return {
      columns: [
        { key: "trip", label: "Trip" },
        { key: "route", label: "Route" },
        { key: "client", label: "Client" },
        { key: "contract", label: "Contract", align: "right" as const },
        { key: "clientRevenue", label: "Client Rev", align: "right" as const },
        { key: "pnl", label: "P&L", align: "right" as const },
        { key: "margin", label: "Margin %", align: "right" as const },
        { key: "paid", label: "Paid", align: "right" as const },
        { key: "due", label: "Due", align: "right" as const },
        { key: "txns", label: "Txns", align: "right" as const },
        { key: "lastTxn", label: "Last Txn", align: "right" as const },
      ],
      rows,
    };
  }, [detailSubTab, missionRows, tripTransactionMetaById]);

  if (loading) {
    return (
      <CenteredLoadingView
        message={t("loadingSupplier")}
        color={Theme.teslaRed}
      />
    );
  }

  if (error || !supplier) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            activeOpacity={0.8}
          >
            <FontAwesome
              name="chevron-left"
              size={20}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {t("supplier")}
            </Text>
          </View>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || t("supplierNotFound")}</Text>
        </View>
      </View>
    );
  }

  const contractValue = totalBilledConsolidated;
  const paid = contractValue - totalPendingConsolidated;
  const due = totalPendingConsolidated;
  const tripsHandled = missionRows.length;
  const isIntegrated =
    supplier.supplier_type === "integrated" ||
    Boolean(supplier.linked_organization_id);
  const isInAppNotIntegrated = !isIntegrated && isInApp;
  const isNotInApp = !isIntegrated && !isInApp;
  const rating = Number(
    (
      supplier.is_verified
        ? hasInAppProfile
          ? 4.6
          : 4.2
        : hasInAppProfile
          ? 4.1
          : 3.8
    ).toFixed(1),
  );
  const ratingFilledStars = Math.max(0, Math.min(5, Math.round(rating)));
  const statusTitle = isIntegrated
    ? "Integrated"
    : isInAppNotIntegrated
      ? "In App - Not Integrated"
      : "Offline";
  const statusSubtitle = isIntegrated
    ? "In-App Active"
    : isInAppNotIntegrated
      ? "In-App Active"
      : "External Entity";
  const canSendRequest = isInAppNotIntegrated && !isLinked;
  const canInviteToApp = isNotInApp;
  const profileActionLabel = canSendRequest
    ? "Send Request"
    : canInviteToApp
      ? "Invite to App"
      : isLinked
        ? "Invitation Sent"
        : "Integrated";
  const tabConfig = [
    { id: "trips" as const, label: "Trips" },
    { id: "cash" as const, label: "Cash Flow" },
    { id: "shared" as const, label: "Shared" },
  ];
  const heroDecorAnimatedStyle = isWebDesktop
    ? {
        opacity: heroDecorProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.16, 0.3],
        }),
        transform: [
          {
            translateY: heroDecorProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -6],
            }),
          },
          {
            rotate: heroDecorProgress.interpolate({
              inputRange: [0, 1],
              outputRange: ["10deg", "4deg"],
            }),
          },
        ],
      }
    : undefined;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="chevron-left"
            size={20}
            color={Theme.textPrimaryDark}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {supplierName}
          </Text>
          <Text style={styles.headerSubtitle}>DEEP ENTITY INTEL</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.publicProfileBtn}
            onPress={() =>
              router.push(`/public-profile/supplier/${supplierId}`)
            }
            activeOpacity={0.8}
            accessibilityLabel="View public profile"
          >
            <FontAwesome
              name="id-card-o"
              size={15}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => setShowProfileModal(true)}
            activeOpacity={0.8}
            accessibilityLabel="Supplier profile"
          >
            {profileAvatarUri ? (
              <Image
                source={{ uri: profileAvatarUri }}
                style={styles.headerAvatarImage}
              />
            ) : (
              <FontAwesome
                name="user"
                size={16}
                color={Theme.textPrimaryDark}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={() => {
              if (detailSubTab === "shared") {
                setSharedLedgerDownloadSignal((n) => n + 1);
              } else {
                setShowReportModal(true);
              }
            }}
            activeOpacity={0.8}
            accessibilityLabel={
              detailSubTab === "shared"
                ? "Download shared ledger report"
                : "Download report"
            }
          >
            <FontAwesome
              name="cloud-download"
              size={18}
              color={Theme.textOnPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: webContentGutter,
          },
          {
            paddingBottom:
              canAddTransaction && detailSubTab !== "shared"
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
        <View style={isWebDesktop ? styles.heroCardsRow : undefined}>
          <LinearGradient
            colors={[Theme.financeCardOrangeFrom, Theme.financeCardOrangeTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.scorecard,
              isWebDesktop && styles.scorecardWebDesktop,
              isWebDesktop && styles.scorecardHeroPane,
            ]}
          >
            {isWebDesktop ? (
              <Animated.View
                style={[styles.scorecardDecorIconWrap, heroDecorAnimatedStyle]}
              >
                <FontAwesome
                  name="book"
                  size={120}
                  color={Theme.textOnDark}
                  style={styles.scorecardDecorIcon}
                />
              </Animated.View>
            ) : null}
            <View
              style={[
                styles.scorecardTop,
                isWebDesktop && styles.scorecardTopWebDesktop,
              ]}
            >
              <View style={styles.scorecardLeft}>
                <Text style={styles.scorecardLabel}>FINANCIAL OVERVIEW</Text>
                <Text style={styles.scorecardSalesLabel}>CONTRACT VALUE</Text>
                <Text style={[styles.scorecardAmount, isWebDesktop && styles.scorecardAmountWebDesktop]}>
                  {formatINR(contractValue)}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.scorecardGrid,
                isWebDesktop && styles.scorecardGridWebDesktop,
              ]}
            >
              <View style={isWebDesktop ? styles.scorecardGridStat : undefined}>
                <Text style={styles.scorecardGridLabelPaid}>PAID</Text>
                <Text style={[styles.scorecardGridPaid, isWebDesktop && styles.scorecardGridPaidWebDesktop]}>
                  {formatINR(paid)}
                </Text>
              </View>
              <View
                style={[
                  styles.scorecardGridRight,
                  isWebDesktop && styles.scorecardGridStat,
                ]}
              >
                <Text style={styles.scorecardGridLabelDue}>DUE</Text>
                <Text style={[styles.scorecardGridDue, isWebDesktop && styles.scorecardGridDueWebDesktop]}>
                  {formatINR(due)}
                </Text>
              </View>
            </View>
          </LinearGradient>
          {isWebDesktop ? (
            <View style={styles.profilePreviewCard}>
              <Text style={styles.profilePreviewEyebrow}>ENTITY PROFILE</Text>
              <View style={styles.profilePreviewIdentityRow}>
                <View style={styles.profilePreviewIdentityAvatar}>
                  {profileAvatarUri ? (
                    <Image source={{ uri: profileAvatarUri }} style={styles.profilePreviewIdentityAvatarImage} />
                  ) : (
                    <FontAwesome name="building" size={12} color={Theme.textSecondary} />
                  )}
                </View>
                <View style={styles.profilePreviewIdentityMeta}>
                  <Text style={styles.profilePreviewIdentityName} numberOfLines={1}>
                    {supplierName}
                  </Text>
                  <Text style={styles.profilePreviewIdentitySub} numberOfLines={1}>
                    {(supplier.contact_person ?? supplier.phone ?? "No contact").trim() || "No contact"}
                  </Text>
                </View>
              </View>
              <View style={styles.profilePreviewRatingRow}>
                <View style={styles.profilePreviewStars}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <FontAwesome
                      key={`supplier-star-${idx}`}
                      name={idx < ratingFilledStars ? "star" : "star-o"}
                      size={12}
                      color={idx < ratingFilledStars ? "#fbbf24" : Theme.borderMedium}
                    />
                  ))}
                </View>
                <View style={styles.profilePreviewRatingBadge}>
                  <Text style={styles.profilePreviewRatingBadgeText}>{rating.toFixed(1)}</Text>
                </View>
              </View>
              <View style={styles.profilePreviewExperienceBlock}>
                <Text style={styles.profilePreviewExperienceEyebrow}>EXPERIENCE</Text>
                <View style={styles.profilePreviewExperienceRow}>
                  <FontAwesome name="history" size={13} color={Theme.textSecondary} />
                  <Text style={styles.profilePreviewTripsNumber}>{tripsHandled}</Text>
                  <Text style={styles.profilePreviewExperienceLabel}>Trips Handled</Text>
                </View>
              </View>
              <View style={styles.profilePreviewToggle}>
                <View
                  style={[
                    styles.profilePreviewToggleDot,
                    isInAppNotIntegrated && styles.profilePreviewToggleDotPending,
                    isIntegrated && styles.profilePreviewToggleDotActive,
                  ]}
                >
                  {isIntegrated ? (
                    <FontAwesome name="check" size={10} color={Theme.textOnPrimary} />
                  ) : isInAppNotIntegrated ? (
                    <FontAwesome name="send" size={8} color={Theme.financeCardOrangeFrom} />
                  ) : null}
                </View>
                <View>
                  <Text style={styles.profilePreviewToggleTitle}>{statusTitle}</Text>
                  <Text style={styles.profilePreviewToggleSub}>{statusSubtitle}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.profilePreviewActionBtn,
                  ecc.actionBtnPrimary,
                  (!canSendRequest && !canInviteToApp) && ecc.actionBtnDisabled,
                ]}
                onPress={() => {
                  if (canSendRequest) {
                    void handleSendInvitation();
                  } else if (canInviteToApp) {
                    handleInviteToApp();
                  }
                }}
                activeOpacity={0.86}
                disabled={sendingInvitation || (!canSendRequest && !canInviteToApp)}
              >
                <FontAwesome
                  name={canSendRequest ? "send" : "envelope-o"}
                  size={12}
                  color={Theme.textOnPrimary}
                />
                <Text style={styles.profilePreviewActionText}>
                  {sendingInvitation && canSendRequest ? "Sending..." : profileActionLabel}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {tabConfig.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tabItem,
                detailSubTab === tab.id && styles.tabItemActive,
              ]}
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

        {detailSubTab === "trips" && (
          <View style={styles.tripDatePillWrap}>
            <DatePresetPillBar
              variant="onLight"
              period={tripDatePeriod}
              onPeriodChange={(p) => {
                setTripDatePeriod(p);
                if (p !== "CUSTOM") {
                  setTripCustomFrom(null);
                  setTripCustomTo(null);
                }
              }}
              onCustomRangePress={() => setTripDateModalVisible(true)}
              customFrom={tripCustomFrom}
              customTo={tripCustomTo}
            />
          </View>
        )}

        {detailSubTab === "trips" && (
          <View
            style={[
              styles.tableCard,
              isWebDesktop && styles.tableCardWebDesktop,
            ]}
          >
            <View
              style={[
                styles.tableHeader,
                isWebDesktop && styles.tableHeaderWebDesktop,
              ]}
            >
              <Text
                style={[
                  styles.th,
                  styles.thMission,
                  isWebDesktop && styles.thWebDesktop,
                  isWebDesktop && styles.thMissionWebDesktop,
                ]}
              >
                Trip
              </Text>
              {isWebDesktop ? (
                <View style={styles.partyColWebDesktop}>
                  <Text style={[styles.th, styles.thWebDesktop]}>Client</Text>
                </View>
              ) : null}
              {isWebDesktop ? (
                <View
                  style={[styles.headerAmountCol, styles.amountColWebDesktop]}
                >
                  <Text
                    style={[styles.th, styles.thRight, styles.thWebDesktop]}
                  >
                    Client Rev
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.headerAmountCol,
                  isWebDesktop && styles.amountColWebDesktop,
                ]}
              >
                <Text
                  style={[
                    styles.th,
                    styles.thSales,
                    isWebDesktop && styles.thWebDesktop,
                  ]}
                >
                  Contract
                </Text>
              </View>
              {isWebDesktop ? (
                <View
                  style={[styles.headerAmountCol, styles.amountColWebDesktop]}
                >
                  <Text
                    style={[
                      styles.th,
                      styles.thRight,
                      styles.thWebDesktop,
                      { textAlign: "right" as const },
                    ]}
                  >
                    P&L
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.headerAmountCol,
                  isWebDesktop && styles.amountColWebDesktop,
                ]}
              >
                <Text
                  style={[
                    styles.th,
                    styles.thRight,
                    isWebDesktop && styles.thWebDesktop,
                  ]}
                >
                  Paid
                </Text>
              </View>
              <View
                style={[
                  styles.headerAmountCol,
                  isWebDesktop && styles.amountColWebDesktop,
                ]}
              >
                <Text
                  style={[
                    styles.th,
                    styles.thRight,
                    isWebDesktop && styles.thWebDesktop,
                  ]}
                >
                  Due
                </Text>
              </View>
              {isWebDesktop ? (
                <View
                  style={[styles.headerAmountCol, styles.amountColWebDesktop]}
                >
                  <Text
                    style={[styles.th, styles.thRight, styles.thWebDesktop]}
                  >
                    Txns
                  </Text>
                </View>
              ) : null}
              {isWebDesktop ? (
                <View
                  style={[styles.headerAmountCol, styles.amountColWebDesktop]}
                >
                  <Text
                    style={[styles.th, styles.thRight, styles.thWebDesktop]}
                  >
                    Last Txn
                  </Text>
                </View>
              ) : null}
            </View>
            {missionRows.length > 0 ? (
              missionRows.map((row) => (
                <TouchableOpacity
                  key={row.trip.id}
                  style={[
                    styles.tableRow,
                    isWebDesktop && styles.tableRowWebDesktop,
                  ]}
                  onPress={() =>
                    router.push(`/trip/${row.trip.id}?entryContext=supplier`)
                  }
                  activeOpacity={0.7}
                >
                  {(() => {
                    const meta = tripTransactionMetaById[
                      String(row.trip.id).trim().toLowerCase()
                    ] ?? {
                      count: 0,
                      lastTxnDate: null,
                    };
                    const cidKey = (row.trip.client_id ?? "")
                      .trim()
                      .toLowerCase();
                    const clientRow = cidKey
                      ? clientById.get(cidKey)
                      : undefined;
                    const rawTripClientName = (
                      row.trip.client_name ?? ""
                    ).trim();
                    const clientDisplayName =
                      (clientRow?.name ?? "").trim() ||
                      (rawTripClientName &&
                      !isUuidLikeString(row.trip.client_name)
                        ? rawTripClientName
                        : "");
                    const clientNameForUi = clientDisplayName || "—";
                    const clientRevenue = Number(row.trip.client_price ?? 0);
                    const tripPnl = clientRevenue - row.sales;
                    return (
                      <>
                        <View
                          style={[
                            styles.tdMission,
                            isWebDesktop && styles.tdMissionWebDesktop,
                          ]}
                        >
                          <Text style={styles.tdMissionId}>
                            {row.missionId}
                          </Text>
                          <Text
                            style={styles.tdRoute}
                            numberOfLines={isWebDesktop ? 3 : 1}
                          >
                            {row.route}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View style={styles.partyColWebDesktop}>
                            <View style={styles.tdPartyAvatarRow}>
                              <PartyAvatar
                                name={clientNameForUi}
                                organizationImageUrl={
                                  clientRow?.linked_organization_id
                                    ? linkedOrgDisplayMap[
                                        clientRow.linked_organization_id
                                      ]?.avatarUrl
                                    : undefined
                                }
                                organizationAvatarSeed={
                                  clientRow?.linked_organization_id
                                    ? linkedOrgDisplayMap[
                                        clientRow.linked_organization_id
                                      ]?.avatarSeed
                                    : undefined
                                }
                                avatarUrl={clientRow?.avatar_url ?? null}
                                avatarSeed={clientRow?.avatar_seed ?? null}
                                entityType="client"
                                size={TRIP_TABLE_AVATAR}
                              />
                              <View style={styles.tdPartyTextStack}>
                                <Text
                                  style={styles.tdPartyWebDesktop}
                                  numberOfLines={1}
                                >
                                  {clientNameForUi}
                                </Text>
                                <Text
                                  style={styles.tdPartyHintWebDesktop}
                                  numberOfLines={1}
                                >
                                  {(clientRow?.contact_person ?? "").trim() ||
                                    "—"}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ) : null}
                        {isWebDesktop ? (
                          <View
                            style={[
                              styles.amountCol,
                              styles.amountColWebDesktop,
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                              ]}
                            >
                              {formatINR(clientRevenue)}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.amountCol,
                            isWebDesktop && styles.amountColWebDesktop,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.td,
                              styles.tdSales,
                              isWebDesktop && styles.tdAmountWebDesktop,
                            ]}
                          >
                            {formatINR(row.sales)}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View
                            style={[
                              styles.amountCol,
                              styles.amountColWebDesktop,
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                                tripPnl >= 0 ? styles.tdGreen : styles.tdRed,
                                { textAlign: "right" as const },
                              ]}
                            >
                              {formatINR(tripPnl)}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.amountCol,
                            isWebDesktop && styles.amountColWebDesktop,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.td,
                              styles.tdRight,
                              styles.tdGreen,
                              isWebDesktop && styles.tdAmountWebDesktop,
                            ]}
                          >
                            {formatINR(row.paid)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.amountCol,
                            isWebDesktop && styles.amountColWebDesktop,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.td,
                              styles.tdRight,
                              styles.tdRed,
                              isWebDesktop && styles.tdAmountWebDesktop,
                            ]}
                          >
                            {formatINR(row.due)}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View
                            style={[
                              styles.amountCol,
                              styles.amountColWebDesktop,
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                              ]}
                            >
                              {meta.count}
                            </Text>
                          </View>
                        ) : null}
                        {isWebDesktop ? (
                          <View
                            style={[
                              styles.amountCol,
                              styles.amountColWebDesktop,
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                              ]}
                            >
                              {meta.lastTxnDate
                                ? formatLedgerDate(meta.lastTxnDate)
                                : "—"}
                            </Text>
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyRowText}>No trips</Text>
              </View>
            )}
          </View>
        )}

        {detailSubTab === "cash" && (
          <View style={styles.cashSection}>
            <LedgerTransactionListView
              transactions={transactions}
              tripDetailsMap={supplierTripDetailsMap}
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
              driverRows={orgDrivers}
            />
          </View>
        )}

        {detailSubTab === "shared" && supplier && (
          <View
            style={[
              styles.sharedSection,
              Platform.OS === "web" && styles.sharedSectionWeb,
            ]}
          >
            <SharedLedgerContent
              entity={{
                id: supplier.id,
                name: supplierName,
                linked_organization_id: supplier.linked_organization_id,
                avatar_url: supplier.avatar_url ?? undefined,
              }}
              entityType="SUPPLIER"
              trips={trips}
              transactions={transactions}
              organizationId={currentOrganization?.id ?? null}
              integrated={Boolean(
                supplier.supplier_type === "integrated" ||
                supplier.linked_organization_id,
              )}
              embeddedInOverlay={true}
              externalDownloadRequest={sharedLedgerDownloadSignal}
              onRefresh={load}
              onRequestConnection={() => {
                setIsLinked(true);
                triggerSuccess("CONNECTION_REQUESTED");
              }}
              onInviteToApp={() => {
                const message = `Join me on Pulse to sync our ledger and compare books with ${supplierName}. Download the Q app to get started.`;
                Share.share({ message, title: "Invite to Q" })
                  .then(() => {
                    // After sharing, show a friendlier message
                    triggerSuccess("INVITE_SENT");
                  })
                  .catch(() => {});
              }}
            />
          </View>
        )}
      </ScrollView>

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
                entityType: "SUPPLIER",
                entityId: supplierId,
                partyName: supplierName.trim() || t("supplier"),
                partyContext: "suppliers",
                partyId: supplierId,
                defaultType: "out",
              });
              if (due > 0) q.set("dueAmountOut", String(due));
              router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
            }}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
        </View>
      )}

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

      <DateRangePickerModal
        visible={tripDateModalVisible}
        initialFrom={tripCustomFrom ?? undefined}
        initialTo={tripCustomTo ?? undefined}
        onDismiss={() => setTripDateModalVisible(false)}
        onApply={(from, to) => {
          setTripCustomFrom(from);
          setTripCustomTo(to);
          setTripDatePeriod("CUSTOM");
          setTripDateModalVisible(false);
        }}
      />

      <LedgerReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        transactions={reportTransactions}
        title={
          supplierName ? `${t("ledgerFor")}${supplierName}` : t("ledgerReport")
        }
        customReport={tripTableReport}
      />
      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View
          style={[styles.profileModalWrap, { paddingBottom: insets.bottom }]}
        >
          <CounterpartyProfileSystemCard
            visible={showProfileModal}
            type="supplier"
            organizationName={
              (supplier?.company_name ??
                supplier?.name ??
                supplier?.contact_person ??
                "—") as string
            }
            adminName={normalizeContactDisplay(supplier?.contact_person)}
            email={normalizeContactDisplay(supplier?.email)}
            phone={normalizePhoneDisplay(supplier?.phone)}
            gstNumber={normalizeContactDisplay(supplier?.gst_number)}
            billingAddress={normalizeContactDisplay(supplier?.address)}
            gridVolumeLabel={formatINR(contractValue)}
            networkTrustLabel="94.2%"
            isIntegrated={Boolean(
              supplier?.supplier_type === "integrated" ||
              supplier?.linked_organization_id ||
              isInApp,
            )}
            entityDisplayId={supplier?.id?.slice(0, 8) ?? null}
            kycDocs={[
              {
                id: "gst",
                documentType: "GST REGISTRATION",
                status: normalizeContactDisplay(supplier?.gst_number)
                  ? "Verified"
                  : "Pending",
                dateLabel: "—",
              },
              {
                id: "pan",
                documentType: "PAN IDENTITY",
                status: supplier?.is_verified ? "Verified" : "Pending",
                dateLabel: "—",
              },
              {
                id: "bank",
                documentType: "BANK PROOF",
                status: supplier?.is_verified ? "Verified" : "Pending",
                dateLabel: "—",
              },
            ]}
            onClose={() => setShowProfileModal(false)}
            onEditPress={() => {
              setShowProfileModal(false);
              setShowEditModal(true);
            }}
          />
          <View style={styles.profileModalFooter}>
            {!supplier?.linked_organization_id && isInApp && !isLinked && (
              <TouchableOpacity
                style={styles.profileSecondaryBtn}
                onPress={() => void handleSendInvitation()}
                activeOpacity={0.8}
                disabled={sendingInvitation}
              >
                <FontAwesome
                  name="paper-plane"
                  size={14}
                  color={Theme.primary}
                />
                <Text style={styles.profileSecondaryBtnText}>
                  {sendingInvitation ? "Sending..." : "Send request"}
                </Text>
              </TouchableOpacity>
            )}
            {!supplier?.linked_organization_id && isInApp && isLinked && (
              <View style={[styles.profileSecondaryBtn, { opacity: 0.7 }]}>
                <FontAwesome name="check" size={14} color={Theme.primary} />
                <Text style={styles.profileSecondaryBtnText}>
                  Invitation sent
                </Text>
              </View>
            )}
            {!supplier?.linked_organization_id && !isInApp && (
              <TouchableOpacity
                style={styles.profileSecondaryBtn}
                onPress={() => {
                  const message = `Join me on Pulse to sync our ledger and compare books with ${supplierName}. Download the Q app to get started.`;
                  Share.share({ message, title: "Invite to Q" });
                }}
                activeOpacity={0.8}
              >
                <FontAwesome name="link" size={14} color={Theme.primary} />
                <Text style={styles.profileSecondaryBtnText}>
                  {t("linkToAppAccount")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <EditSupplierModal
        visible={showEditModal}
        supplier={supplier}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditSave}
        onSyncLatest={
          supplier.supplier_type === "integrated"
            ? handleSyncLatestFromPlatform
            : undefined
        }
      />
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 10,
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
  publicProfileBtn: {
    width: 36,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
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
    backgroundColor: Theme.surface,
  },
  profileModalFooter: {
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: Theme.surface,
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
  profileHealthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  profileHealthLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileHealthPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  profileHealthValue: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.primary,
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
  profileSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  profileSecondaryBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
  },
  scorecard: ehs.scorecard,
  scorecardWebDesktop: ehs.scorecardWebDesktop,
  heroCardsRow: ehs.heroCardsRow,
  scorecardHeroPane: ehs.scorecardHeroPane,
  scorecardDecorIconWrap: ehs.scorecardDecorIconWrap,
  scorecardDecorIcon: ehs.scorecardDecorIcon,
  scorecardTop: ehs.scorecardTop,
  scorecardTopWebDesktop: ehs.scorecardTopWebDesktop,
  scorecardLeft: ehs.scorecardLeft,
  scorecardLabel: ehs.scorecardLabel,
  scorecardSalesLabel: ehs.scorecardSalesLabel,
  scorecardAmount: ehs.scorecardAmount,
  scorecardAmountWebDesktop: ehs.scorecardAmountWebDesktop,
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
  scorecardGrid: ehs.scorecardGrid,
  scorecardGridWebDesktop: ehs.scorecardGridWebDesktop,
  scorecardGridStat: ehs.scorecardGridStat,
  scorecardGridRight: ehs.scorecardGridRight,
  scorecardGridLabelPaid: ehs.scorecardGridLabelPaid,
  scorecardGridLabelDue: ehs.scorecardGridLabelDue,
  scorecardGridPaid: ehs.scorecardGridPaid,
  scorecardGridPaidWebDesktop: ehs.scorecardGridPaidWebDesktop,
  scorecardGridDue: ehs.scorecardGridDue,
  scorecardGridDueWebDesktop: ehs.scorecardGridDueWebDesktop,
  profilePreviewCard: ecc.card,
  profilePreviewEyebrow: ecc.eyebrow,
  profilePreviewIdentityRow: ecc.identityRow,
  profilePreviewIdentityAvatar: ecc.identityAvatar,
  profilePreviewIdentityAvatarImage: ecc.identityAvatarImage,
  profilePreviewIdentityMeta: ecc.identityMeta,
  profilePreviewIdentityName: ecc.identityName,
  profilePreviewIdentitySub: ecc.identitySub,
  profilePreviewRatingRow: ecc.ratingRow,
  profilePreviewStars: ecc.stars,
  profilePreviewRatingBadge: ecc.ratingBadge,
  profilePreviewRatingBadgeText: ecc.ratingBadgeText,
  profilePreviewExperienceBlock: ecc.experienceBlock,
  profilePreviewExperienceEyebrow: ecc.experienceEyebrow,
  profilePreviewExperienceRow: ecc.experienceRow,
  profilePreviewTripsNumber: ecc.tripsNumber,
  profilePreviewExperienceLabel: ecc.experienceLabel,
  profilePreviewToggle: ecc.toggle,
  profilePreviewToggleDot: ecc.toggleDot,
  profilePreviewToggleDotActive: ecc.toggleDotActive,
  profilePreviewToggleDotPending: {
    borderColor: Theme.financeCardOrangeFrom,
    backgroundColor: "rgba(234,88,12,0.12)",
  },
  profilePreviewToggleTitle: ecc.toggleTitle,
  profilePreviewToggleSub: ecc.toggleSub,
  profilePreviewActionBtn: ecc.actionBtn,
  profilePreviewActionText: ecc.actionText,
  tabRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 4,
    borderRadius: 16,
    marginBottom: 8,
    gap: 4,
  },
  tripDatePillWrap: {
    paddingHorizontal: 4,
    marginBottom: 6,
    marginTop: -4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
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
  tableCardWebDesktop: {
    borderRadius: 12,
    borderColor: Theme.borderMedium,
    width: "100%",
    backgroundColor: Theme.surface,
    marginHorizontal: 0,
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
  tableHeaderWebDesktop: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Theme.surface,
    borderBottomColor: Theme.borderMedium,
  },
  th: {
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  thWebDesktop: {
    fontSize: 11,
    letterSpacing: 0.1,
    color: Theme.textSecondary,
    fontWeight: "700",
    fontStyle: "italic",
  },
  thMissionWebDesktop: {
    flexGrow: 1,
    flexShrink: 1,
    flex: 0,
    minWidth: 200,
    width: "32%",
  },
  partyColWebDesktop: {
    flexGrow: 0,
    flexShrink: 0,
    width: "15%",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
  },
  tdPartyAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  tdPartyTextStack: {
    flex: 1,
    minWidth: 0,
  },
  headerAmountCol: {
    width: 80,
    minWidth: 72,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  amountCol: {
    width: 80,
    minWidth: 72,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  amountColWebDesktop: {
    flexGrow: 0,
    flexShrink: 0,
    flex: 1,
    width: "auto",
    minWidth: 64,
    maxWidth: 104,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 5,
  },
  thMission: { flex: 1, minWidth: 0 },
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
  tableRowWebDesktop: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomColor: Theme.borderLight,
    minHeight: 46,
    backgroundColor: Theme.surface,
  },
  td: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 1, minWidth: 0 },
  tdMissionId: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tdRoute: {
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 4,
  },
  tdMissionWebDesktop: {
    flexGrow: 1,
    flexShrink: 1,
    flex: 0,
    minWidth: 200,
    width: "32%",
    paddingRight: 6,
  },
  tdPartyWebDesktop: {
    fontSize: 9,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
    fontStyle: "italic",
  },
  tdPartyHintWebDesktop: {
    fontSize: 7,
    color: Theme.textMuted,
    marginTop: 1,
    fontWeight: "500",
    fontStyle: "italic",
  },
  tdAmountWebDesktop: {
    width: "100%",
    textAlign: "right" as const,
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
  },
  tdSales: { width: 80, textAlign: "right" as const },
  tdRight: { width: 72, textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  emptyRow: { paddingVertical: 24, alignItems: "center" },
  emptyRowText: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  cashSection: { marginBottom: 24 },
  sharedSection: { marginBottom: 24 },
  sharedSectionWeb: { width: "100%", alignSelf: "stretch" },
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
