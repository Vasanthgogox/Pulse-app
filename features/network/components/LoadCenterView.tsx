/**
 * Load Center — reference UI: Hire Partners | Find Work | Awarded.
 * Header "Load Center" / "Find or Hire Work", three sub-tabs, cards, modals.
 */
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { FinanceFAB } from "@/components/FinanceFAB";
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useOrganization } from "@/contexts/OrganizationContext";
import { searchExistingDriversByPhone } from "@/features/drivers/services/drivers.service";
import { upsertTripSubcontract } from "@/features/finance/services/tripSubcontracts.service";
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
import { shareDraftIndent } from "@/features/indents/services/indents.service";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import { setInitialTripForDetail } from "@/features/trips";
import {
    assignAggregateTripDriverByPhone,
    getDriverAvailabilityByPhoneGlobal,
    humanizeTripIdInRpcError,
    updateTripSupplier,
} from "@/features/trips/services/trips.service";
import { generateTripOtp, regenerateTripOtp } from "@/features/trips/services/tripOtp.service";
import {
    assignmentShellColors,
    assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { formatINR, formatMobileNumber } from "@/lib/format";
import { validatePhone } from "@/lib/phoneValidation";
import {
    useIndentOfferCountsQuery,
    useDriversQuery,
    useIndentDirectQuotesQuery,
    useIndentsQuery,
    useInvalidateIndents,
    useInvalidateTrips,
    useMarketIndentsQuery,
    useMyDirectQuotesQuery,
    useSuppliersQuery,
    useTripsQuery,
    useVehiclesQuery,
} from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import {
    Building2,
    ListChecks,
    Package,
    Share2,
    Truck,
    Users,
    X,
    Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
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
  {
    id: "OPEN",
    label: "Open",
    statuses: ["open", "pending", "broadcast", "draft"],
  },
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

/** Hide GET LOAD row state pill when the active status chip already matches (see GET LOAD cards). */
function shouldHideGetLoadStatePill(
  filter: StatusFilterTab,
  stateLabel: string,
  quoteAccepted: boolean,
): boolean {
  if (filter === "OPEN" && stateLabel === "OPEN") return true;
  if (filter === "QUOTED" && stateLabel === "QUOTED") return true;
  if (filter === "AWARDED" && quoteAccepted) return true;
  return false;
}

/** Status pill colors for Hire Partner cards (Tesla palette, no indigo). */
function giveLoadStatusPillStyles(status: string): {
  pill: object;
  text: object;
} {
  const s = (status || "").toLowerCase();
  if (s === "awarded") {
    return {
      pill: {
        backgroundColor: Theme.positive,
        borderWidth: 1,
        borderColor: Theme.darkGreen,
      },
      text: { color: Theme.textOnPrimary },
    };
  }
  if (["completed", "closed", "cancelled", "expired"].includes(s)) {
    return {
      pill: {
        backgroundColor: Theme.surfaceGray,
        borderWidth: 1,
        borderColor: Theme.borderMedium,
      },
      text: { color: Theme.textSecondary },
    };
  }
  if (s === "quoted") {
    return {
      pill: {
        backgroundColor: Theme.screenBackground,
        borderWidth: 1,
        borderColor: Theme.textPrimaryDark,
      },
      text: { color: Theme.textPrimaryDark },
    };
  }
  return {
    pill: {
      backgroundColor: Theme.tripHubUnassignedPillBg,
      borderWidth: 1,
      borderColor: Theme.textPrimaryDark,
    },
    text: { color: Theme.textPrimaryDark },
  };
}

function formatIndentCardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      .toUpperCase();
  } catch {
    return "—";
  }
}

interface LoadCenterViewProps {
  /** Top padding (e.g. from parent sub-tab row + safe area). */
  contentTopPadding?: number;
  /** Opens Network → My Network (connections / invitations). */
  onMyNetworkPress?: () => void;
  onCreateIndentPress: () => void;
  onIndentPress: (indent: IndentRow) => void;
  highlightedIndentId?: string | null;
  /** Opens ShareLoadSheet to broadcast this indent to the Pulse network. */
  onShareToNetwork?: (indent: IndentRow) => void;
}

const TESLA_BLACK = "#171A20";

export function LoadCenterView({
  contentTopPadding = 0,
  onMyNetworkPress,
  onCreateIndentPress,
  onIndentPress,
  highlightedIndentId,
  onShareToNetwork,
}: LoadCenterViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const scrollRef = useRef<FlashList<IndentRow>>(null);

  const [loadSubTab, setLoadSubTab] = useState<LoadSubTab>("GIVE_LOAD");
  const [loadTabsWrapWidth, setLoadTabsWrapWidth] = useState(0);
  const loadTabsActiveAnim = useRef(new Animated.Value(0)).current;
  const [statusFilterTab, setStatusFilterTab] =
    useState<StatusFilterTab>("OPEN");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadAvatarByIndentId, setLoadAvatarByIndentId] = useState<
    Record<string, string>
  >({});
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
  const [aggregateDriverTrackingName, setAggregateDriverTrackingName] =
    useState("");
  const aggregateDriverNameManualRef = useRef(false);
  const [aggregateDriverPhone, setAggregateDriverPhone] = useState("");
  const [aggregatePhoneName, setAggregatePhoneName] = useState<string | null>(
    null,
  );
  const [aggregatePhoneNotFound, setAggregatePhoneNotFound] = useState(false);
  const [aggregatePhoneInTrip, setAggregatePhoneInTrip] = useState(false);
  const aggregatePartnerRateInputRef = useRef<TextInput | null>(null);
  const aggregateAdvancePaidInputRef = useRef<TextInput | null>(null);
  const aggregateDriverNameInputRef = useRef<TextInput | null>(null);
  const aggregateDriverPhoneInputRef = useRef<TextInput | null>(null);
  const aggregateVehicleInputRef = useRef<TextInput | null>(null);
  const aggregatePhoneLookupTimeoutRef = useRef<number | null>(null);
  /** Prevents double-submit on Staff Handshake (parallel creates → unique trip_number 409). */
  const staffHandshakeDeployLockRef = useRef(false);
  const [subcontractSupplierId, setSubcontractSupplierId] = useState<
    string | null
  >(null);
  const [subcontractRate, setSubcontractRate] = useState<string>("");
  const [aggregateAdvancePaid, setAggregateAdvancePaid] = useState<string>("");
  const [deployOtpCode, setDeployOtpCode] = useState<string | null>(null);
  const [deployOtpExpiresAt, setDeployOtpExpiresAt] = useState<string | null>(
    null,
  );
  const [deployTripIdForOtp, setDeployTripIdForOtp] = useState<string | null>(
    null,
  );
  /** Staff Handshake: mirror Add Trip — assign driver/vehicle on trip detail when on. */
  const [staffHandshakeAssignLater, setStaffHandshakeAssignLater] =
    useState(false);
  const [localBidHistoryByIndentId, setLocalBidHistoryByIndentId] = useState<
    Record<string, { amount: number; updatedAt: string }[]>
  >({});
  const isSingleRowHeader = Platform.OS === "web" && width >= 1200;
  const isCompactModalLayout = Platform.OS === "web" && width < 920;

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
  const { data: suppliers = [] } = useSuppliersQuery(orgId);
  const invalidateTrips = useInvalidateTrips();
  const invalidateIndents = useInvalidateIndents();
  const queryClient = useQueryClient();

  const isClaimedTab = loadSubTab === "AWARDED";
  const loadSubTabIndex =
    loadSubTab === "GIVE_LOAD" ? 0 : loadSubTab === "GET_LOAD" ? 1 : 2;
  useEffect(() => {
    Animated.timing(loadTabsActiveAnim, {
      toValue: loadSubTabIndex,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [loadSubTabIndex, loadTabsActiveAnim]);

  const useGridLayout = width >= 1024;
  const isMobileView = width < 820;
  /** Narrow cards: stack bid meta + actions so CTAs stay on a clean second row. */
  const compactIndentFooter = width < 520;

  useEffect(() => {
    if (!highlightedIndentId || useGridLayout) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToItem({
        animated: true,
        item: { id: highlightedIndentId } as IndentRow,
        viewPosition: 0.5,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [highlightedIndentId, useGridLayout]);

  /** O(myQuotes.length): map indent_id -> quote for Find Work "Quote Sent" / "Update quote" and modal prefill. */
  const myQuoteByIndentId = useMemo(() => {
    const m = new Map<string, DirectQuoteRow>();
    for (const q of myQuotes) m.set(q.indent_id, q);
    return m;
  }, [myQuotes]);
  const activeBidQuote = useMemo(() => {
    if (loadAction?.type !== "BID") return null;
    return myQuoteByIndentId.get(loadAction.load.id) ?? null;
  }, [loadAction, myQuoteByIndentId]);
  const activeBidQuoteUpdatedAt = useMemo(() => {
    if (!activeBidQuote?.updated_at) return null;
    const parsed = new Date(activeBidQuote.updated_at);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [activeBidQuote?.updated_at]);
  const activeBidHistory = useMemo(() => {
    if (loadAction?.type !== "BID") return [];
    const indentId = loadAction.load.id;
    const localHistory = localBidHistoryByIndentId[indentId] ?? [];
    return localHistory
      .filter((entry) => Number.isFinite(Number(entry.amount)))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [loadAction, localBidHistoryByIndentId]);

  const visiblePartnersForHandshake = useMemo(() => {
    const base = suppliers;
    // Never hide the currently selected partner (keeps existing selection stable).
    if (
      subcontractSupplierId &&
      !base.some((s) => s.id === subcontractSupplierId)
    ) {
      const selected = suppliers.find((s) => s.id === subcontractSupplierId);
      if (selected) return [selected, ...base];
    }
    return base;
  }, [
    suppliers,
    subcontractSupplierId,
  ]);

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

  useEffect(() => {
    const trimmed = aggregateDriverPhone.trim();
    if (aggregatePhoneLookupTimeoutRef.current)
      clearTimeout(aggregatePhoneLookupTimeoutRef.current);
    aggregatePhoneLookupTimeoutRef.current = setTimeout(() => {
      aggregatePhoneLookupTimeoutRef.current = null;
      const digits = trimmed.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      if (last10.length < 10) {
        setAggregatePhoneName(null);
        setAggregatePhoneNotFound(false);
        setAggregatePhoneInTrip(false);
        return;
      }

      searchExistingDriversByPhone(last10).then(async ({ matches }) => {
        const direct = matches[0]?.full_name ?? null;
        let foundName = direct;

        if (!foundName) {
          // Some deployments store phone as +91XXXXXXXXXX; try that too.
          const { matches: matchesWithCode } =
            await searchExistingDriversByPhone(`+91${last10}`);
          foundName = matchesWithCode[0]?.full_name ?? null;
        }

        setAggregatePhoneName(foundName);
        if (foundName && !aggregateDriverNameManualRef.current) {
          // Autofill from phone lookup unless user manually edited the field.
          setAggregateDriverTrackingName(foundName);
        }
        setAggregatePhoneNotFound(!foundName);
        if (!orgId) {
          setAggregatePhoneInTrip(false);
          return;
        }
        const { result } = await getDriverAvailabilityByPhoneGlobal(last10, {
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
        setAggregatePhoneInTrip(result.isBusy);
      });
    }, 400);
    return () => {
      if (aggregatePhoneLookupTimeoutRef.current)
        clearTimeout(aggregatePhoneLookupTimeoutRef.current);
    };
  }, [aggregateDriverPhone, orgId]);

  /** Indent ids that already have a trip (owner or supplier). Exclude these from Claimed so we don't show "ASSIGN STAFF & DEPLOY" again after deploy. */
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
    useIndentOfferCountsQuery(orgId, giveLoadIds);

  /** Indent ids where my org's quote is accepted (awarded to me). Used to exclude from Find Work and build Claimed list. */
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

  /**
   * Find Work "Done": terminal loads that I interacted with (quoted), excluding any
   * load awarded to me (those belong in Claimed → Done). We later union this with
   * Claimed → Done when rendering Find Work → Done, so users can view all done
   * outcomes from one place without changing award/deploy flow.
   */
  const findWorkDoneLoads = useMemo(() => {
    return marketIndents.filter((i) => {
      const status = (i.status || "").toLowerCase();
      if (!statusMatchesFilter(status, "DONE")) return false;
      const target = (i.circulation_target || "").toLowerCase();
      const isTargeted = target === "integrated_supplier" || target === "both";
      if (!isTargeted) return false;
      if (awardedToMeIndentIds.has(i.id)) return false;
      return myQuoteByIndentId.has(i.id);
    });
  }, [marketIndents, awardedToMeIndentIds, myQuoteByIndentId]);

  /** Claimed "Done": loads awarded to me that are completed or have a trip. */
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

  /**
   * Find Work → Done should also include Claimed → Done (awarded-to-me + done/trip),
   * so users can see final outcomes in the Find Work DONE tab too.
   */
  const findWorkDoneUnionLoads = useMemo(() => {
    const byId = new Map<string, IndentRow>();
    for (const l of findWorkDoneLoads) byId.set(l.id, l);
    for (const l of awardedLoadsDone ?? []) byId.set(l.id, l);
    return Array.from(byId.values());
  }, [findWorkDoneLoads, awardedLoadsDone]);

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

  /** Check if a load matches the search query (route, ID, client, creator org). */
  const loadMatchesSearch = useCallback(
    (load: IndentRow, q: string): boolean => {
      const trimmed = q.trim().toLowerCase();
      if (!trimmed) return true;
      const route =
        `${(load.pickup_area || "").toLowerCase()} ${(load.drop_location || "").toLowerCase()}`.trim();
      const indentId = (getIndentDisplayNumber(load) || "").toLowerCase();
      const tripId = (load.trip_number || "").toLowerCase();
      const client = (load.client_name || "").toLowerCase();
      const creator = (
        (load as { creator_organization_name?: string })
          .creator_organization_name || ""
      ).toLowerCase();
      return (
        route.includes(trimmed) ||
        indentId.includes(trimmed) ||
        tripId.includes(trimmed) ||
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
      if (statusFilterTab === "OPEN") {
        // Hire Partner: once a load has any bids (or becomes "quoted"), it should
        // move out of Created and into Quoted.
        const hasBids = (quoteCounts[load.id] ?? 0) > 0;
        const isQuotedStatus = statusMatchesFilter(status, "QUOTED");
        if (hasBids || isQuotedStatus) return false;
        return statusMatchesFilter(status, "OPEN");
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
    const statusFiltered = (() => {
      if (statusFilterTab === "OPEN") {
        // Find Work: Open should only show loads I haven't quoted yet.
        return findWorkLoads.filter((load) => !myQuoteByIndentId.has(load.id));
      }
      if (statusFilterTab === "QUOTED") {
        // Find Work: Quoted means I have sent a quote (pending/rejected/etc).
        return findWorkLoads.filter((load) => myQuoteByIndentId.has(load.id));
      }
      if (statusFilterTab === "AWARDED") {
        // Find Work: Awarded mirrors Claimed (awarded to me, ready to deploy).
        return awardedLoads;
      }
      return [];
    })();

    return statusFiltered.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [
    findWorkLoads,
    statusFilterTab,
    searchQuery,
    loadMatchesSearch,
    myQuoteByIndentId,
    awardedLoads,
  ]);

  const filteredFindWorkDoneLoads = useMemo(() => {
    return findWorkDoneUnionLoads.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [findWorkDoneUnionLoads, searchQuery, loadMatchesSearch]);

  const filteredFindWorkList =
    statusFilterTab === "DONE"
      ? filteredFindWorkDoneLoads
      : filteredFindWorkLoads;

  useEffect(() => {
    let cancelled = false;
    const loadCardAvatars = async () => {
      if (filteredFindWorkList.length === 0) {
        setLoadAvatarByIndentId({});
        return;
      }
      const pairs = await Promise.all(
        filteredFindWorkList.map(async (load) => {
          const row = load as Record<string, unknown>;
          const rawAvatarUrl = String(
            row.creator_avatar_url ??
              row.creatorAvatarUrl ??
              row.avatar_url ??
              row.avatarUrl ??
              "",
          ).trim();
          if (rawAvatarUrl) {
            if (
              rawAvatarUrl.startsWith("http://") ||
              rawAvatarUrl.startsWith("https://")
            ) {
              return [load.id, rawAvatarUrl] as const;
            }
            const signed = await getSignedAvatarUrl(rawAvatarUrl);
            if (signed) return [load.id, signed] as const;
          }
          const rawSeed = String(
            row.creator_avatar_seed ??
              row.creatorAvatarSeed ??
              row.avatar_seed ??
              row.avatarSeed ??
              "",
          ).trim();
          if (rawSeed) return [load.id, getAvatarUriForSeed(rawSeed)] as const;
          return [load.id, ""] as const;
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      pairs.forEach(([indentId, uri]) => {
        if (uri) next[indentId] = uri;
      });
      setLoadAvatarByIndentId(next);
    };
    loadCardAvatars();
    return () => {
      cancelled = true;
    };
  }, [filteredFindWorkList]);

  const filteredClaimedLoads = useMemo(() => {
    return awardedLoads.filter((load) => loadMatchesSearch(load, searchQuery));
  }, [awardedLoads, searchQuery, loadMatchesSearch]);
  const filteredClaimedDoneLoads = useMemo(() => {
    return awardedLoadsDone.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [awardedLoadsDone, searchQuery, loadMatchesSearch]);

  /** Counts per status tab for the current role tab (Hire Partner / Find Work / Claimed). */
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
          if (filter === "OPEN") {
            const hasBids = (quoteCounts[load.id] ?? 0) > 0;
            const isQuotedStatus = statusMatchesFilter(status, "QUOTED");
            if (hasBids || isQuotedStatus) return false;
            return statusMatchesFilter(status, "OPEN");
          }
          return statusMatchesFilter(status, filter);
        }).length;
      }
      if (loadSubTab === "GET_LOAD") {
        if (filter === "DONE") return findWorkDoneUnionLoads.length;
        if (filter === "AWARDED") return awardedLoads.length;
        if (filter === "QUOTED") {
          return findWorkLoads.filter((load) => myQuoteByIndentId.has(load.id))
            .length;
        }
        if (filter === "OPEN") {
          return findWorkLoads.filter((load) => !myQuoteByIndentId.has(load.id))
            .length;
        }
        return 0;
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
    findWorkDoneUnionLoads,
    awardedLoads,
    awardedLoadsDone,
    quoteCounts,
    myQuoteByIndentId,
  ]);

  useEffect(() => {
    // Keep status filter valid per role tab to avoid confusing empty views.
    if (loadSubTab === "AWARDED") {
      if (statusFilterTab !== "AWARDED") {
        setStatusFilterTab("AWARDED");
      }
      return;
    }
    // No additional guard needed: Hire Partner and Find Work both support AWARDED now.
  }, [loadSubTab, statusFilterTab]);

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

  const handleBroadcastDraft = async (load: IndentRow) => {
    if (!orgId) return;
    const { error } = await shareDraftIndent(load.id);
    if (error) {
      Alert.alert("Could not broadcast", error.message);
      return;
    }
    invalidateIndents(orgId);
    triggerSuccess("Load broadcasted to network");
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
        "Load awarded — supplier can assign and deploy from Claimed.",
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
    if (assigningTripId === load.id) return;
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

      // Mark indent completed so it leaves Claimed list (O(1)). Ignore status-update failure; trip is source of truth.
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
    if (assigningTripId === load.id) return;
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
        "Please select a driver and a vehicle from your org to assign trip.",
      );
      return;
    }
    if (staffHandshakeDeployLockRef.current) {
      return;
    }
    staffHandshakeDeployLockRef.current = true;
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
      staffHandshakeDeployLockRef.current = false;
      setAssigningTripId(null);
    }
  };

  const handleDeployAdHoc = async (load: IndentRow) => {
    if (assigningTripId === load.id) return;
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
    const handshakeSubSupplierId = (subcontractSupplierId ?? "").trim();
    const handshakeSubRateRaw = subcontractRate.trim();
    const handshakeSubRateNum = Number(handshakeSubRateRaw);
    if (!handshakeSubSupplierId) {
      Alert.alert(
        "Partner required",
        "Select the associated partner (sub-supplier) for this trip.",
      );
      return;
    }
    if (
      handshakeSubRateRaw === "" ||
      !Number.isFinite(handshakeSubRateNum) ||
      handshakeSubRateNum < 0
    ) {
      Alert.alert(
        "Partner rate required",
        "Enter the rate you will pay this partner (₹).",
      );
      return;
    }
    /** Trip detail will hold driver / vehicle / OTP; never persist ad-hoc fields when deferring. */
    const deferHandshakeAssignment = staffHandshakeAssignLater;
    const nameTrimmed = deferHandshakeAssignment
      ? ""
      : aggregateDriverTrackingName.trim();
    const phoneTrimmed = deferHandshakeAssignment
      ? ""
      : aggregateDriverPhone.trim();
    const regTrimmed = deferHandshakeAssignment
      ? ""
      : assignVehicleRegistration.trim();
    if (!deferHandshakeAssignment && nameTrimmed.length === 0) {
      Alert.alert(
        "Driver name required",
        "Enter driver name (tracking) to continue.",
      );
      return;
    }
    if (!deferHandshakeAssignment && phoneTrimmed.length === 0) {
      Alert.alert(
        "Driver phone required",
        "Enter driver phone (tracking) to continue.",
      );
      return;
    }
    if (!deferHandshakeAssignment && regTrimmed.length === 0) {
      Alert.alert(
        "Vehicle number required",
        "Enter vehicle number to continue.",
      );
      return;
    }
    const phoneErr = phoneTrimmed ? validatePhone(phoneTrimmed) : null;
    if (!deferHandshakeAssignment && phoneErr) {
      Alert.alert("Invalid driver phone", phoneErr);
      return;
    }
    if (staffHandshakeDeployLockRef.current) {
      return;
    }
    staffHandshakeDeployLockRef.current = true;
    try {
      setAssigningTripId(load.id);
      const vehicleIdForQuote = deferHandshakeAssignment
        ? null
        : typeof assignVehicleId === "string"
          ? assignVehicleId
          : null;
      const { error: assignErr } = await updateDirectQuoteAssignment(
        acceptedQuote.id,
        null,
        vehicleIdForQuote,
      );
      if (assignErr) {
        Alert.alert("Could not assign", assignErr.message);
        return;
      }
      const regNum = deferHandshakeAssignment ? "" : regTrimmed;
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
      const subSupplierId = handshakeSubSupplierId;
      const subRateNum = handshakeSubRateNum;
      const shouldSaveSubcontract =
        subSupplierId !== "" &&
        handshakeSubRateRaw !== "" &&
        Number.isFinite(subRateNum) &&
        subRateNum >= 0;

      const saveSubcontract = async () => {
        if (!shouldSaveSubcontract) return;
        const isTripOwner = trip.organization_id === orgId;

        if (isTripOwner) {
          const { error: supplierUpdateErr } = await updateTripSupplier(
            trip.id,
            {
              supplier_id: subSupplierId,
              supplier_rate: subRateNum,
            },
          );
          if (supplierUpdateErr) {
            Alert.alert(
              "Trip created",
              `Partner was saved, but trip supplier link could not be updated. ${supplierUpdateErr.message}`,
            );
          }
        }

        const { error: subErr } = await upsertTripSubcontract({
          viewerOrgId: orgId,
          tripId: trip.id,
          supplierId: subSupplierId,
          rate: subRateNum,
        });
        if (subErr)
          Alert.alert(
            "Trip created",
            `Partner could not be saved. ${subErr.message}`,
          );
        queryClient.invalidateQueries({
          queryKey: ["q", "trips", "subcontracts", orgId],
        });
      };

      // Driver + OTP are optional: require phone only for OTP generation (not for trip creation).
      if (deferHandshakeAssignment || !phoneTrimmed || phoneErr) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        triggerSuccess(
          deferHandshakeAssignment
            ? "Trip created — add driver and vehicle on trip detail when ready."
            : "Trip created (OTP not generated)",
        );
        // Do not treat this as an error. OTP can be generated later from Trip Detail
        // after providing a driver phone number.
        return;
      }
      const { error: availabilityError, result: availability } =
        await getDriverAvailabilityByPhoneGlobal(phoneTrimmed, {
          excludeTripId: trip.id,
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
      if (availabilityError) {
        throw availabilityError;
      }
      if (availability.isBusy) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          `Driver is already assigned to ${availability.ongoingTripLabel ?? "another ongoing trip"}.\n\nComplete or unassign that trip before assigning this one.`,
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      const { error: assignAggErr } = await assignAggregateTripDriverByPhone(
        trip.id,
        orgId,
        phoneTrimmed,
        regNum || null,
      );
      if (assignAggErr) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          `Driver could not be assigned. ${humanizeTripIdInRpcError(assignAggErr.message, trip)}\n\nAssign driver from trip detail to generate OTP.`,
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      const {
        error: otpErr,
        code,
        expires_at,
      } = await generateTripOtp(trip.id);
      if (otpErr || !code) {
        await saveSubcontract();
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          "OTP could not be generated. Get OTP from the trip detail screen.",
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      setDeployOtpCode(code);
      setDeployOtpExpiresAt(expires_at ?? null);
      setDeployTripIdForOtp(trip.id);

      await saveSubcontract();

      await updateIndent(load.id, { status: "completed" });
      invalidateTrips(orgId);
      invalidateIndents(orgId);
      triggerSuccess("OTP generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      Alert.alert("Could not deploy", msg);
    } finally {
      staffHandshakeDeployLockRef.current = false;
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
  const aggregateHasDriverName = aggregateDriverTrackingName.trim().length > 0;
  const aggregateHasDriverPhone = aggregateDriverPhone.trim().length > 0;
  const aggregateHasVehicleText = assignVehicleRegistration.trim().length > 0;
  const aggregateTrackingFlowReady =
    aggregateHasDriverName && aggregateHasDriverPhone && aggregateHasVehicleText;
  /** Aggregate Staff Handshake: partner + rate are always required before deploy. */
  const aggregatePartnerHandshakeComplete = useMemo(() => {
    const sid = (subcontractSupplierId ?? "").trim();
    const rateRaw = subcontractRate.trim();
    const rateNum = Number(rateRaw);
    return (
      sid.length > 0 &&
      rateRaw.length > 0 &&
      Number.isFinite(rateNum) &&
      rateNum >= 0
    );
  }, [subcontractSupplierId, subcontractRate]);

  /** Staff Handshake: dismiss OTP preview, or close modal. */
  const handleStaffHandshakeBack = useCallback(() => {
    if (deployOtpCode) {
      setDeployOtpCode(null);
      setDeployOtpExpiresAt(null);
      setDeployTripIdForOtp(null);
      return;
    }
    setLoadAction(null);
    setDeployOtpCode(null);
    setDeployOtpExpiresAt(null);
    setDeployTripIdForOtp(null);
    setStaffHandshakeAssignLater(false);
  }, [deployOtpCode]);

  /** Keep add-load FAB above the global chat FAB, tab bar, and safe area. */
  const hirePartnerFabBottom =
    Layout.demoTabBarScrollBottomInset +
    insets.bottom +
    Layout.tabBarBottomPaddingMin +
    Layout.fabStackOffset;
  const paddingBottom = useMemo(() => {
    const base = 24 + Layout.demoTabBarScrollBottomInset + insets.bottom + 24;
    if (loadSubTab !== "GIVE_LOAD") return base;
    return hirePartnerFabBottom + Layout.fabSize + Layout.fabBottomOffset;
  }, [hirePartnerFabBottom, insets.bottom, loadSubTab]);
  const statusTabsForRole = useMemo(() => {
    return isClaimedTab ? [] : STATUS_TABS;
  }, [isClaimedTab]);

  /** Vehicle | load | weight — weight column right-aligned under route destination. */
  const renderLoadCardSpecsColumns = useCallback(
    (vehicleDetail: string, weightDetail: string, loadTypeDetail: string) => (
      <View style={styles.loadCardSpecsGrid}>
        <View style={styles.loadCardSpecsLabelsRow}>
          <View style={styles.loadCardSpecCell}>
            <Text style={styles.loadCardSpecLabel}>Vehicle</Text>
          </View>
          <View style={[styles.loadCardSpecCell, styles.loadCardSpecDivider]}>
            <Text style={styles.loadCardSpecLabel}>Load</Text>
          </View>
          <View
            style={[
              styles.loadCardSpecCell,
              styles.loadCardSpecDivider,
              styles.loadCardSpecCellRight,
            ]}
          >
            <Text style={[styles.loadCardSpecLabel, styles.loadCardSpecLabelRight]}>
              Weight
            </Text>
          </View>
        </View>
        <View style={styles.loadCardSpecsValuesRow}>
          <View style={styles.loadCardSpecCell}>
            <Text style={styles.loadCardSpecValue} numberOfLines={2}>
              {vehicleDetail}
            </Text>
          </View>
          <View style={[styles.loadCardSpecCell, styles.loadCardSpecDivider]}>
            <Text style={styles.loadCardSpecValue} numberOfLines={2}>
              {loadTypeDetail}
            </Text>
          </View>
          <View
            style={[
              styles.loadCardSpecCell,
              styles.loadCardSpecDivider,
              styles.loadCardSpecCellRight,
            ]}
          >
            <Text
              style={[styles.loadCardSpecValue, styles.loadCardSpecValueRight]}
              numberOfLines={2}
            >
              {weightDetail}
            </Text>
          </View>
        </View>
      </View>
    ),
    [],
  );

  const renderClaimedLoadCard = (
    load: IndentRow,
    isDone: boolean,
    stretchInGrid = false,
    /** Hide redundant "Claimed" pill when the Claimed sub-tab is already selected */
    hideClaimedContextPill = true,
  ) => {
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    const supplierRate =
      acceptedQuote?.amount != null
        ? Number(acceptedQuote.amount)
        : Number(load.client_price || 0);
    const vehicleDetail = load.vehicle_type || "—";
    const weightValue = Number(load.weight);
    const weightDetail =
      Number.isFinite(weightValue) && weightValue > 0
        ? `${weightValue} KG`
        : "—";
    const loadTypeDetail = load.load_type || "—";

    return (
      <TouchableOpacity
        style={[styles.loadCard, stretchInGrid && styles.loadCardGrid]}
        onPress={() => onIndentPress(load)}
        activeOpacity={0.7}
      >
        <View style={[styles.loadCardOrb, { pointerEvents: "none" }]} />
        <View style={styles.loadCardHeroRow}>
          {!hideClaimedContextPill ? (
            <View style={styles.loadPillRow}>
              <View style={styles.loadTypePill}>
                <Text style={styles.loadTypePillText}>CLAIMED</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.loadCardIdCompact} numberOfLines={1}>
            {getIndentDisplayNumber(load)}
            {load.trip_number ? ` · ${load.trip_number}` : ""}
          </Text>
          <Text style={styles.loadCardDateHero}>
            {formatIndentCardDate(load.pickup_date)}
          </Text>
        </View>
        <LoadCardRouteRow
          origin={load.pickup_area || "—"}
          destination={load.drop_location || "—"}
          compact={stretchInGrid}
        />
        <View style={styles.loadCardSpecsPanel}>
          {renderLoadCardSpecsColumns(
            vehicleDetail,
            weightDetail,
            loadTypeDetail,
          )}
          <View style={styles.loadCardQuoteHint}>
            <Text style={styles.loadCardQuoteHintText}>
              Agreed rate {formatINR(supplierRate)}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.loadCardFooter,
            stretchInGrid && styles.loadCardFooterGrid,
            compactIndentFooter && styles.loadCardFooterCompact,
          ]}
        >
          <View
            style={[
              styles.loadCardMeta,
              compactIndentFooter && styles.loadCardMetaCompact,
            ]}
          >
            <View style={styles.bidMetaWrap}>
              <View
                style={[
                  styles.bidIconCircle,
                  isDone
                    ? styles.bidIconCircleActive
                    : styles.bidIconCircleMuted,
                ]}
              >
                <Package
                  size={16}
                  color={isDone ? Theme.darkGreen : Theme.textMuted}
                  strokeWidth={2.2}
                />
              </View>
              <Text style={styles.loadCardMetaText} numberOfLines={2}>
                {isDone ? "Trip on books" : "Assign staff to deploy"}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.loadCardActions,
              compactIndentFooter && styles.loadCardActionsCompact,
            ]}
          >
            <View style={styles.loadCardActionCluster}>
              <TouchableOpacity
                style={styles.shareIndentIconBtn}
                onPress={() => handleShareIndent(load)}
                activeOpacity={0.88}
                accessibilityLabel="Share load"
              >
                <Share2 size={18} color={Theme.textMuted} strokeWidth={2.2} />
              </TouchableOpacity>
              {isDone ? (
                <TouchableOpacity
                  style={styles.reviewBidsBtn}
                  onPress={() => onIndentPress(load)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.reviewBidsBtnText}>View detail</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.reviewBidsBtn}
                  onPress={() => {
                    setAssignDriverId(null);
                    setAssignVehicleId(undefined);
                    setAssignVehicleRegistration("");
                    setUseAdHocDriver(false);
                    setDeployOtpCode(null);
                    setDeployOtpExpiresAt(null);
                    setDeployTripIdForOtp(null);
                    setStaffHandshakeAssignLater(false);
                    setLoadAction({ type: "ASSIGN", load });
                  }}
                  activeOpacity={0.9}
                  disabled={assigningTripId === load.id}
                >
                  <Text style={styles.reviewBidsBtnText}>
                    {assigningTripId === load.id
                      ? "Authorizing…"
                      : "Assign & deploy"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: contentTopPadding }]}>
      {/* Dark header: sub-tabs + status filters — reference UI */}
      <View
        style={[
          styles.loadDarkHeader,
          isClaimedTab && styles.loadDarkHeaderClaimed,
        ]}
      >
        {/* Sub-tabs: GIVE LOAD | GET LOAD | CLAIMED */}
        <View
          style={[
            styles.loadFilterHeaderRow,
            isSingleRowHeader && styles.loadFilterHeaderRowSingle,
          ]}
        >
          <View
            style={[
              styles.loadSubTabsWrap,
              isSingleRowHeader && styles.loadSubTabsWrapSingle,
            ]}
          >
            <View
              style={styles.loadMainTabsPillWrap}
              onLayout={(e) => setLoadTabsWrapWidth(e.nativeEvent.layout.width)}
            >
              {loadTabsWrapWidth > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.loadMainTabActiveBg,
                    {
                      width: (loadTabsWrapWidth - 8) / 3,
                      transform: [
                        {
                          translateX: loadTabsActiveAnim.interpolate({
                            inputRange: [0, 1, 2],
                            outputRange: [
                              0,
                              (loadTabsWrapWidth - 8) / 3,
                              ((loadTabsWrapWidth - 8) / 3) * 2,
                            ],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ) : null}
              {[
                {
                  key: "GIVE_LOAD" as const,
                  label: "GIVE LOAD",
                  count: hirePartnerLoads.length,
                },
                {
                  key: "GET_LOAD" as const,
                  label: "GET LOAD",
                  count: findWorkLoads.length,
                },
                {
                  key: "AWARDED" as const,
                  label: "CLAIMED",
                  count: awardedLoads.length,
                },
              ].map((tab) => {
                const active = loadSubTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.loadMainTabPill,
                      active && styles.loadMainTabPillActive,
                    ]}
                    onPress={() => setLoadSubTab(tab.key)}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.loadMainTabPillText,
                        active && styles.loadMainTabPillTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                    {tab.count > 0 ? (
                      <View
                        style={[
                          styles.loadMainTabBadge,
                          active && styles.loadMainTabBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.loadMainTabBadgeText,
                            active && styles.loadMainTabBadgeTextActive,
                          ]}
                        >
                          {tab.count}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {onMyNetworkPress ? (
            <TouchableOpacity
              style={styles.loadMyNetworkBtn}
              onPress={onMyNetworkPress}
              activeOpacity={0.85}
              accessibilityLabel="My network"
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Users size={18} color={Theme.textOnDark} strokeWidth={2.1} />
              <Text style={styles.loadMyNetworkBtnLabel}>Network</Text>
            </TouchableOpacity>
          ) : null}
          {isSingleRowHeader ? (
            <>
              <View
                style={[styles.loadSearchWrap, styles.loadSearchWrapSingle]}
              >
                <FontAwesome
                  name="search"
                  size={15}
                  color={Theme.textSecondary}
                  style={styles.loadSearchIcon}
                />
                <TextInput
                  style={styles.loadSearchInput}
                  placeholder="Search loads by route, load ID, client..."
                  placeholderTextColor={Theme.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {!isClaimedTab ? (
                <View style={styles.loadTypeFilterWrap}>
                  {statusTabsForRole.map((tab) => {
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
            </>
          ) : null}
        </View>
        {/* Search + Status filters (same layout as Manage Network: search + filter chips) */}
        {!isSingleRowHeader ? (
          <View
            style={[
              styles.loadSearchRow,
              isClaimedTab && styles.loadSearchRowClaimed,
            ]}
          >
            <View style={styles.loadSearchWrap}>
              <FontAwesome
                name="search"
                size={15}
                color={Theme.textSecondary}
                style={styles.loadSearchIcon}
              />
              <TextInput
                style={styles.loadSearchInput}
                placeholder="Search loads by route, load ID, client..."
                placeholderTextColor={Theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {!isClaimedTab ? (
              <View style={styles.loadTypeFilterWrap}>
                {statusTabsForRole.map((tab) => {
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
        ) : null}
      </View>

      {/* Content area: rounded top, light bg — reference overlap */}
      <View
        style={[
          styles.loadContentWrap,
          isClaimedTab && styles.loadContentWrapClaimed,
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isClaimedTab && styles.scrollContentClaimed,
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
                <View style={useGridLayout ? styles.gridList : undefined}>
                  <View style={styles.loadSectionHeaderBlock}>
                    <View style={styles.loadSectionRow}>
                      <Text style={styles.loadSectionTitle}>
                        Your active indents
                      </Text>
                      <View style={styles.loadSectionPill}>
                        <Text style={styles.loadSectionPillText}>Live</Text>
                      </View>
                    </View>
                    {onShareToNetwork ? (
                      <Text style={styles.loadSectionSub}>
                        Indents not yet awarded: use Pulse to broadcast a 24h
                        story to your network.
                      </Text>
                    ) : null}
                  </View>
                  {filteredHirePartnerLoads.map((load) => {
                    const status = (load.status || "").toLowerCase();
                    const isDraft = status === "draft";
                    const isAwardedPendingTrip =
                      status === "awarded" && !indentIdsWithTrip.has(load.id);
                    const isDone = statusMatchesFilter(status, "DONE");
                    const vehicleDetail = load.vehicle_type || "—";
                    const weightValue = Number(load.weight);
                    const weightDetail =
                      Number.isFinite(weightValue) && weightValue > 0
                        ? `${weightValue} KG`
                        : "—";
                    const loadTypeDetail = load.load_type || "—";
                    // Indent was assigned a supplier directly (no quote needed).
                    const hasDirectSupplier = !!load["assigned_supplier_id"];
                    // Shipper view: never show "Create Trip". The supplier creates the trip from
                    // Claimed (Assign Staff & Deploy). When awarded but no trip yet, supplier
                    // is assigned (from accepted quote or assigned_supplier_id); status stays
                    // "awarded" until supplier deploys.
                    const isAwaitingSupplierDeploy =
                      isAwardedPendingTrip || hasDirectSupplier;
                    const parseAmount = (value: unknown): number | null => {
                      if (value == null) return null;
                      if (typeof value === "number") {
                        return Number.isFinite(value) ? value : null;
                      }
                      if (typeof value === "string") {
                        const normalized = value.replace(/[^0-9.-]/g, "");
                        const parsed = Number(normalized);
                        return Number.isFinite(parsed) ? parsed : null;
                      }
                      return null;
                    };
                    const awardedAmount =
                      parseAmount(load["assigned_supplier_rate"]) ??
                      parseAmount(load["awarded_amount"]) ??
                      parseAmount(load["supplier_rate"]) ??
                      parseAmount(load.supplier_target) ??
                      parseAmount(load.client_price);
                    const bidCount = quoteCounts[load.id] ?? 0;
                    const terminalForQuotePill =
                      status === "awarded" ||
                      statusMatchesFilter(status, "DONE");
                    const displayStatus =
                      !terminalForQuotePill && bidCount > 0 ? "quoted" : status;
                    const statusPill = giveLoadStatusPillStyles(displayStatus);
                    const showPulseToNetwork =
                      Boolean(onShareToNetwork) &&
                      indentCanBroadcastToPulseNetwork(load) &&
                      !isDone;
                    return (
                      <View
                        key={load.id}
                        style={useGridLayout ? styles.gridCardWrap : undefined}
                      >
                        <TouchableOpacity
                          style={[
                            styles.loadCard,
                            useGridLayout && styles.loadCardGrid,
                          ]}
                          onPress={() => onIndentPress(load)}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.loadCardOrb,
                              { pointerEvents: "none" },
                            ]}
                          />
                          <View style={styles.loadCardHeroRow}>
                            <View style={styles.loadPillRow}>
                              <View
                                style={[styles.loadStatePill, statusPill.pill]}
                              >
                                <Text
                                  style={[
                                    styles.loadStatePillText,
                                    statusPill.text,
                                  ]}
                                >
                                  {displayStatus.toUpperCase()}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.loadCardDateHero}>
                              {formatIndentCardDate(load.pickup_date)}
                            </Text>
                          </View>
                          <LoadCardRouteRow
                            origin={load.pickup_area || "—"}
                            destination={load.drop_location || "—"}
                            compact={useGridLayout}
                          />
                          <Text
                            style={styles.loadCardIdCompact}
                            numberOfLines={1}
                          >
                            {getIndentDisplayNumber(load)}
                          </Text>
                          <View style={styles.loadCardSpecsPanel}>
                            {renderLoadCardSpecsColumns(
                              vehicleDetail,
                              weightDetail,
                              loadTypeDetail,
                            )}
                            {(isAwaitingSupplierDeploy ||
                              status === "awarded") &&
                            awardedAmount != null ? (
                              <View style={styles.loadCardQuoteHint}>
                                <Text style={styles.loadCardQuoteHintText}>
                                  Awarded amount {formatINR(awardedAmount)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View
                            style={[
                              styles.loadCardFooter,
                              useGridLayout && styles.loadCardFooterGrid,
                              compactIndentFooter && styles.loadCardFooterCompact,
                            ]}
                          >
                            <View
                              style={[
                                styles.loadCardMeta,
                                compactIndentFooter &&
                                  styles.loadCardMetaCompact,
                              ]}
                            >
                              {isDone ? (
                                <View style={styles.bidMetaWrap}>
                                  <View
                                    style={[
                                      styles.bidIconCircle,
                                      styles.bidIconCircleMuted,
                                    ]}
                                  >
                                    <FontAwesome
                                      name="check-circle"
                                      size={16}
                                      color={
                                        status === "cancelled"
                                          ? Theme.textMuted
                                          : Theme.positive
                                      }
                                    />
                                  </View>
                                  <Text style={styles.loadCardMetaText}>
                                    {status === "cancelled"
                                      ? "Cancelled"
                                      : "Completed"}
                                  </Text>
                                </View>
                              ) : isAwardedPendingTrip ? (
                                <View style={styles.bidMetaWrap}>
                                  <View
                                    style={[
                                      styles.bidIconCircle,
                                      styles.bidIconCircleActive,
                                    ]}
                                  >
                                    <FontAwesome
                                      name="trophy"
                                      size={16}
                                      color={Theme.driverGold}
                                    />
                                  </View>
                                  <Text style={styles.loadCardMetaText}>
                                    Supplier claimed
                                    {awardedAmount != null
                                      ? ` · ${formatINR(awardedAmount)}`
                                      : ""}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.bidMetaWrap}>
                                  <View
                                    style={[
                                      styles.bidIconCircle,
                                      bidCount > 0
                                        ? styles.bidIconCircleActive
                                        : styles.bidIconCircleMuted,
                                    ]}
                                  >
                                    {bidCount > 0 ? (
                                      <BidReceivedHammer
                                        visible={true}
                                        size={16}
                                      />
                                    ) : (
                                      <FontAwesome
                                        name="gavel"
                                        size={16}
                                        color={Theme.textMuted}
                                      />
                                    )}
                                  </View>
                                  <Text
                                    style={styles.loadCardMetaText}
                                    numberOfLines={1}
                                  >
                                    {bidCount} bids received
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View
                              style={[
                                styles.loadCardActions,
                                compactIndentFooter &&
                                  styles.loadCardActionsCompact,
                              ]}
                            >
                              <View style={styles.loadCardActionCluster}>
                                <TouchableOpacity
                                  style={styles.shareIndentIconBtn}
                                  onPress={() =>
                                    isDone || isAwardedPendingTrip
                                      ? onIndentPress(load)
                                      : handleShareIndent(load)
                                  }
                                  activeOpacity={0.88}
                                  accessibilityLabel={
                                    isDone || isAwardedPendingTrip
                                      ? "View detail"
                                      : "Share indent"
                                  }
                                >
                                  <Share2
                                    size={18}
                                    color={Theme.textMuted}
                                    strokeWidth={2.2}
                                  />
                                </TouchableOpacity>
                                {showPulseToNetwork && onShareToNetwork ? (
                                  <TouchableOpacity
                                    style={styles.broadcastNetworkBtn}
                                    onPress={() => onShareToNetwork(load)}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Broadcast indent to Pulse network as story"
                                  >
                                    <Zap size={13} color="#fff" fill="#fff" />
                                    <Text
                                      style={styles.broadcastNetworkBtnText}
                                    >
                                      Pulse
                                    </Text>
                                  </TouchableOpacity>
                                ) : null}
                                {isDone ? null : isAwaitingSupplierDeploy ? (
                                  <View style={styles.deployPendingWrap}>
                                    <Text style={styles.deployPendingText}>
                                      Pending
                                    </Text>
                                  </View>
                                ) : (
                                  <TouchableOpacity
                                    style={styles.reviewBidsBtn}
                                    onPress={() => {
                                      if (isDraft) {
                                        handleBroadcastDraft(load);
                                        return;
                                      }
                                      setSelectedQuoteId(null);
                                      setLoadAction({ type: "AWARD", load });
                                    }}
                                    activeOpacity={0.9}
                                  >
                                    <Text style={styles.reviewBidsBtnText}>
                                      {isDraft ? "Broadcast" : "Review Hub"}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
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
                <Text style={styles.emptyTitle}>Get Load</Text>
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
            ) : filteredFindWorkList.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrapMuted}>
                  <FontAwesome
                    name="trophy"
                    size={56}
                    color={Theme.textMuted}
                  />
                </View>
                <Text style={styles.emptyTitle}>Get Load</Text>
                <Text style={styles.emptySub}>
                  Loads shared with you by partners will appear here. Connect as
                  an integrated supplier to see loads from shippers.
                </Text>
              </View>
            ) : (
              <View style={useGridLayout ? styles.gridList : undefined}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>
                    Market opportunities
                  </Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>Live</Text>
                  </View>
                </View>
                {filteredFindWorkList.map((load) => {
                  const existingQuote = myQuoteByIndentId.get(load.id);
                  const quoteStatus = (
                    existingQuote?.status ?? ""
                  ).toLowerCase();
                  const isPending = quoteStatus === "pending";
                  const isRejected = quoteStatus === "rejected";
                  const isAccepted = quoteStatus === "accepted";
                  const isDoneOutcome =
                    statusMatchesFilter(load.status || "", "DONE") ||
                    indentIdsWithTrip.has(load.id);
                  const vehicleDetail = load.vehicle_type || "—";
                  const weightValue = Number(load.weight);
                  const weightDetail =
                    Number.isFinite(weightValue) && weightValue > 0
                      ? `${weightValue} KG`
                      : "—";
                  const loadTypeDetail = load.load_type || "—";
                  const openBidModal = () => {
                    setQuoteAmount(
                      existingQuote ? String(existingQuote.amount) : "",
                    );
                    setLoadAction({ type: "BID", load });
                  };
                  const clientLabel = (
                    load.creator_organization_name ||
                    load.client_name ||
                    ""
                  ).trim();
                  const getStatePill = () => {
                    if (isAccepted) {
                      return {
                        wrap: {
                          backgroundColor: Theme.positive,
                          borderWidth: 1,
                          borderColor: Theme.darkGreen,
                        },
                        txt: { color: Theme.textOnPrimary },
                        label: (
                          existingQuote?.status || "AWARDED"
                        ).toUpperCase(),
                      };
                    }
                    if (isRejected) {
                      return {
                        wrap: {
                          backgroundColor: Theme.negativeMuted,
                          borderWidth: 1,
                          borderColor: Theme.teslaRed,
                        },
                        txt: { color: Theme.teslaRed },
                        label: "DECLINED",
                      };
                    }
                    if (isPending) {
                      return {
                        wrap: {
                          backgroundColor: Theme.tripHubUnassignedPillBg,
                          borderWidth: 1,
                          borderColor: Theme.textPrimaryDark,
                        },
                        txt: { color: Theme.textPrimaryDark },
                        label: "QUOTED",
                      };
                    }
                    return {
                      wrap: {
                        backgroundColor: Theme.surfaceGray,
                        borderWidth: 1,
                        borderColor: Theme.borderMedium,
                      },
                      txt: { color: Theme.textPrimaryDark },
                      label: "OPEN",
                    };
                  };
                  const sp = getStatePill();
                  const hideGetLoadStatePill = shouldHideGetLoadStatePill(
                    statusFilterTab,
                    sp.label,
                    isAccepted,
                  );
                  const metaLine = isAccepted
                    ? isDoneOutcome
                      ? "Completed — open details"
                      : "Awarded — open Claimed to deploy"
                    : isRejected
                      ? "Quote declined — send a new price"
                      : isPending
                        ? `Your quote ${formatINR(Number(existingQuote?.amount ?? 0))}`
                        : "No quote sent yet";
                  const ctaLabel = isAccepted
                    ? isDoneOutcome
                      ? "View details"
                      : "View claimed"
                    : isPending
                      ? "Update quote"
                      : isRejected
                        ? "New quote"
                        : "Bid now";
                  return (
                    <View
                      key={load.id}
                      style={useGridLayout ? styles.gridCardWrap : undefined}
                    >
                      <TouchableOpacity
                        style={[
                          styles.loadCard,
                          useGridLayout && styles.loadCardGrid,
                        ]}
                        onPress={() => onIndentPress(load)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.loadCardOrb,
                            { pointerEvents: "none" },
                          ]}
                        />
                        <View style={styles.loadCardHeroRow}>
                          {!hideGetLoadStatePill ? (
                            <View style={styles.loadPillRow}>
                              <View style={[styles.loadStatePill, sp.wrap]}>
                                <Text
                                  style={[styles.loadStatePillText, sp.txt]}
                                >
                                  {sp.label}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={{ flex: 1 }} />
                          )}
                          <Text style={styles.loadCardDateHero}>
                            {formatIndentCardDate(load.pickup_date)}
                          </Text>
                        </View>
                        <LoadCardRouteRow
                          origin={load.pickup_area || "—"}
                          destination={load.drop_location || "—"}
                          compact={useGridLayout}
                        />
                        {clientLabel ? (
                          <View
                            style={[
                              styles.loadMarketClientRow,
                              useGridLayout && styles.loadMarketClientRowGrid,
                            ]}
                          >
                            <View style={styles.getLoadAvatarWrap}>
                              {loadAvatarByIndentId[load.id] ? (
                                <Image
                                  source={{
                                    uri: loadAvatarByIndentId[load.id],
                                  }}
                                  style={styles.getLoadAvatarImage}
                                />
                              ) : (
                                <Text style={styles.getLoadAvatarInitial}>
                                  {clientLabel.trim().charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <Building2
                              size={14}
                              color={Theme.textSecondary}
                              strokeWidth={2.2}
                            />
                            <Text
                              style={styles.loadMarketClientText}
                              numberOfLines={1}
                            >
                              {clientLabel.toUpperCase()}
                            </Text>
                          </View>
                        ) : useGridLayout ? (
                          <View style={styles.loadMarketClientRowGridReserve} />
                        ) : null}
                        <Text
                          style={styles.loadCardIdCompact}
                          numberOfLines={1}
                        >
                          {getIndentDisplayNumber(load)}
                        </Text>
                        <View style={styles.loadCardSpecsPanel}>
                          {renderLoadCardSpecsColumns(
                            vehicleDetail,
                            weightDetail,
                            loadTypeDetail,
                          )}
                          <View style={styles.loadCardQuoteHint}>
                            <Text style={styles.loadCardQuoteHintText}>
                              Target{" "}
                              {formatINR(
                                Number(
                                  load.supplier_target ??
                                    load.client_price ??
                                    0,
                                ),
                              )}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.loadCardFooter,
                            useGridLayout && styles.loadCardFooterGrid,
                            compactIndentFooter && styles.loadCardFooterCompact,
                          ]}
                        >
                          <View
                            style={[
                              styles.loadCardMeta,
                              compactIndentFooter && styles.loadCardMetaCompact,
                            ]}
                          >
                            <View style={styles.bidMetaWrap}>
                              <View
                                style={[
                                  styles.bidIconCircle,
                                  existingQuote
                                    ? styles.bidIconCircleActive
                                    : styles.bidIconCircleMuted,
                                ]}
                              >
                                <Package
                                  size={16}
                                  color={
                                    existingQuote
                                      ? Theme.textPrimaryDark
                                      : Theme.textMuted
                                  }
                                  strokeWidth={2.2}
                                />
                              </View>
                              <Text
                                style={styles.loadCardMetaText}
                                numberOfLines={2}
                              >
                                {metaLine}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.loadCardActions,
                              compactIndentFooter &&
                                styles.loadCardActionsCompact,
                            ]}
                          >
                            <View style={styles.loadCardActionCluster}>
                              <TouchableOpacity
                                style={styles.shareIndentIconBtn}
                                onPress={() => handleShareIndent(load)}
                                activeOpacity={0.88}
                                accessibilityLabel="Share load"
                              >
                                <Share2
                                  size={18}
                                  color={Theme.textMuted}
                                  strokeWidth={2.2}
                                />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.reviewBidsBtn}
                                onPress={
                                  isAccepted
                                    ? isDoneOutcome
                                      ? () => onIndentPress(load)
                                      : () => setLoadSubTab("AWARDED")
                                    : openBidModal
                                }
                                activeOpacity={0.9}
                              >
                                <Text style={styles.reviewBidsBtnText}>
                                  {ctaLabel}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))}

          {loadSubTab === "AWARDED" &&
            (filteredClaimedLoads.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrapGold}>
                  <FontAwesome
                    name="trophy"
                    size={56}
                    color={Theme.driverGold}
                  />
                </View>
                <Text style={styles.emptyTitle}>Claimed</Text>
                <Text style={styles.emptySub}>
                  Claimed loads will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.securedSection}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>Ready to deploy</Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>
                      {filteredClaimedLoads.length} live
                    </Text>
                  </View>
                </View>
                {useGridLayout ? (
                  <View style={styles.gridList}>
                    {filteredClaimedLoads.map((load) => (
                      <View
                        key={`claimed-${load.id}`}
                        style={[
                          width >= 1280
                            ? styles.gridCardWrap
                            : styles.gridCardWrapHalf,
                          highlightedIndentId === load.id &&
                            styles.highlightedIndentCard,
                        ]}
                      >
                        {renderClaimedLoadCard(load, false, true)}
                      </View>
                    ))}
                  </View>
                ) : (
                  <FlashList<IndentRow>
                    data={filteredClaimedLoads}
                    renderItem={({ item: load }: { item: IndentRow }) => (
                      <View
                        style={[
                          highlightedIndentId === load.id
                            ? styles.highlightedIndentCard
                            : null,
                        ]}
                      >
                        {renderClaimedLoadCard(load, false, false)}
                      </View>
                    )}
                    estimatedItemSize={168}
                    keyExtractor={(item) => item.id}
                    ref={scrollRef}
                  />
                )}
              </View>
            ))}
        </ScrollView>
        {loadSubTab === "GIVE_LOAD" ? (
          <View
            style={[
              styles.hirePartnerFabWrap,
              { bottom: hirePartnerFabBottom, pointerEvents: "box-none" },
            ]}
          >
            {isMobileView ? (
              <FinanceFAB
                onPress={onCreateIndentPress}
                accessibilityLabel="Broadcast New Indent"
                icon="package"
              />
            ) : (
              <TouchableOpacity
                style={styles.hirePartnerFab}
                onPress={onCreateIndentPress}
                activeOpacity={0.9}
                accessibilityLabel="Broadcast New Indent"
              >
                <SemanticAddIcon
                  IconComponent={Package}
                  iconSize={20}
                  iconColor={Theme.textOnPrimary}
                  badgeSize={18}
                  badgeIconSize={13}
                  badgeBackgroundColor="#FFFFFF"
                  badgeIconColor={Theme.darkBackground}
                  badgeOffsetX={-7}
                  badgeOffsetY={-6}
                />
              </TouchableOpacity>
            )}
          </View>
        ) : null}
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
            <View style={styles.reviewHubModalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setLoadAction(null);
                  setSelectedQuoteId(null);
                }}
                hitSlop={12}
                style={styles.reviewHubModalBack}
              >
                <X size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
              </TouchableOpacity>
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={[styles.modalTitle, styles.modalTitleCenter]}>
                  Review Hub
                </Text>
                {loadAction?.type === "AWARD" ? (
                  <Text style={styles.modalSubtitle}>
                    Audit indent {getIndentDisplayNumber(loadAction.load)}
                  </Text>
                ) : null}
              </View>
              <View style={styles.reviewHubModalHeaderSpacer} />
            </View>
            {loadAction?.type === "AWARD" ? (
              <View style={styles.reviewHubHero}>
                <View
                  style={[styles.reviewHubHeroGlow, { pointerEvents: "none" }]}
                />
                <Text style={styles.reviewHubHeroKicker}>Target route</Text>
                <Text style={styles.reviewHubHeroRoute} numberOfLines={3}>
                  {(loadAction.load.pickup_area || "—").toUpperCase()} →{" "}
                  {(loadAction.load.drop_location || "—").toUpperCase()}
                </Text>
                <View style={styles.reviewHubHeroMeta}>
                  <View style={styles.reviewHubHeroMetaCol}>
                    <Text style={styles.reviewHubHeroStatLabel}>Offers</Text>
                    <Text style={styles.reviewHubHeroStatValue} numberOfLines={1}>
                      {awardModalQuotesLoading
                        ? "—"
                        : String(awardModalQuotes.length)}
                    </Text>
                  </View>
                  {lowestPendingAmount != null && pendingOfferCount > 0 ? (
                    <View style={styles.reviewHubHeroMetaColEnd}>
                      <Text style={styles.reviewHubHeroStatLabel}>
                        Lowest bid
                      </Text>
                      <Text
                        style={[
                          styles.reviewHubHeroStatValue,
                          styles.reviewHubHeroStatValueEnd,
                        ]}
                        numberOfLines={1}
                      >
                        {formatINR(lowestPendingAmount)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.reviewHubHeroMetaColEnd}>
                      <Text style={styles.reviewHubHeroStatLabel}>Pending</Text>
                      <Text
                        style={[
                          styles.reviewHubHeroStatValue,
                          styles.reviewHubHeroStatValueEnd,
                        ]}
                        numberOfLines={1}
                      >
                        {String(pendingOfferCount)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : null}
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
                <View style={styles.quoteHeaderRowDark}>
                  <Text style={styles.quoteHeaderNameDark}>Bidder</Text>
                  <Text style={styles.quoteHeaderAmountDark}>Amount</Text>
                  <Text style={styles.quoteHeaderStatusDark}>Status</Text>
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
          behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            <View style={styles.reviewHubModalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setLoadAction(null);
                  setQuoteAmount("");
                }}
                hitSlop={12}
                style={styles.reviewHubModalBack}
              >
                <X size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
              </TouchableOpacity>
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={[styles.modalTitle, styles.modalTitleCenter]}>
                  Bid hub
                </Text>
                <Text style={styles.modalSubtitle}>Submit quotation</Text>
              </View>
              <View style={styles.reviewHubModalHeaderSpacer} />
            </View>
            <ScrollView
              style={styles.bidModalScroll}
              contentContainerStyle={styles.bidModalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loadAction?.type === "BID" ? (
                <View style={styles.bidIndentDetailSection}>
                  <View style={styles.bidHubHero}>
                    <View
                      style={[styles.bidHubHeroGlow, { pointerEvents: "none" }]}
                    />
                    <Text style={styles.bidHubHeroKicker}>
                      You are bidding on
                    </Text>
                    <Text style={styles.bidHubHeroRoute} numberOfLines={4}>
                      {(loadAction.load.pickup_area || "—").trim()} →{" "}
                      {(loadAction.load.drop_location || "—").trim()}
                    </Text>
                    <View style={styles.bidHubHeroChips}>
                      {loadAction.load.load_type ? (
                        <View style={styles.bidHubChip}>
                          <Text style={styles.bidHubChipText} numberOfLines={1}>
                            {String(loadAction.load.load_type).toUpperCase()}
                          </Text>
                        </View>
                      ) : null}
                      {loadAction.load.vehicle_type ? (
                        <View style={styles.bidHubChip}>
                          <Text style={styles.bidHubChipText} numberOfLines={1}>
                            {loadAction.load.vehicle_type}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.reviewHubHeroMeta, { marginTop: 14 }]}>
                      <View style={styles.reviewHubHeroMetaCol}>
                        <Text style={styles.reviewHubHeroStatLabel}>
                          Indent
                        </Text>
                        <Text
                          style={styles.reviewHubHeroStatValue}
                          numberOfLines={1}
                        >
                          {getIndentDisplayNumber(loadAction.load)}
                        </Text>
                      </View>
                      <View style={styles.reviewHubHeroMetaColEnd}>
                        <Text style={styles.reviewHubHeroStatLabel}>
                          Target
                        </Text>
                        <Text
                          style={[
                            styles.reviewHubHeroStatValue,
                            styles.reviewHubHeroStatValueEnd,
                          ]}
                          numberOfLines={1}
                        >
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
                  </View>
                </View>
              ) : null}
              <View style={styles.bidInputBlock}>
                <Text style={styles.bidSectionTitle}>Financial proposal</Text>
                <Text style={styles.quoteLabel}>Your price (₹)</Text>
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
                  onChangeText={(raw) =>
                    setQuoteAmount(raw.replace(/[^\d]/g, ""))
                  }
                />
                {activeBidQuote ? (
                  <View style={styles.previousBidWrap}>
                    <Text style={styles.previousBidLabel}>Previous bid</Text>
                    <Text style={styles.previousBidValue}>
                      {formatINR(Number(activeBidQuote.amount ?? 0))}
                    </Text>
                    {activeBidQuoteUpdatedAt ? (
                      <Text style={styles.previousBidMeta}>
                        Last updated: {activeBidQuoteUpdatedAt}
                      </Text>
                    ) : null}
                    {activeBidHistory.length > 0 ? (
                      <View style={styles.previousBidHistoryWrap}>
                        <Text style={styles.previousBidHistoryTitle}>
                          Earlier updates
                        </Text>
                        {activeBidHistory.map((entry, idx) => {
                          const dt = new Date(entry.updatedAt);
                          const readable = Number.isNaN(dt.getTime())
                            ? "Unknown time"
                            : dt.toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                          return (
                            <View
                              key={`${entry.updatedAt}-${entry.amount}-${idx}`}
                              style={styles.previousBidHistoryRow}
                            >
                              <Text style={styles.previousBidHistoryAmount}>
                                {formatINR(Number(entry.amount ?? 0))}
                              </Text>
                              <Text style={styles.previousBidHistoryDate}>
                                {readable}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
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
                  const existingQuoteBeforeSave = myQuoteByIndentId.get(
                    load.id,
                  );
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
                    await Promise.allSettled([
                      queryClient.invalidateQueries({
                        queryKey: [
                          ...queryKeys.indents.all(orgId),
                          "my-direct-quotes",
                        ],
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ["indents", load.id, "direct-quotes"],
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ["indents", "quote-counts"],
                      }),
                      refetchMyQuotes(),
                      refetchMarketIndents(),
                    ]);
                    triggerSuccess(
                      hadExistingQuote ? "Quote updated" : "Offer Published",
                    );
                    if (existingQuoteBeforeSave) {
                      setLocalBidHistoryByIndentId((prev) => {
                        const indentId = load.id;
                        const prior = prev[indentId] ?? [];
                        const nextEntry = {
                          amount: Number(existingQuoteBeforeSave.amount ?? 0),
                          updatedAt:
                            existingQuoteBeforeSave.updated_at ??
                            new Date().toISOString(),
                        };
                        const alreadyExists = prior.some(
                          (row) =>
                            Number(row.amount) === Number(nextEntry.amount) &&
                            row.updatedAt === nextEntry.updatedAt,
                        );
                        if (alreadyExists) return prev;
                        return {
                          ...prev,
                          [indentId]: [nextEntry, ...prior].slice(0, 10),
                        };
                      });
                    }
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
                  {submittingQuote ? "Submitting…" : "Submit bid"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Staff Handshake modal: Roster (driver + vehicle from org) or Ad hoc driver (OTP claim). Triggered from Claimed tab (ASSIGN STAFF & DEPLOY). O(n): drivers/vehicles loaded once per org. Web shell matches TripAssignmentBlock centered modal. */}
      <Modal
        visible={loadAction?.type === "ASSIGN"}
        animationType={Platform.OS === "web" ? "fade" : "slide"}
        presentationStyle={
          Platform.OS === "web" ? "overFullScreen" : "fullScreen"
        }
        transparent={Platform.OS === "web"}
        onRequestClose={handleStaffHandshakeBack}
      >
        <View
          style={
            Platform.OS === "web"
              ? assignmentShellStyles.webModalBackdrop
              : [styles.assignModalPage, { paddingTop: insets.top }]
          }
        >
          <View
            style={
              Platform.OS === "web"
                ? [
                    assignmentShellStyles.webModalCardWhite,
                    { paddingTop: insets.top },
                    isCompactModalLayout && styles.assignWebModalCardCompact,
                    !useAdHocDriver && {
                      height: "auto",
                      maxHeight: 620,
                      minHeight: 420,
                    },
                  ]
                : styles.handshakeNativeInner
            }
          >
            <View style={assignmentShellStyles.modalHero}>
              <View style={assignmentShellStyles.modalHeroText}>
                <Text
                  style={[
                    assignmentShellStyles.modalTitle,
                    { fontStyle: "italic", fontWeight: "900" },
                  ]}
                >
                  Supply & Allocation
                </Text>
                <Text style={assignmentShellStyles.modalSubtitle}>
                  Network node selection — roster deploy or OTP for the driver.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setLoadAction(null);
                  setDeployOtpCode(null);
                  setDeployOtpExpiresAt(null);
                  setDeployTripIdForOtp(null);
                  setStaffHandshakeAssignLater(false);
                }}
                hitSlop={12}
                style={assignmentShellStyles.modalCloseBtn}
                accessibilityLabel="Close"
              >
                <FontAwesome
                  name="times"
                  size={18}
                  color={assignmentShellColors.subtitle}
                />
              </TouchableOpacity>
            </View>
            {loadAction?.type === "ASSIGN" && (
            <View
              style={[styles.assignModalBody, assignmentShellStyles.modalBodyFlex]}
            >
              <ScrollView
                style={styles.assignModalScroll}
                contentContainerStyle={[
                  assignmentShellStyles.bodyScrollContent,
                  {
                    paddingHorizontal: isCompactModalLayout ? 12 : 20,
                    paddingTop: isCompactModalLayout ? 12 : 20,
                    paddingBottom: !deployOtpCode
                      ? 110 + insets.bottom
                      : 24 + insets.bottom,
                  },
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
                          Expires{" "}
                          {new Date(deployOtpExpiresAt).toLocaleString()}
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
                        setStaffHandshakeAssignLater(false);
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
                ) : (
                  <>
                    <View style={styles.handshakeSegmentSection}>
                      <View style={styles.handshakeSegmentPill}>
                        <TouchableOpacity
                          style={[
                            styles.handshakeSegBtn,
                            !useAdHocDriver && styles.handshakeSegBtnActive,
                          ]}
                          onPress={() => {
                            setUseAdHocDriver(false);
                            setAssignVehicleRegistration("");
                            setAggregateDriverPhone("");
                            setAggregateDriverTrackingName("");
                            setSubcontractSupplierId(null);
                            setSubcontractRate("");
                            setAggregateAdvancePaid("");
                            aggregateDriverNameManualRef.current = false;
                            setAggregateDriverTrackingName("");
                            setAggregatePhoneName(null);
                            setAggregatePhoneNotFound(false);
                            setAggregatePhoneInTrip(false);
                          }}
                          activeOpacity={0.88}
                        >
                          <Truck
                            size={14}
                            color={!useAdHocDriver ? "#ffffff" : "#94a3b8"}
                          />
                          <Text
                            style={[
                              styles.handshakeSegBtnText,
                              !useAdHocDriver && styles.handshakeSegBtnTextActive,
                            ]}
                          >
                            Asset
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.handshakeSegBtn,
                            useAdHocDriver && styles.handshakeSegBtnActive,
                          ]}
                          onPress={() => {
                            setUseAdHocDriver(true);
                            setAssignDriverId(null);
                            setAssignVehicleId(undefined);
                            setAssignVehicleRegistration("");
                            setAggregateDriverPhone("");
                            setAggregateDriverTrackingName("");
                            setSubcontractSupplierId(null);
                            setSubcontractRate("");
                            setAggregateAdvancePaid("");
                            aggregateDriverNameManualRef.current = false;
                            setAggregateDriverTrackingName("");
                            setAggregatePhoneName(null);
                            setAggregatePhoneNotFound(false);
                            setAggregatePhoneInTrip(false);
                          }}
                          activeOpacity={0.88}
                        >
                          <Building2
                            size={14}
                            color={useAdHocDriver ? "#ffffff" : "#94a3b8"}
                          />
                          <Text
                            style={[
                              styles.handshakeSegBtnText,
                              useAdHocDriver && styles.handshakeSegBtnTextActive,
                            ]}
                          >
                            Aggregate
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.handshakeAssignLaterOuter,
                        isCompactModalLayout && styles.handshakeAssignLaterOuterCompact,
                      ]}
                    >
                      <View style={styles.handshakeAssignLaterLeft}>
                        <View style={styles.handshakeAssignLaterIconWrap}>
                          <ListChecks size={18} color="#64748b" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.handshakeAssignLaterTitle}>
                            Assign later
                          </Text>
                          <Text style={styles.handshakeAssignLaterSub}>
                            {useAdHocDriver
                              ? "(vehicle & driver phone from trip detail)"
                              : "(vehicle & driver from trip detail)"}
                          </Text>
                        </View>
                      </View>
                      <Switch
                        value={staffHandshakeAssignLater}
                        onValueChange={(v) => {
                          setStaffHandshakeAssignLater(v);
                          if (v) {
                            setAssignDriverId(null);
                            setAssignVehicleId(undefined);
                            setAggregateDriverPhone("");
                            aggregateDriverNameManualRef.current = false;
                            setAggregateDriverTrackingName("");
                            setAssignVehicleRegistration("");
                          }
                        }}
                        trackColor={{
                          false: "#e2e8f0",
                          true: "#0f172a",
                        }}
                        thumbColor="#ffffff"
                      />
                    </View>

                    {!useAdHocDriver ? (
                      (staffHandshakeAssignLater ? (
                        <Text style={styles.modalHint}>
                          Assign vehicle and driver on the trip screen before the
                          trip starts.
                        </Text>
                      ) : (
                        <>
                    {(() => {
                      const selectedDriver = activeDrivers.find(
                        (d) => String(d.id) === assignDriverId,
                      );
                      const selectedVehicle =
                        typeof assignVehicleId === "string"
                          ? vehicles.find(
                              (v) => String(v.id) === assignVehicleId,
                            )
                          : null;
                      return (
                        <>
                          <View
                            style={[
                              styles.assignSelectionGrid,
                              width >= 980 && styles.assignSelectionGridDesktop,
                            ]}
                          >
                            <View style={styles.assignPickerCard}>
                              <View style={styles.assignPickerHeader}>
                                <Text style={styles.assignPickerTitle}>
                                  Select Driver
                                </Text>
                                <View style={styles.assignPickerBadge}>
                                  <Text style={styles.assignPickerBadgeText}>
                                    {activeDrivers.length} Total
                                  </Text>
                                </View>
                              </View>
                              {activeDrivers.map((d) => (
                                <TouchableOpacity
                                  key={d.id}
                                  style={[
                                    styles.assignEntityRow,
                                    assignDriverId === String(d.id) &&
                                      styles.assignEntityRowActive,
                                  ]}
                                  onPress={() =>
                                    setAssignDriverId(String(d.id))
                                  }
                                  activeOpacity={0.85}
                                >
                                  <View style={styles.assignEntityIconWrap}>
                                    <FontAwesome
                                      name="user"
                                      size={16}
                                      color={
                                        assignDriverId === String(d.id)
                                          ? Theme.textOnPrimary
                                          : Theme.textMuted
                                      }
                                    />
                                  </View>
                                  <View style={styles.assignEntityTextCol}>
                                    <Text style={styles.assignEntityTitle}>
                                      {d.name ?? d.phone ?? "—"}
                                    </Text>
                                    <Text style={styles.assignEntitySubtitle}>
                                      {d.phone
                                        ? `Phone: ${d.phone}`
                                        : "Available"}
                                    </Text>
                                  </View>
                                  <FontAwesome
                                    name={
                                      assignDriverId === String(d.id)
                                        ? "check-circle"
                                        : "chevron-right"
                                    }
                                    size={15}
                                    color={
                                      assignDriverId === String(d.id)
                                        ? Theme.primary
                                        : Theme.textMuted
                                    }
                                  />
                                </TouchableOpacity>
                              ))}
                              {activeDrivers.length === 0 ? (
                                <View style={styles.assignEmptyState}>
                                  <Text style={styles.assignEmptyText}>
                                    No asset drivers were found in your
                                    organization. Add a salaried driver to
                                    continue with Asset-based assignment, or use
                                    the Aggregate flow from the previous step.
                                  </Text>
                                  <TouchableOpacity
                                    style={styles.assignEmptyActionBtn}
                                    onPress={() => {
                                      setLoadAction(null);
                                      setDeployOtpCode(null);
                                      setDeployOtpExpiresAt(null);
                                      setDeployTripIdForOtp(null);
                                      setStaffHandshakeAssignLater(false);
                                      setTimeout(
                                        () => {
                                          router.push(
                                            "/(modals)/add-driver" as import("expo-router").Href,
                                          );
                                        },
                                        Platform.OS === "ios" ? 100 : 0,
                                      );
                                    }}
                                    activeOpacity={0.9}
                                  >
                                    <FontAwesome
                                      name="plus"
                                      size={12}
                                      color={Theme.textOnPrimary}
                                    />
                                    <Text
                                      style={styles.assignEmptyActionBtnText}
                                    >
                                      Add Driver
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                            </View>

                            <View style={styles.assignPickerCard}>
                              <View style={styles.assignPickerHeader}>
                                <Text style={styles.assignPickerTitle}>
                                  Select Vehicle
                                </Text>
                                <View style={styles.assignPickerBadge}>
                                  <Text style={styles.assignPickerBadgeText}>
                                    {vehicles.length} Total
                                  </Text>
                                </View>
                              </View>
                              {vehicles.map((v) => (
                                <TouchableOpacity
                                  key={v.id}
                                  style={[
                                    styles.assignEntityRow,
                                    assignVehicleId === String(v.id) &&
                                      styles.assignEntityRowActive,
                                  ]}
                                  onPress={() =>
                                    setAssignVehicleId(String(v.id))
                                  }
                                  activeOpacity={0.85}
                                >
                                  <View style={styles.assignEntityIconWrap}>
                                    <FontAwesome
                                      name="truck"
                                      size={16}
                                      color={
                                        assignVehicleId === String(v.id)
                                          ? Theme.textOnPrimary
                                          : Theme.textMuted
                                      }
                                    />
                                  </View>
                                  <View style={styles.assignEntityTextCol}>
                                    <Text style={styles.assignEntityTitle}>
                                      {v.vehicle_number}
                                    </Text>
                                    <Text style={styles.assignEntitySubtitle}>
                                      {v.vehicle_type
                                        ? `${v.vehicle_type}${
                                            v.vehicle_body_type
                                              ? ` · ${v.vehicle_body_type}`
                                              : ""
                                          }`
                                        : "Fleet vehicle"}
                                    </Text>
                                  </View>
                                  <FontAwesome
                                    name={
                                      assignVehicleId === String(v.id)
                                        ? "check-circle"
                                        : "chevron-right"
                                    }
                                    size={15}
                                    color={
                                      assignVehicleId === String(v.id)
                                        ? Theme.primary
                                        : Theme.textMuted
                                    }
                                  />
                                </TouchableOpacity>
                              ))}
                              {vehicles.length === 0 ? (
                                <View style={styles.assignEmptyState}>
                                  <Text style={styles.assignEmptyText}>
                                    No vehicles were found in your fleet. Add an
                                    own vehicle to continue with Asset-based
                                    assignment.
                                  </Text>
                                  <TouchableOpacity
                                    style={styles.assignEmptyActionBtn}
                                    onPress={() => {
                                      setLoadAction(null);
                                      setDeployOtpCode(null);
                                      setDeployOtpExpiresAt(null);
                                      setDeployTripIdForOtp(null);
                                      setStaffHandshakeAssignLater(false);
                                      setTimeout(
                                        () => {
                                          router.push(
                                            "/(modals)/add-vehicle" as import("expo-router").Href,
                                          );
                                        },
                                        Platform.OS === "ios" ? 100 : 0,
                                      );
                                    }}
                                    activeOpacity={0.9}
                                  >
                                    <FontAwesome
                                      name="plus"
                                      size={12}
                                      color={Theme.textOnPrimary}
                                    />
                                    <Text
                                      style={styles.assignEmptyActionBtnText}
                                    >
                                      Add Vehicle
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                            </View>
                          </View>

                          <View style={styles.assignSummaryBar}>
                            <View style={styles.assignSummaryRow}>
                              <View style={styles.assignSummaryBlock}>
                                <Text style={styles.assignSummaryLabel}>
                                  Selected Driver
                                </Text>
                                <Text style={styles.assignSummaryValue}>
                                  {selectedDriver?.name ??
                                    selectedDriver?.phone ??
                                    "Not selected"}
                                </Text>
                              </View>
                              <View style={styles.assignSummaryDivider} />
                              <View style={styles.assignSummaryBlock}>
                                <Text style={styles.assignSummaryLabel}>
                                  Selected Vehicle
                                </Text>
                                <Text style={styles.assignSummaryValue}>
                                  {selectedVehicle?.vehicle_number ??
                                    "Not selected"}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </>
                      );
                    })()}
                        </>
                      ))
                    ) : (
                      (() => {
                        const selectedPartner = subcontractSupplierId
                          ? suppliers.find((s) => s.id === subcontractSupplierId)
                          : null;
                        const inlinePartners = visiblePartnersForHandshake;
                        const canWideAlign =
                          Platform.OS === "web" ? width >= 1200 : width >= 900;

                        const partnerPane = (
                          <View
                            style={[
                              styles.aggregatePaneCard,
                              canWideAlign && styles.aggregatePaneWide,
                            ]}
                          >
                            <View style={styles.aggregatePaneHeaderRow}>
                              <Text style={styles.aggregatePaneTitle}>
                                Transport partner *
                              </Text>
                              <TouchableOpacity
                                style={styles.partnerAddBtn}
                                onPress={() => {
                                  setLoadAction(null);
                                  setDeployOtpCode(null);
                                  setDeployOtpExpiresAt(null);
                                  setDeployTripIdForOtp(null);
                                  setStaffHandshakeAssignLater(false);
                                  setTimeout(
                                    () => {
                                      router.push(
                                        "/(modals)/add-supplier" as import("expo-router").Href,
                                      );
                                    },
                                    Platform.OS === "ios" ? 100 : 0,
                                  );
                                }}
                                activeOpacity={0.9}
                              >
                                <FontAwesome
                                  name="plus-circle"
                                  size={12}
                                  color={Theme.textPrimaryDark}
                                />
                                <Text style={styles.partnerAddBtnText}>
                                  Add Partner
                                </Text>
                              </TouchableOpacity>
                            </View>
                            {inlinePartners.length > 0 ? (
                              <View style={styles.aggregatePartnerList}>
                                {inlinePartners.map((p) => {
                                  const partnerName =
                                    p.company_name ||
                                    p.name ||
                                    p.contact_person ||
                                    "—";
                                  const partnerSub = [p.phone, p.email]
                                    .filter(Boolean)
                                    .join(" · ");
                                  const isSelected = subcontractSupplierId === p.id;
                                  return (
                                    <TouchableOpacity
                                      key={p.id}
                                      style={[
                                        styles.aggregatePartnerCard,
                                        isSelected && styles.aggregatePartnerCardSelected,
                                      ]}
                                      onPress={() =>
                                        setSubcontractSupplierId(
                                          isSelected ? null : p.id,
                                        )
                                      }
                                      activeOpacity={0.85}
                                    >
                                      <View style={styles.aggregatePartnerAvatar}>
                                        <Text
                                          style={styles.aggregatePartnerAvatarText}
                                        >
                                          {partnerName.slice(0, 2).toUpperCase()}
                                        </Text>
                                      </View>
                                      <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text
                                          style={styles.aggregatePartnerName}
                                          numberOfLines={1}
                                        >
                                          {partnerName}
                                        </Text>
                                        {partnerSub ? (
                                          <Text
                                            style={styles.aggregatePartnerSub}
                                            numberOfLines={1}
                                          >
                                            {partnerSub}
                                          </Text>
                                        ) : null}
                                      </View>
                                      <FontAwesome
                                        name={
                                          isSelected ? "check-circle" : "circle-thin"
                                        }
                                        size={22}
                                        color={
                                          isSelected ? Theme.primary : Theme.borderInput
                                        }
                                      />
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            ) : (
                              <View style={styles.aggregateViewMoreBtn}>
                                <Text style={styles.aggregateViewMoreText}>
                                  No partners yet. Add or select partner
                                </Text>
                              </View>
                            )}
                          </View>
                        );

                        const rateAndTrackingPane = (
                          <View
                            style={[
                              styles.aggregatePaneCard,
                              canWideAlign && styles.aggregatePaneWide,
                            ]}
                          >
                            <View
                              style={[
                                styles.aggregateGridRow,
                                canWideAlign && styles.aggregateGridRowWide,
                              ]}
                            >
                              <View style={styles.aggregateGridCol}>
                                <Text style={styles.tripAssignRowLabel}>
                                  Partner rate (₹) *
                                </Text>
                                <TextInput
                                  style={[
                                    styles.assignVehicleInput,
                                    assignmentShellStyles.inputWell,
                                  ]}
                                  placeholder="0"
                                  placeholderTextColor={Theme.textMuted}
                                  value={subcontractRate}
                                  onChangeText={setSubcontractRate}
                                  ref={aggregatePartnerRateInputRef}
                                  keyboardType="decimal-pad"
                                  returnKeyType="next"
                                  onSubmitEditing={() =>
                                    aggregateAdvancePaidInputRef.current?.focus()
                                  }
                                />
                              </View>
                              <View style={styles.aggregateGridCol}>
                                <Text style={styles.tripAssignRowLabel}>
                                  Advance paid (₹)
                                </Text>
                                <TextInput
                                  style={[
                                    styles.assignVehicleInput,
                                    assignmentShellStyles.inputWell,
                                  ]}
                                  placeholder="Optional"
                                  placeholderTextColor={Theme.textMuted}
                                  value={aggregateAdvancePaid}
                                  onChangeText={setAggregateAdvancePaid}
                                  ref={aggregateAdvancePaidInputRef}
                                  keyboardType="decimal-pad"
                                  returnKeyType={
                                    staffHandshakeAssignLater ? "done" : "next"
                                  }
                                  onSubmitEditing={() => {
                                    if (!staffHandshakeAssignLater) {
                                      aggregateDriverNameInputRef.current?.focus();
                                    }
                                  }}
                                />
                              </View>
                            </View>

                            {!staffHandshakeAssignLater ? (
                              <>
                                <Text style={styles.tripAssignRowLabel}>
                                  Driver Name (Tracking) *
                                </Text>
                                <TextInput
                                  style={[
                                    styles.assignVehicleInput,
                                    assignmentShellStyles.inputWell,
                                  ]}
                                  placeholder="e.g. Suresh Kumar"
                                  placeholderTextColor={Theme.textMuted}
                                  value={aggregateDriverTrackingName}
                                  onChangeText={(value) => {
                                    aggregateDriverNameManualRef.current = true;
                                    setAggregateDriverTrackingName(value);
                                  }}
                                  ref={aggregateDriverNameInputRef}
                                  autoCorrect={false}
                                  autoCapitalize="words"
                                  returnKeyType="next"
                                  onSubmitEditing={() =>
                                    aggregateDriverPhoneInputRef.current?.focus()
                                  }
                                />
                                <View
                                  style={[
                                    styles.aggregateGridRow,
                                    canWideAlign && styles.aggregateGridRowWide,
                                  ]}
                                >
                                  <View style={styles.aggregateGridCol}>
                                    <Text
                                      style={[
                                        styles.tripAssignRowLabel,
                                        styles.aggregateInlineFieldLabel,
                                      ]}
                                    >
                                      Driver Phone (Tracking) *
                                    </Text>
                                    <View
                                      style={[
                                        styles.aggregatePhoneInputWrap,
                                        assignmentShellStyles.inputWell,
                                      ]}
                                    >
                                      <Text style={styles.aggregatePhonePrefix}>
                                        🇮🇳 +91
                                      </Text>
                                      <TextInput
                                        style={styles.aggregatePhoneInput}
                                        placeholder="98765 43210"
                                        placeholderTextColor={Theme.textMuted}
                                        value={aggregateDriverPhone}
                                        onChangeText={(t) =>
                                          setAggregateDriverPhone(
                                            formatMobileNumber(t),
                                          )
                                        }
                                        ref={aggregateDriverPhoneInputRef}
                                        keyboardType="phone-pad"
                                        autoComplete="tel"
                                        returnKeyType="next"
                                        onSubmitEditing={() =>
                                          aggregateVehicleInputRef.current?.focus()
                                        }
                                      />
                                    </View>
                                  </View>
                                  <View style={styles.aggregateGridCol}>
                                    <Text
                                      style={[
                                        styles.tripAssignRowLabel,
                                        styles.aggregateInlineFieldLabel,
                                      ]}
                                    >
                                      Vehicle Number *
                                    </Text>
                                    <TextInput
                                      style={[
                                        styles.assignVehicleInput,
                                        assignmentShellStyles.inputWell,
                                      ]}
                                      placeholder="e.g. TN 67 GH 7652"
                                      placeholderTextColor={Theme.textMuted}
                                      value={assignVehicleRegistration}
                                      onChangeText={setAssignVehicleRegistration}
                                      ref={aggregateVehicleInputRef}
                                      editable
                                      returnKeyType="done"
                                    />
                                  </View>
                                </View>
                                {aggregatePhoneName ? (
                                  <Text style={styles.phoneModalFound}>
                                    Found: {aggregatePhoneName}
                                  </Text>
                                ) : aggregatePhoneNotFound ? (
                                  <Text style={styles.phoneModalNotFound}>
                                    No driver found for this number
                                  </Text>
                                ) : null}
                                {aggregatePhoneName && aggregatePhoneInTrip ? (
                                  <Text style={styles.phoneModalInTrip}>
                                    Driver is in trip
                                  </Text>
                                ) : null}
                              </>
                            ) : null}
                          </View>
                        );

                        return (
                          <>
                            {staffHandshakeAssignLater ? (
                              <Text style={styles.modalHint}>
                                Add vehicle number and driver phone on the trip
                                screen before the trip starts.
                              </Text>
                            ) : null}
                            <View
                              style={assignmentShellStyles.tripAssignSurfaceCard}
                            >
                              <View style={styles.tripAssignCardHeader}>
                                <Text style={styles.tripAssignCardHeaderTitle}>
                                  Current Node
                                </Text>
                                <View
                                  style={[
                                    styles.tripAssignSourceBadge,
                                    styles.tripAssignBadgeUnassigned,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.tripAssignSourceBadgeText,
                                      styles.tripAssignSourceBadgeTextUnassigned,
                                    ]}
                                  >
                                    Unassigned
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.tripAssignPartnerHint}>
                                Associated partner (required). Select your
                                sub-supplier for this trip and enter the rate you
                                will pay.
                              </Text>
                              <ScrollView
                                style={[
                                  styles.currentNodeInnerScroll,
                                  !canWideAlign && styles.currentNodeInnerScrollMobile,
                                  isCompactModalLayout && styles.currentNodeInnerScrollCompact,
                                ]}
                                contentContainerStyle={[
                                  styles.currentNodeInnerScrollContent,
                                  styles.aggregateSplit,
                                  canWideAlign && styles.aggregateSplitWide,
                                ]}
                                nestedScrollEnabled
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={!canWideAlign}
                              >
                                {canWideAlign ? (
                                  <>
                                    {partnerPane}
                                    {rateAndTrackingPane}
                                  </>
                                ) : (
                                  <View style={styles.aggregateMobileStack}>
                                    {partnerPane}
                                    {rateAndTrackingPane}
                                  </View>
                                )}
                              </ScrollView>
                            </View>
                          </>
                        );
                      })()
                  )}
                  </>
                )}
              </ScrollView>
              {!deployOtpCode ? (
                <View
                  style={[
                    assignmentShellStyles.modalFooterBar,
                    { paddingBottom: Math.max(16, insets.bottom + 8) },
                  ]}
                >
                  {loadAction?.type === "ASSIGN" &&
                  assigningTripId === loadAction.load.id ? (
                    <View style={styles.loadingWrap}>
                      <ActivityIndicator size="small" color={Theme.primary} />
                      <Text style={styles.loadingText}>Creating trip…</Text>
                    </View>
                  ) : loadAction?.type === "ASSIGN" &&
                    !useAdHocDriver &&
                    staffHandshakeAssignLater ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={assigningTripId === loadAction.load.id}
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => {
                        if (loadAction?.type === "ASSIGN") {
                          void handleFinalAssignment(loadAction.load);
                        }
                      }}
                    >
                      <FontAwesome
                        name="bolt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        Authorize & deploy voyage
                      </Text>
                    </Pressable>
                  ) : loadAction?.type === "ASSIGN" &&
                    !useAdHocDriver &&
                    !staffHandshakeAssignLater &&
                    rosterReady ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={assigningTripId === loadAction.load.id}
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => {
                        if (loadAction?.type === "ASSIGN") {
                          void handleDeployRoster(loadAction.load);
                        }
                      }}
                    >
                      <FontAwesome
                        name="bolt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        Authorize & deploy voyage
                      </Text>
                    </Pressable>
                  ) : loadAction?.type === "ASSIGN" &&
                    useAdHocDriver &&
                    !staffHandshakeAssignLater ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        assigningTripId === loadAction.load.id ||
                        !aggregatePartnerHandshakeComplete ||
                        !aggregateTrackingFlowReady ||
                        (aggregateDriverPhone.trim().length > 0 &&
                          aggregatePhoneInTrip)
                      }
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => {
                        if (loadAction?.type === "ASSIGN") {
                          void handleDeployAdHoc(loadAction.load);
                        }
                      }}
                    >
                      <FontAwesome
                        name="share-alt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        {aggregateDriverPhone.trim().length > 0 &&
                        aggregatePhoneInTrip
                          ? "Driver on trip"
                          : "Deploy & get OTP"}
                      </Text>
                    </Pressable>
                  ) : loadAction?.type === "ASSIGN" &&
                    useAdHocDriver &&
                    staffHandshakeAssignLater ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        assigningTripId === loadAction.load.id ||
                        !aggregatePartnerHandshakeComplete
                      }
                      style={({ pressed }) => [
                        styles.handshakePrimaryCta,
                        pressed && { opacity: 0.9 },
                        Platform.OS === "web" &&
                          ({ cursor: "pointer" } as const),
                      ]}
                      onPress={() => {
                        if (loadAction?.type === "ASSIGN") {
                          void handleDeployAdHoc(loadAction.load);
                        }
                      }}
                    >
                      <FontAwesome
                        name="share-alt"
                        size={18}
                        color={Theme.textOnPrimary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.handshakePrimaryCtaText}>
                        Create trip & assign later
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.modalHint, { marginBottom: 0 }]}>
                      {!useAdHocDriver
                        ? "Select a driver and a vehicle from your org to continue."
                        : "Enter driver name, driver phone, and vehicle number, or use Assign later."}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          )}
          </View>
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
  container: { flex: 1, backgroundColor: Theme.darkBackground },
  loadDarkHeader: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  loadDarkHeaderClaimed: {
    paddingBottom: 2,
  },
  loadFilterHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 8,
    gap: 10,
  },
  loadFilterHeaderRowSingle: {
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
  },
  loadSubTabsWrap: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 2,
  },
  loadSubTabsWrapSingle: {
    flex: 0,
    minWidth: 380,
    maxWidth: 420,
    paddingBottom: 0,
  },
  loadMainTabsPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  loadMainTabActiveBg: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 999,
    backgroundColor: Theme.darkBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 3,
  },
  loadMainTabPill: {
    minWidth: 0,
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  loadMainTabPillActive: {
    backgroundColor: "transparent",
  },
  loadMainTabPillText: {
    fontSize: 8.5,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  loadMainTabPillTextActive: {
    color: Theme.textOnDark,
  },
  loadMainTabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  loadMainTabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.3)",
  },
  loadMainTabBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  loadMainTabBadgeTextActive: {
    color: Theme.textOnDark,
  },
  loadMyNetworkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexShrink: 0,
    marginBottom: 2,
  },
  loadMyNetworkBtnLabel: {
    ...Typography.networkDarkHeaderNav,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  hirePartnerFabWrap: {
    position: "absolute",
    right: 16,
    zIndex: 100,
    elevation: 10,
  },
  hirePartnerFab: {
    width: Layout.fabSize,
    height: Layout.fabSize,
    borderRadius: Layout.fabBorderRadius,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: Layout.fabShadowOffsetY },
    shadowOpacity: Layout.fabShadowOpacity,
    shadowRadius: Layout.fabShadowRadius,
    elevation: Layout.fabElevation,
  },
  loadSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  loadSearchRowClaimed: {
    paddingTop: 6,
  },
  loadSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.textSecondary,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  loadSearchWrapSingle: {
    flex: 1,
    maxWidth: 520,
    minWidth: 300,
    height: 36,
    marginHorizontal: 6,
  },
  loadSearchIcon: { marginRight: 8 },
  loadSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 18,
    fontSize: 11,
    lineHeight: 11,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  loadTypeFilterWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  loadTypeFilterChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  loadTypeFilterChipActive: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 4,
    elevation: 1,
  },
  loadTypeFilterChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadTypeFilterChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  loadTypeFilterChipCount: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  loadTypeFilterChipCountActive: {
    color: Theme.textPrimaryDark,
  },
  loadContentWrap: {
    flex: 1,
    backgroundColor: LOAD_CONTENT_BG,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    overflow: "hidden",
  },
  loadContentWrapClaimed: {
    marginTop: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  loadSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
    paddingHorizontal: 2,
    width: "100%",
  },
  loadSectionHeaderBlock: {
    width: "100%",
    marginBottom: 12,
  },
  loadSectionSub: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  loadSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    flex: 1,
    minWidth: 0,
  },
  loadSectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  loadSectionPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  loadMarketClientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    zIndex: 1,
  },
  /** Fixed slot height so grid row mates align when org name is missing */
  loadMarketClientRowGrid: {
    minHeight: 28,
  },
  loadMarketClientRowGridReserve: {
    minHeight: 28,
    marginBottom: 8,
  },
  loadMarketClientText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    minWidth: 0,
  },
  loadCardQuoteHint: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  loadCardQuoteHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  reviewHubHero: {
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  reviewHubHeroGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  reviewHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  reviewHubHeroRoute: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  reviewHubHeroMeta: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderOnDark,
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  reviewHubHeroMetaCol: {
    flex: 1,
    minWidth: 0,
  },
  reviewHubHeroMetaColEnd: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
    alignItems: "flex-end",
  },
  reviewHubHeroStatValueEnd: {
    textAlign: "right" as const,
    alignSelf: "stretch",
  },
  reviewHubHeroStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reviewHubHeroStatValue: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  modalTitleCenter: {
    textAlign: "center",
    width: "100%",
  },
  modalSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginTop: 4,
    textAlign: "center",
  },
  reviewHubModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewHubModalBack: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  reviewHubModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  bidHubHero: {
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidHubHeroGlow: {
    position: "absolute",
    top: -36,
    right: -36,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bidHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  bidHubHeroRoute: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    lineHeight: 22,
    marginBottom: 10,
  },
  bidHubHeroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bidHubChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  bidHubChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },
  bidSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  scrollContentClaimed: {
    paddingTop: 12,
  },
  gridList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    alignItems: "stretch",
  },
  gridCardWrap: {
    width: "33.333%",
    paddingHorizontal: 6,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  gridCardWrapHalf: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  loadCardGrid: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
  },
  loadCardFooterGrid: {
    marginTop: "auto",
  },
  loadingWrap: { paddingVertical: 32, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  loadCard: {
    position: "relative" as const,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 18,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    overflow: "hidden",
    minHeight: 0,
  },
  loadCardOrb: {
    position: "absolute",
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  loadCardHeroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    zIndex: 1,
  },
  loadCardDateHero: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  loadCardTop: {
    marginBottom: 8,
  },
  loadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  loadTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surfaceGray,
  },
  loadTypePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  loadStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  loadStatePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  loadStatePillGetLoadDefault: {
    backgroundColor: Theme.positive,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
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
  loadCardIdCompact: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    zIndex: 1,
  },
  loadCardSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 4,
    zIndex: 1,
  },
  loadCardSpecDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 12,
    marginLeft: 0,
  },
  bidMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  bidIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  bidIconCircleActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  bidIconCircleMuted: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  shareIndentIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  broadcastNetworkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 0,
    flexShrink: 0,
    shadowColor: "#6366f1",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  broadcastNetworkBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.2,
  },
  loadCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardDate: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  loadCardDateText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    zIndex: 1,
  },
  loadCardFooterCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 0,
  },
  loadCardMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadCardMetaCompact: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: "stretch",
  },
  loadCardMetaText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
    minWidth: 0,
  },
  loadCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 10,
    flexShrink: 0,
    flexGrow: 0,
    minWidth: 0,
  },
  loadCardActionsCompact: {
    marginLeft: 0,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    width: "100%",
  },
  loadCardActionCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  shareIndentBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#EAEAEA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 30,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  reviewBidsBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deployPendingWrap: {
    paddingHorizontal: 12,
    minHeight: 44,
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
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
    minWidth: 0,
  },
  getLoadCompanyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  getLoadAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  getLoadAvatarImage: {
    width: "100%",
    height: "100%",
  },
  getLoadAvatarInitial: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  getLoadTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    textAlign: "right",
  },
  getLoadTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  loadCardInner: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginTop: 6,
    zIndex: 1,
  },
  loadCardInnerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  loadCardSpecsGrid: {
    gap: 6,
  },
  loadCardSpecsLabelsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecsValuesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecCell: {
    flex: 1,
    minWidth: 0,
  },
  loadCardSpecCellRight: {
    alignItems: "flex-end",
  },
  loadCardSpecLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadCardSpecValue: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  loadCardSpecLabelRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  loadCardSpecValueRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  quoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 8,
    minHeight: 30,
  },
  quoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  quoteSentRow: {
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    minHeight: 30,
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
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
    minHeight: 132,
  },
  awardedCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
    alignSelf: "stretch",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: TESLA_BLACK,
    borderRadius: 8,
    minHeight: 32,
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
    paddingHorizontal: 40,
    lineHeight: 20,
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
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidModalSheetFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
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
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  handshakeBtnModal: { backgroundColor: Theme.textPrimaryDark },
  handshakeSegmentSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  handshakeSegmentPill: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      } as const,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  handshakeSegBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 11,
  },
  handshakeSegBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: {
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      } as const,
    }),
  },
  handshakeSegBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  handshakeSegBtnTextActive: {
    color: "#ffffff",
  },
  handshakeAssignLaterOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      } as const,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  handshakeAssignLaterOuterCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  handshakeAssignLaterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  handshakeAssignLaterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  handshakeAssignLaterTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  handshakeAssignLaterSub: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 2,
  },
  handshakePrimaryCta: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 12px 24px rgba(15,23,42,0.2)",
        cursor: "pointer",
      } as const,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  },
  handshakePrimaryCtaText: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  assignWebModalCardCompact: {
    width: "98%",
    maxWidth: 760,
    borderRadius: 14,
    height: "92vh",
    maxHeight: "92vh",
  },
  handshakeNativeInner: {
    flex: 1,
    minHeight: 0,
  },
  assignModalPage: {
    flex: 1,
    backgroundColor: Theme.surfaceLight,
    position: "relative",
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
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
  assignModalBody: {
    flex: 1,
    minHeight: 0,
  },
  assignModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    width: "100%",
    alignSelf: "stretch",
  },
  tripAssignCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignCardHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tripAssignSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tripAssignBadgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.borderInput,
  },
  tripAssignSourceBadgeText: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tripAssignSourceBadgeTextUnassigned: {
    color: Theme.textPrimaryDark,
  },
  tripAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignRowLast: { borderBottomWidth: 0 },
  tripAssignRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  tripAssignIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tripAssignIconInactive: {
    backgroundColor: "#f3f4f6",
    borderColor: assignmentShellColors.borderSlate,
  },
  tripAssignIconDriverActive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.primary,
  },
  tripAssignIconVehicleActive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  tripAssignRowTextCol: { flex: 1, minWidth: 0 },
  tripAssignRowLabel: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  tripAssignRowInput: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 22,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  phoneModalFound: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  phoneModalNotFound: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 4,
  },
  phoneModalInTrip: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.negative,
    marginTop: 4,
  },
  tripAssignPartnerBlock: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  tripAssignPartnerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
    marginBottom: 10,
  },
  aggregateSplit: {
    gap: 12,
  },
  currentNodeInnerScroll: {
    width: "100%",
  },
  currentNodeInnerScrollMobile: {
    maxHeight: 440,
  },
  currentNodeInnerScrollCompact: {
    maxHeight: 380,
  },
  currentNodeInnerScrollContent: {
    paddingBottom: 8,
  },
  aggregateMobileStack: {
    gap: 12,
  },
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregatePaneCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 8,
  },
  aggregatePaneWide: {
    minHeight: 190,
  },
  aggregatePaneHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  aggregatePaneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  aggregatePartnerCard: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aggregatePartnerCardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  aggregatePartnerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  aggregatePartnerAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 1,
  },
  aggregatePartnerList: {
    gap: 8,
  },
  aggregateViewMoreBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  aggregateViewMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  aggregateGridRow: {
    gap: 12,
  },
  aggregateGridRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregateGridCol: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  aggregateInlineFieldLabel: {
    textTransform: "none",
    letterSpacing: 0.2,
    fontSize: 11,
    marginBottom: 6,
  },
  aggregatePhoneInputWrap: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aggregatePhonePrefix: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  aggregatePhoneInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  partnerAddBtn: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  partnerAddBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  assignSelectionGrid: {
    gap: 12,
    marginBottom: 14,
  },
  assignSelectionGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  assignPickerCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  assignPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  assignPickerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  assignPickerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceLight,
  },
  assignPickerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  assignEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    marginBottom: 8,
    gap: 10,
  },
  assignEntityRowActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  assignEntityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignEntityTextCol: {
    flex: 1,
    minWidth: 0,
  },
  assignEntityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignEntitySubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  assignEmptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  assignEmptyState: {
    marginTop: 2,
    gap: 10,
  },
  assignEmptyActionBtn: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Theme.primary,
  },
  assignEmptyActionBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  assignSummaryBar: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  assignSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignSummaryBlock: {
    flex: 1,
    minWidth: 0,
  },
  assignSummaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  assignSummaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  assignSummaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignInputWrap: {
    marginBottom: 6,
  },
  subcontractPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    marginBottom: 6,
  },
  subcontractPickLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginRight: 10,
  },
  subcontractPickValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  subcontractPickerModalRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: Theme.overlayBackdrop,
  },
  subcontractPickerModalBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  subcontractPickerCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    maxHeight: 380,
    alignSelf: "center",
    width: "100%",
    ...Platform.select({
      web: {
        maxWidth: 760,
        boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
      } as const,
    }),
  },
  subcontractPickerTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMutedDemo,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  subcontractPickerToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  subcontractPickerToggleLabel: {
    flex: 1,
    paddingRight: 12,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  subcontractPickerScroll: { maxHeight: 248 },
  subcontractPickerScrollContent: { paddingVertical: 6 },
  subcontractPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: 44,
  },
  subcontractPickerRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  subcontractPickerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginRight: 10,
  },
  subcontractPickerBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    borderWidth: 1,
    borderColor: Theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 10,
  },
  subcontractPickerEmpty: {
    padding: 16,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  subcontractPickerClearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  subcontractPickerClearText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.negative,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  assignVehicleInput: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 44,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
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
    backgroundColor: Theme.textPrimaryDark,
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
  quoteHeaderRowDark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 14,
    marginBottom: 8,
  },
  quoteHeaderNameDark: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderAmountDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderStatusDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontStyle: "italic",
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
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  bidModalScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  bidIndentDetailSection: {
    marginTop: 8,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 12,
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
    gap: 10,
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
    minWidth: 116,
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
    minWidth: 0,
    flexShrink: 1,
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
    marginTop: 6,
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
    ...Platform.select({
      web: {
        outlineStyle: "none",
        /** iOS Safari: font-size < 16px on focused inputs triggers page zoom. */
        fontSize: 16,
        lineHeight: 22,
        maxWidth: "100%",
      } as any,
    }),
  },
  previousBidWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
  },
  previousBidLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  previousBidValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  previousBidMeta: {
    marginTop: 2,
    fontSize: 10,
    color: Theme.textSecondary,
  },
  previousBidHistoryWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 6,
  },
  previousBidHistoryTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  previousBidHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previousBidHistoryAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previousBidHistoryDate: {
    fontSize: 10,
    color: Theme.textSecondary,
  },
  quotePlaceholder: {
    fontSize: 36,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    marginBottom: 24,
  },
  highlightedIndentCard: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
    shadowColor: Theme.teslaRed,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
});
