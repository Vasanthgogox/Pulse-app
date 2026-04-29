/**
 * Network tab — Allies hub (stories, connections, discover) and embedded Load center.
 * Full-width layout; top bar switches Network ↔ Load (no left sidebar on web).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
  ConnectionsView,
  type ConnectedOrg,
  type ConnectionFilterTab,
} from "@/features/network/components/ConnectionsView";
import { DiscoverView } from "@/features/network/components/DiscoverView";
import { InvitationsView } from "@/features/network/components/InvitationsView";
import { StoryReel } from "@/features/network/components/StoryReel";
import { isPostVisibleForOrg, type PostRow } from "@/features/network/services/posts.service";
import {
  approveConnectionRequest,
  cancelConnectionRequest,
  rejectConnectionRequest,
  type ConnectionRequestRow,
} from "@/services/connectionRequestsService";
import {
  useClientsQuery,
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
  useDriversQuery,
  useInvalidateNetwork,
  useNetworkFeedQuery,
  useRealtimeNetworkInvalidation,
  useSuppliersQuery,
} from "@/lib/queries";
import { useRouter } from "expo-router";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Compass,
  Cpu,
  Globe,
  Inbox,
  Mail,
  MapPin,
  Search,
  Slash,
  Signal,
  Truck,
  UserPlus,
  UserPlus2,
  Users,
  Verified,
  ShieldCheck,
  X,
} from "lucide-react-native";
import { useOrganization } from "@/contexts/OrganizationContext";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
}: {
  orgId: string;
  orgName: string;
  feedPosts: PostRow[];
  feedLoading: boolean;
  onCreatePost: () => void;
  headerActions?: React.ReactNode;
}) {
  const storyPosts = useMemo(() => feedPosts.filter(isStoryPost), [feedPosts]);
  if (feedLoading && storyPosts.length === 0) {
    return (
      <View style={styles.storyLoading}>
        <ActivityIndicator color={Theme.teslaRed} />
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
};

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const searchParams = useLocalSearchParams<{ view?: string }>();
  const isWideNetwork = Platform.OS === "web" && width >= 1180;
  const isDesktopMatrix = width >= 1100;
  const isMobileLayout = width < 820;
  const isCompactPhone = width < 420;
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [connSearch, setConnSearch] = useState("");
  const [connFilter, setConnFilter] = useState<ConnectionFilterTab>("ALL");
  const [connSearchOpen, setConnSearchOpen] = useState(false);
  const [invSubTab, setInvSubTab] = useState<"received" | "sent">("received");
  const [invSearch, setInvSearch] = useState("");
  const [invSearchOpen, setInvSearchOpen] = useState(false);
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [viewMode, setViewMode] = useState<"dashboard" | "profile" | "requests">("dashboard");
  const [requestTab, setRequestTab] = useState<"received" | "sent" | "cancelled">("received");
  const [selectedProfileNode, setSelectedProfileNode] = useState<NetworkProfileNode | null>(null);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [clockUtc, setClockUtc] = useState<string>(() =>
    new Date().toLocaleTimeString("en-GB", { hour12: false }),
  );
  const [connectionsSnapshot, setConnectionsSnapshot] = useState<ConnectedOrg[]>([]);

  useRealtimeNetworkInvalidation(orgId);
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const feedQ = useNetworkFeedQuery(orgId);
  const invalidateNetwork = useInvalidateNetwork(orgId);

  const filterTabs = useMemo(
    () => ["ALL", "CLIENT", "SUPPLIER", "DRIVER"] as ConnectionFilterTab[],
    [],
  );

  const pendingCount = useMemo(
    () => (receivedQ.data ?? []).filter((r) => r.status === "pending").length,
    [receivedQ.data],
  );
  const receivedRequests = useMemo(
    () => ((receivedQ.data ?? []) as ConnectionRequestRow[]).filter((r) => r.status === "pending"),
    [receivedQ.data],
  );
  const sentRequests = useMemo(
    () => ((sentQ.data ?? []) as ConnectionRequestRow[]).filter((r) => r.status === "pending"),
    [sentQ.data],
  );
  const cancelledRequests = useMemo(() => {
    const fromReceived = ((receivedQ.data ?? []) as ConnectionRequestRow[]).filter(
      (r) => r.status !== "pending" && r.status !== "approved",
    );
    const fromSent = ((sentQ.data ?? []) as ConnectionRequestRow[]).filter(
      (r) => r.status !== "pending" && r.status !== "approved",
    );
    const merged = [...fromReceived, ...fromSent];
    const seen = new Set<string>();
    return merged.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [receivedQ.data, sentQ.data]);
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
  const recentAddedConnections = useMemo((): ConnectedOrg[] => {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    type R = ConnectedOrg & { createdAt: number };
    const acc: R[] = [];

    for (const c of (clientsQ.data ?? []) as Array<{
      id: string;
      name: string;
      phone?: string | null;
      linked_organization_id?: string | null;
      is_integrated?: boolean;
      created_at?: string | null;
      avatar_url?: string | null;
      avatar_seed?: string | null;
      mutual_count?: number | null;
      mutual_connections_count?: number | null;
      rating?: number | null;
      average_rating?: number | null;
    }>) {
      const created = c.created_at ? new Date(c.created_at).getTime() : 0;
      if (created === 0 || now - created > windowMs || !c.name?.trim()) continue;
      acc.push({
        id: c.id,
        name: c.name,
        role: "CLIENT",
        is_integrated: c.is_integrated ?? Boolean(c.linked_organization_id),
        avatar_url: c.avatar_url ?? null,
        avatar_seed: c.avatar_seed ?? null,
        mutual_count: c.mutual_count ?? c.mutual_connections_count ?? null,
        rating: c.rating ?? c.average_rating ?? null,
        phone: c.phone ?? null,
        linked_organization_id: c.linked_organization_id ?? null,
        createdAt: created,
      });
    }

    for (const s of (suppliersQ.data ?? []) as Array<{
      id: string;
      name: string | null;
      phone?: string | null;
      linked_organization_id?: string | null;
      supplier_type?: string | null;
      is_integrated?: boolean;
      created_at?: string | null;
      avatar_url?: string | null;
      avatar_seed?: string | null;
      mutual_count?: number | null;
      mutual_connections_count?: number | null;
      rating?: number | null;
      average_rating?: number | null;
    }>) {
      const created = s.created_at ? new Date(s.created_at).getTime() : 0;
      if (created === 0 || now - created > windowMs) continue;
      const name = s.name?.trim() ? s.name.trim() : "Supplier";
      acc.push({
        id: s.id,
        name,
        role: "SUPPLIER",
        is_integrated: s.is_integrated ?? (s.supplier_type === "integrated" || Boolean(s.linked_organization_id)),
        avatar_url: s.avatar_url ?? null,
        avatar_seed: s.avatar_seed ?? null,
        mutual_count: s.mutual_count ?? s.mutual_connections_count ?? null,
        rating: s.rating ?? s.average_rating ?? null,
        phone: s.phone ?? null,
        linked_organization_id: s.linked_organization_id ?? null,
        createdAt: created,
      });
    }

    for (const d of driversQ.data ?? []) {
      if (d.left_at) continue;
      const dr = d as {
        id: string;
        name: string;
        user_id?: string | null;
        left_at?: string | null;
        created_at?: string | null;
        phone?: string | null;
        avatar_url?: string | null;
        avatar_seed?: string | null;
        mutual_count?: number | null;
        mutual_connections_count?: number | null;
        rating?: number | null;
        average_rating?: number | null;
      };
      const created = dr.created_at ? new Date(dr.created_at).getTime() : 0;
      if (created === 0 || now - created > windowMs || !dr.name?.trim()) continue;
      acc.push({
        id: `driver-${dr.id}`,
        name: dr.name,
        role: "DRIVER",
        is_integrated: Boolean(dr.user_id),
        avatar_url: dr.avatar_url ?? null,
        avatar_seed: dr.avatar_seed ?? null,
        mutual_count: dr.mutual_count ?? dr.mutual_connections_count ?? null,
        rating: dr.rating ?? dr.average_rating ?? null,
        phone: dr.phone ?? null,
        createdAt: created,
      });
    }

    return acc
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 5)
      .map((row) => {
        const { createdAt, ...rest } = row;
        void createdAt;
        return rest;
      });
  }, [clientsQ.data, suppliersQ.data, driversQ.data]);

  const onCreatePost = () => router.push("/(modals)/create-post");
  useEffect(() => {
    const tick = setInterval(() => {
      setClockUtc(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    }, 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (searchParams.view === "requests") {
      setViewMode("requests");
    }
  }, [searchParams.view]);
  const allowLoadPosts = organization?.capabilities?.canBid ?? true;
  const feedPosts = useMemo(
    () => (feedQ.data ?? []).filter((post) => isPostVisibleForOrg(post, { allowLoadPosts })),
    [feedQ.data, allowLoadPosts],
  );

  const onRefresh = useCallback(async () => {
    if (!orgId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        feedQ.refetch(),
        receivedQ.refetch(),
        clientsQ.refetch(),
        suppliersQ.refetch(),
        driversQ.refetch(),
      ]);
      invalidateNetwork();
    } finally {
      setRefreshing(false);
    }
  }, [orgId, feedQ, receivedQ, clientsQ, suppliersQ, driversQ, invalidateNetwork]);

  if (!orgId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Theme.teslaRed} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const openProfileFromRequest = (row: ConnectionRequestRow, mode: "received" | "sent" | "cancelled") => {
    const fromReceived = mode === "received";
    const name = fromReceived ? row.from_org_name : row.to_org_name;
    const normalized = String(row.status ?? "").toLowerCase();
    const status: NetworkProfileNode["status"] =
      normalized === "approved"
        ? "CONNECTED"
        : normalized === "pending"
          ? "REQUEST SENT"
          : "LIVE";
    setSelectedProfileNode({
      id: fromReceived ? row.from_organization_id : row.to_organization_id,
      name: name?.trim() || "Organization",
      type: row.request_shipper_client ? "CLIENT" : "SUPPLIER",
      location: "Not available",
      status,
      rating: null,
      mutuals: 0,
    });
    setViewMode("profile");
  };

  const handleAcceptRequest = async (requestId: string) => {
    setRequestActionId(requestId);
    try {
      const res = await approveConnectionRequest(requestId, orgId);
      if (res.error) return;
      await Promise.all([receivedQ.refetch(), sentQ.refetch(), clientsQ.refetch(), suppliersQ.refetch()]);
      invalidateNetwork();
    } finally {
      setRequestActionId(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    setRequestActionId(requestId);
    try {
      const res = await rejectConnectionRequest(requestId, orgId);
      if (res.error) return;
      await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
      invalidateNetwork();
    } finally {
      setRequestActionId(null);
    }
  };

  const handleRecallRequest = async (requestId: string) => {
    setRequestActionId(requestId);
    try {
      const res = await cancelConnectionRequest(requestId);
      if (res.error) return;
      await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
      invalidateNetwork();
    } finally {
      setRequestActionId(null);
    }
  };

  if (viewMode === "requests") {
    const list =
      requestTab === "received"
        ? receivedRequests
        : requestTab === "sent"
          ? sentRequests
          : cancelledRequests;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.requestsHero}>
          <Pressable
            onPress={() => setViewMode("dashboard")}
            style={({ pressed }) => [styles.requestsBackBtn, pressed && { opacity: 0.8 }]}
          >
            <ArrowLeft size={14} color={Theme.textOnPrimary} />
            <Text style={styles.requestsBackBtnText}>Dashboard</Text>
          </Pressable>
          <Text style={styles.requestsHeroTitle}>Inbound mission protocol</Text>
          <Text style={styles.requestsHeroSub}>Manage network access requests</Text>
          <View style={styles.requestsTabRow}>
            {([
              { key: "received", label: "RECEIVED", count: receivedRequests.length },
              { key: "sent", label: "SENT", count: sentRequests.length },
              { key: "cancelled", label: "CANCELLED", count: cancelledRequests.length },
            ] as const).map((tab) => {
              const on = requestTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setRequestTab(tab.key)}
                  style={[styles.requestsTabBtn, on && styles.requestsTabBtnOn]}
                >
                  <Text style={[styles.requestsTabText, on && styles.requestsTabTextOn]}>{tab.label}</Text>
                  <View style={[styles.requestsTabBadge, on && styles.requestsTabBadgeOn]}>
                    <Text style={[styles.requestsTabBadgeText, on && styles.requestsTabBadgeTextOn]}>
                      {tab.count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.requestsListContent}
          showsVerticalScrollIndicator={false}
        >
          {list.length === 0 ? (
            <View style={styles.requestsEmptyCard}>
              <Slash size={32} color={Theme.textSecondary} />
              <Text style={styles.requestsEmptyTitle}>No {requestTab} protocol</Text>
              <Text style={styles.requestsEmptySub}>Your queue is currently clear.</Text>
            </View>
          ) : (
            list.map((req) => {
              const isBusy = requestActionId === req.id;
              const title = requestTab === "received" ? req.from_org_name : req.to_org_name;
              const roleLabel = req.request_shipper_client ? "CLIENT" : "SUPPLIER";
              return (
                <Pressable
                  key={req.id}
                  onPress={() => openProfileFromRequest(req, requestTab)}
                  style={({ pressed }) => [styles.requestsCard, pressed && { opacity: 0.93 }]}
                >
                  <View style={styles.requestsCardMain}>
                    <View style={styles.requestsCardAvatar}>
                      <Text style={styles.requestsCardAvatarText}>{(title ?? "OR").slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.requestsCardInfo}>
                      <Text style={styles.requestsCardName} numberOfLines={1}>
                        {(title ?? "Organization").toUpperCase()}
                      </Text>
                      <View style={styles.requestsCardMeta}>
                        <Text style={styles.requestsCardRole}>{roleLabel}</Text>
                        <Text style={styles.requestsCardTime}>
                          {new Date(req.created_at).toLocaleDateString("en-GB")}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.requestsActions}>
                    {requestTab === "received" ? (
                      <>
                        <Pressable
                          onPress={() => void handleRejectRequest(req.id)}
                          disabled={isBusy}
                          style={styles.requestsIgnoreBtn}
                        >
                          <X size={12} color={Theme.textSecondary} />
                          <Text style={styles.requestsIgnoreText}>Ignore</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleAcceptRequest(req.id)}
                          disabled={isBusy}
                          style={styles.requestsAcceptBtn}
                        >
                          {isBusy ? (
                            <ActivityIndicator size={12} color={Theme.textOnPrimary} />
                          ) : (
                            <Check size={12} color={Theme.textOnPrimary} />
                          )}
                          <Text style={styles.requestsAcceptText}>Accept</Text>
                        </Pressable>
                      </>
                    ) : requestTab === "sent" ? (
                      <Pressable
                        onPress={() => void handleRecallRequest(req.id)}
                        disabled={isBusy}
                        style={styles.requestsRecallBtn}
                      >
                        {isBusy ? (
                          <ActivityIndicator size={12} color={Theme.textOnPrimary} />
                        ) : (
                          <Clock size={12} color={Theme.textOnPrimary} />
                        )}
                        <Text style={styles.requestsRecallText}>Recall</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.requestsCancelledPill}>
                        <Slash size={12} color={Theme.textSecondary} />
                        <Text style={styles.requestsCancelledText}>
                          {(req.status ?? "cancelled").toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  if (viewMode === "profile" && selectedProfileNode) {
    return (
      <View style={[styles.profileShell, { paddingTop: insets.top }]}>
        <View style={styles.profileCover}>
          <View style={styles.profileCoverGrain} />
          <Pressable
            onPress={() => setViewMode("dashboard")}
            style={({ pressed }) => [styles.profileBackBtn, pressed && { opacity: 0.82 }]}
          >
            <ArrowLeft size={16} color={Theme.textOnPrimary} />
            <Text style={styles.profileBackBtnText}>Back to matrix</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.profileContent,
            {
              paddingBottom:
                24 +
                insets.bottom +
                Layout.demoTabBarScrollBottomInset +
                Layout.tabBarBottomPaddingMin,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileGrid}>
            <View style={styles.profileLeftCol}>
              <View style={styles.profileIdentityCardModern}>
                <View style={styles.profileAvatarLgModern}>
                  <Text style={styles.profileAvatarLgText}>
                    {selectedProfileNode.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileNameRow}>
                  <Text style={styles.profileName}>{selectedProfileNode.name}</Text>
                  <Verified size={18} color={Theme.primary} />
                </View>
                <View style={styles.profileLocationRow}>
                  <MapPin size={13} color={Theme.textSecondary} />
                  <Text style={styles.profileLocation}>{selectedProfileNode.location}</Text>
                </View>

                <View style={styles.profileStatRow}>
                  <View style={styles.profileStatCell}>
                    <Text style={styles.profileStatN}>
                      {selectedProfileNode.rating != null
                        ? selectedProfileNode.rating.toFixed(1)
                        : "N/A"}
                    </Text>
                    <Text style={styles.profileStatL}>Rating</Text>
                  </View>
                  <View style={styles.profileStatCell}>
                    <Text style={styles.profileStatN}>{selectedProfileNode.mutuals}</Text>
                    <Text style={styles.profileStatL}>Mutuals</Text>
                  </View>
                </View>

                <View style={styles.profileCtaStack}>
                  <Pressable style={styles.profilePrimaryBtn}>
                    <UserPlus size={14} color={Theme.textOnPrimary} />
                    <Text style={styles.profilePrimaryBtnText}>Send protocol</Text>
                  </Pressable>
                  <Pressable style={styles.profileSecondaryBtn}>
                    <Mail size={14} color={Theme.textOnPrimary} />
                    <Text style={styles.profileSecondaryBtnText}>Direct message</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.profileOpsCard}>
                <Text style={styles.profileOpsKicker}>Operations status</Text>
                <View style={styles.profileOpsRow}>
                  <Text style={styles.profileOpsLabel}>KYC Verified</Text>
                  <ShieldCheck size={15} color={Theme.primary} />
                </View>
                <View style={styles.profileOpsRow}>
                  <Text style={styles.profileOpsLabel}>Active Fleet</Text>
                  <Text style={styles.profileOpsValue}>
                    {Math.max(1, connectionsSnapshot.length * 2)} Units
                  </Text>
                </View>
                <View style={styles.profileOpsRow}>
                  <Text style={styles.profileOpsLabel}>Response Rate</Text>
                  <Text style={styles.profileOpsValue}>98%</Text>
                </View>
              </View>
            </View>

            <View style={styles.profileRightCol}>
              <View style={styles.profileOverviewCardModern}>
                <Text style={styles.profileOverviewTitle}>Ally dossier</Text>
                <Text style={styles.profileOverviewBody}>
                  Authorized {selectedProfileNode.type.toLowerCase()} partner with
                  verified network performance in {selectedProfileNode.location}.
                  High-reliability execution and synchronized operations on Pulse.
                </Text>
                <View style={styles.profileMetricGrid}>
                  <View style={styles.profileMetricCardModern}>
                    <View style={styles.profileMetricHead}>
                      <ArrowUpRight size={16} color={Theme.primary} />
                      <Text style={styles.profileMetricHeadText}>SLA compliance</Text>
                    </View>
                    <Text style={styles.profileMetricValue}>98.2%</Text>
                  </View>
                  <View style={styles.profileMetricCardModern}>
                    <View style={styles.profileMetricHead}>
                      <Signal size={16} color={Theme.primary} />
                      <Text style={styles.profileMetricHeadText}>Network presence</Text>
                    </View>
                    <Text style={styles.profileMetricValue}>
                      {selectedProfileNode.status === "CONNECTED" ? "LIVE" : selectedProfileNode.status}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const trendPct = totalConnections > 0 ? Math.round((pendingCount / totalConnections) * 100) : 0;

  const handleOpenProfileFromConnection = (item: ConnectedOrg) => {
    setSelectedProfileNode({
      id: item.id,
      name: item.name,
      type: item.role,
      location: "Not available",
      status: item.is_integrated ? "CONNECTED" : "LIVE",
      rating: item.rating ?? null,
      mutuals: item.mutual_count ?? 0,
      phone: item.phone ?? null,
    });
    setViewMode("profile");
  };

  const handleOpenProfileFromDiscover = (
    org: {
      id: string;
      name: string;
      connection_status?: string | null;
      mutual_count?: number | null;
      mutual_connections_count?: number | null;
      rating_value?: number | null;
      location_value?: string | null;
    },
  ) => {
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
    setViewMode("profile");
  };

  const scrollContent = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom:
            24 +
            insets.bottom +
            Layout.demoTabBarScrollBottomInset +
            Layout.tabBarBottomPaddingMin,
        },
      ]}
      showsVerticalScrollIndicator={false}
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
          <View style={styles.topTickerTrack}>
            <Text style={styles.topTickerText}>
              BUILD YOUR NETWORK BY ADDING CONTACTS AND CONNECTING WITH VERIFIED APP USERS TO GROW YOUR BUSINESS.
            </Text>
          </View>
          <View style={styles.topTickerClock}>
            <Clock size={10} color={Theme.textOnPrimary} />
            <Text style={styles.topTickerClockText}>{clockUtc} UTC</Text>
          </View>
        </View>
        <View style={[styles.topCluster, isDesktopMatrix && styles.topClusterDesktop]}>
          <View style={[styles.topClusterMain, isDesktopMatrix && styles.topClusterMainDesktop]}>
            <View style={styles.commandStatsWrap}>
              <View style={styles.commandMainCard}>
                <View style={styles.commandMainBgOrb} />
                <View style={styles.commandMainContent}>
                  <View style={styles.commandMainHead}>
                    <View style={styles.commandMainKickerRow}>
                      <Cpu size={12} color={Theme.primary} />
                      <Text style={styles.commandMainKicker}>CORE NODE INTEL</Text>
                    </View>
                    <View style={styles.commandGrowthPill}>
                      <ArrowUpRight size={11} color={Theme.primary} />
                      <Text style={styles.commandGrowthText}>+{trendPct || 12}%</Text>
                    </View>
                  </View>
                  <View style={styles.commandMainStatsRow}>
                    <View style={styles.commandTotalWrap}>
                      <Text style={styles.commandTotalText}>
                        {String(totalConnections).padStart(2, "0")}
                      </Text>
                      <Text style={styles.commandTotalSub}>Network Growth</Text>
                    </View>
                    <View style={styles.commandMetricGrid}>
                      <View style={styles.commandMetricCell}>
                        <Users size={13} color={Theme.primary} />
                        <Text style={styles.commandMetricN}>{String(clientCount).padStart(2, "0")}</Text>
                        <Text style={styles.commandMetricL}>CLIENTS</Text>
                      </View>
                      <View style={styles.commandMetricCell}>
                        <Globe size={13} color={Theme.primary} />
                        <Text style={styles.commandMetricN}>{String(supplierCount).padStart(2, "0")}</Text>
                        <Text style={styles.commandMetricL}>SUPPLIERS</Text>
                      </View>
                      <View style={styles.commandMetricCell}>
                        <Truck size={13} color={Theme.primary} />
                        <Text style={styles.commandMetricN}>{String(driverCount).padStart(2, "0")}</Text>
                        <Text style={styles.commandMetricL}>FLEET</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.storyRowShell}>
              <NetworkStoryStrip
                orgId={orgId}
                orgName={organization?.name ?? ""}
                feedPosts={feedPosts}
                feedLoading={feedQ.isLoading}
                onCreatePost={onCreatePost}
              />
            </View>
          </View>

          <View style={[styles.topClusterLogCol, isDesktopMatrix && styles.topClusterLogColDesktop]}>
            <View style={[styles.commandSideCard, isDesktopMatrix && styles.commandSideCardDesktop]}>
              <View style={styles.commandSideHead}>
                <Text style={styles.commandSideKicker}>Activity log</Text>
                <Signal size={14} color={Theme.primary} />
              </View>
              <ScrollView
                style={styles.commandLogScroll}
                contentContainerStyle={styles.commandLogScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {recentAddedConnections.length === 0 ? (
                  <View style={styles.commandLogEmpty}>
                    <Text style={styles.commandLogEmptyText}>No recent additions yet</Text>
                  </View>
                ) : (
                  recentAddedConnections.map((item) => (
                    <View key={`recent-log-${item.id}`} style={styles.commandLogRow}>
                      <View style={styles.commandLogLine} />
                      <View style={styles.commandLogTextWrap}>
                        <Text style={styles.commandLogTitle} numberOfLines={1}>
                          {`${item.name.toUpperCase()} added as ${item.role}`}
                        </Text>
                        <Text style={styles.commandLogMeta}>
                          {item.is_integrated ? "Operational access live" : "Pending app join"}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
        <View style={styles.registryHead}>
          <View style={styles.registryHeadLeft}>
            <View style={styles.registryLine} />
            <Text style={styles.registryKicker}>Registry core</Text>
          </View>
          <Text style={styles.registryHeading}>Grow network</Text>
        </View>
        <View style={[styles.networkMergedRow, !isWideNetwork && styles.networkMergedRowStack]}>
          <View style={[styles.sectionBlock, isWideNetwork && styles.networkMergedPanePrimary]}>
            <View style={[styles.connectionsCard, isWideNetwork && styles.networkMergedCard]}>
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
                  <Activity size={14} color={Theme.textPrimaryDark} />
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
                  {connSearchOpen ? (
                    <View style={styles.inlineSearchBox}>
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
              <ConnectionsView
                orgId={orgId}
                embedded
                hubMode
                hubSearch={connSearch}
                hubFilter={connFilter}
                onOpenProfile={handleOpenProfileFromConnection}
                onConnectionsComputed={setConnectionsSnapshot}
              />
            </View>
          </View>

          <View style={[styles.sectionBlock, isWideNetwork && styles.networkMergedPaneTertiary]}>
            <View style={[styles.discoverCard, isWideNetwork && styles.networkMergedCard]}>
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
                  <Compass size={14} color={Theme.textSecondary} />
                  <View style={styles.sectionTitleBlock}>
                    <Text style={styles.sectionKicker}>Discover potential allies</Text>
                    <Text style={styles.sectionHeading}>Grow your network</Text>
                  </View>
                </View>
                <View style={styles.discoverHeaderActions}>
                  {discoverSearchOpen ? (
                    <View style={styles.discoverSearchInline}>
                      <Search size={13} color={Theme.textSecondary} />
                      <TextInput
                        style={styles.discoverSearchInput}
                        placeholder="Search network..."
                        placeholderTextColor={Theme.textSecondary}
                        value={discoverSearch}
                        onChangeText={setDiscoverSearch}
                        returnKeyType="search"
                        autoCapitalize="words"
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
                      style={({ pressed }) => [styles.discoverSearchIconBtn, pressed && { opacity: 0.72 }]}
                      hitSlop={8}
                    >
                      <Search size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                    </Pressable>
                  )}
                </View>
              </View>
              <DiscoverView
                orgId={orgId}
                embedded
                search={discoverSearch}
                onSearchChange={setDiscoverSearch}
                showSearchChrome={false}
                onOpenProfile={handleOpenProfileFromDiscover}
              />
            </View>
          </View>
        </View>
      </>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {scrollContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    minHeight: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 18,
    backgroundColor: Theme.screenBackground,
  },
  topTicker: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  topTickerTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    flex: 1,
    minWidth: 0,
  },
  topTickerText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.8,
  },
  topTickerClock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topTickerClockText: {
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
    marginTop: 10,
    gap: 12,
  },
  topClusterDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
  },
  topClusterMain: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  topClusterMainDesktop: {
    flex: 8,
    flexBasis: 0,
  },
  storyRowShell: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  topClusterLogCol: {
    width: "100%",
  },
  topClusterLogColDesktop: {
    width: 0,
    minWidth: 220,
    flex: 2,
    flexBasis: 0,
    alignSelf: "stretch",
  },
  commandMainCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  commandMainBgOrb: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(26,35,126,0.05)",
    right: -80,
    top: -80,
  },
  commandMainContent: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 14,
  },
  commandMainHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  commandMainKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commandMainKicker: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 2.8,
    textTransform: "uppercase",
  },
  commandGrowthPill: {
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
  },
  commandGrowthText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.primary,
  },
  commandMainStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  commandTotalWrap: {
    flex: 1,
    minWidth: 0,
  },
  commandTotalText: {
    fontSize: 72,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -1,
    lineHeight: 72,
  },
  commandTotalSub: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  commandMetricGrid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 0,
  },
  commandMetricCell: {
    width: 84,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 9,
    paddingVertical: 10,
    alignItems: "center",
    gap: 5,
  },
  commandMetricN: {
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
  },
  commandMetricL: {
    fontSize: 7,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: 0.85,
  },
  commandSideCard: {
    width: "100%",
    minWidth: 0,
    minHeight: 196,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
  },
  commandSideCardDesktop: {
    flex: 1,
    minHeight: 0,
  },
  commandSideHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commandSideKicker: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.onPrimaryMuted,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  commandLogScroll: {
    maxHeight: 200,
  },
  commandLogScrollContent: {
    gap: 8,
    paddingBottom: 2,
  },
  commandLogRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  commandLogLine: {
    width: 2,
    height: 18,
    borderRadius: 2,
    backgroundColor: Theme.primary,
    marginTop: 2,
  },
  commandLogTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  commandLogTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  commandLogMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.onPrimaryMuted,
    textTransform: "uppercase",
  },
  commandLogEmpty: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  commandLogEmptyText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.onPrimaryMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  profileLeftCol: {
    width: 320,
    gap: 10,
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
    borderRadius: 44,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    padding: 22,
    alignItems: "center",
    gap: 12,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  profileAvatarLgModern: {
    width: 108,
    height: 108,
    borderRadius: 30,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
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
    gap: 6,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
  },
  profileLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  profileLocation: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  profileStatRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  profileStatCell: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  profileStatN: {
    fontSize: 20,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  profileStatL: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  profileCtaStack: {
    width: "100%",
    gap: 8,
  },
  profilePrimaryBtn: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  profilePrimaryBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  profileSecondaryBtn: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  profileSecondaryBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
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
  profileOverviewCard: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    padding: 20,
    gap: 12,
  },
  profileOverviewCardModern: {
    borderRadius: 44,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 14,
  },
  profileOverviewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileOverviewTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
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
    fontSize: 13,
    lineHeight: 20,
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
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  profileMetricValue: {
    fontSize: 28,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    letterSpacing: -0.4,
  },
  profileMetricHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  profileMetricHeadText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 0.7,
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
    paddingVertical: 16,
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
  networkMergedRow: {
    marginHorizontal: 0,
    marginTop: 12,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 18,
  },
  networkMergedRowStack: {
    marginHorizontal: 0,
    flexDirection: "column",
    gap: 18,
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
  networkMergedCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 0,
    marginBottom: 0,
  },
  connectionsCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  discoverCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 14,
    backgroundColor: Theme.screenBackground,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
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
    justifyContent: "space-between",
    gap: 10,
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
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  inlineSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
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
    gap: 12,
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
    gap: 12,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 10,
  },
  sectionHeadingRowSpreadMobile: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 10,
  },
  sectionTitleBlock: {
    minWidth: 0,
    gap: 4,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.6,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  sectionHeading: {
    ...Typography.subTabLabel,
    fontSize: 20,
    color: Theme.textPrimaryDark,
    letterSpacing: 0.8,
  },
  registryHead: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 18,
    marginBottom: 6,
    gap: 8,
  },
  registryHeadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  registryLine: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.primary,
  },
  registryKicker: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 2.8,
    textTransform: "uppercase",
  },
  registryHeading: {
    fontSize: 38,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    textTransform: "uppercase",
    fontStyle: "italic",
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
  discoverHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    minWidth: 44,
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
    minHeight: 34,
    width: 230,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  discoverSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
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
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hubSearchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    fontWeight: "700",
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
  requestsHero: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: Theme.textPrimaryDark,
  },
  requestsBackBtn: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.driverWhiteMutedStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  requestsBackBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  requestsHeroTitle: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    fontStyle: "italic",
  },
  requestsHeroSub: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.onPrimaryMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  requestsTabRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  requestsTabBtn: {
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    backgroundColor: Theme.driverWhiteMutedStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  requestsTabBtnOn: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.screenBackground,
  },
  requestsTabText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.onPrimaryMuted,
    letterSpacing: 0.6,
  },
  requestsTabTextOn: {
    color: Theme.textPrimaryDark,
  },
  requestsTabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    backgroundColor: Theme.textPrimaryDark,
  },
  requestsTabBadgeOn: {
    backgroundColor: Theme.surfaceGray,
  },
  requestsTabBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textOnPrimary,
  },
  requestsTabBadgeTextOn: {
    color: Theme.textPrimaryDark,
  },
  requestsListContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    gap: 10,
    paddingBottom:
      24 + Layout.demoTabBarScrollBottomInset + Layout.tabBarBottomPaddingMin,
  },
  requestsEmptyCard: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    minHeight: 190,
    gap: 8,
  },
  requestsEmptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  requestsEmptySub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  requestsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  requestsCardMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requestsCardAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  requestsCardAvatarText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  requestsCardInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  requestsCardName: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  requestsCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requestsCardRole: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  requestsCardTime: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  requestsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  requestsIgnoreBtn: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
  },
  requestsIgnoreText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  requestsAcceptBtn: {
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
  },
  requestsAcceptText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  requestsRecallBtn: {
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
  },
  requestsRecallText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  requestsCancelledPill: {
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
  },
  requestsCancelledText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
});
