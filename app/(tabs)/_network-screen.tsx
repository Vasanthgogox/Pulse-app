/**
 * Network tab — Allies hub (stories, connections, discover) and embedded Load center.
 * Full-width layout; top bar switches Network ↔ Load (no left sidebar on web).
 */
import { HomePageHeader } from "@/components/HomePageHeader";
import { InboundProtocolPanel } from "@/components/InboundProtocolPanel";
import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";

/** Network growth card — darker indigo than `Theme.primary` for kicker + trend pill. */
const NETWORK_GROWTH_PURPLE = "#3730A3";
import { useOptionalBusinessConnectionRequestModal } from "@/contexts/BusinessConnectionRequestModalContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
  ConnectionsView,
  type ConnectedOrg,
  type ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import { DiscoverView } from "@/features/network/components/DiscoverView";
import { NetworkPhoneAndContactsPanel } from "@/features/network/components/NetworkPhoneAndContactsPanel";
import { discoverSearchTermForOrgs } from "@/lib/networkPhoneSearch";
import { MutualConnectionsModal } from "@/features/network/components/MutualConnectionsModal";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import {
  NETWORK_HUB_GRID_ROW_PADDING_H,
  NETWORK_HUB_SPLIT_COLUMN_GAP_PX,
} from "@/features/network/constants/networkHubGrid";
import { NetworkLoadsQuickCards } from "@/features/network/components/NetworkLoadsQuickCards";
import { NetworkProfileModalBody } from "@/features/network/components/NetworkProfileModalBody";
import { NetworkProfileModalChrome } from "@/features/network/components/NetworkProfileGlassShell";
import { getOrgProfileSnapshot } from "@/features/network/services/networkProfileSnapshot.service";
import { LinearGradient } from "expo-linear-gradient";
import { ContentErrorState } from "@/components/ContentErrorState";
import { NetworkTabErrorBoundary } from "@/components/network/NetworkTabErrorBoundary";
import { StoryReel } from "@/features/network/components/StoryReel";
import {
  ENABLE_UNLINKED_COUNTERPARTIES,
  UnlinkedCounterpartiesSection,
} from "@/features/network/components/UnlinkedCounterpartiesSection";
import { isPostVisibleForOrg, type PostRow } from "@/features/network/services/posts.service";
import {
  cancelPendingConnectionRequestByOrgPair,
  type ConnectionRequestRow,
  createConnectionRequest,
  looksLikeConnectionRateLimitError,
} from "@/features/connections/services/connectionRequests.service";
import {
  ConnectionRoleModal,
  type ConnectionInviteRole,
} from "@/features/network/components/ConnectionRoleModal";
import { queryKeys } from "@/lib/queryKeys";
import { useProtocolInvitesWithDriverSent } from "@/lib/hooks/useProtocolInvitesWithDriverSent";
import { useInboundProtocolInviteActions } from "@/lib/hooks/useInboundProtocolInviteActions";
import { getOrCreateNetworkConversation } from "@/features/chat/services/chat.service";
import { ROUTES } from "@/lib/routes";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
  useDriverInvitesSentQuery,
  useInvalidateNetwork,
} from "@/lib/queries/useNetworkQueries";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useNetworkFeedQuery } from "@/lib/queries/usePostsQuery";
import { useRealtimeNetworkInvalidation } from "@/lib/queries/useRealtimeInvalidation";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useRouter } from "expo-router";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  Compass,
  Mail,
  Search,
  User,
  UserPlus,
  Warehouse,
  X,
} from "lucide-react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  type TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

function isStoryPost(p: PostRow): boolean {
  return p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY";
}

function NetworkStoryStrip({
  orgId,
  orgName,
  feedPosts,
  feedLoading,
  onCreatePost,
  headerActions,
  embedded,
}: {
  orgId: string;
  orgName: string;
  feedPosts: PostRow[];
  feedLoading: boolean;
  onCreatePost: () => void;
  headerActions?: React.ReactNode;
  embedded?: boolean;
}) {
  const storyPosts = useMemo(() => feedPosts.filter(isStoryPost), [feedPosts]);
  if (feedLoading && storyPosts.length === 0) {
    return (
      <View style={styles.storyLoading}>
        <LoadingIndicator color={Theme.teslaRed} />
        <Text style={styles.storyLoadingLabel}>Syncing stories…</Text>
      </View>
    );
  }
  return (
    <StoryReel
      posts={storyPosts}
      orgId={orgId}
      orgName={orgName}
      onCreatePost={onCreatePost}
      headerActions={headerActions}
      embedded={embedded}
    />
  );
}

type NetworkProfileNode = {
  id: string;
  name: string;
  type: "CLIENT" | "SUPPLIER" | "DRIVER";
  location: string;
  status: "CONNECTED" | "REQUEST SENT" | "LIVE";
  rating: number | null;
  mutuals: number;
  phone?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  is_integrated?: boolean;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getNetworkNodeLocation(item: ConnectedOrg): string {
  const cityState = [item.city, item.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const direct = item.business_location ?? item.location ?? item.headquarters ?? null;
  return cityState || direct?.trim() || "Not available";
}

function useAnimatedCount(target: number, durationMs = 720): number {
  const [displayValue, setDisplayValue] = useState(target);
  const previousValueRef = React.useRef(target);

  useEffect(() => {
    const startValue = previousValueRef.current;
    const endValue = Number.isFinite(target) ? target : 0;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min((Date.now() - startedAt) / durationMs, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + (endValue - startValue) * easedProgress);
      setDisplayValue(nextValue);

      if (progress >= 1) {
        previousValueRef.current = endValue;
        clearInterval(timer);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [durationMs, target]);

  return displayValue;
}

function NetworkScreenInner() {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const { width } = useWindowDimensions();
  const searchParams = useLocalSearchParams<{ view?: string }>();
  const isWideNetwork = Platform.OS === "web" && width >= 1180;
  const isDesktopMatrix = width >= 1100;
  const isMobileLayout = width < 820;
  /** Org welcome bar — mobile + tablet only; hidden on desktop web. */
  const showHomePageHeader = Platform.OS !== "web" || width < 1180;
  /** Desktop: stories 80% + load marketplace 20% in one row. */
  const showStoryLoadsSplit = Platform.OS === "web" && width >= 1180;
  const isCompactPhone = width < 420;
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const {
    currentOrganization: organization,
    isLoading: orgLoading,
    error: organizationError,
    refreshOrganization,
  } = useOrganization();
  const orgId = organization?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [connSearch, setConnSearch] = useState("");
  const [connFilter, setConnFilter] = useState<ConnectionFilterTab>("ALL");
  const [connSearchOpen, setConnSearchOpen] = useState(false);
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [viewMode, setViewMode] = useState<"dashboard" | "requests">("dashboard");
  const [inviteTab, setInviteTab] = useState<"received" | "sent">("received");
  const [selectedProfileNode, setSelectedProfileNode] = useState<NetworkProfileNode | null>(null);
  const [mutualModalTarget, setMutualModalTarget] = useState<{
    targetOrgId: string;
    targetOrgName: string;
  } | null>(null);
  const [selectedProfileStats, setSelectedProfileStats] = useState<{ totalTrips: number | null }>({
    totalTrips: null,
  });
  const [profileStatsLoading, setProfileStatsLoading] = useState(false);
  const [discoverInviteCount, setDiscoverInviteCount] = useState(0);
  const [discoverInviteLimit, setDiscoverInviteLimit] = useState(5);
  const { t } = useLanguage();
  const discoverOrgSearch = discoverSearchTermForOrgs(discoverSearch);
  const [protocolRoleModalOpen, setProtocolRoleModalOpen] = useState(false);
  const [protocolSending, setProtocolSending] = useState(false);
  const [protocolCancelling, setProtocolCancelling] = useState(false);

  useRealtimeNetworkInvalidation(orgId);
  const queryClient = useQueryClient();
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const driverInvitesSentQ = useDriverInvitesSentQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const feedQ = useNetworkFeedQuery(orgId);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const {
    receivedItems: receivedInviteItems,
    sentItems: sentInviteItems,
    pendingCount,
  } = useProtocolInvitesWithDriverSent(orgId);
  const { inviteActionId, handleInviteAction } =
    useInboundProtocolInviteActions(orgId);
  const businessConnectionModal = useOptionalBusinessConnectionRequestModal();

  const filterTabs = useMemo(
    () => ["ALL", "CLIENT", "SUPPLIER", "DRIVER"] as ConnectionFilterTab[],
    [],
  );

  const clientCount = useMemo(
    () => ((clientsQ.data ?? []) as unknown[]).length,
    [clientsQ.data],
  );
  const supplierCount = useMemo(
    () => ((suppliersQ.data ?? []) as unknown[]).length,
    [suppliersQ.data],
  );
  const driverCount = useMemo(
    () => (driversQ.data ?? []).filter((d) => !d.left_at).length,
    [driversQ.data],
  );
  const totalConnections = useMemo(
    () => clientCount + supplierCount + driverCount,
    [clientCount, supplierCount, driverCount],
  );
  const animatedTotalConnections = useAnimatedCount(totalConnections);
  const animatedClientCount = useAnimatedCount(clientCount);
  const animatedSupplierCount = useAnimatedCount(supplierCount);
  const animatedDriverCount = useAnimatedCount(driverCount);
  const totalConnectionsDisplay = String(animatedTotalConnections).padStart(2, "0");
  const onCreatePost = () => router.push("/(modals)/create-post");
  useEffect(() => {
    if (searchParams.view === "requests") {
      setViewMode("requests");
    }
  }, [searchParams.view]);
  const allowLoadPosts = organization?.capabilities?.canBid ?? true;
  const integratedPartnerOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const client of (clientsQ.data ?? []) as Array<{
      linked_organization_id?: string | null;
      is_integrated?: boolean;
    }>) {
      const linkedOrgId = client.linked_organization_id?.trim();
      const isIntegratedClient = client.is_integrated ?? Boolean(linkedOrgId);
      if (!isIntegratedClient || !linkedOrgId) continue;
      ids.add(linkedOrgId);
    }
    for (const supplier of (suppliersQ.data ?? []) as Array<{
      linked_organization_id?: string | null;
      supplier_type?: string | null;
      is_integrated?: boolean;
    }>) {
      const linkedOrgId = supplier.linked_organization_id?.trim();
      const isIntegratedSupplier =
        supplier.is_integrated ?? (supplier.supplier_type === "integrated" || Boolean(linkedOrgId));
      if (!isIntegratedSupplier || !linkedOrgId) continue;
      ids.add(linkedOrgId);
    }
    return ids;
  }, [clientsQ.data, suppliersQ.data]);
  const feedPosts = useMemo(
    () =>
      (feedQ.data ?? []).filter((post) => {
        if (!isPostVisibleForOrg(post, { allowLoadPosts })) return false;
        if (!orgId) return false;
        const authorOrgId = (post.organization_id ?? "").trim();
        if (!authorOrgId) return false;
        if (authorOrgId === orgId) return true;
        return integratedPartnerOrgIds.has(authorOrgId);
      }),
    [feedQ.data, allowLoadPosts, orgId, integratedPartnerOrgIds],
  );

  const onRefresh = useCallback(async () => {
    if (!orgId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        feedQ.refetch(),
        receivedQ.refetch(),
        sentQ.refetch(),
        driverInvitesSentQ.refetch(),
        clientsQ.refetch(),
        suppliersQ.refetch(),
        driversQ.refetch(),
      ]);
      invalidateNetwork();
    } finally {
      setRefreshing(false);
    }
  }, [
    orgId,
    feedQ,
    receivedQ,
    sentQ,
    driverInvitesSentQ,
    clientsQ,
    suppliersQ,
    driversQ,
    invalidateNetwork,
  ]);

  useEffect(() => {
    let cancelled = false;
    const nodeOrgId = selectedProfileNode?.id ?? null;
    /** Whenever we point the modal at a different org, drop any
     *  in-flight role picker / cancel state so it can't leak across
     *  profiles. */
    setProtocolRoleModalOpen(false);
    setProtocolSending(false);
    setProtocolCancelling(false);
    const isUuid =
      typeof nodeOrgId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nodeOrgId);

    if (!nodeOrgId || !isUuid) {
      setSelectedProfileStats({ totalTrips: null });
      setProfileStatsLoading(false);
      return;
    }

    setProfileStatsLoading(true);
    void (async () => {
      try {
        const [tripsRes, snapshotRes] = await Promise.all([
          supabase()
            .from("trips")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", nodeOrgId),
          orgId
            ? getOrgProfileSnapshot(orgId, nodeOrgId)
            : Promise.resolve({ error: null, snapshot: null }),
        ]);
        if (cancelled) return;
        setSelectedProfileStats({ totalTrips: tripsRes.count ?? 0 });
        const snap = snapshotRes.snapshot;
        if (snap) {
          setSelectedProfileNode((prev) => {
            if (!prev || prev.id !== nodeOrgId) return prev;
            return {
              ...prev,
              name: snap.name?.trim() || prev.name,
              type: snap.type ?? prev.type,
              location:
                snap.location && snap.location !== "Not available"
                  ? snap.location
                  : prev.location && prev.location !== "Not available"
                    ? prev.location
                    : snap.location,
              status: snap.status ?? prev.status,
              rating: snap.rating ?? prev.rating,
              mutuals: snap.mutuals ?? prev.mutuals,
              phone: snap.phone ?? prev.phone,
              avatar_url: snap.avatar_url ?? prev.avatar_url,
              avatar_seed: snap.avatar_seed ?? prev.avatar_seed,
              is_integrated: snap.is_integrated ?? prev.is_integrated,
            };
          });
        }
      } finally {
        if (!cancelled) setProfileStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProfileNode?.id, orgId]);

  const handleOpenProfileFromDiscover = useCallback(
    (org: {
      id: string;
      name: string;
      connection_status?: string | null;
      mutual_count?: number | null;
      mutual_connections_count?: number | null;
      rating_value?: number | null;
      location_value?: string | null;
    }) => {
      const normalized = String(org.connection_status ?? "").toLowerCase();
      const status: NetworkProfileNode["status"] =
        normalized === "approved"
          ? "CONNECTED"
          : normalized === "pending"
            ? "REQUEST SENT"
            : "LIVE";
      setSelectedProfileNode({
        id: org.id,
        name: org.name,
        type: "SUPPLIER",
        location: org.location_value?.trim() || "Not available",
        status,
        rating: org.rating_value ?? null,
        mutuals: org.mutual_count ?? org.mutual_connections_count ?? 0,
      });
    },
    [],
  );

  const handlePressMutuals = useCallback((target: { id: string; name: string }) => {
    setMutualModalTarget({ targetOrgId: target.id, targetOrgName: target.name });
  }, []);

  /** Belt-and-suspenders: ensure we only open a profile for a real
   *  organization UUID. Synthetic placeholder faces from
   *  `MutualAvatarStack` have ids like "<orgId>-mutual-0" — those must
   *  never reach the profile modal, otherwise the snapshot hydrator
   *  bails on the non-UUID id and the modal sticks on "MUTUAL 1 /
   *  NOT AVAILABLE / 0 trips". The avatar stack now blocks taps on
   *  synthetic faces at the source, but we re-check here so any future
   *  caller is also safe. */
  const handleOpenMutualProfile = useCallback(
    (row: Pick<MutualConnectionRow, "id" | "name">) => {
      const looksLikeOrgUuid =
        typeof row.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id);
      if (!looksLikeOrgUuid) {
        if (__DEV__) {
          console.warn(
            "[network] ignored mutual profile open for non-UUID id",
            row.id,
          );
        }
        return;
      }
      handleOpenProfileFromDiscover({
        id: row.id,
        name: row.name,
        connection_status: "approved",
        mutual_count: 0,
        mutual_connections_count: 0,
        rating_value: null,
        location_value: undefined,
      });
    },
    [handleOpenProfileFromDiscover],
  );

  /** Live pending row for the org currently shown in the profile modal.
   *  Must run before any early return so hook order stays stable across
   *  logout/login and requests vs dashboard view. */
  const profileLivePending = useMemo(() => {
    if (!selectedProfileNode) return null;
    const row = (sentQ.data ?? []).find(
      (r) =>
        r.to_organization_id === selectedProfileNode.id &&
        r.status === "pending",
    );
    if (!row) return null;
    const role: ConnectionInviteRole | null = row.request_shipper_client
      ? "client"
      : row.request_carrier_supplier
        ? "supplier"
        : null;
    return { row, role };
  }, [sentQ.data, selectedProfileNode]);

  /** Authoritative status for CTA rendering: starts from the snapshot
   *  status but is overridden whenever `sentQ` shows a live pending row
   *  for this org. */
  const profileEffectiveStatus: NetworkProfileNode["status"] | null =
    selectedProfileNode
      ? selectedProfileNode.status === "CONNECTED"
        ? "CONNECTED"
        : profileLivePending
          ? "REQUEST SENT"
          : selectedProfileNode.status
      : null;

  if (!orgId) {
    if (orgLoading) {
      return <SceneLoadingSplash variant="preparing" />;
    }
    if (organizationError) {
      return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <ContentErrorState
            variant="workspace"
            onRetry={() => void refreshOrganization()}
          />
        </View>
      );
    }
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ContentErrorState
          variant="workspaceMissing"
          onRetry={() => void refreshOrganization()}
          retryLabel="Refresh"
        />
      </View>
    );
  }

  if (viewMode === "requests") {
    return (
      <View style={styles.container}>
        <InboundProtocolPanel
          layout="fullscreen"
          topInset={insets.top}
          bottomInset={layout.scrollBottomPadding()}
          tab={inviteTab}
          onTabChange={setInviteTab}
          onClose={() => setViewMode("dashboard")}
          pendingCount={pendingCount}
          receivedItems={receivedInviteItems}
          sentItems={sentInviteItems}
          busyId={inviteActionId}
          onApprove={(item) => void handleInviteAction(item, "approve")}
          onReject={(item) => void handleInviteAction(item, "reject")}
          onCancel={(item) => void handleInviteAction(item, "cancel")}
          onOpenInviteDetail={(item) =>
            businessConnectionModal?.presentConnectionInvite(item)
          }
          onManageAll={() => setViewMode("dashboard")}
          showFooter={false}
        />
      </View>
    );
  }

  const trendPct = totalConnections > 0 ? Math.round((pendingCount / totalConnections) * 100) : 0;

  const handleOpenProfileFromConnection = (item: ConnectedOrg) => {
    setSelectedProfileNode({
      id: item.linked_organization_id ?? item.id,
      name: item.name,
      type: item.role,
      location: getNetworkNodeLocation(item),
      status: item.is_integrated ? "CONNECTED" : "LIVE",
      rating: item.rating ?? null,
      mutuals: item.mutual_count ?? 0,
      phone: item.phone ?? null,
      avatar_url: item.avatar_url ?? null,
      avatar_seed: item.avatar_seed ?? null,
      is_integrated: item.is_integrated,
    });
  };

  const handleSendProtocolFromProfile = () => {
    if (!selectedProfileNode || !orgId) return;
    if (profileEffectiveStatus === "CONNECTED") {
      Alert.alert(
        "Network protocol",
        "You are already connected with this organization.",
      );
      return;
    }
    if (profileEffectiveStatus === "REQUEST SENT") {
      /* "Request sent" tap is wired to the cancel button now; this
       *  branch is just a safety net if some other call path triggers
       *  the send handler while a request is already pending. */
      return;
    }
    if (selectedProfileNode.type === "DRIVER") {
      Alert.alert(
        "Network protocol",
        "Driver protocol can be sent from driver invite flows.",
      );
      return;
    }
    if (!UUID_REGEX.test(selectedProfileNode.id)) {
      Alert.alert(
        "Network protocol",
        "This profile is not linked to an organization account yet. Use invite flows to connect first.",
      );
      return;
    }

    setProtocolRoleModalOpen(true);
  };

  const handleSendProtocolWithRole = async (mode: ConnectionInviteRole) => {
    if (!selectedProfileNode || !orgId) return;
    setProtocolSending(true);
    const { error, alreadyInvited, requestId } = await createConnectionRequest(
      orgId,
      selectedProfileNode.id,
      {
        requestShipperClient: mode === "client",
        requestCarrierSupplier: mode === "supplier",
      },
    );
    setProtocolSending(false);
    setProtocolRoleModalOpen(false);

    if (error) {
      if (looksLikeConnectionRateLimitError(error.message)) {
        Alert.alert(
          "Daily limit reached",
          "You have reached today's invite limit.",
        );
        return;
      }
      Alert.alert("Could not send protocol", error.message);
      return;
    }

    /* Optimistic local snapshot status + cache write so the CTA flips
     *  to "Request sent · CLIENT/SUPPLIER" immediately, even before the
     *  refetch resolves. */
    setSelectedProfileNode((prev) =>
      prev
        ? {
            ...prev,
            status: "REQUEST SENT",
          }
        : prev,
    );
    if (requestId) {
      const nodeName = selectedProfileNode.name;
      const nodeId = selectedProfileNode.id;
      queryClient.setQueryData<ConnectionRequestRow[]>(
        queryKeys.connectionRequests.sent(orgId),
        (prev = []) => {
          if (prev.some((r) => r.id === requestId)) return prev;
          const optimistic: ConnectionRequestRow = {
            id: requestId,
            from_organization_id: orgId,
            to_organization_id: nodeId,
            request_shipper_client: mode === "client",
            request_carrier_supplier: mode === "supplier",
            status: "pending",
            created_at: new Date().toISOString(),
            responded_at: null,
            responded_by: null,
            from_org_name: "",
            to_org_name: nodeName,
          };
          return [optimistic, ...prev];
        },
      );
    }
    await Promise.all([sentQ.refetch(), receivedQ.refetch()]);
    invalidateNetwork();
    if (alreadyInvited) {
      Alert.alert(
        "Protocol status",
        "A request was already pending for this organization.",
      );
      return;
    }
    Alert.alert(
      "Protocol sent",
      `Request sent to ${selectedProfileNode.name}.`,
    );
  };

  const handleCancelProtocolFromProfile = async () => {
    if (!selectedProfileNode || !orgId) return;
    if (protocolCancelling) return;
    if (!UUID_REGEX.test(selectedProfileNode.id)) return;
    setProtocolCancelling(true);
    const { error } = await cancelPendingConnectionRequestByOrgPair(
      orgId,
      selectedProfileNode.id,
    );
    setProtocolCancelling(false);
    if (error) {
      Alert.alert("Could not cancel request", error.message);
      return;
    }
    /* Clear the pending row from the sent cache immediately so the CTA
     *  flips back to "Send protocol" without waiting on the refetch. */
    const nodeId = selectedProfileNode.id;
    queryClient.setQueryData<ConnectionRequestRow[]>(
      queryKeys.connectionRequests.sent(orgId),
      (prev = []) =>
        prev.filter(
          (r) => !(r.to_organization_id === nodeId && r.status === "pending"),
        ),
    );
    setSelectedProfileNode((prev) =>
      prev ? { ...prev, status: "LIVE" } : prev,
    );
    await sentQ.refetch();
    invalidateNetwork();
  };

  const handleOpenDirectMessage = async () => {
    if (!selectedProfileNode || !orgId) return;
    if (!UUID_REGEX.test(selectedProfileNode.id)) {
      Alert.alert(
        "Direct message",
        "This profile is not linked to an app organization yet, so chat cannot be opened.",
      );
      return;
    }
    const orgName = organization?.name?.trim() || "My Organization";
    try {
      const conversation = await getOrCreateNetworkConversation({
        orgId,
        orgName,
        partnerOrgId: selectedProfileNode.id,
        partnerOrgName: selectedProfileNode.name,
      });
      setSelectedProfileNode(null);
      router.push({
        pathname: ROUTES.CHAT,
        params: {
          tab: "network",
          conversationId: conversation.id,
          openDetail: "1",
          ts: String(Date.now()),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open conversation.";
      Alert.alert("Direct message", message);
    }
  };

  const scrollContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        !showHomePageHeader && { paddingTop: insets.top + 8 },
        { paddingBottom: layout.scrollBottomPadding(32) },
      ]}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      {...tabBarScrollProps}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Theme.teslaRed}
        />
      }
    >
      <>
        <View style={styles.topTicker}>
          <Text style={styles.topTickerText}>
            BUILD YOUR NETWORK BY ADDING CONTACTS AND CONNECTING WITH VERIFIED APP USERS TO GROW YOUR BUSINESS.
          </Text>
        </View>
        <View style={[styles.topCluster, isCompactPhone && styles.topClusterCompact]}>
          <View style={styles.topClusterMain}>
        <View style={styles.commandStatsWrap}>
          <View style={styles.commandMainCard}>
            <View style={styles.commandMainBgOrb} />
                <View style={[styles.commandMainContent, isMobileLayout && styles.commandMainContentCompact]}>
                  <View style={[styles.commandMainHead, isMobileLayout && styles.commandMainHeadMobile]}>
                    <View style={[styles.commandMainKickerRow, isMobileLayout && styles.commandMainKickerRowMobile]}>
                  <Activity size={isMobileLayout ? 12 : 14} color={NETWORK_GROWTH_PURPLE} />
                      <Text style={styles.commandMainKicker} numberOfLines={1}>
                        NETWORK GROWTH
                      </Text>
                </View>
                <View style={styles.commandGrowthPill}>
                  <ArrowUpRight size={isMobileLayout ? 11 : 13} color={NETWORK_GROWTH_PURPLE} />
                  <Text style={styles.commandGrowthText}>+{trendPct || 12}%</Text>
                </View>
              </View>
                  <View style={[styles.commandMainStatsRow, isMobileLayout && styles.commandMainStatsRowCompact]}>
                    <View style={[styles.commandTotalWrap, isMobileLayout && styles.commandTotalWrapCompact]}>
                      <Text style={styles.commandTotalText} numberOfLines={1}>
                        {totalConnectionsDisplay}
                      </Text>
                    </View>
                    <View style={[styles.commandMetricGrid, isMobileLayout && styles.commandMetricGridCompact]}>
                      <View style={[styles.commandMetricCell, isMobileLayout && styles.commandMetricCellCompact]}>
                    <Building2
                      size={isMobileLayout ? 11 : 13}
                      color={Theme.primary}
                      strokeWidth={2}
                    />
                        <Text style={[styles.commandMetricN, isMobileLayout && styles.commandMetricNCompact]}>
                          {String(animatedClientCount).padStart(2, "0")}
                        </Text>
                        <Text style={[styles.commandMetricL, isMobileLayout && styles.commandMetricLCompact]}>
                          CLIENTS
                        </Text>
                  </View>
                      <View style={[styles.commandMetricCell, isMobileLayout && styles.commandMetricCellCompact]}>
                    <Warehouse
                      size={isMobileLayout ? 11 : 13}
                      color={Theme.primary}
                      strokeWidth={2}
                    />
                        <Text style={[styles.commandMetricN, isMobileLayout && styles.commandMetricNCompact]}>
                          {String(animatedSupplierCount).padStart(2, "0")}
                        </Text>
                        <Text style={[styles.commandMetricL, isMobileLayout && styles.commandMetricLCompact]}>
                          SUPPLIERS
                        </Text>
                  </View>
                      <View style={[styles.commandMetricCell, isMobileLayout && styles.commandMetricCellCompact]}>
                    <User
                      size={isMobileLayout ? 11 : 13}
                      color={Theme.primary}
                      strokeWidth={2}
                    />
                        <Text style={[styles.commandMetricN, isMobileLayout && styles.commandMetricNCompact]}>
                          {String(animatedDriverCount).padStart(2, "0")}
                        </Text>
                        <Text style={[styles.commandMetricL, isMobileLayout && styles.commandMetricLCompact]}>
                          FLEET
                        </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
            </View>
            {showStoryLoadsSplit ? (
              <View style={styles.storyLoadsRow}>
                <View style={styles.storyLoadsRowStories}>
                  <NetworkStoryStrip
                    orgId={orgId}
                    orgName={organization?.name ?? ""}
                    feedPosts={feedPosts}
                    feedLoading={feedQ.isLoading}
                    onCreatePost={onCreatePost}
                    embedded
                  />
                </View>
                <View style={styles.storyLoadsRowMarketplace}>
                  <NetworkLoadsQuickCards layout="sidebar" />
                </View>
              </View>
            ) : (
              <NetworkStoryStrip
                orgId={orgId}
                orgName={organization?.name ?? ""}
                feedPosts={feedPosts}
                feedLoading={feedQ.isLoading}
                onCreatePost={onCreatePost}
              />
            )}
              </View>
        </View>
        {!showStoryLoadsSplit ? (
          <NetworkLoadsQuickCards compact={isCompactPhone} />
        ) : null}
        {ENABLE_UNLINKED_COUNTERPARTIES && orgId ? (
          <UnlinkedCounterpartiesSection orgId={orgId} />
        ) : null}
        <View style={[styles.networkMergedRow, !isWideNetwork && styles.networkMergedRowStack]}>
          <View
            style={[
              styles.sectionBlock,
              styles.sectionBlockMerged,
              isWideNetwork && styles.networkMergedPanePrimary,
            ]}
          >
            <View style={[styles.sectionBody, styles.sectionBodyConnections]}>
              <View
                style={[
                  styles.sectionHeadingRowSpread,
                  isMobileLayout && styles.sectionHeadingRowSpreadMobile,
                ]}
              >
                <View
                  style={[
                    styles.sectionHeadingRowCompact,
                    isMobileLayout && styles.sectionHeadingRowCompactMobile,
                  ]}
                >
                  <Activity size={11} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Operations pulse</Text>
                    <Text style={styles.sectionHeading}>Your connections</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.connectionsHeaderControls,
                    isMobileLayout && styles.connectionsHeaderControlsMobile,
                  ]}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.inlineFilterScroll}
                    style={[
                      styles.inlineTabsWrap,
                      styles.inlineTabsWrapHeader,
                      isMobileLayout && styles.inlineTabsWrapHeaderMobile,
                    ]}
                  >
                    {filterTabs.map((t) => {
                      const active = connFilter === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setConnFilter(t)}
                          style={[styles.inlineFilterPill, active && styles.inlineFilterPillOn]}
                        >
                          <Text style={[styles.inlineFilterPillText, active && styles.inlineFilterPillTextOn]}>
                            {t}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View
                    style={[
                      styles.connectionsSearchSlot,
                      isMobileLayout && styles.connectionsSearchSlotMobile,
                      isMobileLayout && connSearchOpen && styles.connectionsSearchSlotMobileOpen,
                    ]}
                  >
                    {connSearchOpen ? (
                      <View
                        style={[
                          styles.inlineSearchBox,
                          isMobileLayout && styles.inlineSearchBoxMobile,
                        ]}
                      >
                        <Search size={13} color={Theme.textSecondary} />
                        <TextInput
                          style={styles.inlineSearchInput}
                          placeholder="Search…"
                          placeholderTextColor={Theme.textSecondary}
                          value={connSearch}
                          onChangeText={setConnSearch}
                          returnKeyType="search"
                          autoFocus
                        />
                        <Pressable
                          onPress={() => {
                            setConnSearch("");
                            setConnSearchOpen(false);
                          }}
                          hitSlop={8}
                        >
                          <Text style={styles.inlineSearchClose}>×</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setConnSearchOpen(true)}
                        style={({ pressed }) => [styles.inlineSearchIconBtn, pressed && { opacity: 0.72 }]}
                        hitSlop={8}
                      >
                        <Search size={13} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
              <ConnectionsView
                orgId={orgId}
                embedded
                hubMode
                hubSearch={connSearch}
                hubFilter={connFilter}
                onOpenProfile={handleOpenProfileFromConnection}
                onPressMutuals={handlePressMutuals}
                onPressMutual={handleOpenMutualProfile}
              />
            </View>
          </View>

          <View
            style={[
              styles.sectionBlock,
              styles.sectionBlockMerged,
              isWideNetwork && styles.networkMergedPaneTertiary,
            ]}
          >
            <View style={[styles.sectionBody, styles.sectionBodyDiscover]}>
              {isMobileLayout && discoverSearchOpen ? (
                <View style={[styles.sectionHeadingRowSpread, styles.discoverHeaderStackMobile]}>
                  <View style={styles.discoverHeaderTitleRowMobile}>
                    <View style={[styles.sectionHeadingRowCompact, styles.discoverHeaderTitleFlexMobile]}>
                      <Compass size={11} color={Theme.textSecondary} strokeWidth={2.2} />
                      <View style={styles.sectionTitleBlock}>
                        <Text style={styles.sectionKicker}>Discover potential allies</Text>
                        <Text style={styles.sectionHeading}>Grow your network</Text>
                      </View>
                    </View>
                    {discoverInviteCount > 0 ? (
                      <View
                        style={[
                          styles.inviteCountPill,
                          discoverInviteCount >= discoverInviteLimit && styles.inviteCountPillOver,
                        ]}
                      >
                        <Text
                          style={[
                            styles.inviteCountPillText,
                            discoverInviteCount >= discoverInviteLimit && styles.inviteCountPillTextOver,
                          ]}
                        >
                          {discoverInviteCount}/{discoverInviteLimit} invites
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.discoverSearchFullRowMobile}>
                    <View style={[styles.discoverSearchInline, styles.discoverSearchInlineDiscoverMobile]}>
                      <Search size={13} color={Theme.textSecondary} />
                      <TextInput
                        style={styles.discoverSearchInput}
                        placeholder={t("networkSearchPlaceholder")}
                        placeholderTextColor={Theme.textSecondary}
                        value={discoverSearch}
                        onChangeText={setDiscoverSearch}
                        returnKeyType="search"
                        autoCapitalize="none"
                        keyboardType="default"
                        autoFocus
                      />
                      <Pressable
                        onPress={() => {
                          setDiscoverSearch("");
                          setDiscoverSearchOpen(false);
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.discoverSearchClose}>×</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.sectionHeadingRowSpread,
                    styles.sectionHeadingRowDiscoverLead,
                    isMobileLayout && styles.sectionHeadingRowSpreadDiscoverMobile,
                  ]}
                >
                  <View
                    style={[
                      styles.sectionHeadingRowCompact,
                      isMobileLayout && styles.sectionHeadingRowCompactDiscoverMobile,
                    ]}
                  >
                    <Compass size={11} color={Theme.textSecondary} strokeWidth={2.2} />
                    <View style={styles.sectionTitleBlock}>
                      <Text style={styles.sectionKicker}>
                        {t("networkDiscoverAlliesKicker")}
                      </Text>
                      <Text style={styles.sectionHeading}>
                        {t("networkDiscoverGrowSlots")}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.discoverHeaderActions,
                      isMobileLayout && styles.discoverHeaderActionsDiscoverMobile,
                      isMobileLayout &&
                        !discoverSearchOpen &&
                        styles.discoverHeaderActionsStackMobile,
                    ]}
                  >
                    {discoverInviteCount > 0 && (
                      <View
                        style={[
                          styles.inviteCountPill,
                          discoverInviteCount >= discoverInviteLimit &&
                            styles.inviteCountPillOver,
                        ]}
                      >
                        <Text
                          style={[
                            styles.inviteCountPillText,
                            discoverInviteCount >= discoverInviteLimit &&
                              styles.inviteCountPillTextOver,
                          ]}
                        >
                          {discoverInviteCount}/{discoverInviteLimit} invites
                        </Text>
                      </View>
                    )}
                    {discoverSearchOpen ? (
                      <View
                        style={[
                          styles.discoverSearchInline,
                          isMobileLayout && styles.discoverSearchInlineDiscoverMobile,
                        ]}
                      >
                        <Search size={13} color={Theme.textSecondary} />
                        <TextInput
                          style={styles.discoverSearchInput}
                          placeholder={t("networkSearchPlaceholder")}
                          placeholderTextColor={Theme.textSecondary}
                          value={discoverSearch}
                          onChangeText={setDiscoverSearch}
                          returnKeyType="search"
                          autoCapitalize="none"
                          autoFocus
                        />
                        <Pressable
                          onPress={() => {
                            setDiscoverSearch("");
                            setDiscoverSearchOpen(false);
                          }}
                          hitSlop={8}
                        >
                          <Text style={styles.discoverSearchClose}>×</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setDiscoverSearchOpen(true)}
                        style={({ pressed }) => [
                          styles.discoverSearchIconBtn,
                          pressed && { opacity: 0.72 },
                        ]}
                        hitSlop={8}
                      >
                        <Search size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
              <NetworkPhoneAndContactsPanel
                orgId={orgId}
                search={discoverSearch}
                connectedOrgIds={integratedPartnerOrgIds}
                inviteDailyCapReached={discoverInviteCount >= discoverInviteLimit}
                onSearchChange={setDiscoverSearch}
                onOpenProfile={handleOpenProfileFromDiscover}
              />
              <DiscoverView
                orgId={orgId}
                embedded
                search={discoverOrgSearch}
                onSearchChange={setDiscoverSearch}
                showSearchChrome={false}
                onOpenProfile={handleOpenProfileFromDiscover}
                onPressMutuals={handlePressMutuals}
                onPressMutual={handleOpenMutualProfile}
                inviteDailyCapReached={discoverInviteCount >= discoverInviteLimit}
                onInviteCountChange={(count, limit) => {
                  setDiscoverInviteCount(count);
                  setDiscoverInviteLimit(limit);
                }}
              />
            </View>
          </View>
        </View>
      </>
    </ScrollView>
  );

  const orgDisplayName = organization?.name?.trim() || "Network";

  return (
    <View style={styles.container}>
      {showHomePageHeader ? (
        <HomePageHeader
          title={orgDisplayName}
          invitationBadgeCount={pendingCount}
          onInvitationsPress={() => setViewMode("requests")}
        />
      ) : null}
      {scrollContent}
      <MutualConnectionsModal
        visible={Boolean(mutualModalTarget)}
        viewerOrgId={orgId}
        targetOrgId={mutualModalTarget?.targetOrgId ?? null}
        targetOrgName={mutualModalTarget?.targetOrgName}
        onClose={() => setMutualModalTarget(null)}
        onOpenProfile={handleOpenMutualProfile}
      />
      {selectedProfileNode ? (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedProfileNode(null)}
      >
        <View
          style={[
            styles.profileModalBackdrop,
            isMobileLayout && styles.profileModalBackdropMobile,
          ]}
        >
          <Pressable style={styles.profileModalBackdropTouch} onPress={() => setSelectedProfileNode(null)} />
            <View style={[styles.profileModalCard, isMobileLayout && styles.profileModalCardMobile]}>
              <NetworkProfileModalChrome>
                <View style={styles.profileModalHead}>
                  <LinearGradient
                    colors={["rgba(15, 23, 42, 0.94)", "rgba(30, 41, 59, 0.9)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0)"]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.55 }}
                    style={styles.profileModalHeadSpecular}
                    pointerEvents="none"
                  />
                  <Text
                    style={[
                      styles.profileModalKicker,
                      FinanceTxnTypography.columnTitle,
                      styles.profileModalKickerOnDark,
                    ]}
                  >
                    Network profile
                  </Text>
                  <Pressable
                    onPress={() => setSelectedProfileNode(null)}
                    style={({ pressed }) => [
                      styles.profileModalClose,
                      pressed && { opacity: 0.72 },
                    ]}
                    hitSlop={8}
                  >
                    <X size={14} color={Theme.textOnPrimary} strokeWidth={2.4} />
                  </Pressable>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.profileModalScroll,
                    isMobileLayout && styles.profileModalScrollMobile,
                    isMobileLayout && {
                      paddingBottom: 16 + insets.bottom,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.profileIdentityCardModal,
                      isMobileLayout && styles.profileIdentityCardModalMobile,
                    ]}
                  >
                    <NetworkProfileModalBody
                      node={selectedProfileNode}
                      isMobile={isMobileLayout}
                      profileStatsLoading={profileStatsLoading}
                      totalTrips={selectedProfileStats.totalTrips ?? 0}
                    />

                  <View style={styles.profileCtaStack}>
                    {profileEffectiveStatus !== "CONNECTED" ? (
                      profileEffectiveStatus === "REQUEST SENT" ? (
                        /* Request already exists for this org. The
                         *  primary CTA flips to a withdraw button so
                         *  the user can recall the invite from the
                         *  same place they sent it; the role pill on
                         *  the left mirrors the discover card so the
                         *  user remembers whether they invited as a
                         *  CLIENT or SUPPLIER. */
                        <View style={styles.profileRequestSentRow}>
                          {profileLivePending?.role ? (
                            <View style={styles.profilePendingRolePill}>
                              <Text
                                style={styles.profilePendingRolePillText}
                                numberOfLines={1}
                              >
                                {profileLivePending.role === "supplier"
                                  ? t("networkDiscoverPendingRoleSupplier")
                                  : t("networkDiscoverPendingRoleClient")}
                              </Text>
                            </View>
                          ) : null}
                          <Pressable
                            style={({ pressed }) => [
                              styles.profileRequestSentBtn,
                              protocolCancelling &&
                                styles.profileRequestSentBtnDisabled,
                              pressed && { opacity: 0.85 },
                            ]}
                            onPress={() =>
                              void handleCancelProtocolFromProfile()
                            }
                            disabled={protocolCancelling}
                            accessibilityRole="button"
                            accessibilityLabel={
                              protocolCancelling
                                ? t("networkDiscoverRequestSent")
                                : `${t("networkDiscoverRequestSent")} — ${t("cancel")}`
                            }
                          >
                            <Check
                              size={12}
                              color={Theme.primary}
                              strokeWidth={2.4}
                            />
                            <Text style={styles.profileRequestSentBtnText}>
                              {protocolCancelling
                                ? `${t("cancel")}…`
                                : `${t("networkDiscoverRequestSent")} · ${t("cancel")}`}
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          style={({ pressed }) => [
                            styles.profilePrimaryBtn,
                            pressed && { opacity: 0.88 },
                          ]}
                          onPress={() => handleSendProtocolFromProfile()}
                          accessibilityRole="button"
                          accessibilityLabel="Send protocol"
                        >
                          <UserPlus size={12} color={Theme.textOnPrimary} />
                          <Text style={styles.profilePrimaryBtnText}>
                            Send protocol
                          </Text>
                        </Pressable>
                      )
                    ) : null}
                    <Pressable
                      style={({ pressed }) => [
                        styles.profileSecondaryBtn,
                        pressed && { opacity: 0.88 },
                      ]}
                      onPress={() => void handleOpenDirectMessage()}
                    >
                      <Mail size={14} color={Theme.textOnPrimary} strokeWidth={2.2} />
                      <Text style={styles.profileSecondaryBtnText}>Direct message</Text>
                    </Pressable>
                  </View>
                </View>
                </ScrollView>
              </NetworkProfileModalChrome>
            </View>
        </View>
      </Modal>
      ) : null}
      {/* Role picker for "Send protocol" — same modal used by Discover so
       *  the entire app shares one invite flow (Add as Client / Supplier
       *  → submit). Rendered outside the profile modal so it can appear
       *  on top of (or alongside) it. */}
      <ConnectionRoleModal
        visible={protocolRoleModalOpen}
        companyName={selectedProfileNode?.name ?? ""}
        submitting={protocolSending}
        onClose={() => {
          if (protocolSending) return;
          setProtocolRoleModalOpen(false);
        }}
        onConfirm={(role) => void handleSendProtocolWithRole(role)}
      />
    </View>
  );
}

export default function NetworkScreen() {
  return (
    <NetworkTabErrorBoundary>
      <NetworkScreenInner />
    </NetworkTabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.networkPageBackground,
    minHeight: 0,
  },
  orgGateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  orgGateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  orgGateMessage: {
    fontSize: 15,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  orgGateBtn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 160,
    alignItems: "center",
  },
  orgGateBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 16,
    fontWeight: "600",
  },
  scroll: { flex: 1, backgroundColor: Theme.networkPageBackground },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 18,
    backgroundColor: Theme.networkPageBackground,
  },
  topTicker: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  topTickerText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.8,
  },
  commandStatsWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
  },
  topCluster: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 14,
    gap: 14,
  },
  topClusterCompact: {
    marginHorizontal: 10,
    gap: 10,
  },
  topClusterMain: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  storyLoadsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    minHeight: 108,
  },
  storyLoadsRowStories: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "80%",
    width: "80%",
    maxWidth: "80%",
    minWidth: 0,
    overflow: "hidden",
  },
  storyLoadsRowMarketplace: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "20%",
    width: "20%",
    maxWidth: "20%",
    minWidth: 0,
    paddingLeft: 16,
    marginLeft: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
    justifyContent: "center",
    alignSelf: "stretch",
    paddingVertical: 8,
    backgroundColor: Theme.screenBackground,
  },
  commandMainCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  commandMainBgOrb: {
    position: "absolute",
    width: 288,
    height: 288,
    borderRadius: 144,
    backgroundColor: "rgba(55, 48, 163, 0.07)",
    right: -96,
    top: -96,
  },
  commandMainContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
  },
  commandMainContentCompact: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  commandMainHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  commandMainHeadMobile: {
    alignItems: "center",
  },
  commandMainKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  commandMainKickerRowMobile: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  commandMainKicker: {
    fontSize: 11,
    fontWeight: "900",
    color: NETWORK_GROWTH_PURPLE,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  commandGrowthPill: {
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(55, 48, 163, 0.28)",
    backgroundColor: "rgba(55, 48, 163, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  commandGrowthText: {
    fontSize: 12,
    fontWeight: "900",
    color: NETWORK_GROWTH_PURPLE,
  },
  commandMainStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  commandMainStatsRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
  },
  commandTotalWrap: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 116,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  commandTotalWrapCompact: {
    minWidth: 104,
    paddingTop: 0,
  },
  commandTotalWrapMobile: {
    alignItems: "flex-start",
  },
  commandTotalText: {
    fontSize: 76,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -1.2,
    lineHeight: 76,
  },
  commandMetricGrid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 0,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "flex-end",
  },
  commandMetricGridCompact: {
    gap: 5,
    justifyContent: "flex-end",
  },
  commandMetricCell: {
    width: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 6,
    paddingVertical: 7,
    alignItems: "center",
    gap: 3,
  },
  commandMetricCellCompact: {
    flex: 1,
    width: undefined,
    minWidth: 0,
    maxWidth: 66,
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 3,
    paddingVertical: 5,
  },
  commandMetricN: {
    fontSize: 17,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  commandMetricNCompact: {
    fontSize: 14,
    lineHeight: 17,
  },
  commandMetricL: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.6,
  },
  commandMetricLCompact: {
    fontSize: 6,
    letterSpacing: 0.4,
  },
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  profileModalBackdropMobile: {
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  profileModalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  profileModalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.networkGlassBorder,
    backgroundColor: "#F4F6FB",
    overflow: "hidden",
    alignSelf: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    ...Platform.select({
      web: {
        boxShadow:
          "0 24px 64px rgba(15, 23, 42, 0.18), 0 0 0 0.5px rgba(255, 255, 255, 0.65) inset",
      },
      default: {},
    }),
  },
  profileModalCardMobile: {
    maxHeight: "94%",
    width: "100%",
    maxWidth: "100%",
    borderRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    alignSelf: "stretch",
  },
  profileModalHead: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.12)",
    overflow: "hidden",
    zIndex: 2,
  },
  profileModalHeadSpecular: {
    ...StyleSheet.absoluteFillObject,
  },
  profileModalKicker: {
    ...FinanceTxnTypography.columnTitle,
    color: Theme.textOnPrimary,
    zIndex: 1,
  },
  profileModalKickerOnDark: {
    color: Theme.textOnPrimary,
  },
  profileModalClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    zIndex: 1,
  },
  profileModalScroll: {
    padding: 10,
    paddingBottom: 14,
    gap: 8,
    alignItems: "stretch",
    flexGrow: 0,
  },
  profileModalScrollMobile: {
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 0,
  },
  profileIdentityCardModalMobile: {
    gap: 8,
  },
  profileIdentityCardModal: {
    gap: 8,
    width: "100%",
  },
  profileOverviewCardModal: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    shadowOpacity: 0.03,
  },
  profileShell: {
    flex: 1,
    backgroundColor: Theme.networkPageBackground,
  },
  profileCover: {
    height: 210,
    backgroundColor: Theme.textPrimaryDark,
    overflow: "hidden",
    justifyContent: "flex-start",
  },
  profileCoverGrain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
    backgroundColor: Theme.primary,
  },
  profileBackBtn: {
    marginTop: 18,
    marginLeft: Layout.screenPaddingHorizontal,
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    backgroundColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  profileBackBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  profileContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: -48,
  },
  profileGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  profileGridStack: {
    flexDirection: "column",
    gap: 12,
  },
  profileLeftCol: {
    width: 320,
    gap: 10,
  },
  profileLeftColStack: {
    width: "100%",
  },
  profileIdentityCard: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  profileIdentityCardModern: {
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 14,
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  profileAvatarLgModern: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  profileAvatarLg: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarLgText: {
    fontSize: 30,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: -0.6,
  },
  profileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    width: "100%",
    paddingHorizontal: 2,
  },
  profileName: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
  },
  profileLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    width: "100%",
    paddingHorizontal: 2,
  },
  profileLocation: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    lineHeight: 12,
  },
  profileInfoTable: {
    width: "100%",
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 0,
  },
  profileInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 5,
  },
  profileInfoLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  profileInfoLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileIconWell: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  profileIconWellRole: {
    backgroundColor: Theme.networkClientTintBg,
  },
  profileIconWellLink: {
    backgroundColor: Theme.networkSupplierTintBg,
  },
  profileIconWellPhone: {
    backgroundColor: Theme.networkMessageTintBg,
  },
  profileIconWellRating: {
    backgroundColor: Theme.networkDriverTintBg,
  },
  profileIconWellTrips: {
    backgroundColor: Theme.networkHubListCardPrimaryTintBg,
  },
  profileIconWellPresence: {
    backgroundColor: Theme.positiveMutedDark,
  },
  profileIconWellMutuals: {
    backgroundColor: Theme.networkGlassSupplyTint,
  },
  profileInfoValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    lineHeight: 14,
    textTransform: "uppercase",
  },
  profileInsightsCard: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  profileInsightsHalf: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  profileInsightHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginBottom: 4,
  },
  profileInsightsDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 10,
  },
  profileInsightsLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textAlign: "center",
  },
  profileInsightsValue: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  profileMetaRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  profileMetaChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  profileMetaChipText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileMetaChipValue: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  profileStatRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  profileStatCell: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingVertical: 8,
  },
  profileStatN: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  profileStatL: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  profileCtaStack: {
    width: "100%",
    gap: 6,
  },
  profilePrimaryBtn: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  profilePrimaryBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.textOnPrimary,
  },
  profileSecondaryBtn: {
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: Theme.textPrimaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      web: {
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.18)",
      },
      default: {},
    }),
  },
  profileSecondaryBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.textOnPrimary,
    zIndex: 1,
  },
  /* "Request sent" CTA row in the profile modal: a CLIENT/SUPPLIER
   *  pill on the left and a tappable "Request sent · Cancel" button
   *  on the right, so the user can withdraw without leaving the
   *  modal. */
  profileRequestSentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  profileRequestSentBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  profileRequestSentBtnDisabled: {
    opacity: 0.6,
  },
  profileRequestSentBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    color: Theme.primary,
  },
  profilePendingRolePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.primary + "1A",
    borderWidth: 1,
    borderColor: Theme.primary + "33",
  },
  profilePendingRolePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  profileOpsCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    padding: 14,
    gap: 10,
  },
  profileOpsKicker: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSection,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  profileOpsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileOpsLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  profileOpsValue: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  profileRightCol: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  profileRightColStack: {
    width: "100%",
    flex: 0,
  },
  profileOverviewCard: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    padding: 20,
    gap: 12,
  },
  profileOverviewCardModern: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    width: "100%",
  },
  profileOverviewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileOverviewTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  profileLivePill: {
    minHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  profileLivePillText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  profileOverviewBody: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  profileMetricGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  profileMetricCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    padding: 12,
    gap: 8,
  },
  profileMetricCardModern: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  profileMetricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  profileMetricHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 2,
  },
  profileMetricHeadText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileLaneLine: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  profileBarsRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  profileBar: {
    flex: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: Theme.primary,
    opacity: 0.36,
  },
  profileRecentCard: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    gap: 10,
  },
  profileRecentKicker: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.onPrimaryMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  profileRecentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileRecentNode: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Theme.driverWhiteMutedStrong,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
  profileRecentNodeText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnPrimary,
  },
  storyLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  storyLoadingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  ribbonOuter: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  ribbonScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingRight: 24,
  },
  ribbonCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
  },
  ribbonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  ribbonChipLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  ribbonChipCount: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    fontStyle: "italic",
  },
  ribbonChipCountMuted: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    maxWidth: 72,
  },
  ribbonBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  ribbonBadgeText: { fontSize: 9, fontWeight: "900", color: Theme.textOnPrimary },
  ribbonChipMuted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 4,
  },
  ribbonMoreText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  missionCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  missionCardHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: Theme.surfaceForm,
  },
  missionCardTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.4,
  },
  sectionBlock: {
    marginTop: 10,
  },
  sectionBlockMerged: {
    marginTop: 0,
  },
  networkMergedRow: {
    marginHorizontal: 0,
    marginTop: 6,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 4,
  },
  networkMergedRowStack: {
    marginHorizontal: 0,
    flexDirection: "column",
    gap: 4,
  },
  networkMergedPanePrimary: {
    marginTop: 0,
  },
  networkMergedPaneSecondary: {
    marginTop: 0,
  },
  networkMergedPaneTertiary: {
    marginTop: 0,
  },
  sectionBody: {
    width: "100%",
    paddingBottom: 8,
  },
  sectionBodyConnections: {
    paddingBottom: 0,
    backgroundColor: Theme.screenBackground,
  },
  sectionBodyDiscover: {
    paddingBottom: 24,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingTop: 16,
    paddingBottom: 6,
  },
  inlineControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  inlineTabsWrap: {
    flex: 1,
    minWidth: 0,
  },
  inlineTabsWrapHeader: {
    flex: 0,
    maxWidth: 340,
  },
  inlineTabsWrapHeaderMobile: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%" as const,
  },
  connectionsHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  connectionsHeaderControlsMobile: {
    width: "100%" as const,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 6,
    minWidth: 0,
  },
  connectionsSearchSlot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
  },
  connectionsSearchSlotMobile: {
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  connectionsSearchSlotMobileOpen: {
    flex: 1,
    minWidth: 0,
    maxWidth: 168,
    justifyContent: "flex-end",
  },
  inlineFilterScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 6,
  },
  inlineFilterPill: {
    minHeight: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    justifyContent: "center",
  },
  inlineFilterPillOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  inlineFilterPillText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: Theme.textSecondary,
  },
  inlineFilterPillTextOn: {
    color: Theme.textOnDark,
  },
  inlineSearchIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  inlineSearchBox: {
    minHeight: 28,
    maxWidth: 210,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 0,
  },
  inlineSearchBoxMobile: {
    flex: 1,
    minWidth: 72,
    maxWidth: 168,
    minHeight: 28,
  },
  inlineSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as unknown as TextStyle,
    }),
  },
  inlineSearchClose: {
    fontSize: 15,
    lineHeight: 16,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  sectionHeadingRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  sectionHeadingRowCompactMobile: {
    width: "100%" as const,
  },
  sectionHeadingRowSpread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingTop: 8,
    paddingBottom: 6,
  },
  sectionHeadingRowDiscoverLead: {
    paddingTop: 4,
    paddingBottom: 10,
  },
  sectionHeadingRowDiscoverSplit: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  discoverSplitHeadRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: NETWORK_HUB_SPLIT_COLUMN_GAP_PX,
    minWidth: 0,
  },
  discoverSplitHeadCell: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  discoverSplitHeadCellRight: {
    alignItems: "flex-start",
  },
  discoverSplitHeadTitle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  sectionHeadingRowSpreadMobile: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 6,
  },
  /** Discover: keep title + search on one row (default SpreadMobile stacks them). */
  sectionHeadingRowSpreadDiscoverMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  discoverHeaderStackMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  discoverHeaderTitleRowMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  discoverHeaderTitleFlexMobile: {
    flex: 1,
    minWidth: 0,
  },
  discoverSearchFullRowMobile: {
    width: "100%",
  },
  sectionHeadingRowCompactDiscoverMobile: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitleBlock: {
    minWidth: 0,
    gap: 2,
  },
  sectionKicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 18,
  },
  expandSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Theme.aggregatePillBg,
  },
  expandSignalText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 1,
  },
  loadsPromoBanner: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 108,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
    shadowColor: Theme.pulseIndigo,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  loadsPromoBannerPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.992 }],
  },
  loadsPromoOrbPrimary: {
    position: "absolute",
    width: 132,
    height: 132,
    borderRadius: 66,
    top: -48,
    right: -28,
    backgroundColor: Theme.pulseIndigo,
    opacity: 0.34,
  },
  loadsPromoOrbSecondary: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    bottom: -36,
    left: -18,
    backgroundColor: "#818cf8",
    opacity: 0.2,
  },
  loadsPromoContent: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  loadsPromoTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  loadsPromoIconRing: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    flexShrink: 0,
  },
  loadsPromoTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 1,
  },
  loadsPromoKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  loadsPromoLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#34d399",
  },
  loadsPromoKicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
  },
  loadsPromoTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  loadsPromoSub: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
    lineHeight: 13,
  },
  loadsPromoGoBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.textOnPrimary,
    flexShrink: 0,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  loadsPromoChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  loadsPromoChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  loadsPromoChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 0.2,
  },
  discoverHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    flexWrap: "wrap",
    maxWidth: "100%" as const,
    gap: 8,
  },
  discoverHeaderActionsSplit: {
    flexShrink: 0,
    alignSelf: "flex-end",
    width: "100%",
  },
  discoverHeaderActionsDiscoverMobile: {
    flexShrink: 0,
    alignSelf: "center",
  },
  /** Invite pill above search so wide counts never overlap the search control on narrow widths. */
  discoverHeaderActionsStackMobile: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
  },
  inviteCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  inviteCountPillOver: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  inviteCountPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  inviteCountPillTextOver: {
    color: "#dc2626",
  },
  discoverSearchIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  discoverSearchInline: {
    minHeight: 36,
    width: 230,
    maxWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  discoverSearchInlineDiscoverMobile: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
  },
  discoverSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as unknown as TextStyle,
    }),
  },
  discoverSearchClose: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  loadCenterReturnBtn: {
    marginLeft: "auto",
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
  },
  loadCenterReturnBtnOn: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceGray,
  },
  loadCenterReturnText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: Theme.textSecondary,
  },
  loadCenterReturnTextOn: {
    color: Theme.textPrimaryDark,
  },
  segmentRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  segmentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  segmentBtnActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceGray,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    color: Theme.textSecondary,
  },
  segmentTextOn: { color: Theme.textPrimaryDark },
  segmentLabelInline: { flexDirection: "row", alignItems: "center", gap: 6 },
  segmentPendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  storyInviteBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  storyInviteBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.1,
  },
  storyTopSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  storyTopSwitchAnimWrap: {
    overflow: "hidden",
  },
  storyTopSwitchBtn: {
    minHeight: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    justifyContent: "center",
    alignItems: "center",
  },
  storyTopSwitchBtnOn: {
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.darkBackground,
  },
  storyTopSwitchText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  storyTopSwitchTextOn: {
    color: Theme.textOnPrimary,
  },
  hubTools: {
    marginTop: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 9,
  },
  hubSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hubSearchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    fontWeight: "700",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as unknown as TextStyle,
    }),
  },
  filterPillScroll: { flexDirection: "row", gap: 8, paddingRight: 8 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  filterPillOn: { backgroundColor: Theme.textPrimaryDark, borderColor: Theme.textPrimaryDark },
  filterPillText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: Theme.textSecondary,
  },
  filterPillTextOn: { color: Theme.textOnDark },
  invSubRow: { flexDirection: "row", gap: 10, marginBottom: 2 },
  invSubRowCompact: { flexDirection: "row", gap: 5, flex: 1, minWidth: 0 },
  invSubRowCompactHeader: {
    flex: 0,
    alignItems: "center",
    flexShrink: 0,
  },
  invitationsMergedHeader: {
    alignItems: "center",
    flexWrap: "nowrap",
    minHeight: 48,
    paddingBottom: 10,
    justifyContent: "space-between",
  },
  invitationsHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    justifyContent: "flex-start",
    marginLeft: 10,
    minWidth: 188,
  },
  invitationsHeaderControlsMobile: {
    marginLeft: 0,
    minWidth: 0,
    width: "100%" as const,
  },
  invHeaderTabPill: {
    minHeight: 28,
    minWidth: 86,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  invHeaderTabText: {
    fontSize: 9,
    letterSpacing: 0.65,
  },
  invHeaderSearchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: "auto",
    flexShrink: 0,
  },
  invHeaderSearchBox: {
    marginLeft: "auto",
    width: 220,
  },
  invHeaderSearchBoxCompact: {
    marginLeft: 0,
    width: "100%" as const,
  },
  invSubBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  invSubBtnOn: { borderBottomColor: Theme.teslaRed },
  invSubText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textSecondary,
  },
  invSubTextOn: { color: Theme.textPrimaryDark },
  onYourLabel: {
    ...Typography.subTabLabel,
    color: Theme.textSection,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 6,
  },
  invitationsCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    paddingBottom: 10,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  headerBadge: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
  },
  headerBadgeText: {
    fontSize: 7,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.6,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    marginTop: 2,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerTitle: {
    ...Typography.networkScreenTitle,
    color: Theme.textPrimaryDark,
  },
  headerSubtitle: {
    ...Typography.headerSubtitle,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  headerCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerCreateBtnText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
});
