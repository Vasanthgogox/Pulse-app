/**
 * Unified shell footer + bottom nav (Q-unified-base aligned).
 */
import { AnimatedChatTabIcon } from "@/components/AnimatedChatTabIcon";
import { AlertRegistryPanel } from "@/components/AlertRegistryPanel";
import { InboundProtocolPanel } from "@/components/InboundProtocolPanel";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
    DEFAULT_USER_2D_AVATAR_SEED,
    getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import {
    useDemoTabBarScrollHideVersion,
    useDemoTabBarVisibilityProgressOptional,
} from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { preloadFinanceWarmup } from "@/lib/preloadFinanceWarmup";
import { preloadTabScreen } from "@/lib/preloadRoutes";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useIntegratedChat } from "@/features/chat/contexts/IntegratedChatContext";
import { useTripChat } from "@/features/chat/contexts/TripChatContext";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { useAlertRegistryNotifications } from "@/lib/globalSync/useAlertRegistryNotifications";
import { useOperationsShelfItems } from "@/lib/globalSync/useOperationsDerived";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useProtocolInvitesWithDriverSent } from "@/lib/hooks/useProtocolInvitesWithDriverSent";
import { setMobileNetworkDockExpanded } from "@/lib/mobileDockState";
import { ROUTES } from "@/lib/routes";
import {
    useIndentsQuery,
    useMarketIndentsQuery,
    useMyDirectQuotesQuery,
} from "@/lib/queries/useIndentsQuery";
import {
    useConnectionRequestsReceivedQuery,
    useConnectionRequestsSentQuery,
} from "@/lib/queries/useNetworkQueries";
import { resolveSharedActionKind } from "@/lib/sharedLedger/registryLabels";
import {
    approveConnectionRequest,
    cancelConnectionRequest,
    cancelPendingConnectionRequestsForPartnerOwner,
    rejectConnectionRequest,
} from "@/services/connectionRequestsService";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type { SharedLedgerNotificationRow } from "@/features/finance/services/sharedLedgerNotifications.service";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { LinearGradient } from "expo-linear-gradient";
import { Home, Package, Route, Wallet } from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Image,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import {
  tabBarFooterPadding,
  resolveTabBarLayoutPlatform,
} from "@/lib/layoutInsets";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";

function AnimatedPress({
  children,
  style,
  onPress,
  activeOpacity = 0.9,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  activeOpacity?: number;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={style}
        onPress={onPress}
        activeOpacity={activeOpacity}
        onPressIn={() => {
          scale.value = withTiming(0.96, {
            duration: 120,
            easing: Easing.out(Easing.quad),
          });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, {
            duration: 140,
            easing: Easing.out(Easing.quad),
          });
        }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Edge tabs (home / chat). */
const MOBILE_EDGE_ICON_SIZE = 22;
const MOBILE_EDGE_ICON_SIZE_COMPACT = 19;
/** Clustered ops tabs — light stroke, Slack thumb. */
const MOBILE_CLUSTER_ICON_SIZE = 19;
const MOBILE_CLUSTER_ICON_SIZE_COMPACT = 17;
const CLUSTER_STROKE = 1.75;

type LucideClusterIcon = typeof Wallet;

function MobileFooterTab({
  label,
  active,
  onPress,
  badgeCount,
  compact,
  icon,
  customIcon,
  avatarUri,
  avatarInitials,
  edge,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badgeCount?: number;
  compact?: boolean;
  icon?: React.ComponentProps<typeof FontAwesome5>["name"];
  customIcon?: React.ReactNode;
  avatarUri?: string | null;
  avatarInitials?: string;
  /** Home / chat wings — fixed width, no stretch. */
  edge?: boolean;
}) {
  const showBadge = (badgeCount ?? 0) > 0;
  const iconSize = compact ? MOBILE_EDGE_ICON_SIZE_COMPACT : MOBILE_EDGE_ICON_SIZE;
  const iconColor = active ? Theme.pulseIndigo : Theme.textMutedDemo;
  const isProfile = avatarInitials != null;
  return (
    <TouchableOpacity
      style={[styles.mobileFooterTab, edge && styles.mobileFooterTabEdge]}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.mobileFooterIconSlot,
          edge && styles.mobileFooterIconSlotEdge,
          active && (edge ? styles.mobileFooterIconSlotEdgeActive : styles.mobileFooterIconSlotActive),
        ]}
      >
        {active && !edge ? <View style={styles.mobileFooterActiveBar} /> : null}
        {isProfile ? (
          avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={[
                styles.mobileFooterAvatar,
                edge && styles.mobileFooterAvatarEdge,
                active && styles.mobileFooterAvatarActive,
              ]}
            />
          ) : (
            <View
              style={[
                styles.mobileFooterAvatar,
                styles.mobileFooterAvatarFallback,
                edge && styles.mobileFooterAvatarEdge,
                active && styles.mobileFooterAvatarActive,
              ]}
            >
              <Text style={styles.mobileFooterAvatarInitials}>
                {avatarInitials}
              </Text>
            </View>
          )
        ) : customIcon ? (
          customIcon
        ) : icon ? (
          <FontAwesome5
            name={icon}
            size={iconSize}
            color={iconColor}
            solid={false}
          />
        ) : null}
        {showBadge ? (
          <View style={styles.mobileFooterBadge}>
            <Text style={styles.mobileFooterBadgeText}>
              {(badgeCount ?? 0) > 9 ? "9+" : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.mobileFooterLabel,
          compact && styles.mobileFooterLabelCompact,
          active && styles.mobileFooterLabelActive,
          active && edge && styles.mobileFooterEdgeLabelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const CLUSTER_PILL_INSET = 5;
/** Horizontal float inset so the glass thumb sits inside each segment. */
const CLUSTER_THUMB_FLOAT = 3;
const CLUSTER_SPRING = { damping: 30, stiffness: 340, mass: 0.72 };

const CLUSTER_THUMB_GLASS_WEB: ViewStyle =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      } as ViewStyle)
    : {};

const CLUSTER_TRACK_GLASS_WEB: ViewStyle =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
      } as ViewStyle)
    : {};

type SlackClusterTab = {
  id: string;
  label: string;
  LucideIcon: LucideClusterIcon;
  active: boolean;
  onPress: () => void;
  badgeCount?: number;
};

/** Slack-style sliding thumb across ops tabs (cash / trips / loads). */
function MobileFooterSlackCluster({
  tabs,
  activeIndex,
  compact,
}: {
  tabs: SlackClusterTab[];
  activeIndex: number;
  compact?: boolean;
}) {
  const [pillWidth, setPillWidth] = useState(0);
  const pillMountedRef = useRef(false);
  const slideIndex = useSharedValue(activeIndex);
  const iconSize = compact
    ? MOBILE_CLUSTER_ICON_SIZE_COMPACT
    : MOBILE_CLUSTER_ICON_SIZE;

  useEffect(() => {
    pillMountedRef.current = true;
    return () => {
      pillMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    slideIndex.value = withSpring(Math.max(0, activeIndex), CLUSTER_SPRING);
  }, [activeIndex, slideIndex]);

  const handlePillLayout = useCallback((width: number) => {
    if (!pillMountedRef.current || width <= 0) return;
    setPillWidth((prev) => (prev === width ? prev : width));
  }, []);

  const segmentWidth =
    pillWidth > 0
      ? (pillWidth - CLUSTER_PILL_INSET * 2) / tabs.length
      : 0;

  const thumbWidth =
    segmentWidth > 0 ? Math.max(0, segmentWidth - CLUSTER_THUMB_FLOAT * 2) : 0;

  const thumbStyle = useAnimatedStyle(() => {
    if (thumbWidth <= 0 || activeIndex < 0) return { opacity: 0 };
    return {
      width: thumbWidth,
      opacity: 1,
      transform: [
        {
          translateX:
            CLUSTER_PILL_INSET +
            CLUSTER_THUMB_FLOAT +
            slideIndex.value * segmentWidth,
        },
      ],
    };
  }, [thumbWidth, segmentWidth, activeIndex]);

  return (
    <View
      style={[
        styles.mobileFooterSlackPill,
        compact && styles.mobileFooterSlackPillCompact,
        CLUSTER_TRACK_GLASS_WEB,
      ]}
      onLayout={(e) => handlePillLayout(e.nativeEvent.layout.width)}
    >
      <LinearGradient
        colors={[Theme.pulseTabClusterTrackTop, Theme.pulseTabClusterTrackBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[Theme.pulseTabClusterTrackInnerGlow, "rgba(255,255,255,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.35 }}
        style={styles.mobileFooterSlackTrackSheen}
        pointerEvents="none"
      />
      {thumbWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.mobileFooterSlackThumb,
            compact && styles.mobileFooterSlackThumbCompact,
            thumbStyle,
            CLUSTER_THUMB_GLASS_WEB,
          ]}
        >
          <LinearGradient
            colors={[
              Theme.pulseTabClusterThumbTop,
              Theme.pulseTabClusterThumbMid,
              Theme.pulseTabClusterThumbBottom,
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[Theme.pulseTabClusterThumbAccent, "rgba(99,102,241,0)"]}
            start={{ x: 0.5, y: 1 }}
            end={{ x: 0.5, y: 0.35 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[Theme.pulseTabClusterThumbSpecular, "rgba(255,255,255,0)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.5 }}
            style={styles.mobileFooterSlackThumbSpecular}
            pointerEvents="none"
          />
          <View style={styles.mobileFooterSlackThumbEdge} pointerEvents="none" />
        </Animated.View>
      ) : null}
      {tabs.map((tab) => {
        const showBadge = (tab.badgeCount ?? 0) > 0;
        const iconColor = tab.active
          ? Theme.pulseTabClusterIconActive
          : Theme.pulseTabClusterIconInactive;
        const Icon = tab.LucideIcon;
        return (
          <Pressable
            key={tab.id}
            style={({ pressed }) => [
              styles.mobileFooterSlackSegment,
              segmentWidth > 0 ? { width: segmentWidth } : styles.mobileFooterSlackSegmentFlex,
              pressed && styles.mobileFooterSlackSegmentPressed,
            ]}
            onPress={tab.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab.active }}
            accessibilityLabel={tab.label}
          >
            <View
              style={[
                styles.mobileFooterSlackIconWrap,
                tab.active && styles.mobileFooterSlackIconWrapActive,
              ]}
            >
              <Icon
                size={iconSize}
                color={iconColor}
                strokeWidth={tab.active ? 2.15 : 1.65}
              />
              {showBadge ? (
                <View style={styles.mobileFooterBadgeClustered}>
                  <Text style={styles.mobileFooterBadgeText}>
                    {(tab.badgeCount ?? 0) > 9 ? "9+" : tab.badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.mobileFooterSlackLabel,
                compact && styles.mobileFooterSlackLabelCompact,
                tab.active && styles.mobileFooterSlackLabelActive,
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AnimatedNavPill({
  active,
  onPress,
  onHoverInExtra,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onPress?: () => void;
  /** Web: prefetch lazy tab chunk / finance queries before click. */
  onHoverInExtra?: () => void;
  icon: React.ComponentProps<typeof FontAwesome5>["name"];
  title: string;
  subtitle?: string;
}) {
  const hoverProgress = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  const springCfg = { damping: 24, stiffness: 200, mass: 1 };

  useEffect(() => {
    activeProgress.value = withSpring(active ? 1 : 0, springCfg);
    if (active) hoverProgress.value = withSpring(0, springCfg);
  }, [active, activeProgress]);

  // Single derived value — active always wins, hover fills in when idle.
  // Both useAnimatedStyle hooks read this; no duplicate Math.max on the UI thread.
  const expansionProgress = useDerivedValue(() =>
    Math.max(activeProgress.value, hoverProgress.value)
  );

  const pillStyle = useAnimatedStyle(() => {
    const p = expansionProgress.value;
    const bgAlpha = activeProgress.value > hoverProgress.value
      ? activeProgress.value          // active → full dark
      : hoverProgress.value * 0.05;   // hover only → very subtle tint
    const borderAlpha = activeProgress.value * 0.6 + hoverProgress.value * 0.08;
    return {
      width: interpolate(p, [0, 1], [44, 160]),
      backgroundColor: `rgba(15,23,42,${bgAlpha})`,
      borderColor: `rgba(15,23,42,${borderAlpha})`,
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const p = expansionProgress.value;
    return {
      opacity: p,
      transform: [{ translateX: interpolate(p, [0, 1], [-12, 0]) }],
    };
  });

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        if (!active) hoverProgress.value = withSpring(1, springCfg);
        onHoverInExtra?.();
      }}
      onHoverOut={() => {
        if (!active) hoverProgress.value = withSpring(0, springCfg);
      }}
      style={styles.webNavPressable}
    >
      <Animated.View style={[styles.webNavPill, pillStyle]}>
        {/* Fixed-width icon box — never shifts during expansion */}
        <View style={styles.webNavIconBox}>
          <FontAwesome5
            name={icon}
            size={16}
            color={active ? Theme.textOnPrimary : Theme.textMutedDemo}
            solid={active}
          />
        </View>
        {/* Absolutely positioned text — revealed by the pill mask */}
        <Animated.View style={[styles.webNavTextAbs, textStyle]}>
          <Text numberOfLines={1} style={[styles.webNavTitle, active && styles.webNavTitleActive]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.webNavSub, active && styles.webNavSubActive]}>
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export type DemoTabId = "finance" | "trips" | "network" | "loadCenter" | "resources";

interface DemoTabBarProps {
  activeTab: DemoTabId;
  onTabChange: (tab: DemoTabId) => void;
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

export function DemoTabBar({
  activeTab,
  onTabChange,
  onProfilePress,
  onNotificationsPress,
}: DemoTabBarProps) {
  void onNotificationsPress;
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id ?? null;
  const warmTabOnHover = (tab: DemoTabId) => {
    if (tab === "finance" || tab === "trips" || tab === "network") {
      preloadTabScreen(tab);
      if (tab === "finance" && orgId) {
        preloadFinanceWarmup(queryClient, orgId);
      }
    }
  };
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  /** Operation shelf row ids the user has opened in the Alert Registry (session-only; badge excludes them). */
  const [seenRegistryOperationIds, setSeenRegistryOperationIds] = useState<
    Record<string, true>
  >({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const [isNetworkExpanded, setIsNetworkExpanded] = useState(false);
  const [notifTab, setNotifTab] = useState<"active" | "history">("active");
  const [inviteTab, setInviteTab] = useState<"received" | "sent">("received");
  const [notifActionId, setNotifActionId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const notificationsPopoverRootRef = useRef<View | null>(null);
  const invitationsPopoverRootRef = useRef<View | null>(null);
  const mobileNetworkAnchorRef = useRef<View | null>(null);
  /** Worklet-readable: sub-dock must fully hide when false (don’t let bar visibility opacity show it on other tabs). */
  const networkDockOpenSV = useSharedValue(false);
  const {
    notificationCount: registryNotificationCount,
    refreshRegistry,
    rejectSalaryRequest,
    markSharedLedgerRead,
  } = useAlertRegistryNotifications(orgId);
  const opsShelf = useOperationsShelfItems();
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const dockIndentsQ = useIndentsQuery(orgId);
  const dockMarketIndentsQ = useMarketIndentsQuery(orgId);
  const dockMyQuotesQ = useMyDirectQuotesQuery(orgId);
  const { getTotalUnreadCount: getTripUnreadCount } = useTripChat();
  const { getTotalUnreadCount: getNetworkUnreadCount } = useIntegratedChat();
  const messageUnreadCount = getTripUnreadCount() + getNetworkUnreadCount();
  const {
    receivedItems: receivedInviteItems,
    sentItems: sentInviteItems,
    pendingCount: pendingInvites,
    refreshInboundProtocol,
    patchAfterAction: patchInviteAfterAction,
  } = useProtocolInvitesWithDriverSent(orgId);
  const activeLoadCount = useMemo(() => {
    const terminalStatuses = new Set(["completed", "cancelled"]);
    const awardedToMeIds = new Set(
      (dockMyQuotesQ.data ?? [])
        .filter((q) => String(q.status ?? "").toLowerCase() === "accepted")
        .map((q) => q.indent_id),
    );
    const activeIds = new Set<string>();

    for (const indent of dockIndentsQ.data ?? []) {
      const status = String(indent.status ?? "").toLowerCase();
      if (terminalStatuses.has(status)) continue;
      if (indent.organization_id === orgId) activeIds.add(indent.id);
    }

    for (const indent of dockMarketIndentsQ.data ?? []) {
      const status = String(indent.status ?? "").toLowerCase();
      if (terminalStatuses.has(status)) continue;
      const target = String(indent.circulation_target ?? "").toLowerCase();
      const isMarketVisible = target === "integrated_supplier" || target === "both";
      if (!isMarketVisible) continue;
      if (status === "awarded") {
        if (awardedToMeIds.has(indent.id)) activeIds.add(indent.id);
        continue;
      }
      activeIds.add(indent.id);
    }

    return activeIds.size;
  }, [dockIndentsQ.data, dockMarketIndentsQ.data, dockMyQuotesQ.data, orgId]);
  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted)
          setProfileAvatarUri(
            getUser2DAvatarUriForSeed(profile.avatar_seed.trim()),
          );
        return;
      }
      if (mounted)
        setProfileAvatarUri(
          getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED),
        );
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);

  useEffect(() => {
    setSeenRegistryOperationIds({});
  }, [currentOrganization?.id]);

  /** Opening the registry counts as having seen current Live Operations rows for badge purposes. */
  useEffect(() => {
    if (!showNotifications || !orgId) return;
    const items = useGlobalSyncStore.getState().getOperationsShelfItems();
    if (items.length === 0) return;
    setSeenRegistryOperationIds((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const { id } of items) {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [showNotifications, orgId]);

  const notificationCount = useMemo(() => {
    const unseenOps = opsShelf.filter((i) => !seenRegistryOperationIds[i.id]).length;
    return registryNotificationCount + unseenOps;
  }, [registryNotificationCount, opsShelf, seenRegistryOperationIds]);

  const handleSalaryReject = async (requestId: string) => {
    setNotifActionId(requestId);
    await rejectSalaryRequest(requestId);
    setNotifActionId(null);
  };
  const handleSharedAction = useCallback(
    async (item: SharedLedgerNotificationRow) => {
      const payload = item.payload_json ?? {};
      const actionKind = resolveSharedActionKind(item.event_type, payload);
      const tripId = typeof payload.trip_id === "string" ? payload.trip_id : null;
      const entityType =
        typeof payload.entity_type === "string"
          ? payload.entity_type.toUpperCase()
          : null;
      const entityId = typeof payload.entity_id === "string" ? payload.entity_id : null;

      setShowNotifications(false);

      if (entityType === "CLIENT" && entityId) {
        const q = new URLSearchParams({
          shared: "1",
          sharedAction: actionKind,
        });
        if (tripId) q.set("tripId", tripId);
        router.push(`/client/${entityId}?${q.toString()}` as const);
      } else if (entityType === "SUPPLIER" && entityId) {
        const q = new URLSearchParams({
          shared: "1",
          sharedAction: actionKind,
        });
        if (tripId) q.set("tripId", tripId);
        router.push(`/supplier/${entityId}?${q.toString()}` as const);
      } else if (tripId) {
        router.push(`/trip-ledger/${tripId}` as const);
      } else {
        router.push("/(tabs)/finance");
      }

      if (orgId && item.status === "open") {
        void markSharedLedgerRead(item.id);
      }
    },
    [orgId, markSharedLedgerRead, router],
  );
  const handleInviteAction = async (
    item: InboundProtocolInviteItem,
    action: "approve" | "reject" | "cancel",
  ) => {
    if (!orgId) return;
    setInviteActionId(item.id);
    let error: Error | null = null;
    if (action === "approve") {
      patchInviteAfterAction(item.id, item.linkedRequestIds);
      const res = await approveConnectionRequest(item.id, orgId);
      error = res.error;
      if (!error) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
      }
    } else if (action === "reject") {
      patchInviteAfterAction(item.id, item.linkedRequestIds);
      const res = await rejectConnectionRequest(item.id, orgId);
      error = res.error;
    } else if (item.partnerOwnerId) {
      const res = await cancelPendingConnectionRequestsForPartnerOwner(
        orgId,
        item.partnerOwnerId,
      );
      error = res.error;
      if (!error) {
        patchInviteAfterAction(
          item.id,
          res.deletedIds.length > 0 ? res.deletedIds : item.linkedRequestIds,
        );
      }
    } else {
      patchInviteAfterAction(item.id, item.linkedRequestIds);
      const ids = item.linkedRequestIds?.length
        ? item.linkedRequestIds
        : [item.id];
      for (const id of ids) {
        const res = await cancelConnectionRequest(id);
        if (res.error) {
          error = res.error;
          break;
        }
      }
    }
    setInviteActionId(null);
    if (error) {
      await refreshInboundProtocol();
    }
    await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
  };

  const bottomInset = useEffectiveBottomInset();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useLanguage();
  const fallbackDockVisibilityProgress = useSharedValue(1);
  const dockVisibilityProgress =
    useDemoTabBarVisibilityProgressOptional() ?? fallbackDockVisibilityProgress;
  const scrollHideVersion = useDemoTabBarScrollHideVersion();

  /** Pay now opens ledger-sync prefilled; salary row is marked paid only after successful submit (see ledger-sync). */
  const openLedgerForSalaryPayment = useCallback(
    (req: SalaryRequestWithDriverRow) => {
      const driverName = req.drivers?.name?.trim() || t("driver");
      const isTripBased =
        req.request_type === "trip_based" &&
        Array.isArray(req.trip_ids) &&
        req.trip_ids.length > 0;
      const q = new URLSearchParams({
        entityType: "DRIVER",
        entityId: req.driver_id,
        partyName: driverName,
        partyId: req.driver_id,
        defaultType: "out",
        salaryAmount: String(req.amount),
        defaultDriverPaymentType: isTripBased ? "settlement" : "advance",
        salaryRequestId: req.id,
      });
      if (isTripBased && req.trip_ids[0]) {
        q.set("tripId", req.trip_ids[0]);
      }
      setShowNotifications(false);
      router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
    },
    [router, t],
  );

  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && windowWidth >= 1024;
  const isCompactMobile = !isDesktopWeb && windowWidth < 390;
  const isFiscal = activeTab === "finance";
  const isTrips = activeTab === "trips";
  const isNetwork = activeTab === "network";
  const isLoadCenter = activeTab === "loadCenter";
  const isChatRoute = pathname.includes("/chat");
  const networkDockOpen = !isDesktopWeb && isNetworkExpanded;
  const displayName = (
    profile?.full_name ??
    profile?.displayName ??
    "User"
  ).trim();
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "US";

  const tabBarPlatform = resolveTabBarLayoutPlatform({
    isWeb,
    isDesktopWeb,
  });
  const footerPadTop = 4;
  const footerPadBottom = tabBarFooterPadding(bottomInset, tabBarPlatform);
  const collapseNetworkDock = useCallback(() => {
    setIsNetworkExpanded(false);
    setMobileNetworkDockExpanded(false);
  }, []);

  const runNetworkDockAction = useCallback((action: () => void) => {
    setIsNetworkExpanded(false);
    setMobileNetworkDockExpanded(false);
    setShowInvitations(false);
    setShowNotifications(false);
    action();
  }, []);

  /** Scroll (any): close legacy network flyout if it was open. */
  useEffect(() => {
    collapseNetworkDock();
  }, [scrollHideVersion, collapseNetworkDock]);

  useEffect(() => {
    networkDockOpenSV.value = networkDockOpen;
  }, [networkDockOpen, networkDockOpenSV]);

  useEffect(() => {
    setMobileNetworkDockExpanded(!isDesktopWeb && networkDockOpen);
    return () => setMobileNetworkDockExpanded(false);
  }, [isDesktopWeb, networkDockOpen]);

  const openNetworkInvitations = () => {
    runNetworkDockAction(() => {
      router.push("/(tabs)/network?view=requests" as const);
    });
  };

  const openNetworkLoads = () => {
    runNetworkDockAction(() => {
      onTabChange("loadCenter");
    });
  };
  const openMessages = () => {
    runNetworkDockAction(() => {
      router.push(ROUTES.CHAT);
    });
  };
  const mobileNetworkSubDockVisibilityStyle = useAnimatedStyle(() => {
    const p = dockVisibilityProgress.value;
    if (!networkDockOpenSV.value) {
      return {
        opacity: 0,
        transform: [{ scale: 0.72 }, { translateY: 18 }],
      };
    }
    return {
      opacity: p,
      transform: [{ scale: 0.92 + p * 0.08 }],
    };
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onDocumentPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      const notificationsRoot =
        notificationsPopoverRootRef.current as unknown as { contains?: (node: Node) => boolean } | null;
      const invitationsRoot =
        invitationsPopoverRootRef.current as unknown as { contains?: (node: Node) => boolean } | null;
      const networkRoot =
        mobileNetworkAnchorRef.current as unknown as { contains?: (node: Node) => boolean } | null;
      const inNotifications =
        !!notificationsRoot &&
        typeof notificationsRoot.contains === "function" &&
        notificationsRoot.contains(target);
      const inInvitations =
        !!invitationsRoot &&
        typeof invitationsRoot.contains === "function" &&
        invitationsRoot.contains(target);
      const inNetworkDock =
        !!networkRoot &&
        typeof networkRoot.contains === "function" &&
        networkRoot.contains(target);
      if (inNotifications || inInvitations || inNetworkDock) return;
      setShowNotifications(false);
      setShowInvitations(false);
      collapseNetworkDock();
    };
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("touchstart", onDocumentPointerDown);
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("touchstart", onDocumentPointerDown);
      document.removeEventListener("mousedown", onDocumentPointerDown);
    };
  }, [collapseNetworkDock]);

  if (isDesktopWeb) {
    const navItems: Array<{
      id: DemoTabId;
      title: string;
      subtitle?: string;
      icon: React.ComponentProps<typeof FontAwesome5>["name"];
      active: boolean;
    }> = [
      {
        id: "finance",
        title: "FINANCE",
        subtitle: "LEDGER",
        icon: "dollar-sign",
        active: isFiscal,
      },
      {
        id: "trips",
        title: "TRIPS",
        subtitle: "OPERATIONS",
        icon: "map-signs",
        active: isTrips,
      },
      {
        id: "network",
        title: "NETWORK",
        subtitle: "MARKET",
        icon: "chart-line",
        active: isNetwork,
      },
      {
        id: "loadCenter",
        title: "LOAD",
        subtitle: "CENTER",
        icon: "truck-loading",
        active: isLoadCenter,
      },
    ];

    return (
      <Fragment>
      <View style={[styles.webTopShell, Platform.OS === "web" && ({ backdropFilter: "blur(24px)" } as unknown as ViewStyle)]}>
        <View style={styles.webHeaderRow}>
          <View style={styles.webBrandWrap}>
            <View>
              <Text style={styles.webBrandTitle}>
                PULSE
                <Text style={styles.webBrandDotText}>.</Text>
              </Text>
            </View>
          </View>

          <View style={styles.webNavPillGroup}>
            {navItems.map((item) => (
              <AnimatedNavPill
                key={`${item.id}-${item.title}`}
                active={item.active}
                onPress={() => onTabChange(item.id)}
                onHoverInExtra={() => warmTabOnHover(item.id)}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
              />
            ))}
          </View>

          <View style={styles.webUtilityWrap}>
            <View style={styles.webPopoverAnchor} ref={notificationsPopoverRootRef}>
              <AnimatedPress
                style={[
                  styles.webBellBtn,
                  showNotifications && styles.webBellBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setShowNotifications((v) => !v);
                  setShowInvitations(false);
                }}
              >
                <FontAwesome5
                  name="bell"
                  size={16}
                  color={showNotifications ? "#ffffff" : "#64748b"}
                />
                {notificationCount > 0 && !showNotifications ? (
                  <View style={styles.webBellDot} />
                ) : null}
              </AnimatedPress>
              {showNotifications ? (
                <View style={styles.webAlertRegistryAnchor}>
                  <AlertRegistryPanel
                    tab={notifTab}
                    onTabChange={setNotifTab}
                    onClose={() => setShowNotifications(false)}
                    onSync={refreshRegistry}
                    syncing={notifActionId != null}
                    finance={{
                      onRejectSalary: (id) => void handleSalaryReject(id),
                      onPaySalary: openLedgerForSalaryPayment,
                      onMarkSharedRead: (id) => void markSharedLedgerRead(id),
                      onSharedAction: (item) => void handleSharedAction(item),
                      busySalaryId: notifActionId,
                    }}
                  />
                </View>
              ) : null}
            </View>
            <View style={styles.webPopoverAnchor} ref={invitationsPopoverRootRef}>
              <AnimatedPress
                style={[
                  styles.webBellBtn,
                  showInvitations && styles.webBellBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setShowInvitations((v) => !v);
                  setShowNotifications(false);
                }}
              >
                <FontAwesome5
                  name="inbox"
                  size={15}
                  color={showInvitations ? "#ffffff" : "#64748b"}
                />
                {pendingInvites > 0 && !showInvitations ? (
                  <View style={styles.webBellDot} />
                ) : null}
              </AnimatedPress>
              {showInvitations ? (
                <View style={styles.webInviteRegistryAnchor}>
                  <InboundProtocolPanel
                    tab={inviteTab}
                    onTabChange={setInviteTab}
                    onClose={() => setShowInvitations(false)}
                    pendingCount={pendingInvites}
                    receivedItems={receivedInviteItems}
                    sentItems={sentInviteItems}
                    busyId={inviteActionId}
                    onApprove={(item) => void handleInviteAction(item, "approve")}
                    onReject={(item) => void handleInviteAction(item, "reject")}
                    onCancel={(item) => void handleInviteAction(item, "cancel")}
                    onManageAll={() => {
                      setShowInvitations(false);
                      router.push({
                        pathname: "/network",
                        params: { view: "requests", ts: String(Date.now()) },
                      } as never);
                    }}
                  />
                </View>
              ) : null}
            </View>
            <AnimatedPress
              onPress={onProfilePress}
              style={styles.webAvatarBtn}
              activeOpacity={0.8}
            >
              {profileAvatarUri ? (
                <Image
                  source={{ uri: profileAvatarUri }}
                  style={styles.webProfileAvatar}
                />
              ) : (
                <Text style={styles.webAvatarText}>{initials}</Text>
              )}
            </AnimatedPress>
          </View>
        </View>
      </View>
      </Fragment>
    );
  }

  /** No cluster tab selected on Home (network) or Chat — avoid defaulting thumb to Cash. */
  const clusterActiveIndex = isFiscal ? 0 : isTrips ? 1 : isLoadCenter ? 2 : -1;

  const slackClusterTabs: SlackClusterTab[] = [
    {
      id: "finance",
      label: "Cash",
      LucideIcon: Wallet,
      active: isFiscal,
      onPress: () => {
        collapseNetworkDock();
        onTabChange("finance");
      },
    },
    {
      id: "trips",
      label: "Trips",
      LucideIcon: Route,
      active: isTrips,
      onPress: () => {
        collapseNetworkDock();
        onTabChange("trips");
      },
    },
    {
      id: "loads",
      label: "Loads",
      LucideIcon: Package,
      active: isLoadCenter,
      badgeCount: activeLoadCount,
      onPress: () => {
        collapseNetworkDock();
        onTabChange("loadCenter");
      },
    },
  ];

  return (
    <View
      style={[
        styles.footerWrap,
        styles.mmtFooterShell,
        { paddingBottom: footerPadBottom },
      ]}
      pointerEvents="box-none"
    >
      <View
              style={[
          styles.mmtFooterBar,
          isCompactMobile && styles.mmtFooterBarCompact,
        ]}
      >
        <View style={styles.mobileFooterEdgeStart}>
          <MobileFooterTab
            label="Home"
            edge
            active={isNetwork}
            badgeCount={pendingInvites}
            customIcon={
              <Home
                size={
                  isCompactMobile
                    ? MOBILE_EDGE_ICON_SIZE_COMPACT + 1
                    : MOBILE_EDGE_ICON_SIZE + 1
                }
                color={isNetwork ? Theme.pulseIndigo : Theme.textMutedDemo}
                fill={isNetwork ? Theme.pulseIndigo : "transparent"}
                strokeWidth={CLUSTER_STROKE}
              />
            }
              onPress={() => {
                collapseNetworkDock();
              onTabChange("network");
            }}
            compact={isCompactMobile}
          />
                </View>
        <MobileFooterSlackCluster
          tabs={slackClusterTabs}
          activeIndex={clusterActiveIndex}
          compact={isCompactMobile}
        />
        <View style={styles.mobileFooterEdgeEnd}>
          <MobileFooterTab
            label="Chat"
            edge
            active={isChatRoute}
            badgeCount={messageUnreadCount}
            customIcon={
              <AnimatedChatTabIcon
                active={isChatRoute}
                size={
                  isCompactMobile
                    ? MOBILE_EDGE_ICON_SIZE_COMPACT + 1
                    : MOBILE_EDGE_ICON_SIZE + 1
                }
              />
            }
            onPress={() => {
              collapseNetworkDock();
              openMessages();
            }}
            compact={isCompactMobile}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  staticIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  footerWrap: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  mmtFooterShell: {
    backgroundColor: Theme.tabBarBg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.tabBarBorderTop,
    paddingTop: 10,
    paddingHorizontal: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  mmtFooterBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 10,
  },
  mmtFooterBarCompact: {
    minHeight: 52,
    paddingHorizontal: 10,
    gap: 8,
  },
  mobileFooterEdgeStart: {
    width: 58,
    alignItems: "center",
    marginLeft: 4,
  },
  mobileFooterEdgeEnd: {
    width: 58,
    alignItems: "center",
    marginRight: 4,
  },
  mobileFooterSlackPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    maxWidth: 300,
    minWidth: 228,
    padding: CLUSTER_PILL_INSET,
    borderRadius: 28,
    backgroundColor: Theme.pulseTabClusterTrackBg,
    borderWidth: 1,
    borderColor: Theme.pulseTabClusterTrackBorder,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  mobileFooterSlackPillCompact: {
    maxWidth: 280,
    minWidth: 212,
    borderRadius: 26,
  },
  mobileFooterSlackTrackSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  mobileFooterSlackThumb: {
    position: "absolute",
    top: CLUSTER_PILL_INSET,
    bottom: CLUSTER_PILL_INSET,
    left: 0,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.pulseTabClusterThumbBorder,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  mobileFooterSlackThumbCompact: {
    borderRadius: 18,
  },
  mobileFooterSlackThumbSpecular: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.88,
  },
  mobileFooterSlackThumbEdge: {
    position: "absolute",
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.pulseTabClusterThumbBorder,
  },
  mobileFooterSlackSegment: {
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 4,
    paddingBottom: 4,
    zIndex: 1,
  },
  mobileFooterSlackSegmentPressed: {
    opacity: 0.82,
  },
  mobileFooterSlackSegmentFlex: {
    flex: 1,
    minWidth: 0,
  },
  mobileFooterSlackIconWrap: {
    position: "relative",
    width: 36,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  mobileFooterSlackIconWrapActive: {
    transform: [{ scale: 1.05 }],
  },
  mobileFooterSlackLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.pulseTabClusterLabelInactive,
    letterSpacing: 0.35,
    textAlign: "center",
    textTransform: "uppercase",
  },
  mobileFooterSlackLabelCompact: {
    fontSize: 8,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  mobileFooterSlackLabelActive: {
    fontWeight: "600",
    color: Theme.pulseTabClusterLabelActive,
    letterSpacing: 0.45,
  },
  mobileFooterTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 0,
    maxWidth: "16.666%",
    paddingHorizontal: 2,
    gap: 4,
  },
  mobileFooterTabEdge: {
    flex: 0,
    width: 56,
    maxWidth: 56,
    minWidth: 56,
  },
  mobileFooterIconSlot: {
    position: "relative",
    width: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  mobileFooterIconSlotEdge: {
    width: 40,
    height: 36,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  mobileFooterIconSlotEdgeActive: {
    backgroundColor: Theme.pulseTabActiveBg,
    borderRadius: 12,
  },
  mobileFooterIconSlotActive: {
    backgroundColor: Theme.pulseTabActiveBg,
  },
  mobileFooterActiveBar: {
    position: "absolute",
    top: -5,
    width: 18,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: Theme.pulseIndigo,
  },
  mobileFooterAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  mobileFooterAvatarEdge: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  mobileFooterAvatarActive: {
    borderWidth: 2,
    borderColor: Theme.pulseIndigo,
  },
  mobileFooterAvatarFallback: {
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileFooterAvatarInitials: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  mobileFooterBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.tabBarBg,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileFooterBadgeClustered: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 13,
    height: 13,
    borderRadius: 7,
    paddingHorizontal: 2,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.pulseTabClusterTrackBg,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileFooterBadgeText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    lineHeight: 10,
  },
  mobileFooterLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: -0.15,
    textAlign: "center",
  },
  mobileFooterLabelCompact: {
    fontSize: 10,
  },
  mobileFooterLabelActive: {
    fontWeight: "600",
    color: Theme.iconPrimary,
  },
  mobileFooterEdgeLabelActive: {
    color: Theme.pulseIndigo,
  },
  mobileFooterRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mobileFooterRowCompact: {
    gap: 4,
  },
  commandFooterWrap: {
    paddingHorizontal: 10,
  },
  mobileCommandRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  mobileCommandRowCompact: {
    gap: 6,
  },
  mobileProfilePortal: {
    width: 58,
    height: 58,
    borderRadius: 22,
    padding: 5,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 2,
    borderColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
  },
  mobileProfilePortalCompact: {
    width: 50,
    height: 50,
    borderRadius: 19,
    padding: 4,
  },
  mobileProfileAvatarFrame: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileCommandProfileAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
  },
  mobileCommandAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  mobileProfileOnlineDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: Theme.darkGreen,
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  mobileProfileOnlinePulse: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: Theme.darkGreen,
    opacity: 0.18,
  },
  commandDock: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 2,
    borderColor: "#0f172a",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.2,
    shadowRadius: 34,
    elevation: 18,
  },
  commandDockCompact: {
    minHeight: 68,
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 30,
  },
  commandNavButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderRadius: 28,
    paddingHorizontal: 2,
  },
  commandNavButtonActive: {
    backgroundColor: "#0f172a",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  commandNavButtonCompact: {
    minHeight: 56,
    borderRadius: 25,
  },
  commandNavLabel: {
    marginTop: 5,
    fontSize: 7.5,
    fontWeight: "900",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontStyle: "italic",
    textAlign: "center",
  },
  commandNavLabelCompact: {
    fontSize: 6.5,
    letterSpacing: 0.8,
  },
  commandNavLabelActive: {
    color: "#ffffff",
  },
  mobileNetworkAnchor: {
    width: 64,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  mobileNetworkAnchorCompact: {
    width: 56,
    minHeight: 56,
  },
  mobileNetworkSubDock: {
    position: "absolute",
    bottom: 78,
    right: 0,
    gap: 10,
    alignItems: "flex-end",
    opacity: 1,
    transform: [{ scale: 1 }, { translateY: 0 }],
  },
  mobileNetworkActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobileNetworkActionLabel: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 1,
    textTransform: "uppercase",
    lineHeight: 26,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  mobileNetworkActionBtn: {
    width: 56,
    height: 56,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#0f172a",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  mobileNetworkActionBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Theme.primary,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileNetworkActionBadgeText: {
    fontSize: 7,
    fontWeight: "900",
    color: "#ffffff",
  },
  mobileNetworkSwitch: {
    width: 64,
    height: 64,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#0f172a",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
  },
  mobileNetworkSwitchActive: {
    backgroundColor: "#0f172a",
  },
  mobileNetworkSwitchCompact: {
    width: 56,
    height: 56,
    borderRadius: 21,
  },
  mobileNetworkSwitchLabel: {
    marginTop: 4,
    fontSize: 6.5,
    fontWeight: "900",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontStyle: "italic",
  },
  mobileNetworkSwitchLabelCompact: {
    fontSize: 5.8,
    letterSpacing: 0.5,
  },
  mobileNetworkSwitchLabelActive: {
    color: "#ffffff",
  },
  mobileCommandSpacer: {
    width: 58,
    height: 58,
  },
  mobileCommandSpacerCompact: {
    width: 50,
    height: 50,
  },
  glassDock: {
    flex: 1,
    height: Layout.tabBarHeight + 6,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.05)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  glassDockCompact: {
    height: Layout.tabBarHeight + 2,
    borderRadius: 16,
  },
  mobileEdgeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  mobileEdgeBtnCompact: {
    width: 30,
    height: 30,
    borderRadius: 9,
  },
  mobileProfileBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(203,213,225,0.5)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mobileProfileBtnCompact: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  mobileProfileAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
  },
  mobileAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  glassDockWeb: {
    height: Layout.tabBarHeight + 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    backgroundColor: "#fff",
    elevation: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  webTopShell: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    zIndex: 200,
    elevation: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  webHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  webBrandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 230,
    paddingRight: 8,
  },
  webBrandLogo: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  webBrandTitle: {
    fontSize: 34,
    fontWeight: "900",
    color: "#0f172a",
    fontStyle: "italic",
    letterSpacing: -1,
    lineHeight: 36,
  },
  webBrandDotText: {
    color: Theme.darkGreen,
    fontSize: 38,
    lineHeight: 38,
  },
  webBrandSub: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: Theme.textMutedDemo,
  },
  webNavPillGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    borderRadius: 999,
    padding: 6,
    minWidth: 0,
    maxWidth: 520,
    width: "auto",
    overflow: "hidden",
  },
  webNavPressable: {
    flexShrink: 0,
  },
  webNavPill: {
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  webNavIconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  webNavTextAbs: {
    position: "absolute",
    left: 44,
    top: 0,
    bottom: 0,
    width: 110,
    justifyContent: "center",
  },
  webNavTitle: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  webNavTitleActive: {
    color: "#ffffff",
  },
  webNavSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  webNavSubActive: {
    color: Theme.teslaRed,
  },
  webUtilityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 90,
    justifyContent: "flex-end",
    paddingRight: 6,
  },
  webPopoverAnchor: {
    position: "relative",
    zIndex: 40,
  },
  webBellBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    position: "relative",
  },
  webBellBtnActive: {
    backgroundColor: "#171A20",
    borderColor: "#171A20",
  },
  webBellDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.teslaRed,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  webAlertRegistryAnchor: {
    position: "absolute",
    top: 48,
    right: 0,
    zIndex: 50,
  },
  webInviteRegistryAnchor: {
    position: "absolute",
    top: 48,
    right: 0,
    zIndex: 50,
  },
  webPopoverCard: {
    position: "absolute",
    top: 44,
    right: 0,
    width: 360,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 20,
  },
  webInvitationPopoverCard: {
    width: 390,
  },
  webPopoverHeadDark: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  webPopoverHeadTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  webPopoverHeadBadge: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  webPopoverTabsWrap: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: "#ffffff",
  },
  webPopoverTabBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  webPopoverTabBtnActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  webPopoverTabBtnText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
  },
  webPopoverTabBtnTextActive: {
    color: "#ffffff",
  },
  webPopoverScroll: {
    maxHeight: 520,
  },
  webPopoverBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  webPopoverRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  webPopoverRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  webPopoverRowLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  webPopoverRowTime: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
  },
  webPopoverRowDesc: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  webNotifRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  webNotifLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  webNotifAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  webNotifAvatarText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  webNotifTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  webNotifName: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  webNotifMeta: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  webNotifRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  webNotifAmount: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  webNotifActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  webNotifRejectBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  webNotifRejectBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  webNotifPayBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  webNotifPayBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  webNotifStatus: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  webInviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  webInviteCode: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  webInviteCodeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },
  webInviteTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  webInviteName: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  webInviteType: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  webInviteActionsInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  webInviteGhostBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  webInviteGhostBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  webInvitePrimaryBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  webInvitePrimaryBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  webPopoverEmpty: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  webPopoverFooterBtn: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  webPopoverFooterBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  webBellBadge: {
    position: "absolute",
    top: -7,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  webBellBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 11,
  },
  webAvatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  webAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  webInviteIconWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  webInviteDot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.primary,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  tabsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  tabsRowWeb: {
    flex: 1,
    minWidth: 420,
    justifyContent: "center",
    alignItems: "stretch",
    backgroundColor: "rgba(15,23,42,0.05)",
    borderRadius: 24,
    marginVertical: 6,
    padding: 2,
  },
  webRightWrap: {
    width: 200,
    height: "100%",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 24,
    flexShrink: 0,
  },
  webRightWrapCompact: {
    width: 80,
    paddingRight: 12,
  },
  webRightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  webProfileBtn: {
    padding: 4,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  webProfileAvatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  dockColumn: {
    flex: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  dockColumnWeb: {
    flex: 1,
  },
  activePill: {
    position: "absolute",
    top: 3,
    left: 2,
    right: 2,
    bottom: 3,
    borderRadius: 18,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    opacity: 0,
  },
  activePillVisible: {
    opacity: 1,
  },
  activePillWeb: {
    borderRadius: 16,
    backgroundColor: "#0f172a",
  },
  activePillAccent: {
    position: "absolute",
    bottom: -4,
    left: "30%",
    right: "30%",
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e11d48",
  },
  activePillAccentWeb: {
    bottom: 0,
    left: "28%",
    right: "28%",
    height: 3,
    borderRadius: 999,
  },
  dockButton: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: Layout.minTouchTargetSize,
  },
  dockLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: Theme.textMutedDemo,
  },
  dockLabelCompact: {
    letterSpacing: 0.55,
  },
  dockLabelActive: {
    color: "#ffffff",
  },
  dockLabelActiveWeb: {
    color: Theme.textPrimaryDark,
  },
  dockLabelWeb: {
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 0,
  },
});
