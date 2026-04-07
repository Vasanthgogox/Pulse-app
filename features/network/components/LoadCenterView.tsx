/**
 * Load Center — reference UI: Hire Partners | Find Work | Awarded.
 * Header "Load Center" / "Find or Hire Work", three sub-tabs, cards, modals.
 */
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  BidReceivedHammer,
  createDirectQuote,
  getIndentDisplayNumber,
  updateDirectQuoteAssignment,
  updateDirectQuoteStatus,
  updateIndent,
  type DirectQuoteRow,
  type IndentRow,
} from "@/features/indents";
import { acceptAwardedQuote } from "@/features/indents/services/accept-awarded-quote.service";
import {
  generateTripOtp,
  regenerateTripOtp,
  setInitialTripForDetail,
} from "@/features/trips";
import { formatINR } from "@/lib/format";
import {
  useDirectQuoteCountsQuery,
  useDriversQuery,
  useIndentDirectQuotesQuery,
  useIndentsQuery,
  useInvalidateIndents,
  useInvalidateTrips,
  useMarketIndentsQuery,
  useMyDirectQuotesQuery,
  useTripsQuery,
  useVehiclesQuery,
} from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Platform as RNPlatform,
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

type LoadSubTab = "GIVE_LOAD" | "GET_LOAD" | "AWARDED";

/** Status filter tabs: Open | Quoted | Awarded | Done. Maps to indent status values. */
type StatusFilterTab = "OPEN" | "QUOTED" | "AWARDED" | "DONE";

const STATUS_TABS: {
  id: StatusFilterTab;
  label: string;
  statuses: string[];
}[] = [
  { id: "OPEN", label: "Open", statuses: ["open", "pending"] },
  { id: "QUOTED", label: "Quoted", statuses: ["quoted"] },
  { id: "AWARDED", label: "Awarded", statuses: ["awarded"] },
  {
    id: "DONE",
    label: "Done",
    statuses: ["completed", "cancelled", "closed", "expired"],
  },
];

function statusMatchesFilter(status: string, filter: StatusFilterTab): boolean {
  const s = status.toLowerCase();
  const tab = STATUS_TABS.find((t) => t.id === filter);
  return tab?.statuses.includes(s) ?? false;
}

interface LoadCenterViewProps {
  /** Top padding (e.g. from parent sub-tab row + safe area). */
  contentTopPadding?: number;
  onCreateIndentPress: () => void;
  onIndentPress: (indent: IndentRow) => void;
}

const TESLA_BLACK = "#171A20";

/** EaseOutExpo: smooth deceleration at the end. */
function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

/**
 * AnimatedCounter — animates the displayed number from previous to target value.
 * Uses requestAnimationFrame with easeOutExpo for smooth number rolling.
 */
function AnimatedCounter({
  value,
  duration = 600,
  style,
  activeStyle,
  isActive,
}: {
  value: number;
  duration?: number;
  style: object;
  activeStyle: object;
  isActive: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const startValueRef = useRef(value);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startValueRef.current = displayValue;
    startTimeRef.current = null;

    const updateCount = (timestamp: number) => {
      if (startTimeRef.current == null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = easeOutExpo(progress);
      const current = Math.round(
        startValueRef.current + (value - startValueRef.current) * easeProgress,
      );
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(updateCount);
      }
    };

    rafRef.current = requestAnimationFrame(updateCount);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <Text style={[style, isActive && activeStyle]}>{displayValue}</Text>;
}

/**
 * Tab count badge with animated number roll and scale bump when count increases.
 */
function AnimatedCountBadge({
  count,
  isActive,
  badgeStyle,
  badgeActiveStyle,
  textStyle,
  textActiveStyle,
}: {
  count: number;
  isActive: boolean;
  badgeStyle: object;
  badgeActiveStyle: object;
  textStyle: object;
  textActiveStyle: object;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      prevCount.current = count;
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 12,
          bounciness: 4,
        }),
      ]).start();
    } else {
      prevCount.current = count;
    }
  }, [count, scaleAnim]);

  return (
    <Animated.View
      style={[
        badgeStyle,
        isActive && badgeActiveStyle,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <AnimatedCounter
        value={count}
        duration={500}
        style={textStyle}
        activeStyle={textActiveStyle}
        isActive={isActive}
      />
    </Animated.View>
  );
}

export function LoadCenterView({
  contentTopPadding = 0,
  onCreateIndentPress,
  onIndentPress,
}: LoadCenterViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [loadSubTab, setLoadSubTab] = useState<LoadSubTab>("GIVE_LOAD");
  const [statusFilterTab, setStatusFilterTab] =
    useState<StatusFilterTab>("OPEN");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPostModal, setShowPostModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [quoteAmount, setQuoteAmount] = useState<string>("");
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [assigningTripId, setAssigningTripId] = useState<string | null>(null);
  const [loadAction, setLoadAction] = useState<
    | {
        type: "AWARD";
        load: IndentRow;
      }
    | {
        type: "BID";
        load: IndentRow;
      }
    | {
        type: "ASSIGN";
        load: IndentRow;
      }
    | null
  >(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState<
    string | null | undefined
  >(undefined);
  const [assignVehicleRegistration, setAssignVehicleRegistration] =
    useState("");
  const [useAdHocDriver, setUseAdHocDriver] = useState(false);
  const [deployOtpCode, setDeployOtpCode] = useState<string | null>(null);
  const [deployOtpExpiresAt, setDeployOtpExpiresAt] = useState<string | null>(
    null,
  );
  const [deployTripIdForOtp, setDeployTripIdForOtp] = useState<string | null>(
    null,
  );
  const [handshakeStep, setHandshakeStep] = useState<
    "flow_choice" | "roster" | "ad_hoc_driver" | "ad_hoc_vehicle"
  >("flow_choice");

  const { data: indents = [], isLoading } = useIndentsQuery(orgId);
  const {
    data: marketIndents = [],
    isLoading: marketLoading,
    isError: marketError,
    isRefetching: marketRefetching,
    refetch: refetchMarketIndents,
  } = useMarketIndentsQuery(orgId);
  const { data: myQuotes = [], refetch: refetchMyQuotes } =
    useMyDirectQuotesQuery(orgId);
  const { data: trips = [] } = useTripsQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);
  const invalidateTrips = useInvalidateTrips();
  const invalidateIndents = useInvalidateIndents();
  const queryClient = useQueryClient();

  /** O(myQuotes.length): map indent_id -> quote for Find Work "Quote Sent" / "Update quote" and modal prefill. */
  const myQuoteByIndentId = useMemo(() => {
    const m = new Map<string, DirectQuoteRow>();
    for (const q of myQuotes) m.set(q.indent_id, q);
    return m;
  }, [myQuotes]);

  const awardModalIndentId =
    loadAction?.type === "AWARD" ? loadAction.load.id : null;
  const {
    data: awardModalQuotes = [],
    isLoading: awardModalQuotesLoading,
    refetch: refetchAwardModalQuotes,
  } = useIndentDirectQuotesQuery(awardModalIndentId);

  useEffect(() => {
    if (loadAction?.type === "AWARD" && awardModalIndentId) {
      refetchAwardModalQuotes();
    }
  }, [loadAction?.type, awardModalIndentId, refetchAwardModalQuotes]);

  /** Sorted for Offer Hub: pending by amount (lowest first), then rejected, then accepted. */
  const sortedOfferHubQuotes = useMemo(() => {
    const list = [...awardModalQuotes];
    return list.sort((a, b) => {
      const sa = (a.status || "").toLowerCase();
      const sb = (b.status || "").toLowerCase();
      if (sa === "pending" && sb === "pending") {
        return Number(a.amount ?? 0) - Number(b.amount ?? 0);
      }
      if (sa === "pending") return -1;
      if (sb === "pending") return 1;
      if (sa === "rejected" && sb === "accepted") return -1;
      if (sa === "accepted" && sb === "rejected") return 1;
      return 0;
    });
  }, [awardModalQuotes]);

  const pendingOfferCount = useMemo(
    () =>
      awardModalQuotes.filter(
        (q) => (q.status || "").toLowerCase() === "pending",
      ).length,
    [awardModalQuotes],
  );
  const lowestPendingAmount = useMemo(() => {
    const pending = awardModalQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    if (pending.length === 0) return null;
    return Math.min(...pending.map((q) => Number(q.amount ?? 0)));
  }, [awardModalQuotes]);

  /** Indent ids that already have a trip (owner or supplier). Exclude these from Secured so we don't show "ASSIGN STAFF & DEPLOY" again after deploy. */
  const indentIdsWithTrip = useMemo(() => {
    const list = trips ?? [];
    const ids: string[] = [];
    for (const t of list) {
      const id = (t as { indent_id?: string | null }).indent_id;
      if (id) ids.push(id);
    }
    return new Set(ids);
  }, [trips]);

  /** All indents from my org (for Hire Partner — filter by status tab). */
  const hirePartnerLoads = useMemo(
    () => indents.filter((i) => i.organization_id === orgId),
    [indents, orgId],
  );
  const giveLoadIds = useMemo(
    () =>
      hirePartnerLoads
        .filter((i) => {
          const s = (i.status || "").toLowerCase();
          return s !== "awarded" && s !== "completed" && s !== "cancelled";
        })
        .map((l) => l.id),
    [hirePartnerLoads],
  );
  const { data: quoteCounts = {}, refetch: refetchQuoteCounts } =
    useDirectQuoteCountsQuery(giveLoadIds);

  /** Indent ids where my org's quote is accepted (awarded to me). Used to exclude from Find Work and build Secured list. */
  const awardedToMeIndentIds = useMemo(
    () =>
      new Set(
        myQuotes
          .filter((q) => (q.status || "").toLowerCase() === "accepted")
          .map((q) => q.indent_id),
      ),
    [myQuotes],
  );

  const awardedLoads = useMemo(
    () =>
      marketIndents.filter(
        (i) =>
          awardedToMeIndentIds.has(i.id) &&
          (i.status || "").toLowerCase() !== "completed" &&
          !indentIdsWithTrip.has(i.id),
      ),
    [marketIndents, awardedToMeIndentIds, indentIdsWithTrip],
  );

  const getLoads = useMemo(
    () =>
      marketIndents.filter((i) => {
        const status = (i.status || "").toLowerCase();
        if (
          status === "awarded" ||
          status === "completed" ||
          status === "cancelled"
        )
          return false;
        const target = (i.circulation_target || "").toLowerCase();
        return target === "integrated_supplier" || target === "both";
      }),
    [marketIndents],
  );

  /** Find Work list: open loads targeted to me, excluding any load already awarded to me (so we never show "Update quote" for awarded loads). */
  const findWorkLoads = useMemo(
    () => getLoads.filter((load) => !awardedToMeIndentIds.has(load.id)),
    [getLoads, awardedToMeIndentIds],
  );

  /** Secured "Done": loads awarded to me that are completed or have a trip. */
  const awardedLoadsDone = useMemo(
    () =>
      marketIndents.filter(
        (i) =>
          awardedToMeIndentIds.has(i.id) &&
          (statusMatchesFilter(i.status || "", "DONE") ||
            indentIdsWithTrip.has(i.id)),
      ),
    [marketIndents, awardedToMeIndentIds, indentIdsWithTrip],
  );

  /** Check if a load matches the search query (route, ID, client, creator org). */
  const loadMatchesSearch = useCallback(
    (load: IndentRow, q: string): boolean => {
      const trimmed = q.trim().toLowerCase();
      if (!trimmed) return true;
      const route =
        `${(load.pickup_area || "").toLowerCase()} ${(load.drop_location || "").toLowerCase()}`.trim();
      const indentId = (getIndentDisplayNumber(load) || "").toLowerCase();
      const client = (load.client_name || "").toLowerCase();
      const creator = (
        (load as { creator_organization_name?: string })
          .creator_organization_name || ""
      ).toLowerCase();
      return (
        route.includes(trimmed) ||
        indentId.includes(trimmed) ||
        client.includes(trimmed) ||
        creator.includes(trimmed)
      );
    },
    [],
  );

  /** Status-filtered lists for each role tab, then search-filtered. */
  const filteredHirePartnerLoads = useMemo(() => {
    const statusFiltered = hirePartnerLoads.filter((load) => {
      const status = (load.status || "").toLowerCase();
      if (statusFilterTab === "QUOTED") {
        const hasBids = (quoteCounts[load.id] ?? 0) > 0;
        const isQuotedStatus = statusMatchesFilter(status, "QUOTED");
        const isNotTerminal =
          !statusMatchesFilter(status, "AWARDED") &&
          !statusMatchesFilter(status, "DONE");
        return (isQuotedStatus || hasBids) && isNotTerminal;
      }
      return statusMatchesFilter(status, statusFilterTab);
    });
    return statusFiltered.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [
    hirePartnerLoads,
    statusFilterTab,
    quoteCounts,
    searchQuery,
    loadMatchesSearch,
  ]);
  const filteredFindWorkLoads = useMemo(() => {
    const statusFiltered = findWorkLoads.filter((load) =>
      statusMatchesFilter(load.status || "", statusFilterTab),
    );
    return statusFiltered.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [findWorkLoads, statusFilterTab, searchQuery, loadMatchesSearch]);
  const filteredSecuredLoads = useMemo(() => {
    return awardedLoads.filter((load) => loadMatchesSearch(load, searchQuery));
  }, [awardedLoads, searchQuery, loadMatchesSearch]);
  const filteredSecuredDoneLoads = useMemo(() => {
    return awardedLoadsDone.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [awardedLoadsDone, searchQuery, loadMatchesSearch]);

  /** Counts per status tab for the current role tab (Hire Partner / Find Work / Secured). */
  const statusTabCounts = useMemo(() => {
    const getCount = (filter: StatusFilterTab) => {
      if (loadSubTab === "GIVE_LOAD") {
        return hirePartnerLoads.filter((load) => {
          const status = (load.status || "").toLowerCase();
          if (filter === "QUOTED") {
            const hasBids = (quoteCounts[load.id] ?? 0) > 0;
            const isQuotedStatus = statusMatchesFilter(status, "QUOTED");
            const isNotTerminal =
              !statusMatchesFilter(status, "AWARDED") &&
              !statusMatchesFilter(status, "DONE");
            return (isQuotedStatus || hasBids) && isNotTerminal;
          }
          return statusMatchesFilter(status, filter);
        }).length;
      }
      if (loadSubTab === "GET_LOAD") {
        return findWorkLoads.filter((load) =>
          statusMatchesFilter(load.status || "", filter),
        ).length;
      }
      if (loadSubTab === "AWARDED") {
        if (filter === "AWARDED") return awardedLoads.length;
        if (filter === "DONE") return awardedLoadsDone.length;
        return 0;
      }
      return 0;
    };
    return {
      OPEN: getCount("OPEN"),
      QUOTED: getCount("QUOTED"),
      AWARDED: getCount("AWARDED"),
      DONE: getCount("DONE"),
    };
  }, [
    loadSubTab,
    hirePartnerLoads,
    findWorkLoads,
    awardedLoads,
    awardedLoadsDone,
    quoteCounts,
  ]);

  useEffect(() => {
    if (loadSubTab === "AWARDED") refetchMyQuotes();
  }, [loadSubTab, refetchMyQuotes]);

  /** Refetch quote counts when viewing Quoted tab so bids received are up to date. */
  useEffect(() => {
    if (loadSubTab === "GIVE_LOAD" && statusFilterTab === "QUOTED") {
      refetchQuoteCounts();
    }
  }, [loadSubTab, statusFilterTab, refetchQuoteCounts]);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
  };

  const handleShareIndent = async (load: IndentRow) => {
    const routeLabel = `${(load.pickup_area || "—").toUpperCase()} → ${(load.drop_location || "—").toUpperCase()}`;
    const dateLabel = load.pickup_date
      ? new Date(load.pickup_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
    const budget = formatINR(Number(load.client_price || 0));
    const indentDisplay = getIndentDisplayNumber(load);
    const webBase =
      process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
    const deepLink =
      webBase !== ""
        ? `${webBase}/indent/${load.id}`
        : Linking.createURL(`/indent/${load.id}`);
    const message =
      `Load Indent ${indentDisplay}\n` +
      `${routeLabel}\n` +
      `Pickup: ${dateLabel} · Budget: ${budget}\n\n` +
      `Update your bid:\n${deepLink}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Share.share({ message });
    }
  };

  const handleAwardQuote = async () => {
    if (!orgId || loadAction?.type !== "AWARD" || !selectedQuoteId) return;
    const load = loadAction.load;
    const currentStatus = (load.status || "").toLowerCase();
    if (currentStatus === "awarded" || currentStatus === "completed") {
      Alert.alert(
        "Already awarded",
        "This load has already been awarded. Closing.",
      );
      setLoadAction(null);
      setSelectedQuoteId(null);
      invalidateIndents(orgId);
      return;
    }
    if (currentStatus === "cancelled" || currentStatus === "closed") {
      Alert.alert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setLoadAction(null);
      setSelectedQuoteId(null);
      invalidateIndents(orgId);
      return;
    }
    const pendingQuotes = awardModalQuotes.filter(
      (q) => (q.status || "").toLowerCase() === "pending",
    );
    const winner = pendingQuotes.find((q) => q.id === selectedQuoteId);
    if (!winner) {
      Alert.alert(
        "Invalid selection",
        "Please select a pending offer to award.",
      );
      return;
    }
    try {
      setAwarding(true);
      const { error: acceptErr } = await updateDirectQuoteStatus(
        winner.id,
        "accepted",
      );
      if (acceptErr) {
        Alert.alert("Could not award", acceptErr.message);
        return;
      }
      for (const q of pendingQuotes) {
        if (q.id !== winner.id) {
          const { error: rejectErr } = await updateDirectQuoteStatus(
            q.id,
            "rejected",
          );
          if (rejectErr) {
            Alert.alert(
              "Award partially failed",
              "One or more quotes could not be updated. Winner was set.",
            );
            queryClient.invalidateQueries({
              queryKey: ["indents", load.id, "direct-quotes"],
            });
            invalidateIndents(orgId);
            break;
          }
        }
      }
      const { error: indentErr } = await updateIndent(load.id, {
        status: "awarded",
      });
      if (indentErr) {
        const friendlyMessage =
          indentErr.message &&
          (indentErr.message.includes("check constraint") ||
            indentErr.message.includes("indents_status_check"))
            ? "Indent status could not be updated. Please refresh the app and try again."
            : indentErr.message;
        Alert.alert(
          "Award saved but indent status could not be updated",
          friendlyMessage,
        );
        queryClient.invalidateQueries({
          queryKey: ["indents", load.id, "direct-quotes"],
        });
      }
      setSelectedQuoteId(null);
      setLoadAction(null);
      invalidateIndents(orgId);
      triggerSuccess(
        "Load awarded — supplier can assign and deploy from Secured.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not award", msg);
      if (loadAction?.type === "AWARD" && loadAction.load?.id) {
        queryClient.invalidateQueries({
          queryKey: ["indents", loadAction.load.id, "direct-quotes"],
        });
      }
      invalidateIndents(orgId);
    } finally {
      setAwarding(false);
    }
  };

  const handleFinalAssignment = async (load: IndentRow) => {
    if (!orgId) {
      Alert.alert(
        "Cannot start trip",
        "Your organization context is missing. Please try again.",
      );
      return;
    }

    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );

    if (!acceptedQuote) {
      Alert.alert(
        "Cannot start trip",
        "No accepted quote found for this load. Please ensure the load is awarded to you.",
      );
      return;
    }

    try {
      setAssigningTripId(load.id);
      const { error, trip } = await acceptAwardedQuote(acceptedQuote.id);
      if (error || !trip) {
        Alert.alert(
          "Could not create trip",
          error?.message ??
            "Unknown error while creating trip from awarded quote.",
        );
        return;
      }

      // Mark indent completed so it leaves Secured list (O(1)). Ignore status-update failure; trip is source of truth.
      const { error: completedErr } = await updateIndent(load.id, {
        status: "completed",
      });
      if (completedErr) {
        // Constraint or RLS may block; still invalidate so list refetches.
      }

      setLoadAction(null);
      triggerSuccess("Trip Initialized");
      if (orgId) {
        invalidateTrips(orgId);
        invalidateIndents(orgId);
      }
      const isShipper = load.organization_id === orgId;
      if (isShipper) router.push("/(tabs)/trips" as import("expo-router").Href);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unknown error while creating trip.";
      Alert.alert("Could not create trip", msg);
    } finally {
      setAssigningTripId(null);
    }
  };

  const handleDeployRoster = async (load: IndentRow) => {
    if (!orgId) {
      Alert.alert(
        "Cannot deploy",
        "Your organization context is missing. Please try again.",
      );
      return;
    }
    const status = (load.status || "").toLowerCase();
    if (status === "cancelled" || status === "closed") {
      Alert.alert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setLoadAction(null);
      return;
    }
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    if (!acceptedQuote) {
      Alert.alert("Cannot deploy", "No accepted quote found for this load.");
      return;
    }
    if (!assignDriverId || typeof assignVehicleId !== "string") {
      Alert.alert(
        "Select driver and vehicle",
        "Please select a driver and a vehicle from your org to authorize voyage.",
      );
      return;
    }
    try {
      setAssigningTripId(load.id);
      const { error: assignErr } = await updateDirectQuoteAssignment(
        acceptedQuote.id,
        assignDriverId,
        assignVehicleId,
      );
      if (assignErr) {
        Alert.alert("Could not assign", assignErr.message);
        return;
      }
      const { error: tripErr, trip } = await acceptAwardedQuote(
        acceptedQuote.id,
      );
      if (tripErr || !trip) {
        Alert.alert(
          "Could not create trip",
          tripErr?.message ?? "Unknown error.",
        );
        return;
      }
      await updateIndent(load.id, { status: "completed" });
      setLoadAction(null);
      setAssignDriverId(null);
      setAssignVehicleId(undefined);
      setAssignVehicleRegistration("");
      setUseAdHocDriver(false);
      triggerSuccess("Voyage authorized — trip created.");
      invalidateTrips(orgId);
      invalidateIndents(orgId);
      const isShipper = load.organization_id === orgId;
      if (isShipper) {
        router.push("/(tabs)/trips" as import("expo-router").Href);
      } else if (trip?.id) {
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not deploy", msg);
    } finally {
      setAssigningTripId(null);
    }
  };

  const handleDeployAdHoc = async (load: IndentRow) => {
    if (!orgId) {
      Alert.alert(
        "Cannot deploy",
        "Your organization context is missing. Please try again.",
      );
      return;
    }
    const status = (load.status || "").toLowerCase();
    if (status === "cancelled" || status === "closed") {
      Alert.alert(
        "Load unavailable",
        "This load has been cancelled or closed.",
      );
      setLoadAction(null);
      return;
    }
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    if (!acceptedQuote) {
      Alert.alert("Cannot deploy", "No accepted quote found for this load.");
      return;
    }
    try {
      setAssigningTripId(load.id);
      const vehicleIdForQuote =
        typeof assignVehicleId === "string" ? assignVehicleId : null;
      const { error: assignErr } = await updateDirectQuoteAssignment(
        acceptedQuote.id,
        null,
        vehicleIdForQuote,
      );
      if (assignErr) {
        Alert.alert("Could not assign", assignErr.message);
        return;
      }
      const regNum = assignVehicleRegistration.trim();
      const { error: tripErr, trip } = await acceptAwardedQuote(
        acceptedQuote.id,
        {
          vehicle_display_number: regNum || undefined,
        },
      );
      if (tripErr || !trip) {
        Alert.alert(
          "Could not create trip",
          tripErr?.message ?? "Unknown error.",
        );
        return;
      }
      const {
        error: otpErr,
        code,
        expires_at,
      } = await generateTripOtp(trip.id);
      if (otpErr || !code) {
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          "OTP could not be generated. Get OTP from the trip detail screen.",
        );
        if (load.organization_id === orgId)
          router.push("/(tabs)/trips" as import("expo-router").Href);
        return;
      }
      setDeployOtpCode(code);
      setDeployOtpExpiresAt(expires_at ?? null);
      setDeployTripIdForOtp(trip.id);
      await updateIndent(load.id, { status: "completed" });
      invalidateTrips(orgId);
      invalidateIndents(orgId);
      triggerSuccess("OTP generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not deploy", msg);
    } finally {
      setAssigningTripId(null);
    }
  };

  const rosterReady =
    !useAdHocDriver && !!assignDriverId && typeof assignVehicleId === "string";
  const adHocReady = useAdHocDriver;
  const activeDrivers = useMemo(
    () => drivers.filter((d) => !d.left_at),
    [drivers],
  );

  /** Staff Handshake: back one step or close modal. Used by header BACK and backdrop. */
  const handleStaffHandshakeBack = useCallback(() => {
    if (deployOtpCode) {
      setDeployOtpCode(null);
      setDeployOtpExpiresAt(null);
      setDeployTripIdForOtp(null);
      setHandshakeStep("flow_choice");
      return;
    }
    if (handshakeStep === "flow_choice") {
      setLoadAction(null);
      setDeployOtpCode(null);
      setDeployOtpExpiresAt(null);
      setDeployTripIdForOtp(null);
      setHandshakeStep("flow_choice");
      return;
    }
    if (handshakeStep === "roster" || handshakeStep === "ad_hoc_driver") {
      setHandshakeStep("flow_choice");
      return;
    }
    if (handshakeStep === "ad_hoc_vehicle") {
      setHandshakeStep("ad_hoc_driver");
    }
  }, [deployOtpCode, handshakeStep]);

  const paddingBottom = 24 + Layout.tabBarHeight + insets.bottom + 24;
  const showStatusFilters = loadSubTab !== "AWARDED";

  const renderSecuredLoadCard = (load: IndentRow, isDone: boolean) => {
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    const supplierRate =
      acceptedQuote?.amount != null
        ? Number(acceptedQuote.amount)
        : Number(load.client_price || 0);

    return (
      <TouchableOpacity
        key={`${isDone ? "done" : "active"}-${load.id}`}
        style={styles.awardedCard}
        onPress={() => onIndentPress(load)}
        activeOpacity={0.8}
      >
        <View style={styles.awardedCardTop}>
          <View style={styles.awardedBadge}>
            <FontAwesome
              name={isDone ? "check-circle" : "trophy"}
              size={14}
              color={isDone ? Theme.positive : Theme.driverGold}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.awardedBadgeText}>
              {isDone ? "Deployed" : "Contract Secured"}
            </Text>
          </View>
          <Text style={styles.awardedId}>{getIndentDisplayNumber(load)}</Text>
        </View>
        <View style={styles.awardedRouteWrap}>
          <Text style={styles.awardedRoute}>
            {load.pickup_area || "—"} → {load.drop_location || "—"}
          </Text>
          <Text style={styles.awardedAmount}>{formatINR(supplierRate)}</Text>
        </View>
        {isDone ? (
          <TouchableOpacity
            style={styles.handshakeBtn}
            onPress={() => onIndentPress(load)}
            activeOpacity={0.9}
          >
            <FontAwesome
              name="eye"
              size={16}
              color={Theme.textOnPrimary}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.handshakeBtnText}>View Detail</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.handshakeBtn}
            onPress={(e) => {
              e.stopPropagation();
              setAssignDriverId(null);
              setAssignVehicleId(undefined);
              setAssignVehicleRegistration("");
              setUseAdHocDriver(false);
              setDeployOtpCode(null);
              setDeployOtpExpiresAt(null);
              setDeployTripIdForOtp(null);
              setHandshakeStep("flow_choice");
              setLoadAction({ type: "ASSIGN", load });
            }}
            activeOpacity={0.9}
            disabled={assigningTripId === load.id}
          >
            <FontAwesome
              name="user"
              size={16}
              color={Theme.textOnPrimary}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.handshakeBtnText}>
              {assigningTripId === load.id
                ? "Authorizing…"
                : "Assign Staff & Deploy"}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: contentTopPadding }]}>
      {/* Dark header: sub-tabs + status filters — reference UI */}
      <View
        style={[
          styles.loadDarkHeader,
          !showStatusFilters && styles.loadDarkHeaderSecured,
        ]}
      >
        {/* Sub-tabs: HIRE PARTNER | FIND WORK | SECURED */}
        <View style={styles.loadFilterHeaderRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.loadFilterScroll}
            contentContainerStyle={styles.loadFilterScrollContent}
          >
            {(
              [
                { id: "GIVE_LOAD" as const, label: "HIRE PARTNER" },
                { id: "GET_LOAD" as const, label: "FIND WORK" },
                { id: "AWARDED" as const, label: "SECURED" },
              ] as const
            ).map((tab) => {
              const count =
                tab.id === "GIVE_LOAD"
                  ? hirePartnerLoads.length
                  : tab.id === "GET_LOAD"
                    ? findWorkLoads.length
                    : awardedLoads.length + awardedLoadsDone.length;
              const isActive = loadSubTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.loadFilterTab}
                  onPress={() => setLoadSubTab(tab.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.loadFilterTabLabelRow}>
                    <Text
                      style={[
                        styles.loadFilterTabText,
                        isActive && styles.loadFilterTabTextActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                    <AnimatedCountBadge
                      count={count}
                      isActive={isActive}
                      badgeStyle={styles.loadFilterTabBadge}
                      badgeActiveStyle={styles.loadFilterTabBadgeActive}
                      textStyle={styles.loadModeCountText}
                      textActiveStyle={styles.loadModeCountTextActive}
                    />
                  </View>
                  {isActive && <View style={styles.loadFilterTabUnderline} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.loadFilterAddBtn}
            onPress={onCreateIndentPress}
            activeOpacity={0.8}
          >
            <SemanticAddIcon
              IconComponent={Package}
              iconSize={14}
              iconColor={Theme.textOnDark}
              badgeSize={14}
              badgeIconSize={10}
              badgeBackgroundColor={Theme.textOnDark}
              badgeIconColor={Theme.darkBackground}
              badgeOffsetX={-6}
              badgeOffsetY={-4}
            />
          </TouchableOpacity>
        </View>
        {/* Search + Status filters (same layout as Manage Network: search + filter chips) */}
        <View
          style={[
            styles.loadSearchRow,
            !showStatusFilters && styles.loadSearchRowSecured,
          ]}
        >
          <View style={styles.loadSearchWrap}>
            <FontAwesome
              name="search"
              size={14}
              color={Theme.textOnDarkMuted}
              style={styles.loadSearchIcon}
            />
            <TextInput
              style={styles.loadSearchInput}
              placeholder="Find by route, ID or client..."
              placeholderTextColor={Theme.textOnDarkMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {showStatusFilters ? (
            <View style={styles.loadTypeFilterWrap}>
              {STATUS_TABS.map((tab) => {
                const count = statusTabCounts[tab.id];
                const isActive = statusFilterTab === tab.id;
                const tabLabel =
                  loadSubTab === "GIVE_LOAD" && tab.id === "OPEN"
                    ? "Created"
                    : tab.label;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.loadTypeFilterChip,
                      isActive && styles.loadTypeFilterChipActive,
                    ]}
                    onPress={() => setStatusFilterTab(tab.id)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.loadTypeFilterChipText,
                        isActive && styles.loadTypeFilterChipTextActive,
                      ]}
                    >
                      {tabLabel}
                    </Text>
                    <Text
                      style={[
                        styles.loadTypeFilterChipCount,
                        isActive && styles.loadTypeFilterChipCountActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      {/* Content area: rounded top, light bg — reference overlap */}
      <View
        style={[
          styles.loadContentWrap,
          !showStatusFilters && styles.loadContentWrapSecured,
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            !showStatusFilters && styles.scrollContentSecured,
            { paddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            loadSubTab === "GET_LOAD" ? (
              <RefreshControl
                refreshing={marketRefetching && !marketLoading}
                onRefresh={() => refetchMarketIndents()}
                tintColor={Theme.primary}
              />
            ) : undefined
          }
        >
          {loadSubTab === "GIVE_LOAD" && (
            <>
              <TouchableOpacity
                style={styles.shareCard}
                onPress={onCreateIndentPress}
                activeOpacity={0.9}
              >
                <View style={styles.shareCardIconWrap}>
                  <SemanticAddIcon
                    IconComponent={Package}
                    iconSize={18}
                    iconColor={LOAD_BROADCAST_MUTED}
                    badgeSize={16}
                    badgeIconSize={11}
                    badgeBackgroundColor="#FFFFFF"
                    badgeIconColor={Theme.darkBackground}
                    badgeOffsetX={-6}
                    badgeOffsetY={-4}
                  />
                </View>
                <Text style={styles.shareCardText}>Broadcast New Indent</Text>
              </TouchableOpacity>
              {isLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={Theme.primary} />
                  <Text style={styles.loadingText}>Loading…</Text>
                </View>
              ) : filteredHirePartnerLoads.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIconWrapMuted}>
                    <FontAwesome
                      name="trophy"
                      size={56}
                      color={Theme.textMuted}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {statusFilterTab === "OPEN"
                      ? loadSubTab === "GIVE_LOAD"
                        ? "Created"
                        : "Open"
                      : statusFilterTab === "QUOTED"
                        ? "Quoted"
                        : statusFilterTab === "AWARDED"
                          ? "Awarded"
                          : "Done"}
                  </Text>
                  <Text style={styles.emptySub}>
                    {statusFilterTab === "OPEN"
                      ? loadSubTab === "GIVE_LOAD"
                        ? "Created loads will appear here."
                        : "Open loads will appear here."
                      : statusFilterTab === "QUOTED"
                        ? "Quoted loads will appear here."
                        : statusFilterTab === "DONE"
                          ? "Done loads will appear here."
                          : "Awarded loads will appear here."}
                  </Text>
                </View>
              ) : (
                filteredHirePartnerLoads.map((load) => {
                  const status = (load.status || "").toLowerCase();
                  const isAwardedPendingTrip =
                    status === "awarded" && !indentIdsWithTrip.has(load.id);
                  const isDone = statusMatchesFilter(status, "DONE");
                  // Indent was assigned a supplier directly (no quote needed).
                  const hasDirectSupplier = !!load["assigned_supplier_id"];
                  // Shipper view: never show "Create Trip". The supplier creates the trip from
                  // Secured (Assign Staff & Deploy). When awarded but no trip yet, supplier
                  // is assigned (from accepted quote or assigned_supplier_id); status stays
                  // "awarded" until supplier deploys.
                  const isAwaitingSupplierDeploy =
                    isAwardedPendingTrip || hasDirectSupplier;
                  return (
                    <TouchableOpacity
                      key={load.id}
                      style={styles.loadCard}
                      onPress={() => onIndentPress(load)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.loadCardTop}>
                        <View style={styles.loadCardTopLeft}>
                          <Text style={styles.loadCardRoute} numberOfLines={3}>
                            {(load.pickup_area || "—").toUpperCase()} TO{" "}
                            {(load.drop_location || "—").toUpperCase()}
                          </Text>
                          <Text style={styles.loadCardId} numberOfLines={1}>
                            ID: {getIndentDisplayNumber(load)}
                          </Text>
                        </View>
                        <View
                          style={[styles.loadCardDate, styles.loadCardTopRight]}
                        >
                          <Text style={styles.loadCardDateText}>
                            {load.pickup_date
                              ? new Date(load.pickup_date).toLocaleDateString(
                                  "en-IN",
                                  { day: "numeric", month: "short" },
                                )
                              : "—"}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.loadCardFooter}>
                        <View style={styles.loadCardMeta}>
                          {isDone ? (
                            <>
                              <FontAwesome
                                name="check-circle"
                                size={14}
                                color={
                                  status === "cancelled"
                                    ? Theme.textMuted
                                    : Theme.positive
                                }
                              />
                              <Text style={styles.loadCardMetaText}>
                                {status === "cancelled"
                                  ? "Cancelled"
                                  : "Completed"}
                              </Text>
                            </>
                          ) : isAwardedPendingTrip ? (
                            <>
                              <FontAwesome
                                name="trophy"
                                size={14}
                                color={Theme.driverGold}
                              />
                              <Text style={styles.loadCardMetaText}>
                                Supplier Secured
                              </Text>
                            </>
                          ) : (
                            <>
                              {(quoteCounts[load.id] ?? 0) > 0 ? (
                                <BidReceivedHammer visible={true} size={14} />
                              ) : (
                                <FontAwesome
                                  name="gavel"
                                  size={14}
                                  color={Theme.textMuted}
                                />
                              )}
                              <Text style={styles.loadCardMetaText}>
                                {quoteCounts[load.id] ?? 0} Bids Received
                              </Text>
                            </>
                          )}
                        </View>
                        <View style={styles.loadCardActions}>
                          <TouchableOpacity
                            style={styles.shareIndentBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              if (isDone || isAwardedPendingTrip) onIndentPress(load);
                              else handleShareIndent(load);
                            }}
                            activeOpacity={0.9}
                          >
                            <FontAwesome
                              name="share-alt"
                              size={12}
                              color={Theme.textPrimaryDark}
                              style={styles.shareIndentBtnIcon}
                            />
                            <Text style={styles.shareIndentBtnText}>
                              {isDone || isAwardedPendingTrip
                                ? "View Detail"
                                : "Share"}
                            </Text>
                          </TouchableOpacity>
                          {isDone ? null : isAwaitingSupplierDeploy ? (
                            <View style={styles.deployPendingWrap}>
                              <Text style={styles.deployPendingText}>
                                Pending
                              </Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.reviewBidsBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedQuoteId(null);
                                setLoadAction({ type: "AWARD", load });
                              }}
                              activeOpacity={0.9}
                            >
                              <Text style={styles.reviewBidsBtnText}>
                                Review Hub
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {loadSubTab === "GET_LOAD" &&
            (marketLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : marketError ? (
              <View style={styles.emptyWrap}>
                <FontAwesome
                  name="exclamation-circle"
                  size={40}
                  color={Theme.textMuted}
                />
                <Text style={styles.emptyTitle}>Find Work</Text>
                <Text style={styles.emptySub}>
                  Unable to load loads. Check your connection or try again.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.quoteBtn,
                    { marginTop: 16, alignSelf: "center" },
                  ]}
                  onPress={() => refetchMarketIndents()}
                  activeOpacity={0.9}
                >
                  <FontAwesome
                    name="refresh"
                    size={14}
                    color={Theme.teslaRed}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.quoteBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : filteredFindWorkLoads.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrapMuted}>
                  <FontAwesome
                    name="trophy"
                    size={56}
                    color={Theme.textMuted}
                  />
                </View>
                <Text style={styles.emptyTitle}>Find Work</Text>
                <Text style={styles.emptySub}>
                  Loads shared with you by partners will appear here. Connect as
                  an integrated supplier to see loads from shippers.
                </Text>
              </View>
            ) : (
              filteredFindWorkLoads.map((load) => {
                const existingQuote = myQuoteByIndentId.get(load.id);
                const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
                const isPending = quoteStatus === "pending";
                const isRejected = quoteStatus === "rejected";
                const isAccepted = quoteStatus === "accepted";
                const openBidModal = () => {
                  setQuoteAmount(
                    existingQuote ? String(existingQuote.amount) : "",
                  );
                  setLoadAction({ type: "BID", load });
                };
                return (
                    <TouchableOpacity
                      key={load.id}
                      style={styles.loadCard}
                      onPress={() => onIndentPress(load)}
                      activeOpacity={0.8}
                    >
                    <View style={styles.loadCardTop}>
                      <View style={styles.loadCardTopLeft}>
                        <Text style={styles.getLoadCompany} numberOfLines={2}>
                          {(
                            load.creator_organization_name ||
                            load.client_name ||
                            "—"
                          ).toUpperCase()}
                        </Text>
                        <Text style={styles.loadCardRouteGet} numberOfLines={4}>
                          {load.pickup_area || "—"} →{" "}
                          {load.drop_location || "—"}
                        </Text>
                      </View>
                      <View style={styles.loadCardTopRight}>
                        <Text style={styles.getLoadTargetLabel}>
                          Target rate
                        </Text>
                        <Text style={styles.getLoadTargetValue}>
                          {formatINR(
                            Number(
                              load.supplier_target ?? load.client_price ?? 0,
                            ),
                          )}
                        </Text>
                      </View>
                    </View>
                    {existingQuote ? (
                      isAccepted ? (
                        <View style={styles.quoteSentRow}>
                          <View style={styles.quoteSentBadge}>
                            <FontAwesome
                              name="trophy"
                              size={12}
                              color={Theme.teslaRed}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.quoteSentText}>
                              Awarded — see Secured
                            </Text>
                          </View>
                        </View>
                      ) : isRejected ? (
                        <View style={styles.quoteSentRow}>
                          <View style={styles.quoteSentBadge}>
                            <Text style={styles.quoteDeclinedText}>
                              Quote declined
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.updateQuoteBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              openBidModal();
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.updateQuoteBtnText}>
                              Send new quote
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.quoteSentRow}>
                          <View style={styles.quoteSentBadge}>
                            <FontAwesome
                              name="check"
                              size={12}
                              color={Theme.textMuted}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.quoteSentText}>
                              Quote Sent{" "}
                              {formatINR(Number(existingQuote.amount))}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.updateQuoteBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              openBidModal();
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.updateQuoteBtnText}>
                              Update quote
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )
                    ) : (
                      <TouchableOpacity
                        style={styles.quoteBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          openBidModal();
                        }}
                        activeOpacity={0.9}
                      >
                        <FontAwesome
                          name="arrow-up"
                          size={14}
                          color={Theme.teslaRed}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.quoteBtnText}>
                          Send Price Quote
                        </Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            ))}

          {loadSubTab === "AWARDED" &&
            (filteredSecuredLoads.length === 0 &&
            filteredSecuredDoneLoads.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrapGold}>
                  <FontAwesome
                    name="trophy"
                    size={56}
                    color={Theme.driverGold}
                  />
                </View>
                <Text style={styles.emptyTitle}>Secured</Text>
                <Text style={styles.emptySub}>
                  Secured loads will appear here.
                </Text>
              </View>
            ) : (
              <>
                {filteredSecuredLoads.length > 0 ? (
                  <View style={styles.securedSection}>
                    <View style={styles.securedSectionHeader}>
                      <Text style={styles.securedSectionTitle}>
                        Ready to Deploy
                      </Text>
                      <Text style={styles.securedSectionCount}>
                        {filteredSecuredLoads.length}
                      </Text>
                    </View>
                    {filteredSecuredLoads.map((load) =>
                      renderSecuredLoadCard(load, false),
                    )}
                  </View>
                ) : null}
                {filteredSecuredDoneLoads.length > 0 ? (
                  <View style={styles.securedSection}>
                    <View style={styles.securedSectionHeader}>
                      <Text style={styles.securedSectionTitle}>Done</Text>
                      <Text style={styles.securedSectionCount}>
                        {filteredSecuredDoneLoads.length}
                      </Text>
                    </View>
                    {filteredSecuredDoneLoads.map((load) =>
                      renderSecuredLoadCard(load, true),
                    )}
                  </View>
                ) : null}
              </>
            ))}
        </ScrollView>
      </View>

      {/* Success overlay */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <FontAwesome name="check" size={16} color={Theme.textOnPrimary} />
            </View>
            <Text style={styles.successTag}>Success</Text>
            <Text style={styles.successTitle}>{successMsg || "Success"}</Text>
          </View>
        </View>
      )}

      {/* Post / Broadcast modal — opens create-indent (reference: Deploy New Load) */}
      <Modal
        visible={showPostModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPostModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPostModal(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderBack} />
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={styles.modalTitle}>Deploy New Load</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPostModal(false)}
                hitSlop={12}
                style={styles.modalHeaderClose}
              >
                <FontAwesome name="times" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Create an indent to share with your network.
            </Text>
            <TouchableOpacity
              style={styles.modalSubmit}
              onPress={() => {
                setShowPostModal(false);
                onCreateIndentPress();
              }}
              activeOpacity={0.9}
            >
              <FontAwesome
                name="send"
                size={16}
                color={Theme.primary}
                style={{ marginRight: 12 }}
              />
              <Text style={styles.modalSubmitText}>Share with Network</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Offer Hub modal — list quotes, select one, Award */}
      <Modal
        visible={loadAction?.type === "AWARD"}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setLoadAction(null);
          setSelectedQuoteId(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => {
            setLoadAction(null);
            setSelectedQuoteId(null);
          }}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={styles.modalTitle}>Offer Hub</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setLoadAction(null);
                  setSelectedQuoteId(null);
                }}
                hitSlop={12}
                style={styles.modalHeaderClose}
              >
                <FontAwesome name="times" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
            {awardModalQuotesLoading ? (
              <View style={styles.bidEmptyWrap}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.bidEmptyText}>Loading offers…</Text>
              </View>
            ) : awardModalQuotes.length === 0 ? (
              <View style={styles.bidEmptyWrap}>
                <FontAwesome
                  name="inbox"
                  size={32}
                  color={Theme.textMuted}
                  style={{ marginBottom: 12 }}
                />
                <Text style={styles.bidEmptyText}>No offers yet</Text>
                <Text style={styles.bidEmptySubtext}>
                  Share this load to get offers from your network.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.offerHubSummary}>
                  <Text style={styles.offerHubSummaryText}>
                    {awardModalQuotes.length} offer
                    {awardModalQuotes.length !== 1 ? "s" : ""}
                  </Text>
                  {lowestPendingAmount != null && pendingOfferCount > 0 && (
                    <Text style={styles.offerHubSummaryLowest}>
                      Lowest: {formatINR(lowestPendingAmount)}
                    </Text>
                  )}
                </View>
                <View style={styles.quoteHeaderRow}>
                  <Text style={styles.quoteHeaderName}>Bidder</Text>
                  <Text style={styles.quoteHeaderAmount}>Amount</Text>
                  <Text style={styles.quoteHeaderStatus}>Status</Text>
                </View>
                <ScrollView
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator
                >
                  {sortedOfferHubQuotes.map((q: DirectQuoteRow) => {
                    const isPending =
                      (q.status || "").toLowerCase() === "pending";
                    const isSelected = selectedQuoteId === q.id;
                    return (
                      <TouchableOpacity
                        key={q.id}
                        style={[
                          styles.quoteRow,
                          isSelected && styles.quoteRowSelected,
                          !isPending && styles.quoteRowDisabled,
                        ]}
                        onPress={() =>
                          isPending &&
                          setSelectedQuoteId(isSelected ? null : q.id)
                        }
                        activeOpacity={0.8}
                        disabled={!isPending}
                      >
                        <Text style={styles.quoteRowName} numberOfLines={1}>
                          {q.bidder_organization_name ?? "—"}
                        </Text>
                        <Text style={styles.quoteRowAmount}>
                          {formatINR(Number(q.amount ?? 0))}
                        </Text>
                        <Text style={styles.quoteRowStatus}>
                          {(q.status || "").toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {pendingOfferCount === 0 && (
                  <Text style={styles.bidEmptySubtext}>
                    No pending offers to award.
                  </Text>
                )}
                {pendingOfferCount > 0 && (
                  <Text style={styles.bidEmptySubtext}>
                    Tap an offer to select, then Award selected.
                  </Text>
                )}
              </>
            )}
            {loadAction?.type === "AWARD" && (
              <>
                <TouchableOpacity
                  style={[styles.modalSubmit, { marginTop: 16 }]}
                  onPress={handleAwardQuote}
                  activeOpacity={0.9}
                  disabled={
                    awarding ||
                    !selectedQuoteId ||
                    !awardModalQuotes.some(
                      (q) =>
                        q.id === selectedQuoteId &&
                        (q.status || "").toLowerCase() === "pending",
                    )
                  }
                >
                  <Text style={styles.modalSubmitText}>
                    {awarding ? "Awarding…" : "Award selected"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.viewIndentBtn}
                  onPress={() => {
                    setLoadAction(null);
                    setSelectedQuoteId(null);
                    onIndentPress(loadAction.load);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.viewIndentBtnText}>View Indent</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Submit Registry Bid modal (reference) */}
      <Modal
        visible={loadAction?.type === "BID"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setLoadAction(null);
          setQuoteAmount("");
        }}
      >
        <KeyboardAvoidingView
          behavior={RNPlatform.OS === "ios" ? "padding" : undefined}
          style={styles.bidModalPage}
        >
          <View
            style={[
              styles.modalSheet,
              styles.bidModalSheetFull,
              {
                paddingTop: insets.top + 12,
                paddingBottom: 24 + insets.bottom,
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, styles.bidModalTitle]}>
                Submit Registry Bid
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setLoadAction(null);
                  setQuoteAmount("");
                }}
                hitSlop={12}
              >
                <FontAwesome name="times" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.bidModalScroll}
              contentContainerStyle={styles.bidModalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loadAction?.type === "BID" ? (
                <View style={styles.bidIndentDetailSection}>
                  <View style={styles.bidIndentCard}>
                    <View style={styles.bidIndentCardAccent} />
                    <View style={styles.bidIndentCardHeaderRow}>
                      <Package
                        size={16}
                        color={Theme.teslaRed}
                        strokeWidth={2.2}
                      />
                      <Text style={styles.bidIndentCardHeaderLabel}>
                        Load summary
                      </Text>
                    </View>
                    <View style={styles.bidIndentCardTop}>
                      <View style={styles.bidIndentCardTopLeft}>
                        <Text style={styles.bidIndentCardOrg} numberOfLines={2}>
                          {(
                            loadAction.load.creator_organization_name ||
                            loadAction.load.client_name ||
                            "—"
                          )
                            .trim()
                            .toUpperCase() || "—"}
                        </Text>
                        <Text
                          style={styles.bidIndentCardRoute}
                          numberOfLines={4}
                        >
                          {(loadAction.load.pickup_area || "—").trim()} →{" "}
                          {(loadAction.load.drop_location || "—").trim()}
                        </Text>
                        <Text style={styles.bidIndentCardId} numberOfLines={1}>
                          ID: {getIndentDisplayNumber(loadAction.load)}
                        </Text>
                      </View>
                      <View style={styles.bidIndentCardTopRight}>
                        <View style={styles.bidIndentDatePill}>
                          <Text style={styles.bidIndentDatePillText}>
                            {loadAction.load.pickup_date
                              ? new Date(
                                  loadAction.load.pickup_date,
                                ).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                })
                              : "—"}
                          </Text>
                        </View>
                        <Text style={styles.bidIndentCardTargetLabel}>
                          Target price
                        </Text>
                        <Text style={styles.bidIndentCardTargetValue}>
                          {formatINR(
                            Number(
                              loadAction.load.supplier_target ??
                                loadAction.load.client_price ??
                                0,
                            ),
                          )}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.bidIndentCardDivider} />
                    {loadAction.load.vehicle_type ? (
                      <View style={styles.bidIndentSpecRow}>
                        <Text style={styles.bidIndentSpecLabel}>Vehicle</Text>
                        <Text
                          style={styles.bidIndentSpecValue}
                          numberOfLines={2}
                        >
                          {loadAction.load.vehicle_type}
                        </Text>
                      </View>
                    ) : null}
                    {loadAction.load.load_type ? (
                      <View style={styles.bidIndentSpecRow}>
                        <Text style={styles.bidIndentSpecLabel}>Load type</Text>
                        <Text
                          style={styles.bidIndentSpecValue}
                          numberOfLines={2}
                        >
                          {loadAction.load.load_type}
                        </Text>
                      </View>
                    ) : null}
                    {loadAction.load.weight != null &&
                    Number(loadAction.load.weight) > 0 ? (
                      <View style={styles.bidIndentSpecRow}>
                        <Text style={styles.bidIndentSpecLabel}>Weight</Text>
                        <Text style={styles.bidIndentSpecValue}>
                          {(Number(loadAction.load.weight) / 1000).toFixed(2)} tons
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.bidIndentStatusRow}>
                      <Text style={styles.bidIndentStatusLabel}>Status</Text>
                      <View style={styles.bidIndentStatusPill}>
                        <Text style={styles.bidIndentStatusPillText}>
                          {(loadAction.load.status || "—")
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}
              <View style={styles.bidInputBlock}>
                <Text style={styles.quoteLabel}>Target Price (₹)</Text>
                <TextInput
                  style={styles.quoteInput}
                  keyboardType="numeric"
                  placeholder={
                    loadAction?.type === "BID" && loadAction.load
                      ? (() => {
                          const target =
                            loadAction.load.supplier_target ??
                            loadAction.load.client_price;
                          return target != null && Number(target) > 0
                            ? `Target rate: ${formatINR(Number(target))}`
                            : "Target price (₹)";
                        })()
                      : "Target price (₹)"
                  }
                  placeholderTextColor={Theme.textMuted}
                  value={quoteAmount}
                  onChangeText={setQuoteAmount}
                />
              </View>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={async () => {
                  if (!orgId || loadAction?.type !== "BID") {
                    return;
                  }
                  const value = Number(
                    String(quoteAmount).replace(/,/g, "").trim(),
                  );
                  if (!Number.isFinite(value) || value <= 0) {
                    Alert.alert(
                      "Invalid amount",
                      "Please enter a valid quote amount.",
                    );
                    return;
                  }
                  const load = loadAction.load;
                  const hadExistingQuote = !!myQuoteByIndentId.get(load.id);
                  try {
                    setSubmittingQuote(true);
                    const { error } = await createDirectQuote(
                      load.id,
                      orgId,
                      value,
                      null,
                      null,
                      null,
                    );
                    setSubmittingQuote(false);
                    if (error) {
                      Alert.alert("Could not publish offer", error.message);
                      refetchMarketIndents();
                      return;
                    }
                    invalidateIndents(orgId);
                    queryClient.invalidateQueries({
                      queryKey: [
                        ...queryKeys.indents.all(orgId),
                        "my-direct-quotes",
                      ],
                    });
                    triggerSuccess(
                      hadExistingQuote ? "Quote updated" : "Offer Published",
                    );
                    setLoadAction(null);
                  } catch (e) {
                    setSubmittingQuote(false);
                    const msg =
                      e instanceof Error
                        ? e.message
                        : "Unknown error while publishing offer.";
                    Alert.alert("Could not publish offer", msg);
                    refetchMarketIndents();
                  }
                }}
                activeOpacity={0.9}
                disabled={submittingQuote}
              >
                <Text style={styles.modalSubmitText}>
                  {submittingQuote ? "Publishing…" : "Publish Bid"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Staff Handshake modal: Roster (driver + vehicle from org) or Ad hoc driver (OTP claim). Triggered from Secured tab (ASSIGN STAFF & DEPLOY). O(n): drivers/vehicles loaded once per org. */}
      <Modal
        visible={loadAction?.type === "ASSIGN"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleStaffHandshakeBack}
      >
        <View style={[styles.assignModalPage, { paddingTop: insets.top }]}>
          <View style={styles.assignModalHeader}>
            <View style={styles.assignModalHeaderText}>
              <Text style={styles.assignModalTitle}>Staff Handshake</Text>
              <Text style={styles.assignModalSubtitle}>
                Network Node Selection
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setLoadAction(null);
                setDeployOtpCode(null);
                setDeployOtpExpiresAt(null);
                setDeployTripIdForOtp(null);
                setHandshakeStep("flow_choice");
              }}
              hitSlop={12}
              style={styles.assignModalCloseBtn}
            >
              <FontAwesome name="times" size={18} color={Theme.textMuted} />
            </TouchableOpacity>
          </View>
          {loadAction?.type === "ASSIGN" && (
            <ScrollView
              style={styles.assignModalScroll}
              contentContainerStyle={[
                styles.assignModalScrollContent,
                { paddingBottom: 24 + insets.bottom },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {/* OTP result (ad hoc flow completed) */}
              {deployOtpCode ? (
                <>
                  <Text style={styles.modalHint}>
                    Share this code with the driver to claim the trip.
                  </Text>
                  <View style={styles.otpCard}>
                    <Text style={styles.otpCode}>{deployOtpCode}</Text>
                    {deployOtpExpiresAt ? (
                      <Text style={styles.otpExpiry}>
                        Expires {new Date(deployOtpExpiresAt).toLocaleString()}
                      </Text>
                    ) : null}
                    <View style={styles.otpActions}>
                      <TouchableOpacity
                        style={styles.otpBtn}
                        onPress={() => {
                          Clipboard.setStringAsync(deployOtpCode).then(() =>
                            triggerSuccess("Copied"),
                          );
                        }}
                      >
                        <Text style={styles.otpBtnText}>Copy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.otpBtn}
                        onPress={() => {
                          Share.share({
                            message: `Claim this trip with code: ${deployOtpCode}`,
                            title: "Trip claim code",
                          }).catch(() => {});
                        }}
                      >
                        <Text style={styles.otpBtnText}>Share</Text>
                      </TouchableOpacity>
                      {deployTripIdForOtp ? (
                        <TouchableOpacity
                          style={styles.otpBtn}
                          onPress={async () => {
                            const { code, expires_at } =
                              await regenerateTripOtp(deployTripIdForOtp);
                            if (code) {
                              setDeployOtpCode(code);
                              setDeployOtpExpiresAt(expires_at ?? null);
                              triggerSuccess("OTP regenerated");
                            }
                          }}
                        >
                          <Text style={styles.otpBtnText}>Regenerate</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.modalSubmit, styles.handshakeBtnModal]}
                    onPress={() => {
                      setLoadAction(null);
                      setDeployOtpCode(null);
                      setDeployOtpExpiresAt(null);
                      setDeployTripIdForOtp(null);
                      setHandshakeStep("flow_choice");
                      const isShipper =
                        loadAction?.type === "ASSIGN" &&
                        loadAction.load.organization_id === orgId;
                      if (isShipper)
                        router.push(
                          "/(tabs)/trips" as import("expo-router").Href,
                        );
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalSubmitText}>
                      {loadAction?.type === "ASSIGN" &&
                      loadAction.load.organization_id === orgId
                        ? "Go to Trips"
                        : "Done"}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : handshakeStep === "flow_choice" ? (
                /* Step 1: How to assign — Roster (driver + vehicle from org) or Ad hoc driver (OTP). */
                <>
                  <Text style={styles.sourceOfSupplySectionTitle}>
                    How do you want to assign this load?
                  </Text>
                  <View style={styles.sourceRow}>
                    <TouchableOpacity
                      style={[styles.sourceOption, styles.sourceOptionFirst]}
                      onPress={() => {
                        setUseAdHocDriver(false);
                        setAssignVehicleRegistration("");
                        setHandshakeStep("roster");
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.sourceOptionIconWrap}>
                        <FontAwesome
                          name="truck"
                          size={16}
                          color={Theme.textMuted}
                        />
                      </View>
                      <Text style={styles.sourceOptionLabel}>Asset</Text>
                      <Text style={styles.sourceOptionSubtitle}>
                        Driver & vehicle from my org
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sourceOption, styles.sourceOptionLast]}
                      onPress={() => {
                        setUseAdHocDriver(true);
                        setAssignDriverId(null);
                        setAssignVehicleId(undefined);
                        setAssignVehicleRegistration("");
                        setHandshakeStep("ad_hoc_driver");
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.sourceOptionIconWrap}>
                        <FontAwesome
                          name="handshake-o"
                          size={16}
                          color={Theme.textMuted}
                        />
                      </View>
                      <Text style={styles.sourceOptionLabel}>Aggregate</Text>
                      <Text style={styles.sourceOptionSubtitle}>
                        Share OTP for driver to claim
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : handshakeStep === "roster" ? (
                /* Roster: driver + vehicle, then Authorize Voyage */
                <>
                  <TouchableOpacity
                    style={styles.wizardBackBtn}
                    onPress={() => setHandshakeStep("flow_choice")}
                  >
                    <FontAwesome
                      name="arrow-left"
                      size={14}
                      color={Theme.primary}
                    />
                    <Text style={styles.wizardBackText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.sourceOfSupplySectionTitle}>Asset</Text>
                  <Text style={styles.modalHint}>
                    Assign driver and vehicle from your org, then authorize
                    voyage.
                  </Text>
                  {(() => {
                    const selectedDriver = activeDrivers.find(
                      (d) => d.id === assignDriverId,
                    );
                    const selectedVehicle =
                      typeof assignVehicleId === "string"
                        ? vehicles.find((v) => v.id === assignVehicleId)
                        : null;
                    return (
                      <>
                        {selectedDriver ? (
                          <View
                            style={[
                              styles.assignRow,
                              styles.assignRowActive,
                              { marginBottom: 8 },
                            ]}
                          >
                            <Text style={styles.assignRowText}>
                              Driver:{" "}
                              {selectedDriver.name ??
                                selectedDriver.phone ??
                                "—"}
                            </Text>
                            <FontAwesome
                              name="check"
                              size={16}
                              color={Theme.primary}
                            />
                          </View>
                        ) : null}
                        {selectedVehicle ? (
                          <View
                            style={[
                              styles.assignRow,
                              styles.assignRowActive,
                              { marginBottom: 16 },
                            ]}
                          >
                            <Text style={styles.assignRowText}>
                              Vehicle: {selectedVehicle.vehicle_number}
                              {selectedVehicle.vehicle_type
                                ? ` · ${selectedVehicle.vehicle_type}`
                                : ""}
                            </Text>
                            <FontAwesome
                              name="check"
                              size={16}
                              color={Theme.primary}
                            />
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                  <Text style={styles.assignSectionLabel}>Driver</Text>
                  {activeDrivers.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.assignRow,
                        assignDriverId === d.id && styles.assignRowActive,
                      ]}
                      onPress={() => setAssignDriverId(d.id)}
                    >
                      <Text style={styles.assignRowText}>
                        {d.name ?? d.phone ?? "—"}
                      </Text>
                      {assignDriverId === d.id ? (
                        <FontAwesome
                          name="check"
                          size={16}
                          color={Theme.primary}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                  {activeDrivers.length === 0 ? (
                    <Text style={styles.modalHint}>
                      No asset drivers. Use Aggregate flow from the previous
                      step.
                    </Text>
                  ) : null}
                  <Text style={styles.assignSectionLabel}>Vehicle</Text>
                  {vehicles.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.assignRow,
                        assignVehicleId === v.id && styles.assignRowActive,
                      ]}
                      onPress={() => setAssignVehicleId(v.id)}
                    >
                      <Text style={styles.assignRowText}>
                        {v.vehicle_number}
                        {v.vehicle_type ? ` · ${v.vehicle_type}` : ""}
                      </Text>
                      {assignVehicleId === v.id ? (
                        <FontAwesome
                          name="check"
                          size={16}
                          color={Theme.primary}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                  {vehicles.length === 0 ? (
                    <Text style={styles.modalHint}>
                      No vehicles in your fleet. Add a vehicle in Resources
                      first.
                    </Text>
                  ) : null}
                  {assigningTripId === loadAction.load.id ? (
                    <View style={styles.loadingWrap}>
                      <ActivityIndicator size="small" color={Theme.primary} />
                      <Text style={styles.loadingText}>Creating trip…</Text>
                    </View>
                  ) : rosterReady ? (
                    <TouchableOpacity
                      style={[styles.modalSubmit, styles.handshakeBtnModal]}
                      onPress={() => handleDeployRoster(loadAction.load)}
                      activeOpacity={0.9}
                    >
                      <FontAwesome
                        name="bolt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.modalSubmitText}>
                        Authorize Voyage
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.modalHint}>
                      Select a driver and a vehicle from your org to continue.
                    </Text>
                  )}
                </>
              ) : handshakeStep === "ad_hoc_driver" ? (
                /* Ad hoc driver: OTP for driver to claim */
                <>
                  <TouchableOpacity
                    style={styles.wizardBackBtn}
                    onPress={() => setHandshakeStep("flow_choice")}
                  >
                    <FontAwesome
                      name="arrow-left"
                      size={14}
                      color={Theme.primary}
                    />
                    <Text style={styles.wizardBackText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.sourceOfSupplySectionTitle}>
                    Aggregate
                  </Text>
                  <Text style={styles.modalHint}>
                    Who will drive this trip?
                  </Text>
                  <View style={[styles.wizardCard, styles.assignRowActive]}>
                    <FontAwesome
                      name="user-o"
                      size={20}
                      color={Theme.primary}
                      style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.wizardCardTitle}>
                        Aggregate driver
                      </Text>
                      <Text style={styles.wizardCardSubtitle}>
                        I'll share an OTP with the driver so they can claim the
                        trip in the app.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.modalSubmit, styles.handshakeBtnModal]}
                    onPress={() => setHandshakeStep("ad_hoc_vehicle")}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalSubmitText}>Continue</Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Aggregate path Step 2: Vehicle (optional), then Deploy & get OTP */
                <>
                  <TouchableOpacity
                    style={styles.wizardBackBtn}
                    onPress={() => setHandshakeStep("ad_hoc_driver")}
                  >
                    <FontAwesome
                      name="arrow-left"
                      size={14}
                      color={Theme.primary}
                    />
                    <Text style={styles.wizardBackText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalHint}>
                    Vehicle (optional). Enter the vehicle registration number if
                    known.
                  </Text>
                  <View style={styles.assignInputWrap}>
                    <TextInput
                      style={styles.assignVehicleInput}
                      placeholder="Vehicle registration number"
                      placeholderTextColor={Theme.textMuted}
                      value={assignVehicleRegistration}
                      onChangeText={setAssignVehicleRegistration}
                      editable={true}
                    />
                  </View>
                  {assigningTripId === loadAction.load.id ? (
                    <View style={styles.loadingWrap}>
                      <ActivityIndicator size="small" color={Theme.primary} />
                      <Text style={styles.loadingText}>Creating trip…</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.modalSubmit, styles.handshakeBtnModal]}
                      onPress={() => handleDeployAdHoc(loadAction.load)}
                      activeOpacity={0.9}
                    >
                      <FontAwesome
                        name="share-alt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.modalSubmitText}>
                        Deploy & get OTP
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

/** Reference: route text red #F44336 */
const LOAD_ROUTE_RED = "#F44336";
/** Reference: content bg #f4f5f7 */
const LOAD_CONTENT_BG = "#f4f5f7";
/** Reference: broadcast area #eef1f6 */
const LOAD_BROADCAST_BG = "#eef1f6";
/** Reference: broadcast icon/label #829ab1 */
const LOAD_BROADCAST_MUTED = "#829ab1";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    backgroundColor: Theme.darkBackground,
  },
  loadDarkHeader: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  loadDarkHeaderSecured: {
    paddingBottom: 2,
  },
  loadFilterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  loadFilterScroll: {
    maxHeight: 36,
    flex: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  loadFilterScrollContent: {
    paddingLeft: 4,
    paddingRight: 24,
    gap: 16,
    flexGrow: 0,
  },
  loadFilterTab: {
    position: "relative" as const,
    paddingVertical: 8,
    marginRight: 6,
  },
  loadFilterTabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  loadFilterTabText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  loadFilterTabTextActive: { color: Theme.textOnDark },
  loadFilterTabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadFilterTabBadgeActive: {
    backgroundColor: Theme.darkSurface,
  },
  loadFilterTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Theme.teslaRed,
  },
  loadFilterAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(248,250,252,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  loadModeCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadModeCountBadgeActive: {
    backgroundColor: Theme.darkSurface,
  },
  loadModeCountText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textAlign: "center",
  },
  loadModeCountTextActive: { color: Theme.textOnDark },
  loadSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  loadSearchRowSecured: {
    paddingTop: 6,
  },
  loadSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  loadSearchIcon: { marginRight: 6 },
  loadSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: Theme.textOnDark,
    paddingVertical: 0,
  },
  loadTypeFilterWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 5,
    paddingVertical: 3,
    gap: 3,
  },
  loadTypeFilterChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  loadTypeFilterChipActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  loadTypeFilterChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadTypeFilterChipTextActive: {
    color: Theme.textOnDark,
  },
  loadTypeFilterChipCount: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
  },
  loadTypeFilterChipCountActive: {
    color: Theme.textOnDark,
  },
  loadContentWrap: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    backgroundColor: LOAD_CONTENT_BG,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    overflow: "hidden",
  },
  loadContentWrapSecured: {
    marginTop: 0,
  },
  scroll: { flex: 1, width: "100%", minWidth: 0 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    flexGrow: 1,
    width: "100%",
  },
  scrollContentSecured: {
    paddingTop: 12,
  },
  shareCard: {
    borderWidth: 2,
    ...(Platform.OS === "android" ? { borderStyle: "dashed" as const } : {}),
    borderColor: "transparent",
    borderRadius: 10,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
    backgroundColor: LOAD_BROADCAST_BG,
  },
  shareCardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#dce4ee",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  shareCardText: {
    fontSize: 10,
    fontWeight: "700",
    color: LOAD_BROADCAST_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  loadingWrap: { paddingVertical: 32, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  loadCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  loadCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  loadCardTopLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  loadCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    maxWidth: "40%",
  },
  loadCardRoute: {
    fontSize: 12,
    fontWeight: "700",
    color: LOAD_ROUTE_RED,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 16,
  },
  loadCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: "#A0A0A0",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardDate: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  loadCardDateText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loadCardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadCardMetaText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  shareIndentBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#EAEAEA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  shareIndentBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  shareIndentBtnIcon: {
    marginRight: 6,
  },
  reviewBidsBtn: {
    backgroundColor: TESLA_BLACK,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  reviewBidsBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  deployPendingWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  deployPendingText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D0D0D0",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  awardedStatusPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  awardedStatusPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  getLoadCompany: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadCardRouteGet: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 16,
  },
  getLoadTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  getLoadTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  quoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    marginTop: 12,
  },
  quoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  quoteSentRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  quoteSentBadge: { flexDirection: "row", alignItems: "center" },
  quoteSentText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  quoteDeclinedText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  updateQuoteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  updateQuoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  awardedCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  awardedCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  awardedBadge: { flexDirection: "row", alignItems: "center" },
  awardedBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  awardedId: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  awardedRouteWrap: {
    backgroundColor: Theme.surfaceGray,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  awardedRoute: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  awardedAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  handshakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: TESLA_BLACK,
    borderRadius: 10,
  },
  handshakeBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  securedSection: {
    marginBottom: 20,
  },
  securedSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  securedSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  securedSectionCount: {
    minWidth: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textAlign: "center",
  },
  emptyWrap: {
    paddingVertical: 64,
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyIconWrapMuted: {
    marginBottom: 20,
    opacity: 0.4,
  },
  emptyIconWrapGold: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#A0A0A0",
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    lineHeight: 20,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  successCard: {
    minWidth: 170,
    maxWidth: 220,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  successIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTag: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  successTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  bidModalPage: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  bidModalSheetFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  modalSheetCenter: { alignItems: "center" },
  modalHandle: {
    width: 48,
    height: 4,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  modalHeaderBack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 40,
    height: 40,
  },
  modalHeaderBackText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.teslaRed,
  },
  modalHeaderTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeaderClose: {
    minWidth: 40,
    alignItems: "flex-end",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  modalHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 24,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
  },
  modalSubmitText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  handshakeBtnModal: { backgroundColor: Theme.buttonPrimary },
  sourceOfSupplySectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  sourceRow: {
    flexDirection: "row",
    gap: 10,
  },
  sourceOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    minHeight: 72,
  },
  sourceOptionFirst: {},
  sourceOptionLast: {
    borderRightWidth: 0,
  },
  sourceOptionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceOptionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sourceOptionSubtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  assignModalPage: {
    flex: 1,
    backgroundColor: "#f4f5f7",
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.primary,
  },
  assignModalSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  assignModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  assignModalScroll: { flex: 1 },
  assignModalScrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  assignSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: "transparent",
  },
  assignRowActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.screenBackground,
  },
  assignRowText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  assignInputWrap: {
    marginBottom: 6,
  },
  assignVehicleInput: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 44,
  },
  wizardBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  wizardBackText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  wizardCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  wizardCardActive: {
    borderColor: Theme.borderLight,
  },
  wizardCardIcon: {
    marginRight: 12,
  },
  wizardCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  wizardCardSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  otpCard: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  otpCode: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 4,
    marginBottom: 8,
  },
  otpExpiry: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 16,
  },
  otpActions: {
    flexDirection: "row",
    gap: 12,
  },
  otpBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 8,
  },
  otpBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteRowSelected: {
    backgroundColor: Theme.surfaceGray,
    borderLeftWidth: 4,
    borderLeftColor: Theme.teslaRed,
  },
  quoteRowDisabled: { opacity: 0.6 },
  quoteRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  viewIndentBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
  },
  viewIndentBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  offerHubSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    marginBottom: 12,
  },
  offerHubSummaryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  offerHubSummaryLowest: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.positive,
  },
  quoteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteHeaderName: {
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginRight: 8,
  },
  quoteHeaderAmount: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginRight: 8,
  },
  quoteHeaderStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  bidEmptyWrap: { paddingVertical: 32, alignItems: "center" },
  bidEmptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidEmptySubtext: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  bidModalTitle: { flex: 1 },
  bidModalScroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  bidModalScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  bidIndentDetailSection: {
    marginTop: 28,
    width: "100%",
    alignSelf: "stretch",
  },
  bidIndentCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingTop: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  bidIndentCardAccent: {
    height: 3,
    width: "100%",
    backgroundColor: Theme.primary,
    marginHorizontal: -14,
    marginBottom: 12,
  },
  bidIndentCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  bidIndentCardHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  bidIndentCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  bidIndentCardTopLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  bidIndentCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    maxWidth: "42%",
  },
  bidIndentCardOrg: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.5,
  },
  bidIndentCardRoute: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 16,
  },
  bidIndentCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidIndentDatePill: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  bidIndentDatePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidIndentCardTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 0,
  },
  bidIndentCardTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  bidIndentCardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceBorder,
    marginBottom: 4,
  },
  bidIndentSpecRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 8,
  },
  bidIndentSpecLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flexShrink: 0,
    maxWidth: "40%",
  },
  bidIndentSpecValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  bidIndentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
  bidIndentStatusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bidIndentStatusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  bidIndentStatusPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bidInputBlock: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 24,
  },
  quoteLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  quoteInput: {
    width: "100%",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 48,
  },
  quotePlaceholder: {
    fontSize: 36,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    marginBottom: 24,
  },
});
