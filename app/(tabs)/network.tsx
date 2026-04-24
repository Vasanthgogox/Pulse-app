/**
 * Network tab — Allies Hub
 * 4 tabs: Feed (stories + posts), Connections, Discover, Loads (indents).
 * Inspired by Instagram (stories), LinkedIn (connections), WhatsApp (messaging).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BidSheet } from "@/features/network/components/BidSheet";
import { ConnectionsView } from "@/features/network/components/ConnectionsView";
import { DiscoverView } from "@/features/network/components/DiscoverView";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { PostCard } from "@/features/network/components/PostCard";
import { StoryReel } from "@/features/network/components/StoryReel";
import { type PostRow } from "@/features/network/services/posts.service";
import {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
  useDriverInvitesSentQuery,
  useInvalidateNetwork,
  useNetworkFeedQuery,
  useRealtimeNetworkInvalidation,
} from "@/lib/queries";
import { useRefreshWithFeedback } from "@/lib/useRefreshWithFeedback";
import {
  approveConnectionRequest,
  cancelConnectionRequest,
  rejectConnectionRequest,
} from "@/services/connectionRequestsService";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Bell,
  Check,
  Compass,
  Globe,
  LayoutGrid,
  Plus,
  RefreshCw,
  Rss,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NetworkTab = "feed" | "connections" | "discover" | "loads";

// ─── Invitation badge helpers ─────────────────────────────────────────────────

interface RequestRow {
  id: string;
  from_org_name: string;
  to_org_name: string;
  status: string;
  created_at: string;
  from_organization_id: string;
  to_organization_id: string;
  request_shipper_client: boolean;
  request_carrier_supplier: boolean;
}

function InvitationBanner({
  received,
  sent,
  onDismiss,
  onApprove,
  onReject,
}: {
  received: RequestRow[];
  sent: RequestRow[];
  onDismiss: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const pending = received.filter((r) => r.status === "pending");
  if (pending.length === 0) return null;

  return (
    <View style={styles.invBanner}>
      <View style={styles.invBannerHeader}>
        <View style={styles.invBannerLeft}>
          <Bell size={14} color={Theme.primary} />
          <Text style={styles.invBannerTitle}>
            {pending.length} pending invitation{pending.length > 1 ? "s" : ""}
          </Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <X size={16} color={Theme.textSecondary} />
        </Pressable>
      </View>
      {pending.slice(0, 2).map((req) => (
        <View key={req.id} style={styles.invRow}>
          <View style={styles.invOrgAvatar}>
            <Text style={styles.invOrgAvatarText}>
              {req.from_org_name?.slice(0, 2).toUpperCase() ?? "??"}
            </Text>
          </View>
          <View style={styles.invInfo}>
            <Text style={styles.invOrgName} numberOfLines={1}>{req.from_org_name}</Text>
            <Text style={styles.invKind}>
              {req.request_shipper_client ? "wants to connect as Client" : "wants to connect as Supplier"}
            </Text>
          </View>
          <View style={styles.invActions}>
            <Pressable style={styles.invAccept} onPress={() => onApprove(req.id)} hitSlop={6}>
              <Check size={14} color="#10b981" strokeWidth={3} />
            </Pressable>
            <Pressable style={styles.invReject} onPress={() => onReject(req.id)} hitSlop={6}>
              <X size={14} color="#ef4444" strokeWidth={3} />
            </Pressable>
          </View>
        </View>
      ))}
      {pending.length > 2 && (
        <Text style={styles.invMore}>+{pending.length - 2} more</Text>
      )}
    </View>
  );
}

// ─── Tab bar item ─────────────────────────────────────────────────────────────

function TabItem({
  tab,
  label,
  icon: Icon,
  active,
  badge,
  onPress,
}: {
  tab: NetworkTab;
  label: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={[styles.tabItemInner, active && styles.tabItemActive, { transform: [{ scale }] }]}>
        <Icon
          size={16}
          color={active ? Theme.primary : Theme.textSecondary}
          strokeWidth={active ? 2.5 : 1.8}
        />
        <Text style={[styles.tabItemLabel, active && styles.tabItemLabelActive]}>{label}</Text>
        {badge != null && badge > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Feed tab ─────────────────────────────────────────────────────────────────

function FeedTab({
  orgId,
  orgName,
  onCreatePost,
}: {
  orgId: string;
  orgName: string;
  onCreatePost: () => void;
}) {
  const [bidPost, setBidPost] = useState<PostRow | null>(null);
  const feedQ = useNetworkFeedQuery(orgId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await feedQ.refetch();
    setRefreshing(false);
  };

  const posts = feedQ.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <StoryReel
            posts={posts}
            orgId={orgId}
            orgName={orgName}
            onCreatePost={onCreatePost}
          />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            orgId={orgId}
            onBid={(post) => setBidPost(post)}
          />
        )}
        contentContainerStyle={styles.feedList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Theme.primary}
          />
        }
        ListEmptyComponent={
          feedQ.isLoading ? (
            <ActivityIndicator color={Theme.primary} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.emptyFeed}>
              <Rss size={48} color={Theme.textSecondary} strokeWidth={1} />
              <Text style={styles.emptyFeedTitle}>Your feed is empty</Text>
              <Text style={styles.emptyFeedSubtitle}>
                Connect with partners and post updates or loads to fill your feed.
              </Text>
              <Pressable style={styles.emptyFeedCta} onPress={onCreatePost}>
                <Plus size={14} color="#fff" />
                <Text style={styles.emptyFeedCtaText}>Create First Post</Text>
              </Pressable>
            </View>
          )
        }
      />

      <BidSheet
        visible={bidPost !== null}
        post={bidPost}
        orgId={orgId}
        onClose={() => setBidPost(null)}
        onSuccess={() => feedQ.refetch()}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const [activeTab, setActiveTab] = useState<NetworkTab>(
    tabParam === "load" ? "loads" : "feed",
  );
  const [showInvBanner, setShowInvBanner] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useRealtimeNetworkInvalidation(orgId);

  const invalidateNetwork = useInvalidateNetwork(orgId);
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const driverInvitesQ = useDriverInvitesSentQuery(orgId);

  const pendingCount = useMemo(
    () => (receivedQ.data ?? []).filter((r) => r.status === "pending").length,
    [receivedQ.data],
  );

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    await approveConnectionRequest(requestId);
    invalidateNetwork();
    setActionLoading(null);
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    await rejectConnectionRequest(requestId);
    invalidateNetwork();
    setActionLoading(null);
  };

  if (!orgId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>ALLIES HUB</Text>
          <Text style={styles.headerSubtitle}>{organization?.name}</Text>
        </View>
        <Pressable
          style={styles.headerCreateBtn}
          onPress={() => router.push("/(modals)/create-post")}
        >
          <Plus size={18} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Invitation banner (feed + connections tab only) */}
      {showInvBanner && (activeTab === "feed" || activeTab === "connections") && pendingCount > 0 && (
        <InvitationBanner
          received={(receivedQ.data ?? []) as RequestRow[]}
          sent={(sentQ.data ?? []) as RequestRow[]}
          onDismiss={() => setShowInvBanner(false)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TabItem
          tab="feed"
          label="Feed"
          icon={Rss}
          active={activeTab === "feed"}
          onPress={() => setActiveTab("feed")}
        />
        <TabItem
          tab="connections"
          label="Network"
          icon={Users}
          active={activeTab === "connections"}
          onPress={() => setActiveTab("connections")}
        />
        <TabItem
          tab="discover"
          label="Discover"
          icon={Compass}
          active={activeTab === "discover"}
          onPress={() => setActiveTab("discover")}
        />
        <TabItem
          tab="loads"
          label="Loads"
          icon={Truck}
          active={activeTab === "loads"}
          onPress={() => setActiveTab("loads")}
        />
      </View>

      {/* Content */}
      {activeTab === "feed" && (
        <FeedTab
          orgId={orgId}
          orgName={organization?.name ?? ""}
          onCreatePost={() => router.push("/(modals)/create-post")}
        />
      )}
      {activeTab === "connections" && (
        <ConnectionsView orgId={orgId} />
      )}
      {activeTab === "discover" && (
        <DiscoverView orgId={orgId} />
      )}
      {activeTab === "loads" && (
        <LoadCenterView
          onCreateIndentPress={() => router.push("/create-indent")}
          onIndentPress={() => {}}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.surface,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimary,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  headerCreateBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabItemInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: Theme.primary + "14",
  },
  tabItemLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  tabItemLabelActive: {
    color: Theme.primary,
    fontWeight: "900",
  },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#fff",
  },

  // Invitation banner
  invBanner: {
    backgroundColor: Theme.screenBackground,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.primary + "30",
    shadowColor: Theme.primary,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 10,
  },
  invBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  invBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  invBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  invRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  invOrgAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  invOrgAvatarText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: -0.3,
  },
  invInfo: { flex: 1 },
  invOrgName: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  invKind: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontWeight: "600",
  },
  invActions: { flexDirection: "row", gap: 6 },
  invAccept: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#10b98118",
    alignItems: "center",
    justifyContent: "center",
  },
  invReject: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#ef444418",
    alignItems: "center",
    justifyContent: "center",
  },
  invMore: {
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "700",
    textAlign: "center",
  },

  // Feed
  feedList: {
    paddingTop: 12,
    paddingBottom: 32,
  },
  emptyFeed: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyFeedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  emptyFeedSubtitle: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyFeedCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 4,
  },
  emptyFeedCtaText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
});
