import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { DetailPageLayout, DetailSection } from "@/components/DetailPageLayout";
import { FinanceFAB } from "@/components/FinanceFAB";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  computeDriverCommissionForTrip,
  getTransactionsByOrganizationAndDriver,
  LedgerReportModal,
  type LedgerRow,
} from "@/features/finance";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import {
  buildMonthlyDriverStatement,
  type DriverLedgerEntryForStatement,
  type TripForStatement,
} from "@/features/finance/aggregation/driverMonthlyStatement";
import {
  averageScore,
  getRatingsForDriver,
  type RatingRow,
} from "@/features/ratings";
import {
  getTripDisplayNumber,
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  getAvatarUriForSeed,
} from "@/constants/DriverLevels";
import {
  canAccessFinance,
  getCapabilitiesFromProfile,
} from "@/lib/capabilities";
import {
  formatINR,
  formatIndianVehicleNumber,
  formatLedgerAmount,
  formatLedgerDate,
} from "@/lib/format";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  getSalaryRequestsByDriverIds,
  updateSalaryRequestStatus,
  type SalaryRequestRow,
} from "@/services/salaryRequestsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  attachDriverByContact,
  getDriverById,
  getDriverProfileDisplay,
  getLatestDriverInviteTermsByUser,
  getDriverInviteSentStatus,
  getDriverLedgerByDriver,
  getDriverOffersByOrganization,
  getDriverSignupMatchStatus,
  resetDriverSignupInvite,
  sendDriverSignupMatchInvite,
  updateDriver,
  type DriverRow,
  type DriverSignupMatchStatus
} from "../services/drivers.service";

/** Latest payment date for a trip from ledger. */
function getLatestPaymentDateForTrip(
  tripId: string,
  txs: LedgerRow[] | null | undefined,
): string | null {
  if (!txs || !tripId) return null;
  const normId = (id: string | null | undefined) =>
    id == null ? "" : String(id).trim().toLowerCase();
  const key = normId(tripId);
  const dates = txs
    .filter((tx) => normId(tx.trip_id) === key)
    .map((tx) => (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10))
    .filter((s) => s.length === 10);
  if (dates.length === 0) return null;
  dates.sort();
  return dates[dates.length - 1];
}

/** Aging label from date (YYYY-MM-DD). */
function getAgingLabel(
  iso: string | null | undefined,
  dueAmount?: number,
): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    const entry = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    entry.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - entry.getTime();
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (days < 0) return `In ${-days} days`;
    if (days === 0)
      return dueAmount != null && dueAmount > 0 ? "Due today" : "Today";
    if (days === 1)
      return dueAmount != null && dueAmount > 0 ? "1 day overdue" : "1 day ago";
    if (dueAmount != null && dueAmount > 0 && days <= 90)
      return `${days} days overdue`;
    if (dueAmount != null && dueAmount > 0 && days > 90)
      return `${Math.floor(days / 30)} mo overdue`;
    if (days <= 30) return `${days} days ago`;
    if (days <= 365) return `${Math.floor(days / 30)} mo ago`;
    return `${Math.floor(days / 365)} yr ago`;
  } catch {
    return "—";
  }
}

function formatLedgerDateShort(s: string): string {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m} ${y}`;
}

function getClientInitials(name: string | null | undefined): string {
  const n = (name ?? "").trim().toUpperCase();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.slice(0, 2);
  return n.slice(0, 2);
}

function formatDayMonUpper(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  const months =
    "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  if (!y || !m || !day) return "—";
  return `${day} ${months[m - 1] ?? ""}`.trim();
}

type TripsDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "all"
  | "custom";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    23,
    59,
    59,
    999,
  );
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  return startOfLocalDay(x);
}

function startOfMonthLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseTripFilterDate(iso: string | undefined): Date | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

function tripMatchesDatePreset(
  dateIso: string | undefined,
  preset: TripsDatePreset,
  customFrom: string | null,
  customTo: string | null,
  now: Date = new Date(),
): boolean {
  if (preset === "all") return true;
  const tripD = parseTripFilterDate(dateIso);
  if (!tripD) return false;
  const t0 = startOfLocalDay(now);
  if (preset === "today") {
    return tripD >= t0 && tripD <= endOfLocalDay(now);
  }
  if (preset === "yesterday") {
    const y = new Date(t0);
    y.setDate(y.getDate() - 1);
    return tripD >= startOfLocalDay(y) && tripD <= endOfLocalDay(y);
  }
  if (preset === "this_week") {
    const wStart = startOfWeekMonday(now);
    return tripD >= wStart && tripD <= endOfLocalDay(now);
  }
  if (preset === "this_month") {
    const mStart = startOfMonthLocal(now);
    return tripD >= mStart && tripD <= endOfLocalDay(now);
  }
  if (preset === "custom" && customFrom && customTo) {
    const from = parseTripFilterDate(customFrom);
    const to = parseTripFilterDate(customTo);
    if (!from || !to) return true;
    return tripD >= startOfLocalDay(from) && tripD <= endOfLocalDay(to);
  }
  return true;
}

function getDriverFallbackSeed(driverId: string): string {
  const value = (driverId ?? "").trim() || "driver";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash + value.charCodeAt(i)) % 10;
  }
  return `driver-${hash + 1}`;
}

/** Same labels as finance tab (Treasury DRIVERS) for consistency. */
function getSalaryRequestTypeLabel(
  t: (k: string) => string,
  requestType: string,
): string {
  return requestType === "monthly"
    ? t("monthlySalary")
    : requestType === "advance"
      ? t("advance")
      : "Trip-based";
}

export interface DriverDetailScreenProps {
  driverId: string;
  onBack: () => void;
  autoOpenProfile?: boolean;
}

export default function DriverDetailScreen({
  driverId,
  onBack,
  autoOpenProfile,
}: DriverDetailScreenProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const router = useRouter();
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
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [dismissingMatch, setDismissingMatch] = useState(false);
  const [signupMatch, setSignupMatch] = useState<DriverSignupMatchStatus | null>(null);
  const [matchInviteStatus, setMatchInviteStatus] = useState<string | null>(null);
  const [historicalInviteOffer, setHistoricalInviteOffer] = useState<{
    payableAmount: number | null;
    commissionPercent: number | null;
    commissionPerKm: number | null;
  } | null>(null);
  const [driverRatings, setDriverRatings] = useState<RatingRow[]>([]);
  const [driverRequests, setDriverRequests] = useState<SalaryRequestRow[]>([]);
  const [driverOffer, setDriverOffer] = useState<{
    payableAmount: number | null;
    commissionPercent: number | null;
    commissionPerKm: number | null;
  } | null>(null);
  const [driverLedgerEntries, setDriverLedgerEntries] = useState<
    DriverLedgerEntryForStatement[]
  >([]);
  const [driverTransactions, setDriverTransactions] = useState<LedgerRow[]>([]);
  const [driverDetailTab, setDriverDetailTab] = useState<
    "trips" | "ledger" | "statement"
  >("trips");
  const [tripsDatePreset, setTripsDatePreset] =
    useState<TripsDatePreset>("all");
  const [tripsCustomFrom, setTripsCustomFrom] = useState<string | null>(null);
  const [tripsCustomTo, setTripsCustomTo] = useState<string | null>(null);
  const [tripsDateRangeModalVisible, setTripsDateRangeModalVisible] =
    useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 1024;
  const heroDecorProgress = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (autoOpenProfile) setShowProfileModal(true);
  }, [autoOpenProfile]);

  const load = useCallback(() => {
    if (!driverId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    Promise.all([
      getDriverById(orgId, driverId),
      getTripsByOrganization(orgId),
      getTripsWhereOrgIsSupplier(orgId),
      getRatingsForDriver(driverId),
      getSalaryRequestsByDriverIds([driverId]),
      getDriverOffersByOrganization(orgId),
      getDriverLedgerByDriver(driverId),
      getTransactionsByOrganizationAndDriver(orgId, driverId),
      getDriverSignupMatchStatus(driverId),
    ])
      .then(
        ([
          res,
          ownerRes,
          supplierRes,
          ratingsRes,
          reqsRes,
          offersRes,
          ledgerRes,
          txsRes,
          signupMatchRes,
        ]) => {
          const driverRow = res.error ? null : (res.driver ?? null);
          if (res.error) {
            setError(res.error.message);
            setDriver(null);
          } else {
            setDriver(driverRow);
          }
          const ownerTrips = ownerRes.error ? [] : (ownerRes.trips ?? []);
          const supplierTrips = supplierRes.error ? [] : (supplierRes.trips ?? []);
          const byId = new Map(ownerTrips.map((t) => [t.id, t]));
          for (const t of supplierTrips) if (!byId.has(t.id)) byId.set(t.id, t);
          const allTrips = Array.from(byId.values());
          const driver = driverRow;
          const txs = txsRes.error ? [] : (txsRes.transactions ?? []);
          const tripIdsFromDriverTx = new Set(
            txs
              .filter(
                (tx) =>
                  tx.contact_type === "driver" &&
                  tx.contact_id != null &&
                  String(tx.contact_id).trim() === String(driverId).trim() &&
                  tx.trip_id != null,
              )
              .map((tx) => String(tx.trip_id).trim().toLowerCase()),
          );
          const tripMatchesDriver = (t: TripRow) => {
            if (t.driver_id === driverId) return true;
            if (tripIdsFromDriverTx.has(String(t.id).trim().toLowerCase()))
              return true;
            if (!driver) return false;
            const displayName = (t.driver_display_name ?? "").trim();
            if (!displayName) return false;
            const nameMatch =
              (driver.name ?? "").trim().toLowerCase() === displayName.toLowerCase();
            const phoneNorm = (p: string) =>
              (p ?? "").replace(/\s/g, "").replace(/\D/g, "");
            const phoneMatch =
              (driver.phone ?? "").trim() !== "" &&
              phoneNorm(displayName).length >= 10 &&
              phoneNorm(driver.phone ?? "") === phoneNorm(displayName);
            return nameMatch || phoneMatch;
          };
          setTrips(allTrips.filter(tripMatchesDriver));
          setDriverRatings(ratingsRes.error ? [] : (ratingsRes.ratings ?? []));
          setDriverRequests(
            reqsRes.error
              ? []
              : (reqsRes.requests ?? []).filter((r) => r.status === "pending"),
          );
          const offers = offersRes.error
            ? {}
            : (offersRes.offersByDriverId ?? {});
          const offer = offers[driverId];
          setDriverOffer(
            offer
              ? {
                  payableAmount: offer.payableAmount ?? null,
                  commissionPercent: offer.commissionPercent ?? null,
                  commissionPerKm: offer.commissionPerKm ?? null,
                }
              : null,
          );
          setDriverLedgerEntries(
            ledgerRes.error
              ? []
              : (ledgerRes.entries ?? []).map((e) => ({
                  id: e.id,
                  driver_id: e.driver_id,
                  trip_id: e.trip_id,
                  type: e.type,
                  amount: e.amount,
                  created_at: e.created_at,
                  description: e.description ?? null,
                })),
          );
          setDriverTransactions(
            txsRes.error ? [] : (txsRes.transactions ?? []),
          );
          setSignupMatch(signupMatchRes.error ? null : (signupMatchRes.match ?? null));
        },
      )
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [driverId, currentOrganization?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!signupMatch?.matched_user_id || !currentOrganization?.id) {
      setMatchInviteStatus(null);
      setHistoricalInviteOffer(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      getDriverInviteSentStatus(
        currentOrganization.id,
        signupMatch.matched_user_id,
      ),
      getLatestDriverInviteTermsByUser(
        currentOrganization.id,
        signupMatch.matched_user_id,
      ),
    ]).then(([statusRes, termsRes]) => {
      if (cancelled) return;
      setMatchInviteStatus(statusRes.status);
      setHistoricalInviteOffer(termsRes.offer);
    });
    return () => {
      cancelled = true;
    };
  }, [signupMatch?.matched_user_id, currentOrganization?.id]);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!driver?.id) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }

      let avatarUrl = (driver.avatar_url ?? "").trim();
      let avatarSeed = (driver.avatar_seed ?? "").trim();

      if (!avatarUrl && !avatarSeed) {
        const { profile } = await getDriverProfileDisplay(driver.id);
        avatarUrl = (profile?.avatarUrl ?? "").trim();
        avatarSeed = (profile?.avatarSeed ?? "").trim();
      }

      if (!mounted) return;

      if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
        setProfileAvatarUri(avatarUrl);
        return;
      }

      if (avatarUrl) {
        const signed = await getSignedAvatarUrl(avatarUrl);
        if (!mounted) return;
        if (signed) {
          setProfileAvatarUri(signed);
          return;
        }
      }

      if (avatarSeed) {
        setProfileAvatarUri(getAvatarUriForSeed(avatarSeed));
        return;
      }

      // Match network page behavior: stable fallback based on driver id.
      setProfileAvatarUri(getAvatarUriForSeed(getDriverFallbackSeed(driver.id)));
    };

    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [driver?.id, driver?.avatar_url, driver?.avatar_seed]);

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

  const driverRatingAvg = useMemo(
    () => averageScore(driverRatings),
    [driverRatings],
  );

  const entityPaid = useMemo(() =>
    driverTransactions.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0),
  [driverTransactions]);
  const entityPending = useMemo(() =>
    driverRequests.reduce((s, r) => s + Number(r.amount ?? 0), 0),
  [driverRequests]);
  const totalDriverEarnings = useMemo(
    () => entityPaid + entityPending,
    [entityPaid, entityPending],
  );
  const settlementHealth = useMemo(
    () =>
      totalDriverEarnings > 0
        ? Math.round((entityPaid / totalDriverEarnings) * 100)
        : 0,
    [entityPaid, totalDriverEarnings],
  );

  const sortedDriverLedger = useMemo(
    () =>
      [...driverTransactions].sort((a, b) => {
        const da = a.transaction_date ?? a.created_at ?? "";
        const db = b.transaction_date ?? b.created_at ?? "";
        return db.localeCompare(da);
      }),
    [driverTransactions],
  );

  const ledgerRows = useMemo(() => {
    const normId = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim();
    const paidByTripId: Record<string, number> = {};
    for (const t of trips) paidByTripId[normId(t.id)] = 0;
    const txnCountByTripId: Record<string, number> = {};
    const lastTxnIsoByTripId: Record<string, string> = {};
    for (const tx of driverTransactions) {
      const txTripKey = normId(tx.trip_id);
      if (
        tx.contact_type === "driver" &&
        tx.contact_id != null &&
        normId(tx.contact_id) === normId(driverId) &&
        txTripKey !== "" &&
        txTripKey in paidByTripId
      ) {
        paidByTripId[txTripKey] =
          (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
      }
      if (
        tx.contact_type === "driver" &&
        tx.contact_id != null &&
        normId(tx.contact_id) === normId(driverId) &&
        txTripKey !== ""
      ) {
        txnCountByTripId[txTripKey] = (txnCountByTripId[txTripKey] ?? 0) + 1;
        const d = (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10);
        if (d.length === 10) {
          const prev = lastTxnIsoByTripId[txTripKey];
          if (!prev || d > prev) lastTxnIsoByTripId[txTripKey] = d;
        }
      }
    }
    const offer = driverOffer
      ? {
          payableAmount: driverOffer.payableAmount ?? null,
          commissionPercent: driverOffer.commissionPercent ?? null,
          commissionPerKm: driverOffer.commissionPerKm ?? null,
        }
      : null;
    const tripRows = trips.map((t) => {
      const tid = normId(t.id);
      const commission = computeDriverCommissionForTrip(
        {
          ...t,
          client_price: t.client_price ?? null,
          distance: t.distance ?? null,
        },
        offer ?? undefined,
      );
      const paid = paidByTripId[tid] ?? 0;
      const due = Math.max(0, commission - paid);
      const tripDateIso =
        (
          t.pickup_date ??
          t.created_at ??
          getLatestPaymentDateForTrip(t.id, driverTransactions) ??
          ""
        )
          .toString()
          .slice(0, 10) || null;
      const filterDateIso =
        (t.pickup_date ?? t.created_at ?? "").toString().slice(0, 10) ||
        undefined;
      const route =
        t.pickup_area?.trim() && t.drop_location?.trim()
          ? `${t.pickup_area.trim()} → ${t.drop_location.trim()}`
          : t.drop_location?.trim() || "—";
      const dateTimeIso = (t.pickup_date ?? t.created_at ?? "").toString();
      /** Show assigned vehicle for asset-based (own fleet) or when vehicle is assigned. */
      const isAssetOrAssignedVehicle =
        !t.supplier_id ||
        t.vehicle_id != null ||
        (t.vehicle_display_number ?? "").trim() !== "";
      const vehicleNum = (t.vehicle_display_number ?? "").trim();
      const vehicleDisplay =
        isAssetOrAssignedVehicle && vehicleNum
          ? formatIndianVehicleNumber(vehicleNum)
          : null;
      const ledgerLast = lastTxnIsoByTripId[tid];
      const paymentLast = getLatestPaymentDateForTrip(t.id, driverTransactions);
      const lastIso =
        ledgerLast && paymentLast
          ? ledgerLast > paymentLast
            ? ledgerLast
            : paymentLast
          : ledgerLast ?? paymentLast ?? null;
      return {
        id: t.id,
        missionId: getTripDisplayNumber(t),
        dest: route,
        vehicleDisplay: vehicleDisplay ?? undefined,
        col1: commission,
        col2: paid,
        col3: due,
        tripDate: tripDateIso ? formatLedgerDateShort(tripDateIso) : "—",
        tripDateIso: dateTimeIso || undefined,
        agingLabel: getAgingLabel(tripDateIso, due),
        filterDateIso,
        clientName: (t.client_name ?? "").trim() || "—",
        clientInitials: getClientInitials(t.client_name),
        clientRev: Number(t.client_price ?? 0),
        margin: Number(t.margin ?? 0),
        txnCount: txnCountByTripId[tid] ?? 0,
        lastTxnShort: formatDayMonUpper(lastIso),
      };
    });
    return tripRows;
  }, [trips, driverTransactions, driverId, driverOffer]);

  const filteredLedgerRows = useMemo(
    () =>
      ledgerRows.filter((r) =>
        tripMatchesDatePreset(
          r.filterDateIso,
          tripsDatePreset,
          tripsCustomFrom,
          tripsCustomTo,
        ),
      ),
    [
      ledgerRows,
      tripsDatePreset,
      tripsCustomFrom,
      tripsCustomTo,
    ],
  );

  const tripsScorecard = useMemo(() => {
    const contractValue = filteredLedgerRows.reduce(
      (s, r) => s + Number(r.col1 ?? 0),
      0,
    );
    const paidSum = filteredLedgerRows.reduce(
      (s, r) => s + Number(r.col2 ?? 0),
      0,
    );
    const dueSum = filteredLedgerRows.reduce(
      (s, r) => s + Number(r.col3 ?? 0),
      0,
    );
    const health =
      contractValue > 0
        ? Math.min(100, Math.round((paidSum / contractValue) * 100))
        : 0;
    return { contractValue, paidSum, dueSum, health };
  }, [filteredLedgerRows]);

  /** Trip details map for Cash Flow list. */
  const driverTripDetailsMap = useMemo(() => {
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

  const monthlyStatement = useMemo(() => {
    const tripsForStatement: TripForStatement[] = trips.map((t) => ({
      ...t,
      missionId: getTripDisplayNumber(t),
    }));
    const offer = driverOffer
      ? {
          payableAmount: driverOffer.payableAmount ?? null,
          commissionPercent: driverOffer.commissionPercent ?? null,
          commissionPerKm: driverOffer.commissionPerKm ?? null,
        }
      : null;
    return buildMonthlyDriverStatement(
      driverId,
      tripsForStatement,
      driverLedgerEntries,
      offer,
      { maxMonths: 12 },
    );
  }, [driverId, trips, driverLedgerEntries, driverOffer]);

  const monthlyRowsReversed = useMemo(
    () =>
      monthlyStatement?.rows != null
        ? [...monthlyStatement.rows].reverse()
        : [],
    [monthlyStatement],
  );
  const [expandedStatementMonthKey, setExpandedStatementMonthKey] = useState<
    string | null
  >(monthlyRowsReversed.length > 0 ? monthlyRowsReversed[0].monthKey : null);
  const primaryStatementRow =
    expandedStatementMonthKey && monthlyStatement
      ? monthlyStatement.rows.find((r) => r.monthKey === expandedStatementMonthKey) ??
        null
      : null;
  const primaryStatementDetail =
    primaryStatementRow && monthlyStatement
      ? monthlyStatement.detailsByMonth[primaryStatementRow.monthKey]
      : null;

  if (loading) {
    return <CenteredLoadingView message={t("loadingDriver")} />;
  }

  if (error || !driver) {
    return (
      <DetailPageLayout title={t("driver")} onBack={onBack}>
        <Text style={styles.errorText}>{error || t("driverNotFound")}</Text>
      </DetailPageLayout>
    );
  }

  const leftAtFormatted =
    driver.left_at != null && driver.left_at !== ""
      ? (() => {
          try {
            const date = new Date(driver.left_at);
            return isNaN(date.getTime())
              ? driver.left_at
              : date.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
          } catch {
            return driver.left_at;
          }
        })()
      : null;

  const statusLabel =
    leftAtFormatted != null
      ? `Disconnected · Left on ${leftAtFormatted}`
      : driver.status === "on_trip"
        ? t("onTrip")
        : driver.status === "online"
          ? t("online")
          : t("offline");

  const canLink =
    !driver.user_id &&
    (driver.phone?.trim() || driver.email?.trim()) &&
    leftAtFormatted == null;
  const normalizedMatchInviteStatus = (matchInviteStatus ?? "").toLowerCase();
  const rejectedInviteForMatch = normalizedMatchInviteStatus === "rejected";
  const canSendMatchedInvite =
    canLink &&
    (signupMatch?.state === "pending_owner_action" ||
      signupMatch?.state === "declined" ||
      signupMatch?.state === "ignored" ||
      signupMatch?.state === "expired" ||
      (signupMatch?.state === "invite_sent" && rejectedInviteForMatch));
  const inviteAlreadySentForMatch =
    canLink && signupMatch?.state === "invite_sent" && !rejectedInviteForMatch;
  const resetInvitationText =
    t("resetInvitation") === "resetInvitation"
      ? "Reset invitation"
      : t("resetInvitation");

  const handleLinkToAccount = () => {
    if (!driver.phone?.trim() && !driver.email?.trim()) return;
    Alert.alert(t("linkToAppAccount"), t("linkToAppAccountMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("link"),
        onPress: async () => {
          setLinking(true);
          const { error: linkError, driver: updated } =
            await attachDriverByContact(driver.id, {
              phone: driver.phone?.trim() || null,
              email: driver.email?.trim() || null,
            });
          setLinking(false);
          if (linkError) {
            Alert.alert(t("linkFailed"), linkError.message);
            return;
          }
          if (updated) setDriver(updated);
        },
      },
    ]);
  };

  const handleSendMatchedInvite = async () => {
    Alert.alert(
      t("driverSignupSendInviteTitle"),
      t("driverSignupSendInviteMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("sendInvitation"),
          onPress: async () => {
            setInviting(true);
            const inviteOffer = {
              payableAmount:
                driverOffer?.payableAmount ??
                driver.payable_amount ??
                historicalInviteOffer?.payableAmount ??
                null,
              commissionPercent:
                driverOffer?.commissionPercent ??
                driver.commission_percent ??
                historicalInviteOffer?.commissionPercent ??
                null,
              commissionPerKm:
                driverOffer?.commissionPerKm ??
                driver.commission_per_km ??
                historicalInviteOffer?.commissionPerKm ??
                null,
            };
            if (
              currentOrganization?.id &&
              (inviteOffer.payableAmount != null ||
                inviteOffer.commissionPercent != null ||
                inviteOffer.commissionPerKm != null) &&
              (driver.payable_amount == null ||
                driver.commission_percent == null ||
                driver.commission_per_km == null)
            ) {
              await updateDriver(currentOrganization.id, driver.id, {
                payable_amount: inviteOffer.payableAmount,
                commission_percent: inviteOffer.commissionPercent,
                commission_per_km: inviteOffer.commissionPerKm,
              });
            }
            let { error: inviteError, status, already_exists } = await sendDriverSignupMatchInvite(
              driver.id,
              inviteOffer,
            );
            if (inviteError) {
              setInviting(false);
              Alert.alert(t("linkFailed"), inviteError.message);
              return;
            }
            const normalizedStatus = (status ?? "").toLowerCase();
            if (already_exists && normalizedStatus === "rejected") {
              const { error: resetErr } = await resetDriverSignupInvite(driver.id);
              if (resetErr) {
                setInviting(false);
                Alert.alert(
                  t("invitationAlreadySentTitle") === "invitationAlreadySentTitle"
                    ? "Invitation update needed"
                    : t("invitationAlreadySentTitle"),
                  t("invitationRejectedNeedsResetBody") ===
                    "invitationRejectedNeedsResetBody"
                    ? "Driver rejected the previous invitation. Please try again in a moment."
                    : t("invitationRejectedNeedsResetBody"),
                );
                load();
                return;
              }
              ({ error: inviteError, status, already_exists } =
                await sendDriverSignupMatchInvite(driver.id, inviteOffer));
              if (inviteError) {
                setInviting(false);
                Alert.alert(t("linkFailed"), inviteError.message);
                load();
                return;
              }
            }
            setInviting(false);
            Alert.alert(
              t("invitationSentTitle"),
              status
                ? `${t("invitationSentBody")}\n\n${t("status")}: ${status}`
                : t("invitationSentBody"),
            );
            load();
          },
        },
      ],
    );
  };

  const handleResetInvitation = async () => {
    setDismissingMatch(true);
    const { error: resetErr } = await resetDriverSignupInvite(driver.id);
    setDismissingMatch(false);
    if (resetErr) {
      Alert.alert(t("linkFailed"), resetErr.message);
      return;
    }
    Alert.alert(
      t("invitationResetTitle") === "invitationResetTitle"
        ? "Invitation reset"
        : t("invitationResetTitle"),
      t("invitationResetBody") === "invitationResetBody"
        ? "Invitation has been reset. You can send a new invitation now."
        : t("invitationResetBody")
    );
    load();
  };

  const lockedPartyName = (driver.name || t("driver")).trim() || t("driver");

  function formatRatingDate(s: string) {
    if (!s) return "—";
    const d = s.slice(0, 10);
    const [y, m, day] = d.split("-");
    const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
    return `${day} ${months[Number(m) - 1]} ${y}`;
  }

  const hasPendingSalaryRequests = driverRequests.length > 0;
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
    <DetailPageLayout
      title={driver.name ?? t("driver")}
      titleSubline={
        <View style={styles.headerTitleSubwrap}>
          <Text style={styles.entityHeaderSubtitle}>DEEP ENTITY INTEL</Text>
          {driverRatingAvg != null && driverRatingAvg > 0 ? (
            <Text style={styles.headerRatingText}>
              {driverRatingAvg.toFixed(1)} ★
              {driverRatings.length > 0 ? ` (${driverRatings.length})` : ""}
            </Text>
          ) : null}
        </View>
      }
      onBack={onBack}
      rightAction={
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.publicProfileHeaderBtn}
            onPress={() => router.push(`/public-profile/driver/${driverId}`)}
            activeOpacity={0.8}
            accessibilityLabel="View public profile"
          >
            <FontAwesome name="id-card-o" size={15} color={Theme.textOnPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileHeaderBtn}
            onPress={() => setShowProfileModal(true)}
            activeOpacity={0.8}
            accessibilityLabel={t("profile")}
            accessibilityHint={
              hasPendingSalaryRequests
                ? "Open profile with pending salary requests"
                : undefined
            }
          >
            {profileAvatarUri ? (
              <Image
                source={{ uri: profileAvatarUri }}
                style={styles.profileHeaderAvatarImage}
              />
            ) : (
              <FontAwesome name="user" size={16} color={Theme.textOnPrimary} />
            )}
            {hasPendingSalaryRequests ? (
              <View style={styles.headerProfileBadge} />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadHeaderBtn}
            onPress={() => setShowReportModal(true)}
            activeOpacity={0.8}
            accessibilityLabel={t("ledgerReport")}
          >
            <FontAwesome
              name="cloud-download"
              size={18}
              color={Theme.textOnPrimary}
            />
          </TouchableOpacity>
        </View>
      }
      fab={
        canAddTransaction ? (
          <View
            style={[
              styles.fabWrap,
              { bottom: Layout.fabBottomOffset + insets.bottom },
            ]}
          >
            <FinanceFAB
              onPress={() => {
                const params = new URLSearchParams();
                params.set("entityType", "DRIVER");
                params.set("entityId", driverId);
                params.set("partyName", lockedPartyName);
                if (entityPending > 0) {
                  params.set("dueAmountOut", String(entityPending));
                }
                router.push(
                  `/(modals)/ledger-sync?${params.toString()}` as const,
                );
              }}
              accessibilityLabel={t("addTransaction")}
              icon="receipt-text"
            />
          </View>
        ) : undefined
      }
      onRefresh={() => {
        isRefreshingRef.current = true;
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {leftAtFormatted != null && (
        <View style={styles.disconnectedBanner}>
          <Text style={styles.disconnectedBannerText}>
            Disconnected from fleet · Left on {leftAtFormatted}
          </Text>
        </View>
      )}

      <View style={styles.scorecard}>
        {isWebDesktop ? (
          <Animated.View style={[styles.scorecardDecorIconWrap, heroDecorAnimatedStyle]}>
            <FontAwesome name="book" size={120} color={Theme.textOnDark} style={styles.scorecardDecorIcon} />
          </Animated.View>
        ) : null}
        <View style={styles.scorecardTop}>
          <View style={styles.scorecardLeft}>
            <Text style={styles.scorecardLabel}>FINANCIAL OVERVIEW</Text>
            {driverDetailTab === "trips" ? (
              <>
                <Text style={styles.scorecardSalesLabel}>
                  {t("driverScorecardContractValue")}
                </Text>
                <Text style={styles.scorecardAmount}>
                  {formatINR(tripsScorecard.contractValue)}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.scorecardSalesLabel}>DRIVER PAYMENTS</Text>
                <Text style={styles.scorecardAmount}>
                  {formatINR(totalDriverEarnings)}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.scorecardGrid}>
          <View>
            <Text style={styles.scorecardGridLabelPaid}>PAID</Text>
            <Text style={styles.scorecardGridPaid}>
              {formatINR(
                driverDetailTab === "trips"
                  ? tripsScorecard.paidSum
                  : entityPaid,
              )}
            </Text>
          </View>
          <View style={styles.scorecardGridRight}>
            <Text style={styles.scorecardGridLabelDue}>
              {driverDetailTab === "trips" ? t("due") : t("toPay")}
            </Text>
            <Text style={styles.scorecardGridDue}>
              {formatINR(
                driverDetailTab === "trips"
                  ? tripsScorecard.dueSum
                  : entityPending,
              )}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            driverDetailTab === "trips" && styles.tabItemActive,
          ]}
          onPress={() => setDriverDetailTab("trips")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabItemText,
              driverDetailTab === "trips" && styles.tabItemTextActive,
            ]}
          >
            {t("driverDetailTabTripsTitle")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            driverDetailTab === "ledger" && styles.tabItemActive,
          ]}
          onPress={() => setDriverDetailTab("ledger")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabItemText,
              driverDetailTab === "ledger" && styles.tabItemTextActive,
            ]}
          >
            {t("driverDetailTabCashFlow")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            driverDetailTab === "statement" && styles.tabItemActive,
          ]}
          onPress={() => setDriverDetailTab("statement")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabItemText,
              driverDetailTab === "statement" && styles.tabItemTextActive,
            ]}
          >
            {t("statement")}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View
          style={[
            styles.profileModalWrap,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.profileModalHeader}>
            <Text style={styles.profileModalTitle}>Driver Profile</Text>
            <TouchableOpacity
              onPress={() => setShowProfileModal(false)}
              style={styles.profileModalCloseBtn}
              hitSlop={12}
              accessibilityLabel={t("close") ?? "Close"}
            >
              <FontAwesome name="times" size={18} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.profileModalScroll}
            contentContainerStyle={[
              styles.profileModalContent,
              { paddingBottom: 24 + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.profileCard}>
              <View style={styles.profileCardTop}>
                <View style={styles.profileAvatarWrap}>
                  {profileAvatarUri ? (
                    <Image
                      source={{ uri: profileAvatarUri }}
                      style={styles.profileAvatarImage}
                    />
                  ) : (
                    <FontAwesome name="user" size={30} color={Theme.primary} />
                  )}
                </View>
                <View style={styles.profileCardTopText}>
                  <Text style={styles.profileEntityName} numberOfLines={2}>
                    {driver.name ?? "—"}
                  </Text>
                  {driver.phone?.trim() ? (
                    <Text style={styles.profileEntitySub} numberOfLines={1}>
                      {driver.phone}
                    </Text>
                  ) : driver.email?.trim() ? (
                    <Text style={styles.profileEntitySub} numberOfLines={1}>
                      {driver.email}
                    </Text>
                  ) : null}
                  <View style={styles.profileBadges}>
                    {driver.user_id ? (
                      <View style={styles.profileBadge}>
                        <Text style={styles.profileBadgeText}>Verified</Text>
                      </View>
                    ) : (
                      <View style={styles.profileBadge}>
                        <Text style={styles.profileBadgeText} numberOfLines={1}>
                          {statusLabel}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.profileBadge, styles.profileBadgeCore]}>
                      <Text style={styles.profileBadgeCoreText}>Core Node</Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.profileGrid}>
                <View style={styles.profileGridItem}>
                  <Text style={styles.profileGridLabel}>Payments</Text>
                  <Text style={styles.profileGridValue} numberOfLines={1}>
                    {formatINR(totalDriverEarnings)}
                  </Text>
                </View>
                <View style={styles.profileGridItem}>
                  <Text style={styles.profileGridLabel}>Paid</Text>
                  <Text style={styles.profileGridValue} numberOfLines={1}>
                    {formatINR(entityPaid)}
                  </Text>
                </View>
                <View style={styles.profileGridItem}>
                  <Text style={styles.profileGridLabel}>To pay</Text>
                  <Text style={styles.profileGridValue} numberOfLines={1}>
                    {formatINR(entityPending)}
                  </Text>
                </View>
              </View>
              <View style={styles.profileHealthRow}>
                <Text style={styles.profileHealthLabel}>Node health</Text>
                <View style={styles.profileHealthPill}>
                  <Text style={styles.profileHealthValue}>
                    {settlementHealth}%
                  </Text>
                </View>
              </View>
              <Text style={styles.profileSectionTitle}>Contact protocol</Text>
              <View style={styles.profileContactRow}>
                <View style={styles.profileContactIcon}>
                  <FontAwesome name="phone" size={14} color={Theme.textMuted} />
                </View>
                <View style={styles.profileContactText}>
                  <Text style={styles.profileContactLabel}>Phone Registry</Text>
                  <Text style={styles.profileContactValue}>
                    {driver.phone ?? "—"}
                  </Text>
                </View>
              </View>
              <View style={styles.profileContactRow}>
                <View style={styles.profileContactIcon}>
                  <FontAwesome name="envelope" size={14} color={Theme.textMuted} />
                </View>
                <View style={styles.profileContactText}>
                  <Text style={styles.profileContactLabel}>Email link</Text>
                  <Text style={styles.profileContactValue}>
                    {driver.email ?? "—"}
                  </Text>
                </View>
              </View>
              {/* Show compensation section for all drivers (including tracking-only) */}
              {driverOffer || driver.tracking_only ? (
                <>
                  <Text style={styles.profileSectionTitle}>
                    Compensation terms
                  </Text>
                  <View style={styles.profileFiscalRow}>
                    <Text style={styles.profileFiscalLabel}>
                      Base Salary (Payable)
                    </Text>
                    <Text style={styles.profileFiscalValue}>
                      {driverOffer?.payableAmount != null &&
                      Number(driverOffer.payableAmount) > 0
                        ? `₹${Number(driverOffer.payableAmount).toLocaleString("en-IN")} / mo`
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.profileFiscalRow}>
                    <Text style={styles.profileFiscalLabel}>
                      Trip Commission
                    </Text>
                    <Text style={styles.profileFiscalValue}>
                      {driverOffer?.commissionPercent != null &&
                      Number(driverOffer.commissionPercent) > 0
                        ? `${driverOffer.commissionPercent}%`
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.profileFiscalRow}>
                    <Text style={styles.profileFiscalLabel}>Per-KM Rate</Text>
                    <Text style={styles.profileFiscalValue}>
                      {driverOffer?.commissionPerKm != null &&
                      Number(driverOffer.commissionPerKm) > 0
                        ? `₹${driverOffer.commissionPerKm} / km`
                        : "—"}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
            {driverRequests.length > 0 && (
              <>
                <Text style={styles.profileSectionTitle}>DRIVER REQUESTS</Text>
                <View style={styles.driverRequestCardsWrap}>
                {driverRequests.map((req) => {
                  const typeLabel = getSalaryRequestTypeLabel(
                    t,
                    req.request_type ?? "",
                  );
                  const dateStr = req.created_at
                    ? formatLedgerDate(req.created_at)
                    : "";
                  const metaLine = dateStr
                    ? `${typeLabel} · ${dateStr}`
                    : typeLabel;
                  return (
                    <View key={req.id} style={styles.driverRequestCard}>
                      <View style={styles.driverRequestCardInner}>
                        <View style={styles.driverRequestIconWrap}>
                          <FontAwesome
                            name="info-circle"
                            size={20}
                            color={Theme.primary}
                          />
                        </View>
                        <View style={styles.driverRequestCardBody}>
                          <Text style={styles.driverRequestCardLabel}>
                            DRIVER REQUEST
                          </Text>
                          <Text style={styles.driverRequestCardAmount}>
                            Needs ₹
                            {Number(req.amount).toLocaleString("en-IN", {
                              maximumFractionDigits: 0,
                            })}
                          </Text>
                          <Text
                            style={styles.driverRequestCardReason}
                            numberOfLines={1}
                          >
                            {metaLine}
                          </Text>
                          {req.note?.trim() ? (
                            <Text
                              style={[
                                styles.driverRequestCardReason,
                                { marginTop: 2 },
                              ]}
                              numberOfLines={2}
                            >
                              {req.note.trim()}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.driverRequestCardActions}>
                        <TouchableOpacity
                          style={[
                            styles.driverRequestBtn,
                            styles.driverRequestBtnPay,
                          ]}
                          onPress={() => {
                            setShowProfileModal(false);
                            const isTripBased =
                              req.request_type === "trip_based" &&
                              Array.isArray(req.trip_ids) &&
                              req.trip_ids.length > 0;
                            const q = new URLSearchParams({
                              entityType: "DRIVER",
                              entityId: req.driver_id,
                              partyName: lockedPartyName,
                              partyId: req.driver_id,
                              defaultType: "out",
                              salaryAmount: String(req.amount),
                              defaultDriverPaymentType: isTripBased ? "settlement" : "advance",
                              salaryRequestId: req.id,
                            });
                            if (isTripBased && req.trip_ids?.[0]) {
                              q.set("tripId", req.trip_ids[0]);
                            }
                            router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.driverRequestBtnPayText}>
                            Pay Now
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.driverRequestBtn,
                            styles.driverRequestBtnReject,
                          ]}
                          onPress={() => {
                            Alert.alert(
                              t("rejectRequest"),
                              `Reject this request for ₹${Number(req.amount).toLocaleString("en-IN")}?`,
                              [
                                { text: t("cancel"), style: "cancel" },
                                {
                                  text: t("reject"),
                                  style: "destructive",
                                  onPress: () => {
                                    updateSalaryRequestStatus(
                                      req.id,
                                      "rejected",
                                    ).then(({ error: e }) => {
                                      if (!e)
                                        setDriverRequests((prev) =>
                                          prev.filter((r) => r.id !== req.id),
                                        );
                                      else
                                        Alert.alert(t("rejectFailed"), e.message);
                                    });
                                  },
                                },
                              ],
                            );
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.driverRequestBtnRejectText}>
                            {t("reject")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                </View>
              </>
            )}

            {canLink && (
              <DetailSection title={t("account")}>
                <TouchableOpacity
                  style={[styles.linkBtn, linking && styles.linkBtnDisabled]}
                  onPress={canSendMatchedInvite ? handleSendMatchedInvite : handleLinkToAccount}
                  disabled={linking || inviting || dismissingMatch || Boolean(inviteAlreadySentForMatch)}
                >
                  <Text style={styles.linkBtnText}>
                    {inviteAlreadySentForMatch
                      ? t("invitationSentLabel")
                      : canSendMatchedInvite
                        ? (inviting ? t("sending") : t("sendInvitation"))
                        : (linking ? t("linking") : t("linkToAppAccount"))}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.linkHint}>
                  {inviteAlreadySentForMatch
                    ? t("invitationAlreadySentHint")
                    : canSendMatchedInvite
                      ? t("driverSignupReadyHint")
                      : t("linkHint")}
                </Text>
                {inviteAlreadySentForMatch ? (
                  <TouchableOpacity
                    onPress={handleResetInvitation}
                    disabled={dismissingMatch || inviting}
                    style={styles.dismissMatchBtn}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={resetInvitationText}
                  >
                    <Text style={styles.dismissMatchBtnText}>
                      {resetInvitationText}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </DetailSection>
            )}

            {driverRatings.length > 0 && (
              <View style={styles.driverRatingsSection}>
                <Text style={styles.profileSectionTitle}>RECENT RATINGS</Text>
                {driverRatings.map((r) => (
                  <View key={r.id} style={styles.driverRatingRow}>
                    <View style={styles.driverRatingIconWrap}>
                      <FontAwesome
                        name="star"
                        size={14}
                        color={Theme.driverGold}
                      />
                    </View>
                    <View style={styles.driverRatingBody}>
                      <Text style={styles.driverRatingScore}>
                        {r.score.toFixed(1)}{" "}
                        <Text style={styles.driverRatingScoreMax}>/ 5.0</Text>
                      </Text>
                      <Text style={styles.driverRatingDate}>
                        {r.created_at ? formatRatingDate(r.created_at) : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {driverDetailTab === "trips" && (
        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={[
            styles.tabScrollContent,
            styles.tabScrollContentTripsFull,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={styles.tripsTabInner}>
            <View style={styles.tripsFilterBar}>
              <ScrollView
                horizontal
                style={styles.tripsFilterScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tripsFilterChipsContent}
              >
                {(
                  [
                    { key: "today" as const, label: t("today") },
                    { key: "yesterday" as const, label: t("yesterdayTrips") },
                    { key: "this_week" as const, label: t("thisWeekTrips") },
                    { key: "this_month" as const, label: t("thisMonth") },
                    { key: "all" as const, label: t("all") },
                  ] as { key: TripsDatePreset; label: string }[]
                ).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.tripsFilterChip,
                      tripsDatePreset === key && styles.tripsFilterChipActive,
                    ]}
                    onPress={() => {
                      setTripsDatePreset(key);
                      if (key !== "custom") {
                        setTripsCustomFrom(null);
                        setTripsCustomTo(null);
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tripsFilterChipText,
                        tripsDatePreset === key &&
                          styles.tripsFilterChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.tripsFilterChip,
                    tripsDatePreset === "custom" &&
                      styles.tripsFilterChipActive,
                  ]}
                  onPress={() => {
                    setTripsDatePreset("custom");
                    setTripsDateRangeModalVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.tripsFilterChipText,
                      tripsDatePreset === "custom" &&
                        styles.tripsFilterChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {t("driverTripsFilterCustom")}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              <TouchableOpacity
                style={styles.tripsFilterCalendarBtn}
                onPress={() => {
                  setTripsDatePreset("custom");
                  setTripsDateRangeModalVisible(true);
                }}
                hitSlop={8}
                accessibilityLabel={t("driverTripsFilterCustom")}
              >
                <FontAwesome name="calendar" size={14} color={Theme.primary} />
              </TouchableOpacity>
            </View>

            {ledgerRows.length > 0 && filteredLedgerRows.length > 0 ? (
              <View style={styles.ledgerSummaryRowTripsFull}>
                <View style={styles.ledgerSummaryTripsPaidBlock}>
                  <Text style={styles.ledgerSummaryLabel}>{t("paid")}</Text>
                  <Text
                    style={[styles.ledgerSummaryAmount, styles.ledgerSummaryIn]}
                  >
                    {formatINR(
                      filteredLedgerRows.reduce(
                        (s, r) => s + Number(r.col2 ?? 0),
                        0,
                      ),
                    )}
                  </Text>
                </View>
                <View style={styles.ledgerSummaryTripsDueBlock}>
                  <Text style={styles.ledgerSummaryLabel}>{t("due")}</Text>
                  <Text
                    style={[
                      styles.ledgerSummaryAmount,
                      styles.ledgerSummaryOut,
                    ]}
                  >
                    {formatINR(
                      filteredLedgerRows.reduce(
                        (s, r) => s + Number(r.col3 ?? 0),
                        0,
                      ),
                    )}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.tripTableCard, styles.tripTableCardFullWidth]}>
              <View style={styles.driverTripsTableFull}>
                  <View style={styles.driverTripsHeaderRow}>
                    <Text style={styles.driverTripsThTrip} numberOfLines={1}>
                      {t("driverTripsColTrip")}
                    </Text>
                    <Text style={styles.driverTripsThClient} numberOfLines={1}>
                      {t("tripsHubColClient")}
                    </Text>
                    <Text style={styles.driverTripsThNum} numberOfLines={1}>
                      {t("driverTripsColClientRev")}
                    </Text>
                    <Text style={styles.driverTripsThNum} numberOfLines={1}>
                      {t("driverTripsColContract")}
                    </Text>
                    <Text style={styles.driverTripsThNum} numberOfLines={1}>
                      {t("driverTripsColPnL")}
                    </Text>
                    <Text style={styles.driverTripsThNum} numberOfLines={1}>
                      {t("paid")}
                    </Text>
                    <Text style={styles.driverTripsThNum} numberOfLines={1}>
                      {t("due")}
                    </Text>
                    <Text style={styles.driverTripsThTxn} numberOfLines={1}>
                      {t("tripsHubColTxns")}
                    </Text>
                    <Text style={styles.driverTripsThLast} numberOfLines={1}>
                      {t("driverTripsColLastTxn")}
                    </Text>
                  </View>
                  {ledgerRows.length === 0 ? (
                    <View
                      style={[
                        styles.driverTripsDataRow,
                        styles.driverTripsDataRowEmpty,
                      ]}
                    >
                      <Text
                        style={styles.driverTripsEmptyWide}
                        numberOfLines={2}
                      >
                        {t("noLedgerEntriesDriver")}
                      </Text>
                    </View>
                  ) : filteredLedgerRows.length === 0 ? (
                    <View
                      style={[
                        styles.driverTripsDataRow,
                        styles.driverTripsDataRowEmpty,
                      ]}
                    >
                      <Text
                        style={styles.driverTripsEmptyWide}
                        numberOfLines={2}
                      >
                        {t("driverTripsEmptyFilter")}
                      </Text>
                    </View>
                  ) : (
                    filteredLedgerRows.map((r) => {
                      const pl = Number(r.margin ?? 0);
                      const plStyle =
                        pl > 0
                          ? styles.tdGreen
                          : pl < 0
                            ? styles.tdRed
                            : styles.tdMuted;
                      return (
                        <Pressable
                          key={r.id}
                          style={({ pressed }) => [
                            styles.driverTripsDataRow,
                            pressed && styles.ledgerRowPressed,
                          ]}
                          onPress={() => {
                            const tripId = String(r.id ?? "").trim();
                            if (!tripId) return;
                            router.push(`/trip/${tripId}`);
                          }}
                        >
                          <View style={styles.driverTripsCellTrip}>
                            <Text
                              style={styles.driverTripsTripId}
                              numberOfLines={1}
                            >
                              {r.missionId ?? "—"}
                            </Text>
                            <Text
                              style={styles.driverTripsRoute}
                              numberOfLines={2}
                            >
                              {r.dest?.trim() || "—"}
                            </Text>
                          </View>
                          <View style={styles.driverTripsCellClient}>
                            <View style={styles.driverTripsClientAvatar}>
                              <Text style={styles.driverTripsClientAvatarText}>
                                {r.clientInitials}
                              </Text>
                            </View>
                            <Text
                              style={styles.driverTripsClientName}
                              numberOfLines={2}
                            >
                              {(r.clientName ?? "—").toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.driverTripsAmt} numberOfLines={1}>
                            {formatINR(r.clientRev)}
                          </Text>
                          <Text style={styles.driverTripsAmt} numberOfLines={1}>
                            {formatINR(r.col1)}
                          </Text>
                          <Text
                            style={[styles.driverTripsAmt, plStyle]}
                            numberOfLines={1}
                          >
                            {formatINR(pl)}
                          </Text>
                          <Text
                            style={[
                              styles.driverTripsAmt,
                              (r.col2 ?? 0) > 0 ? styles.tdGreen : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {(r.col2 ?? 0) > 0
                              ? formatLedgerAmount(r.col2)
                              : "—"}
                          </Text>
                          <Text
                            style={[
                              styles.driverTripsAmt,
                              (r.col3 ?? 0) > 0 ? styles.tdRed : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {(r.col3 ?? 0) > 0
                              ? formatLedgerAmount(r.col3)
                              : "—"}
                          </Text>
                          <Text
                            style={styles.driverTripsTxn}
                            numberOfLines={1}
                          >
                            {r.txnCount > 0 ? String(r.txnCount) : "—"}
                          </Text>
                          <Text
                            style={styles.driverTripsLastTxn}
                            numberOfLines={1}
                          >
                            {r.lastTxnShort}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>
            </View>
        </ScrollView>
      )}

      {driverDetailTab === "ledger" && (
        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={[
            styles.tabScrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <LedgerTransactionListView
              transactions={sortedDriverLedger}
              tripDetailsMap={driverTripDetailsMap}
              tripOptions={tripOptions}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
              driverRows={driver ? [driver] : []}
            />
          </View>
        </ScrollView>
      )}

      {driverDetailTab === "statement" && (
        <View
          style={[
            styles.tabScrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
        >
          <View style={styles.tableWrap}>
            <Text style={styles.sectionTitle}>MONTHLY SALARY STATEMENT</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thMonth]} numberOfLines={1}>
                  MONTH
                </Text>
                <Text style={[styles.th, styles.thCol]} numberOfLines={1}>
                  SALARY
                </Text>
                <Text style={[styles.th, styles.thCol]} numberOfLines={1}>
                  COMM.
                </Text>
                <Text style={[styles.th, styles.thColLast]} numberOfLines={1}>
                  PAID
                </Text>
              </View>
              {monthlyRowsReversed.length === 0 ? (
                <View style={styles.tableRow}>
                  <Text style={[styles.td, styles.tdMission]} numberOfLines={1}>
                    {t("noStatementDataYet")}
                  </Text>
                </View>
              ) : (
                monthlyRowsReversed.map((row) => {
                  const isExpanded =
                    expandedStatementMonthKey === row.monthKey;
                  return (
                    <TouchableOpacity
                      key={row.monthKey}
                      style={styles.statementMonthRow}
                      activeOpacity={0.8}
                      onPress={() =>
                        setExpandedStatementMonthKey((prev) =>
                          prev === row.monthKey ? null : row.monthKey,
                        )
                      }
                    >
                      <View style={[styles.tableRow, styles.statementMonthRowInner]}>
                        <View style={styles.tdMonth}>
                          <Text style={styles.tdMissionId} numberOfLines={1}>
                            {row.label}
                          </Text>
                          <Text style={styles.tdDest} numberOfLines={1}>
                            {row.tripCount} trips, {row.ledgerEntryCount} payments
                          </Text>
                        </View>
                        <View style={styles.tdCol}>
                          <Text
                            style={[
                              styles.td,
                              row.fixedSalary > 0 ? styles.tdDark : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {row.fixedSalary > 0
                              ? formatINR(row.fixedSalary)
                              : "₹0"}
                          </Text>
                        </View>
                        <View style={styles.tdCol}>
                          <Text
                            style={[
                              styles.td,
                              row.tripCommission > 0
                                ? styles.tdDark
                                : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {row.tripCommission > 0
                              ? formatINR(row.tripCommission)
                              : "₹0"}
                          </Text>
                        </View>
                        <View style={styles.tdColLast}>
                          <Text
                            style={[
                              styles.td,
                              row.paidTotal > 0 ? styles.tdGreen : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {row.paidTotal > 0 ? formatINR(row.paidTotal) : "₹0"}
                          </Text>
                        </View>
                        <FontAwesome
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={10}
                          color={Theme.textMutedDemo}
                          style={styles.statementMonthChevron}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          {primaryStatementRow && primaryStatementDetail && (
            <>
              <View style={styles.statementSummaryCard}>
                <Text style={styles.statementSummaryTitle}>
                  {primaryStatementRow.label.toUpperCase()}
                </Text>
                <View style={styles.statementSummaryContent}>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabel}>Salary</Text>
                    <Text style={styles.statementSummaryValue}>
                      {formatINR(primaryStatementRow.fixedSalary)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabel}>
                      Trip-based commission
                    </Text>
                    <Text style={styles.statementSummaryValue}>
                      {formatINR(primaryStatementRow.tripCommission)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryDivider} />
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabelStrong}>
                      Total earnings (due)
                    </Text>
                    <Text style={styles.statementSummaryValueStrong}>
                      {formatINR(primaryStatementRow.totalEarnings)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabelStrong}>Paid</Text>
                    <Text
                      style={[
                        styles.statementSummaryValueStrong,
                        styles.statementSummaryValueGreen,
                      ]}
                    >
                      {formatINR(primaryStatementRow.paidTotal)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabelStrong}>
                      Balance (still to pay)
                    </Text>
                    <Text
                      style={[
                        styles.statementSummaryValueStrong,
                        styles.statementSummaryValueRed,
                      ]}
                    >
                      {formatINR(
                        Math.max(
                          0,
                          primaryStatementRow.totalEarnings -
                            primaryStatementRow.paidTotal,
                        ),
                      )}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.statementCard}>
                <Text style={styles.statementSectionTitle}>TRIPS</Text>
                <View style={styles.statementCardContent}>
                  {primaryStatementDetail.trips.length === 0 ? (
                    <Text style={styles.statementEmptyText}>
                      {t("noLedgerEntriesDriver")}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.statementHeaderRow}>
                        <Text style={[styles.statementHeaderCell, styles.statementHeaderCellLeft]}>
                          TRIP ID
                        </Text>
                        <View style={styles.statementTripAmounts}>
                          <Text style={styles.statementHeaderCell}>COMM.</Text>
                          <Text style={styles.statementHeaderCell}>PAID</Text>
                          <Text style={styles.statementHeaderCell}>DUE</Text>
                        </View>
                      </View>
                      {primaryStatementDetail.trips.map((trip) => (
                        <View key={trip.id} style={styles.statementTripRow}>
                          <View style={styles.statementTripLeft}>
                            <Text
                              style={styles.statementTripId}
                              numberOfLines={1}
                            >
                              {trip.missionId}
                            </Text>
                          </View>
                          <View style={styles.statementTripAmounts}>
                            <Text style={styles.statementTripAmount}>
                              {formatINR(trip.commission)}
                            </Text>
                            <Text
                              style={[
                                styles.statementTripAmount,
                                styles.statementTripAmountGreen,
                              ]}
                            >
                              {formatINR(trip.paid)}
                            </Text>
                            <Text
                              style={[
                                styles.statementTripAmount,
                                trip.due > 0
                                  ? styles.statementTripAmountRed
                                  : styles.statementTripAmountMuted,
                              ]}
                            >
                              {formatINR(trip.due)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              </View>

              <View style={styles.statementCard}>
                <Text style={styles.statementSectionTitle}>PAYMENTS</Text>
                <View style={styles.statementCardContent}>
                  {primaryStatementDetail.ledgerEntries.length === 0 ? (
                    <Text style={styles.statementEmptyText}>
                      {t("noLedgerEntriesDriver")}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.statementHeaderRow}>
                        <Text style={[styles.statementHeaderCell, styles.statementHeaderCellLeft]}>
                          DATE / TYPE
                        </Text>
                        <Text style={styles.statementHeaderCell}>AMOUNT</Text>
                      </View>
                      {primaryStatementDetail.ledgerEntries.map((e) => (
                        <View key={e.id} style={styles.statementPaymentRow}>
                          <View style={styles.statementPaymentLeft}>
                            <Text
                              style={styles.statementPaymentDate}
                              numberOfLines={1}
                            >
                              {formatLedgerDate(e.date)}
                            </Text>
                            <Text
                              style={styles.statementPaymentType}
                              numberOfLines={1}
                            >
                              {e.type}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.statementPaymentAmount,
                              styles.statementTripAmountGreen,
                            ]}
                            numberOfLines={1}
                          >
                            {formatINR(e.amount)}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      )}

      <DateRangePickerModal
        visible={tripsDateRangeModalVisible}
        initialFrom={tripsCustomFrom ?? undefined}
        initialTo={tripsCustomTo ?? undefined}
        onDismiss={() => setTripsDateRangeModalVisible(false)}
        onApply={(from, to) => {
          setTripsCustomFrom(from);
          setTripsCustomTo(to);
          setTripsDatePreset("custom");
          setTripsDateRangeModalVisible(false);
        }}
        onClear={() => {
          setTripsCustomFrom(null);
          setTripsCustomTo(null);
          setTripsDatePreset("all");
          setTripsDateRangeModalVisible(false);
        }}
      />

      <LedgerReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        transactions={sortedDriverLedger}
        title={
          lockedPartyName
            ? `${t("ledgerFor")}${lockedPartyName}`
            : t("ledgerReport")
        }
      />
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  headerTitleSubwrap: {
    alignItems: "center",
    gap: 4,
  },
  entityHeaderSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 100,
    elevation: 10,
  },
  publicProfileHeaderBtn: {
    width: 36,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  profileHeaderAvatarImage: {
    width: "100%",
    height: "100%",
  },
  downloadHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  headerProfileBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.negative,
    borderWidth: 1,
    borderColor: Theme.screenBackground,
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
  profileEntitySub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 6,
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
    fontSize: 11,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  profileBadgeCore: {
    backgroundColor: Theme.fiscalTabActiveBg ?? "#e8eaf6",
    borderColor: Theme.primary,
  },
  profileBadgeCoreText: {
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  profileContactValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  profileFiscalRow: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  profileFiscalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  profileFiscalValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  // Scorecard (copied from vehicle detail for visual parity)
  scorecard: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 40,
    padding: 32,
    marginBottom: 24,
    marginHorizontal: Layout.screenPaddingHorizontal,
    overflow: "hidden",
  },
  scorecardDecorIconWrap: {
    position: "absolute",
    right: -14,
    top: -16,
  },
  scorecardDecorIcon: {
    transform: [{ rotate: "12deg" }],
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
  // Tabs (matching vehicle detail pills)
  tabRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 4,
    borderRadius: 16,
    marginHorizontal: 0,
    marginBottom: 24,
    gap: 4,
    width: "100%",
    alignSelf: "stretch",
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
  tabScroll: { flex: 1 },
  tabScrollContent: {
    flexGrow: 1,
  },
  tabScrollContentTripsFull: {
    alignSelf: "stretch",
    width: "100%",
  },
  tripsTabInner: {
    alignSelf: "stretch",
    width: "100%",
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
  },
  tripsFilterBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 6,
    width: "100%",
    alignSelf: "stretch",
  },
  tripsFilterScroll: {
    flex: 1,
    minWidth: 0,
  },
  tripsFilterChipsContent: {
    flexGrow: 0,
    alignItems: "center",
    paddingRight: 4,
    gap: 8,
  },
  tripsFilterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
  },
  tripsFilterChipActive: {
    backgroundColor: Theme.primary,
  },
  tripsFilterChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tripsFilterChipTextActive: {
    color: Theme.textOnPrimary,
  },
  tripsFilterCalendarBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverTripsTableFull: {
    width: "100%",
    alignSelf: "stretch",
  },
  tripTableCardFullWidth: {
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerSummaryRowTripsFull: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  ledgerSummaryTripsPaidBlock: {
    flexShrink: 0,
    minWidth: 0,
  },
  ledgerSummaryTripsDueBlock: {
    flexShrink: 0,
    minWidth: 0,
    alignItems: "flex-end",
  },
  driverTripsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  driverTripsDataRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: 56,
  },
  driverTripsDataRowEmpty: {
    justifyContent: "center",
  },
  driverTripsThTrip: {
    flex: 2.05,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  driverTripsThClient: {
    flex: 1.85,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  driverTripsThNum: {
    flex: 1,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textAlign: "right",
  },
  driverTripsThTxn: {
    flex: 0.62,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textAlign: "right",
  },
  driverTripsThLast: {
    flex: 0.72,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textAlign: "right",
  },
  driverTripsCellTrip: {
    flex: 2.05,
    minWidth: 0,
    paddingRight: 6,
  },
  driverTripsTripId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  driverTripsRoute: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 4,
  },
  driverTripsCellClient: {
    flex: 1.85,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
  },
  driverTripsClientAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.positiveMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  driverTripsClientAvatarText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  driverTripsClientName: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  driverTripsAmt: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  driverTripsTxn: {
    flex: 0.62,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  driverTripsLastTxn: {
    flex: 0.72,
    minWidth: 0,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
  },
  driverTripsEmptyWide: {
    flex: 1,
    width: "100%",
    paddingVertical: 24,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tableWrap: { paddingHorizontal: 16, paddingTop: 24 },
  tripTableCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 32,
    overflow: "hidden",
  },
  tripTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tripTh: {
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tripThMission: { flex: 1, minWidth: 0 },
  tripHeaderAmountCol: {
    width: 80,
    minWidth: 72,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  tripThSales: { width: 80, textAlign: "right" as const },
  tripThRight: { width: 72, textAlign: "right" as const },
  tripTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tripTd: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  tripTdMission: { flex: 1, minWidth: 0 },
  tripTdMissionId: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tripTdRoute: {
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 4,
  },
  tripAmountCol: {
    width: 80,
    minWidth: 72,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tripTdSales: { width: 80, textAlign: "right" as const },
  tripTdRight: { width: 72, textAlign: "right" as const },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 2,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  ledgerSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  ledgerSummaryRow: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    gap: 0,
  },
  ledgerSummaryCell: {
    flex: 1,
    minWidth: 0,
  },
  ledgerSummaryCellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 12,
  },
  ledgerSummaryLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  ledgerSummaryAmount: {
    fontSize: 19,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  ledgerSummaryIn: { color: Theme.positive ?? Theme.darkGreen },
  ledgerSummaryOut: { color: Theme.teslaRed },
  ledgerTableHeaderWrap: {
    width: "100%",
    backgroundColor: Theme.surface,
    paddingHorizontal: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: Theme.borderLight,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  ledgerTableHeader: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  ledgerTh: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    paddingVertical: 10,
    textTransform: "uppercase",
  },
  ledgerThNode: {
    flex: 0.25,
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 8,
    paddingVertical: 10,
    justifyContent: "center",
  },
  ledgerThMission: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerThBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 10,
    justifyContent: "center",
  },
  ledgerTdBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 10,
  },
  ledgerThCredit: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  ledgerThDebit: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  ledgerThSpacer: { width: 22, minWidth: 22 },
  ledgerTdNode: {
    flex: 0.25,
    minWidth: 0,
    paddingRight: 8,
  },
  ledgerTdMission: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerTdCredit: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 8,
  },
  ledgerTdDebit: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 8,
  },
  ledgerCellSubCategory: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  ledgerCellSubDate: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.03,
    marginTop: 2,
  },
  ledgerCellVehicle: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.03,
    marginTop: 1,
  },
  ledgerRowActionHint: {
    paddingLeft: 6,
    paddingRight: 4,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    width: 22,
    minWidth: 22,
  },
  /** Driver ledger: TRIP/ROUTE/DATE (combined), PAID, TO PAY. */
  driverLedgerThCol: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 6,
    justifyContent: "center",
  },
  driverLedgerThColRouteDate: {
    flex: 0.5,
    minWidth: 0,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    justifyContent: "center",
  },
  driverLedgerThColRight: { textAlign: "right" as const },
  driverLedgerTdCol: {
    flex: 0.25,
    minWidth: 0,
    paddingRight: 6,
  },
  driverLedgerTdColRouteDate: {
    flex: 0.5,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
  },
  driverLedgerTdColRouteDateContent: {
    justifyContent: "center",
  },
  driverLedgerTdRoute: {
    alignItems: "center",
    justifyContent: "center",
  },
  /** TRIP/ROUTE column: muted text to match client ledger (other tabs). */
  ledgerRouteText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.05,
    textAlign: "center",
  },
  ledgerRouteTextBlock: {
    textAlign: "left",
    marginTop: 2,
  },
  driverLedgerTdColAmount: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  ledgerRowWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  ledgerRowPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  /** Ledger expanded detail — compact, aligned with EntityDetailOverlay / table. */
  ledgerExpandedDetail: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    overflow: "hidden",
  },
  ledgerExpandedBlock: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  ledgerExpandedBlockTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkBackground,
    textTransform: "uppercase",
  },
  ledgerExpandedBlockContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ledgerExpandedRowDouble: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    minWidth: 0,
    marginBottom: 8,
  },
  ledgerExpandedRowDoubleLast: {
    marginBottom: 0,
  },
  ledgerExpandedHalf: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    paddingRight: 6,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    borderRightWidth: 1,
    borderRightColor: Theme.surfaceBorder,
  },
  ledgerExpandedHalfLast: {
    borderRightWidth: 0,
    paddingRight: 0,
  },
  ledgerExpandedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  ledgerExpandedRowLast: {
    borderBottomWidth: 0,
  },
  ledgerExpandedLabelSmall: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  ledgerExpandedValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minWidth: 0,
  },
  ledgerExpandedPaymentDark: {
    backgroundColor: Theme.darkBackground,
    marginHorizontal: 0,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  ledgerExpandedRowTriple: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  ledgerExpandedTripleCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: 2,
  },
  ledgerExpandedTripleCellAmount: {
    alignItems: "flex-end",
  },
  ledgerExpandedLabelOnDark: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  ledgerExpandedValueOnDark: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  ledgerExpandedValueOnDarkGreen: {
    color: Theme.darkGreen,
    fontWeight: "700",
  },
  ledgerExpandedValueOnDarkRed: {
    color: Theme.teslaRed,
    fontWeight: "700",
  },
  driverProtocolThFirst: {
    flex: 0.42,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
  },
  driverProtocolThCol: {
    flex: 0.24,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  driverProtocolThColLast: {
    flex: 0.24,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  ledgerTableBodyWrap: {
    paddingHorizontal: 0,
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
  ledgerEmptyRow: {
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  ledgerEmptyText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  table: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 2,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 6,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  thMission: { flex: 0.42 },
  thMonth: { flex: 0.28 },
  thCol: { flex: 0.24, textAlign: "right" as const },
  thColLast: { flex: 0.24, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  ledgerTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  statementMonthRow: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  statementMonthRowInner: {
    paddingRight: 24,
  },
  statementMonthChevron: {
    marginLeft: 4,
  },
  tdMonth: { flex: 0.28 },
  tdCol: { flex: 0.24, alignItems: "flex-end" as const },
  tdColLast: { flex: 0.24, alignItems: "flex-end" as const },
  td: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 0.42 },
  tdMissionWrap: { flex: 0.42, minWidth: 0 },
  tdMissionId: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  tdDest: {
    fontSize: 6,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  tdDark: { color: Theme.textPrimaryDark },
  tdMuted: { color: Theme.textMuted },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  // Statement detail (selected month)
  statementSummaryCard: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  statementSummaryTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.4,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 10,
    paddingHorizontal: 16,
    textTransform: "uppercase",
  },
  statementSummaryContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statementSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  statementSummaryLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  statementSummaryLabelStrong: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  statementSummaryValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  statementSummaryValueStrong: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  statementSummaryValueGreen: { color: Theme.darkGreen },
  statementSummaryValueRed: { color: Theme.teslaRed },
  statementSummaryDivider: {
    height: 1,
    backgroundColor: Theme.surfaceLight,
    marginVertical: 8,
  },
  statementCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  statementSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.2,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 10,
    paddingHorizontal: 12,
    textTransform: "uppercase",
  },
  statementCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statementHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  statementHeaderCell: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
    minWidth: 44,
  },
  statementHeaderCellLeft: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
  },
  statementEmptyText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  statementTripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  statementTripLeft: {
    flex: 1,
    minWidth: 0,
  },
  statementTripId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  statementTripAmounts: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  statementTripAmount: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  statementTripAmountGreen: { color: Theme.darkGreen },
  statementTripAmountRed: { color: Theme.teslaRed },
  statementTripAmountMuted: { color: Theme.textMuted },
  statementPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
  },
  statementPaymentLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  statementPaymentDate: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  statementPaymentType: {
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 2,
  },
  statementPaymentAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerRatingText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.driverGold ?? Theme.primary,
  },
  disconnectedBanner: {
    backgroundColor: Theme.negativeMuted ?? Theme.surfaceLight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Theme.negative ?? Theme.textMuted,
  },
  disconnectedBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  ratingsList: { marginTop: 8, gap: 12 },
  ratingRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  ratingScore: { fontSize: 14, fontWeight: "800", color: Theme.driverGold },
  ratingComment: { fontSize: 12, color: Theme.textSecondary, marginTop: 4 },
  ratingDate: { fontSize: 11, color: Theme.textMuted, marginTop: 4 },
  linkBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.primary,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  linkBtnDisabled: { opacity: 0.6 },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: Theme.textOnPrimary },
  linkHint: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 8,
    maxWidth: 280,
  },
  dismissMatchBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  dismissMatchBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  driverRequestCardsWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    marginBottom: 16,
    gap: 12,
  },
  driverRequestCard: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    padding: 16,
  },
  driverRequestCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  driverRequestIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverRequestCardBody: { flex: 1, minWidth: 0 },
  driverRequestCardLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  driverRequestCardAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  driverRequestCardReason: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  driverRequestCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  driverRequestBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  driverRequestBtnPay: {
    backgroundColor: Theme.primary,
  },
  driverRequestBtnPayText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 1,
  },
  driverRequestBtnReject: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  driverRequestBtnRejectText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
  },
  driverMetricsGrid: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
  },
  driverMetricCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    alignItems: "center",
  },
  driverMetricIcon: { marginBottom: 8 },
  driverMetricLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  driverMetricValue: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  driverMetricValueActive: { color: Theme.darkGreen },
  driverContactCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
  },
  driverContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverContactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverContactIconWrapAlt: {
    backgroundColor: Theme.surfaceForm,
  },
  driverContactTextWrap: { flex: 1, minWidth: 0 },
  driverContactLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  driverContactValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  driverContactDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 12,
    marginLeft: 48,
  },
  driverCompensationCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
    overflow: "hidden",
  },
  driverCompensationHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  driverCompensationHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: 1,
  },
  driverCompensationBody: { padding: 16 },
  driverCompensationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  driverCompensationLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  driverCompensationValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  driverCompensationDivider: {
    height: 1,
    backgroundColor: Theme.surfaceLight,
    marginVertical: 8,
  },
  driverRatingsSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 24,
  },
  driverRatingsSectionTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  driverRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 8,
  },
  driverRatingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  driverRatingBody: { flex: 1, minWidth: 0 },
  driverRatingScore: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  driverRatingScoreMax: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  driverRatingDate: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
});
