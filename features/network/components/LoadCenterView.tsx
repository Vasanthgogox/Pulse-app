/**
 * Load Center — reference UI: Hire Partners | Find Work | Awarded.
 * Header "Load Center" / "Find or Hire Work", three sub-tabs, cards, modals.
 */
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import { SubTabs } from "@/components/SubTabs";
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
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
import { shareDraftIndent } from "@/features/indents/services/indents.service";
import { acceptAwardedQuote } from "@/features/indents/services/accept-awarded-quote.service";
import {
  assignAggregateTripDriverByPhone,
  generateTripOtp,
  isTripCompleted,
  regenerateTripOtp,
  setInitialTripForDetail,
} from "@/features/trips";
import { formatINR } from "@/lib/format";
import { validatePhone } from "@/lib/phoneValidation";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  useDirectQuoteCountsQuery,
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
import { searchExistingDriversByPhone } from "@/features/drivers/services/drivers.service";
import { queryKeys } from "@/lib/queryKeys";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Platform as RNPlatform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
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
  { id: "OPEN", label: "Open", statuses: ["open", "pending", "broadcast", "draft"] },
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

export function LoadCenterView({
  contentTopPadding = 0,
  onCreateIndentPress,
  onIndentPress,
}: LoadCenterViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [loadSubTab, setLoadSubTab] = useState<LoadSubTab>("GIVE_LOAD");
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
  const [aggregateDriverPhone, setAggregateDriverPhone] = useState("");
  const [aggregatePhoneName, setAggregatePhoneName] = useState<string | null>(null);
  const [aggregatePhoneNotFound, setAggregatePhoneNotFound] = useState(false);
  const [aggregatePhoneInTrip, setAggregatePhoneInTrip] = useState(false);
  const aggregatePhoneLookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [subcontractSupplierId, setSubcontractSupplierId] = useState<string | null>(null);
  const [subcontractRate, setSubcontractRate] = useState<string>("");
  const [subcontractPickerOpen, setSubcontractPickerOpen] = useState(false);
  const [showIntegratedPartners, setShowIntegratedPartners] = useState(false);
  const [deployOtpCode, setDeployOtpCode] = useState<string | null>(null);
  const [deployOtpExpiresAt, setDeployOtpExpiresAt] = useState<string | null>(
    null,
  );
  const [deployTripIdForOtp, setDeployTripIdForOtp] = useState<string | null>(
    null,
  );
  const [handshakeStep, setHandshakeStep] = useState<
    "flow_choice" | "roster" | "ad_hoc_vehicle"
  >("flow_choice");
  const [localBidHistoryByIndentId, setLocalBidHistoryByIndentId] = useState<
    Record<string, { amount: number; updatedAt: string }[]>
  >({});

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
  const useGridLayout = width >= 1024;

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

  const isIntegratedSupplierRow = useCallback((s: { supplier_type?: string | null; linked_organization_id?: string | null }) => {
    return s.supplier_type === "integrated" && !!s.linked_organization_id;
  }, []);

  const visiblePartnersForHandshake = useMemo(() => {
    const manual = suppliers.filter((s) => !isIntegratedSupplierRow(s));
    const base = showIntegratedPartners ? suppliers : manual;
    // Never hide the currently selected partner (keeps existing selection stable).
    if (subcontractSupplierId && !base.some((s) => s.id === subcontractSupplierId)) {
      const selected = suppliers.find((s) => s.id === subcontractSupplierId);
      if (selected) return [selected, ...base];
    }
    return base;
  }, [suppliers, showIntegratedPartners, subcontractSupplierId, isIntegratedSupplierRow]);

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
        let userId = matches[0]?.user_id ?? null;
        let foundName = direct;

        if (!foundName) {
          // Some deployments store phone as +91XXXXXXXXXX; try that too.
          const { matches: matchesWithCode } = await searchExistingDriversByPhone(
            `+91${last10}`,
          );
          foundName = matchesWithCode[0]?.full_name ?? null;
          userId = userId ?? matchesWithCode[0]?.user_id ?? null;
        }

        setAggregatePhoneName(foundName);
        setAggregatePhoneNotFound(!foundName);

        // If driver exists in app, show if they're currently assigned to an active trip.
        const driverRow =
          userId != null
            ? drivers.find((d) => d.user_id === userId) ??
              drivers.find(
                (d) =>
                  (d.phone ?? "").replace(/\D/g, "").slice(-10) === last10,
              ) ??
              null
            : drivers.find(
                (d) =>
                  (d.phone ?? "").replace(/\D/g, "").slice(-10) === last10,
              ) ?? null;

        if (!driverRow?.id) {
          setAggregatePhoneInTrip(false);
          return;
        }

        const activeTrip =
          (trips ?? []).find(
            (t) =>
              (t as { driver_id?: string | null }).driver_id === driverRow.id &&
              !isTripCompleted(t as any) &&
              String((t as any).status ?? "").toLowerCase() !== "cancelled",
          ) ?? null;
        setAggregatePhoneInTrip(!!activeTrip);
      });
    }, 400);
    return () => {
      if (aggregatePhoneLookupTimeoutRef.current)
        clearTimeout(aggregatePhoneLookupTimeoutRef.current);
    };
  }, [aggregateDriverPhone, drivers, trips]);

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
    useDirectQuoteCountsQuery(giveLoadIds);

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
      const isTargeted =
        target === "integrated_supplier" || target === "both";
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

    return statusFiltered.filter((load) => loadMatchesSearch(load, searchQuery));
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
    statusFilterTab === "DONE" ? filteredFindWorkDoneLoads : filteredFindWorkLoads;

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
    const phoneTrimmed = aggregateDriverPhone.trim();
    const phoneErr = phoneTrimmed ? validatePhone(phoneTrimmed) : null;
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
      // Driver + OTP are optional: require phone only for OTP generation (not for trip creation).
      if (!phoneTrimmed || phoneErr) {
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        triggerSuccess("Trip created (OTP not generated)");
        // Do not treat this as an error. OTP can be generated later from Trip Detail
        // after providing a driver phone number.
        return;
      }

      const { error: assignAggErr } = await assignAggregateTripDriverByPhone(
        trip.id,
        orgId,
        phoneTrimmed,
        regNum || null,
      );
      if (assignAggErr) {
        await updateIndent(load.id, { status: "completed" });
        invalidateTrips(orgId);
        invalidateIndents(orgId);
        setLoadAction(null);
        setAssigningTripId(null);
        Alert.alert(
          "Trip created",
          `Driver could not be assigned. ${assignAggErr.message}\n\nAssign driver from trip detail to generate OTP.`,
        );
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      const { error: otpErr, code, expires_at } = await generateTripOtp(trip.id);
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
        setInitialTripForDetail(trip);
        router.push(
          `/trip/${trip.id}?entryContext=supplier` as import("expo-router").Href,
        );
        return;
      }

      setDeployOtpCode(code);
      setDeployOtpExpiresAt(expires_at ?? null);
      setDeployTripIdForOtp(trip.id);

      const subSupplierId = (subcontractSupplierId ?? "").trim();
      const subRateNum = Number(subcontractRate);
      const shouldSaveSubcontract =
        subSupplierId !== "" &&
        Number.isFinite(subRateNum) &&
        subRateNum >= 0;
      if (shouldSaveSubcontract) {
        const { error: subErr } = await upsertTripSubcontract({
          viewerOrgId: orgId,
          tripId: trip.id,
          supplierId: subSupplierId,
          rate: subRateNum,
        });
        if (subErr) Alert.alert("Trip created", `Partner could not be saved. ${subErr.message}`);
        // Ensure Finance → Suppliers reflects the saved partner payable immediately
        // (covers both backend RPC success and local fallback).
        queryClient.invalidateQueries({
          queryKey: ["q", "trips", "subcontracts", orgId],
        });
      }

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
  const aggregateHasDriverPhone = aggregateDriverPhone.trim().length > 0;
  const aggregateHasVehicleText = assignVehicleRegistration.trim().length > 0;

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
    if (handshakeStep === "roster" || handshakeStep === "ad_hoc_vehicle") {
      setHandshakeStep("flow_choice");
      return;
    }
  }, [deployOtpCode, handshakeStep]);

  /** Keep FAB above the floating demo tab bar + safe area insets. */
  const hirePartnerFabBottom =
    Layout.demoTabBarScrollBottomInset +
    insets.bottom +
    Layout.tabBarBottomPaddingMin;
  const paddingBottom = useMemo(() => {
    const base = 24 + Layout.demoTabBarScrollBottomInset + insets.bottom + 24;
    if (loadSubTab !== "GIVE_LOAD") return base;
    return hirePartnerFabBottom + Layout.fabSize + Layout.fabBottomOffset;
  }, [hirePartnerFabBottom, insets.bottom, loadSubTab]);
  const statusTabsForRole = useMemo(() => {
    return isClaimedTab
      ? STATUS_TABS.filter((t) => t.id === "AWARDED")
      : STATUS_TABS;
  }, [isClaimedTab]);

  const renderClaimedLoadCard = (load: IndentRow, isDone: boolean) => {
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
        style={styles.loadCard}
        onPress={() => onIndentPress(load)}
        activeOpacity={0.7}
      >
        <View style={styles.awardedCardTop}>
          <View style={styles.loadPillRow}>
            <View style={styles.loadTypePill}>
              <Text style={styles.loadTypePillText}>CLAIMED</Text>
            </View>
            <View
              style={[
                styles.loadStatePill,
                { backgroundColor: isDone ? Theme.positive : Theme.driverGold },
              ]}
            >
              <Text style={styles.loadStatePillText}>
                {isDone ? "DEPLOYED" : "AWARDED"}
              </Text>
            </View>
          </View>
          <Text style={styles.awardedId}>{getIndentDisplayNumber(load)}</Text>
        </View>
        <Text style={styles.loadCardRouteGet} numberOfLines={2}>
          {(load.pickup_area || "—").toUpperCase()} TO{" "}
          {(load.drop_location || "—").toUpperCase()}
        </Text>
        <View style={styles.loadCardInner}>
          <View style={styles.loadCardInnerTopRow}>
            <Text style={styles.loadCardId} numberOfLines={1}>
              ID: {getIndentDisplayNumber(load)}
            </Text>
            <View style={styles.loadCardTopRight}>
              <Text style={styles.getLoadTargetLabel}>Supplier rate</Text>
              <Text style={styles.getLoadTargetValue}>{formatINR(supplierRate)}</Text>
            </View>
          </View>
          <View style={styles.loadCardSpecsRow}>
            <View style={styles.loadCardSpecItem}>
              <Text style={styles.loadCardSpecLabel}>Vehicle</Text>
              <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                {vehicleDetail}
              </Text>
            </View>
            <View style={styles.loadCardSpecItem}>
              <Text style={styles.loadCardSpecLabel}>Weight</Text>
              <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                {weightDetail}
              </Text>
            </View>
            <View style={styles.loadCardSpecItem}>
              <Text style={styles.loadCardSpecLabel}>Load Type</Text>
              <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                {loadTypeDetail}
              </Text>
            </View>
          </View>
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
            onPress={() => {
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
          isClaimedTab && styles.loadDarkHeaderClaimed,
        ]}
      >
        {/* Sub-tabs: HIRE PARTNER | FIND WORK | CLAIMED */}
        <View style={styles.loadFilterHeaderRow}>
          <SubTabs<LoadSubTab>
            variant="dark"
            horizontalPadding={0}
            value={loadSubTab}
            onChange={setLoadSubTab}
            items={[
              {
                key: "GIVE_LOAD",
                label: "HIRE PARTNER",
                badgeCount: hirePartnerLoads.length,
              },
              { key: "GET_LOAD", label: "FIND WORK", badgeCount: findWorkLoads.length },
              {
                key: "AWARDED",
                label: "CLAIMED",
                badgeCount: awardedLoads.length,
              },
            ]}
          />
        </View>
        {/* Search + Status filters (same layout as Manage Network: search + filter chips) */}
        <View
          style={[
            styles.loadSearchRow,
            isClaimedTab && styles.loadSearchRowClaimed,
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
        </View>
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
                  return (
                    <View key={load.id} style={useGridLayout ? styles.gridCardWrap : undefined}>
                      <TouchableOpacity
                        style={styles.loadCard}
                        onPress={() => onIndentPress(load)}
                        activeOpacity={0.7}
                      >
                      <View style={styles.loadCardTop}>
                        <View style={styles.loadPillRow}>
                          <View style={styles.loadTypePill}>
                            <Text style={styles.loadTypePillText}>HIRE PARTNER</Text>
                          </View>
                          <View style={styles.loadStatePill}>
                            <Text style={styles.loadStatePillText}>
                              {status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.loadCardRoute} numberOfLines={2}>
                        {(load.pickup_area || "—").toUpperCase()} TO{" "}
                        {(load.drop_location || "—").toUpperCase()}
                      </Text>
                      <View style={styles.loadCardInner}>
                        <View style={styles.loadCardInnerTopRow}>
                          <Text style={styles.loadCardId} numberOfLines={1}>
                            ID: {getIndentDisplayNumber(load)}
                          </Text>
                          <View style={styles.loadCardDate}>
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
                        <View style={styles.loadCardSpecsRow}>
                          <View style={styles.loadCardSpecItem}>
                            <Text style={styles.loadCardSpecLabel}>Vehicle</Text>
                            <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                              {vehicleDetail}
                            </Text>
                          </View>
                          <View style={styles.loadCardSpecItem}>
                            <Text style={styles.loadCardSpecLabel}>Weight</Text>
                            <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                              {weightDetail}
                            </Text>
                          </View>
                          <View style={styles.loadCardSpecItem}>
                            <Text style={styles.loadCardSpecLabel}>Load Type</Text>
                            <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                              {loadTypeDetail}
                            </Text>
                          </View>
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
                                Supplier Claimed
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
                            onPress={() =>
                              isDone || isAwardedPendingTrip
                                ? onIndentPress(load)
                                : handleShareIndent(load)
                            }
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
            ) : filteredFindWorkList.length === 0 ? (
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
              <View style={useGridLayout ? styles.gridList : undefined}>
                {filteredFindWorkList.map((load) => {
                const existingQuote = myQuoteByIndentId.get(load.id);
                const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
                const isPending = quoteStatus === "pending";
                const isRejected = quoteStatus === "rejected";
                const isAccepted = quoteStatus === "accepted";
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
                return (
                  <View key={load.id} style={useGridLayout ? styles.gridCardWrap : undefined}>
                    <TouchableOpacity
                      style={styles.loadCard}
                      onPress={() => onIndentPress(load)}
                      activeOpacity={0.7}
                    >
                    <View style={styles.loadCardTop}>
                      <View style={styles.loadPillRow}>
                        <View style={styles.loadTypePill}>
                          <Text style={styles.loadTypePillText}>FIND WORK</Text>
                        </View>
                        <View style={styles.loadStatePill}>
                          <Text style={styles.loadStatePillText}>
                            {existingQuote
                              ? (existingQuote.status || "quoted").toUpperCase()
                              : "OPEN"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.loadCardRouteGet} numberOfLines={2}>
                      {(load.pickup_area || "—").toUpperCase()} TO{" "}
                      {(load.drop_location || "—").toUpperCase()}
                    </Text>
                    <View style={styles.loadCardInner}>
                      <View style={styles.loadCardInnerTopRow}>
                        <View style={styles.getLoadCompanyWrap}>
                          <View style={styles.getLoadAvatarWrap}>
                            {loadAvatarByIndentId[load.id] ? (
                              <Image
                                source={{ uri: loadAvatarByIndentId[load.id] }}
                                style={styles.getLoadAvatarImage}
                              />
                            ) : (
                              <Text style={styles.getLoadAvatarInitial}>
                                {(
                                  load.creator_organization_name ||
                                  load.client_name ||
                                  "U"
                                )
                                  .trim()
                                  .charAt(0)
                                  .toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.getLoadCompany} numberOfLines={1}>
                            {(
                              load.creator_organization_name ||
                              load.client_name ||
                              "—"
                            ).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.loadCardTopRight}>
                          <Text style={styles.getLoadTargetLabel}>Target rate</Text>
                          <Text style={styles.getLoadTargetValue}>
                            {formatINR(
                              Number(
                                load.supplier_target ?? load.client_price ?? 0,
                              ),
                            )}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.loadCardSpecsRow}>
                        <View style={styles.loadCardSpecItem}>
                          <Text style={styles.loadCardSpecLabel}>Vehicle</Text>
                          <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                            {vehicleDetail}
                          </Text>
                        </View>
                        <View style={styles.loadCardSpecItem}>
                          <Text style={styles.loadCardSpecLabel}>Weight</Text>
                          <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                            {weightDetail}
                          </Text>
                        </View>
                        <View style={styles.loadCardSpecItem}>
                          <Text style={styles.loadCardSpecLabel}>Load Type</Text>
                          <Text style={styles.loadCardSpecValue} numberOfLines={1}>
                            {loadTypeDetail}
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
                                Awarded — see Claimed
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
                              onPress={openBidModal}
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
                              onPress={openBidModal}
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
                          onPress={openBidModal}
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
                <View style={styles.securedSectionHeader}>
                  <Text style={styles.securedSectionTitle}>Ready to Deploy</Text>
                  <Text style={styles.securedSectionCount}>
                    {filteredClaimedLoads.length}
                  </Text>
                </View>
                <View style={useGridLayout ? styles.gridList : undefined}>
                  {filteredClaimedLoads.map((load) => (
                    <View key={`claimed-${load.id}`} style={useGridLayout ? styles.gridCardWrap : undefined}>
                      {renderClaimedLoadCard(load, false)}
                    </View>
                  ))}
                </View>
              </View>
            ))}
        </ScrollView>
        {loadSubTab === "GIVE_LOAD" ? (
          <View
            style={[styles.hirePartnerFabWrap, { bottom: hirePartnerFabBottom }]}
            pointerEvents="box-none"
          >
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
                          {String(loadAction.load.weight)} kg
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.bidIndentStatusRow}>
                      <Text style={styles.bidIndentStatusLabel}>Status</Text>
                      <View style={styles.bidIndentStatusPill}>
                        <Text style={styles.bidIndentStatusPillText}>
                          {(() => {
                            const status = String(loadAction.load.status || "—")
                              .trim()
                              .toLowerCase();
                            if (status === "draft") return "Draft (Editable)";
                            if (status === "broadcast") return "Broadcast";
                            return status
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase());
                          })()}
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
                  const existingQuoteBeforeSave = myQuoteByIndentId.get(load.id);
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
                  {submittingQuote ? "Publishing…" : "Publish Bid Node"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Staff Handshake modal: Roster (driver + vehicle from org) or Ad hoc driver (OTP claim). Triggered from Claimed tab (ASSIGN STAFF & DEPLOY). O(n): drivers/vehicles loaded once per org. */}
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
                        setAggregateDriverPhone("");
                        setSubcontractSupplierId(null);
                        setSubcontractRate("");
                        setSubcontractPickerOpen(false);
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
                        setAggregateDriverPhone("");
                        setSubcontractSupplierId(null);
                        setSubcontractRate("");
                        setSubcontractPickerOpen(false);
                        setHandshakeStep("ad_hoc_vehicle");
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
                                  assignDriverId === d.id &&
                                    styles.assignEntityRowActive,
                                ]}
                                onPress={() => setAssignDriverId(d.id)}
                                activeOpacity={0.85}
                              >
                                <View style={styles.assignEntityIconWrap}>
                                  <FontAwesome
                                    name="user"
                                    size={16}
                                    color={
                                      assignDriverId === d.id
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
                                    {d.phone ? `Phone: ${d.phone}` : "Available"}
                                  </Text>
                                </View>
                                <FontAwesome
                                  name={
                                    assignDriverId === d.id
                                      ? "check-circle"
                                      : "chevron-right"
                                  }
                                  size={15}
                                  color={
                                    assignDriverId === d.id
                                      ? Theme.primary
                                      : Theme.textMuted
                                  }
                                />
                              </TouchableOpacity>
                            ))}
                            {activeDrivers.length === 0 ? (
                              <View style={styles.assignEmptyState}>
                                <Text style={styles.assignEmptyText}>
                                  No asset drivers were found in your organization.
                                  Add a salaried driver to continue with Asset-based
                                  assignment, or use the Aggregate flow from the
                                  previous step.
                                </Text>
                                <TouchableOpacity
                                  style={styles.assignEmptyActionBtn}
                                  onPress={() => {
                                    setLoadAction(null);
                                    setDeployOtpCode(null);
                                    setDeployOtpExpiresAt(null);
                                    setDeployTripIdForOtp(null);
                                    setHandshakeStep("flow_choice");
                                    setTimeout(() => {
                                      router.push(
                                        "/(modals)/add-driver" as import("expo-router").Href,
                                      );
                                    }, RNPlatform.OS === "ios" ? 100 : 0);
                                  }}
                                  activeOpacity={0.9}
                                >
                                  <FontAwesome
                                    name="plus"
                                    size={12}
                                    color={Theme.textOnPrimary}
                                  />
                                  <Text style={styles.assignEmptyActionBtnText}>
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
                                  assignVehicleId === v.id &&
                                    styles.assignEntityRowActive,
                                ]}
                                onPress={() => setAssignVehicleId(v.id)}
                                activeOpacity={0.85}
                              >
                                <View style={styles.assignEntityIconWrap}>
                                  <FontAwesome
                                    name="truck"
                                    size={16}
                                    color={
                                      assignVehicleId === v.id
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
                                          v.body_type ? ` · ${v.body_type}` : ""
                                        }`
                                      : "Fleet vehicle"}
                                  </Text>
                                </View>
                                <FontAwesome
                                  name={
                                    assignVehicleId === v.id
                                      ? "check-circle"
                                      : "chevron-right"
                                  }
                                  size={15}
                                  color={
                                    assignVehicleId === v.id
                                      ? Theme.primary
                                      : Theme.textMuted
                                  }
                                />
                              </TouchableOpacity>
                            ))}
                            {vehicles.length === 0 ? (
                              <View style={styles.assignEmptyState}>
                                <Text style={styles.assignEmptyText}>
                                  No vehicles were found in your fleet. Add an own
                                  vehicle to continue with Asset-based assignment.
                                </Text>
                                <TouchableOpacity
                                  style={styles.assignEmptyActionBtn}
                                  onPress={() => {
                                    setLoadAction(null);
                                    setDeployOtpCode(null);
                                    setDeployOtpExpiresAt(null);
                                    setDeployTripIdForOtp(null);
                                    setHandshakeStep("flow_choice");
                                    setTimeout(() => {
                                      router.push(
                                        "/(modals)/add-vehicle" as import("expo-router").Href,
                                      );
                                    }, RNPlatform.OS === "ios" ? 100 : 0);
                                  }}
                                  activeOpacity={0.9}
                                >
                                  <FontAwesome
                                    name="plus"
                                    size={12}
                                    color={Theme.textOnPrimary}
                                  />
                                  <Text style={styles.assignEmptyActionBtnText}>
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
                        Assign Trip
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.modalHint}>
                      Select a driver and a vehicle from your org to continue.
                    </Text>
                  )}
                </>
              ) : (
                /* Aggregate — same fields as before; UI aligned with TripAssignmentBlock (trip detail). */
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
                    Assign driver and vehicle for OTP (partner and rate optional).
                  </Text>

                  <View style={styles.tripAssignCard}>
                    <View style={styles.tripAssignCardHeader}>
                      <Text style={styles.tripAssignCardHeaderTitle}>
                        Current Node
                      </Text>
                      <View style={[styles.tripAssignSourceBadge, styles.tripAssignBadgeUnassigned]}>
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

                    <View style={styles.tripAssignRow}>
                      <View style={styles.tripAssignRowLeft}>
                        <View
                          style={[
                            styles.tripAssignIcon,
                            aggregateHasDriverPhone
                              ? styles.tripAssignIconDriverActive
                              : styles.tripAssignIconInactive,
                          ]}
                        >
                          <FontAwesome
                            name="user"
                            size={20}
                            color={
                              aggregateHasDriverPhone
                                ? Theme.primary
                                : Theme.textMuted
                            }
                          />
                        </View>
                        <View style={styles.tripAssignRowTextCol}>
                          <Text style={styles.tripAssignRowLabel}>
                            Driver Node
                          </Text>
                          <TextInput
                            style={styles.tripAssignRowInput}
                            placeholder="Phone for OTP (optional)"
                            placeholderTextColor={Theme.textMuted}
                            value={aggregateDriverPhone}
                            onChangeText={setAggregateDriverPhone}
                            keyboardType="phone-pad"
                            autoComplete="tel"
                          />
                          {aggregatePhoneName ? (
                            <Text style={styles.phoneModalFound}>Found: {aggregatePhoneName}</Text>
                          ) : aggregatePhoneNotFound ? (
                            <Text style={styles.phoneModalNotFound}>
                              No driver found for this number
                            </Text>
                          ) : null}
                          {aggregatePhoneName && aggregatePhoneInTrip ? (
                            <Text style={styles.phoneModalInTrip}>Driver is in trip</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    <View style={[styles.tripAssignRow, styles.tripAssignRowLast]}>
                      <View style={styles.tripAssignRowLeft}>
                        <View
                          style={[
                            styles.tripAssignIcon,
                            aggregateHasVehicleText
                              ? styles.tripAssignIconVehicleActive
                              : styles.tripAssignIconInactive,
                          ]}
                        >
                          <FontAwesome
                            name="truck"
                            size={18}
                            color={
                              aggregateHasVehicleText
                                ? Theme.textPrimaryDark
                                : Theme.textMuted
                            }
                          />
                        </View>
                        <View style={styles.tripAssignRowTextCol}>
                          <Text style={styles.tripAssignRowLabel}>
                            Vehicle Registry
                          </Text>
                          <TextInput
                            style={styles.tripAssignRowInput}
                            placeholder="Vehicle registration (optional)"
                            placeholderTextColor={Theme.textMuted}
                            value={assignVehicleRegistration}
                            onChangeText={setAssignVehicleRegistration}
                            editable={true}
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.tripAssignPartnerBlock}>
                      <Text style={styles.tripAssignPartnerHint}>
                        Associated partner (optional). Tag your partner for this
                        trip and enter the rate you will pay.
                      </Text>
                      <TouchableOpacity
                        style={styles.subcontractPickBtn}
                        onPress={() => setSubcontractPickerOpen(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.subcontractPickLabel}>Partner</Text>
                        <Text
                          style={styles.subcontractPickValue}
                          numberOfLines={1}
                        >
                          {subcontractSupplierId
                            ? (suppliers.find(
                                (s) => s.id === subcontractSupplierId,
                              )?.company_name ||
                                suppliers.find(
                                  (s) => s.id === subcontractSupplierId,
                                )?.name ||
                                suppliers.find(
                                  (s) => s.id === subcontractSupplierId,
                                )?.contact_person ||
                                "Selected")
                            : "Select partner"}
                        </Text>
                        <FontAwesome
                          name="chevron-down"
                          size={12}
                          color={Theme.textMuted}
                          style={{ marginLeft: 10 }}
                        />
                      </TouchableOpacity>
                      <View style={styles.assignInputWrap}>
                        <TextInput
                          style={styles.assignVehicleInput}
                          placeholder="Partner rate (₹)"
                          placeholderTextColor={Theme.textMuted}
                          value={subcontractRate}
                          onChangeText={setSubcontractRate}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
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

      {/* Partner picker: own Modal so dimmer fully covers Staff Handshake (avoids z-order / bleed-through). */}
      <Modal
        visible={!!(subcontractPickerOpen && loadAction?.type === "ASSIGN")}
        transparent
        animationType="fade"
        onRequestClose={() => setSubcontractPickerOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.subcontractPickerModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSubcontractPickerOpen(false)}
          />
          <View
            style={[
              styles.subcontractPickerModalBody,
              {
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom + 12,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.subcontractPickerCard}>
              <Text style={styles.subcontractPickerTitle}>Select partner</Text>
              <View style={styles.subcontractPickerToggleRow}>
                <Text style={styles.subcontractPickerToggleLabel}>
                  Show integrated suppliers
                </Text>
                <Switch
                  value={showIntegratedPartners}
                  onValueChange={setShowIntegratedPartners}
                  trackColor={{
                    false: Theme.borderInput,
                    true: Theme.primaryText,
                  }}
                  thumbColor={Theme.screenBackground}
                />
              </View>
              <ScrollView
                style={styles.subcontractPickerScroll}
                contentContainerStyle={styles.subcontractPickerScrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {visiblePartnersForHandshake.length === 0 ? (
                  <Text style={styles.subcontractPickerEmpty}>
                    No partners yet. Add partners first.
                  </Text>
                ) : (
                  visiblePartnersForHandshake.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.subcontractPickerRow,
                        subcontractSupplierId === s.id &&
                          styles.subcontractPickerRowActive,
                      ]}
                      onPress={() => {
                        setSubcontractSupplierId(
                          subcontractSupplierId === s.id ? null : s.id,
                        );
                        setSubcontractPickerOpen(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={styles.subcontractPickerText}
                        numberOfLines={1}
                      >
                        {s.company_name || s.name || s.contact_person || "—"}
                      </Text>
                      {isIntegratedSupplierRow(s) ? (
                        <Text
                          style={styles.subcontractPickerBadge}
                          numberOfLines={1}
                        >
                          INTEGRATED
                        </Text>
                      ) : null}
                      {subcontractSupplierId === s.id ? (
                        <FontAwesome
                          name="check"
                          size={14}
                          color={Theme.darkGreen}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              {subcontractSupplierId ? (
                <TouchableOpacity
                  style={styles.subcontractPickerClearBtn}
                  onPress={() => {
                    setSubcontractSupplierId(null);
                    setSubcontractPickerOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.subcontractPickerClearText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  loadDarkHeaderClaimed: {
    paddingBottom: 2,
  },
  loadFilterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
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
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  loadSearchIcon: { marginRight: 6 },
  loadSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 18,
    fontSize: 11,
    lineHeight: 11,
    color: Theme.textOnDark,
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
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
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
    paddingTop: 16,
  },
  scrollContentClaimed: {
    paddingTop: 12,
  },
  gridList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    alignItems: "flex-start",
  },
  gridCardWrap: {
    width: "33.333%",
    paddingHorizontal: 6,
  },
  loadingWrap: { paddingVertical: 32, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  loadCard: {
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
  loadCardTop: {
    marginBottom: 8,
  },
  loadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  loadTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceGray,
  },
  loadTypePillText: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: Theme.primary,
  },
  loadStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.positive,
  },
  loadStatePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textOnPrimary,
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
    fontSize: 11,
    fontWeight: "800",
    color: TESLA_BLACK,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 15,
    marginBottom: 6,
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 0,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
  },
  loadCardMeta: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  loadCardMetaText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 30,
  },
  reviewBidsBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  deployPendingWrap: {
    paddingHorizontal: 12,
    minHeight: 30,
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
  loadCardRouteGet: {
    fontSize: 11,
    fontWeight: "800",
    color: TESLA_BLACK,
    marginBottom: 8,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 15,
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
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    marginTop: 6,
  },
  loadCardInnerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  loadCardSpecsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  loadCardSpecItem: {
    flex: 1,
    minWidth: 0,
  },
  loadCardSpecLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  loadCardSpecValue: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
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
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  handshakeBtnModal: { backgroundColor: Theme.buttonPrimary },
  sourceOfSupplySectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
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
  assignModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    width: "100%",
    alignSelf: "stretch",
  },
  /** Aggregate deploy — mirrors TripAssignmentBlock card on trip detail */
  tripAssignCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  tripAssignCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
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
    borderBottomColor: Theme.borderLight,
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
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
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
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: "transparent",
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
    paddingHorizontal: 20,
  },
  subcontractPickerCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    maxHeight: 360,
  },
  subcontractPickerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  subcontractPickerToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  subcontractPickerToggleLabel: {
    flex: 1,
    paddingRight: 12,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  subcontractPickerScroll: { maxHeight: 260 },
  subcontractPickerScrollContent: { paddingVertical: 6 },
  subcontractPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
  },
  subcontractPickerClearText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.teslaRed,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  assignVehicleInput: {
    backgroundColor: Theme.surfaceGray,
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
  wizardBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    marginBottom: 14,
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
    marginBottom: 16,
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
});
