/**
 * Unified shell footer + bottom nav (Q-unified-base aligned).
 */
import { DemoTabBarMobileFooter } from "@/components/demo/DemoTabBarMobileFooter";
import { WebNavMirrorToggle } from "@/components/demo/WebNavMirrorToggle";
import { AlertRegistryPanel, type RegistryFilterTab } from "@/components/AlertRegistryPanel";
import { NotificationBellIcon } from "@/components/NotificationBellIcon";
import { InboundProtocolPanel } from "@/components/InboundProtocolPanel";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
    DEFAULT_USER_2D_AVATAR_SEED,
    getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalBusinessConnectionRequestModal } from "@/contexts/BusinessConnectionRequestModalContext";
import {
    useDemoTabBarScrollHideVersion,
    useDemoTabBarVisibilityProgressOptional,
} from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { preloadChatRoute } from "@/lib/preloadChatWarmup";
import { preloadFinanceWarmup } from "@/lib/preloadFinanceWarmup";
import { preloadPulseLoadsRoute, preloadTabScreen } from "@/lib/preloadRoutes";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
// Chat unread badges read from a tiny external signal — importing
// `useTripChat` / `useIntegratedChat` here would drag the entire chat graph
// (~256 KB) into the startup chunk. Chat providers (lazy) publish into this
// signal as their counts change.
import {
    getTotalChatUnreadCount as readTotalChatUnread,
    subscribeChatUnreadSignal,
} from "@/lib/chatUnreadSignal";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { navigateToOpsAlert } from "@/lib/alertRegistry/registryOpsNavigation.util";
import { alertDetailRoute } from "@/lib/alertRegistry/alertDetailRoute.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import { useAlertRegistryNotifications } from "@/lib/globalSync/useAlertRegistryNotifications";
import { useOperationsShelfItems } from "@/lib/globalSync/useOperationsDerived";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useProtocolInvitesWithDriverSent } from "@/lib/hooks/useProtocolInvitesWithDriverSent";
import { useTabBarActiveLoadCount } from "@/lib/hooks/useTabBarActiveLoadCount";
import { setMobileNetworkDockExpanded } from "@/lib/mobileDockState";
import { ROUTES } from "@/lib/routes";
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
} from "@/features/connections/services/connectionRequests.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type { SharedLedgerNotificationRow } from "@/features/finance/services/sharedLedgerNotifications.service";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { LinearGradient } from "expo-linear-gradient";
import { Inbox, MessageSquare } from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import {
  tabBarFooterPadding,
  resolveTabBarLayoutPlatform,
} from "@/lib/layoutInsets";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";

function isIgnorableInviteRefetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("lock was stolen by another request");
}

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

export type DemoTabId = "finance" | "trips" | "network" | "loadCenter" | "resources";

/** Desktop web: PULSE opens hub layout; NETWORK pill opens classic scroll layout. */
export type NetworkTabLayout = "hub" | "classic";

export type DemoTabChangeOptions = {
  networkLayout?: NetworkTabLayout;
};

interface DemoTabBarProps {
  activeTab: DemoTabId;
  onTabChange: (tab: DemoTabId, options?: DemoTabChangeOptions) => void;
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
  const onWarmTab = useCallback(
    (tab: DemoTabId) => {
      if (tab === "loadCenter") {
        preloadPulseLoadsRoute();
        return;
      }
      if (tab === "finance" || tab === "trips" || tab === "network") {
        preloadTabScreen(tab);
        if (tab === "finance" && orgId) {
          preloadFinanceWarmup(queryClient, orgId);
        }
        if ((tab === "trips" || tab === "network") && orgId) {
          preloadChatRoute(orgId);
        }
      }
    },
    [orgId, queryClient],
  );
  const warmChatRoute = useCallback(() => {
    preloadChatRoute(orgId);
  }, [orgId]);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  /** Operation shelf row ids the user has opened in the Alert Registry (session-only; badge excludes them). */
  const [seenRegistryOperationIds, setSeenRegistryOperationIds] = useState<
    Record<string, true>
  >({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const [isNetworkExpanded, setIsNetworkExpanded] = useState(false);
  const [notifTab, setNotifTab] = useState<RegistryFilterTab>("all");
  const [inviteTab, setInviteTab] = useState<"received" | "sent">("received");
  const [notifActionId, setNotifActionId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const businessConnectionModal = useOptionalBusinessConnectionRequestModal();
  const notificationsPopoverRootRef = useRef<View | null>(null);
  const invitationsPopoverRootRef = useRef<View | null>(null);
  const registryDrawerRef = useRef<View | null>(null);
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
  const { width: windowWidth } = useWindowDimensions();
  const isWebEarly = Platform.OS === "web";
  const isDesktopWebEarly = isWebEarly && windowWidth >= 1024;
  const [loadsBadgeReady, setLoadsBadgeReady] = useState(false);
  useEffect(() => {
    if (isDesktopWebEarly) return;
    const t = setTimeout(() => setLoadsBadgeReady(true), 2800);
    return () => clearTimeout(t);
  }, [isDesktopWebEarly]);
  const activeLoadCount = useTabBarActiveLoadCount(
    orgId,
    !isDesktopWebEarly && loadsBadgeReady,
  );
  // External-store-driven counts; chat providers publish into the signal.
  const messageUnreadCount = useSyncExternalStore(
    subscribeChatUnreadSignal,
    readTotalChatUnread,
    readTotalChatUnread,
  );
  const {
    receivedItems: receivedInviteItems,
    sentItems: sentInviteItems,
    pendingCount: pendingInvites,
    refreshInboundProtocol,
    patchAfterAction: patchInviteAfterAction,
  } = useProtocolInvitesWithDriverSent(orgId);
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
      await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
      return;
    }
    const refetchInvites = () =>
      Promise.all([receivedQ.refetch(), sentQ.refetch()]);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        void refetchInvites().catch((refetchError) => {
          if (!isIgnorableInviteRefetchError(refetchError)) {
            console.warn("[DemoTabBar] deferred invite refetch failed", refetchError);
          }
        });
      });
    } else {
      setTimeout(() => {
        void refetchInvites().catch((refetchError) => {
          if (!isIgnorableInviteRefetchError(refetchError)) {
            console.warn("[DemoTabBar] deferred invite refetch failed", refetchError);
          }
        });
      }, 0);
    }
  };

  const bottomInset = useEffectiveBottomInset();
  const { t } = useLanguage();
  const fallbackDockVisibilityProgress = useSharedValue(1);
  const dockVisibilityProgress =
    useDemoTabBarVisibilityProgressOptional() ?? fallbackDockVisibilityProgress;
  const scrollHideVersion = useDemoTabBarScrollHideVersion();

  const openAlertDetail = useCallback(
    (
      kind: "salary" | "shared" | "ops",
      id: string,
      mode: "active" | "archive" = "active",
    ) => {
      setShowNotifications(false);
      router.push(alertDetailRoute(kind, id, mode));
    },
    [router],
  );

  const openLedgerForSalaryPayment = useCallback(
    (req: SalaryRequestWithDriverRow) => {
      const isTripBasedAttribution =
        req.request_type === "trip_based" &&
        String(req.note ?? "").toLowerCase().includes("fleet trip");
      setShowNotifications(false);
      if (isTripBasedAttribution) {
        router.push(
          `/(modals)/attribution-trip-create?requestId=${encodeURIComponent(req.id)}` as const,
        );
        return;
      }
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
      router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
    },
    [router, t],
  );

  const handleViewSalaryArchive = useCallback(
    (req: SalaryRequestWithDriverRow) => {
      setShowNotifications(false);
      const tripId = Array.isArray(req.trip_ids) ? req.trip_ids[0] : null;
      if (tripId) {
        router.push(`/trip-ledger/${tripId}` as const);
        return;
      }
      router.push("/(tabs)/finance" as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleDismissOps = useCallback(
    async (ops: GlobalOperationAlert) => {
      if (!orgId) {
        useGlobalSyncStore.getState().dismissOperationAlert(ops.id);
        return;
      }
      await useGlobalSyncStore.getState().acknowledgeGlobalAlert(ops.id, orgId);
    },
    [orgId],
  );

  const handleOpenOps = useCallback(
    (ops: GlobalOperationAlert) => {
      setShowNotifications(false);
      navigateToOpsAlert(router, ops);
    },
    [router],
  );

  const isWeb = isWebEarly;
  const isDesktopWeb = isDesktopWebEarly;
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
    setIsNetworkExpanded((open) => {
      if (!open) return open;
      setMobileNetworkDockExpanded(false);
      return false;
    });
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
  const openMessagesFromPressIn = () => {
    warmChatRoute();
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
      const drawerHost =
        registryDrawerRef.current as unknown as {
          contains?: (node: Node) => boolean;
        } | null;
      const inDrawer =
        !!drawerHost &&
        typeof drawerHost.contains === "function" &&
        drawerHost.contains(target);
      const inNotificationsBell =
        !!notificationsRoot &&
        typeof notificationsRoot.contains === "function" &&
        notificationsRoot.contains(target);
      const inInvitationsBell =
        !!invitationsRoot &&
        typeof invitationsRoot.contains === "function" &&
        invitationsRoot.contains(target);
      const inNetworkDock =
        !!networkRoot &&
        typeof networkRoot.contains === "function" &&
        networkRoot.contains(target);
      if (inDrawer || inNotificationsBell || inInvitationsBell || inNetworkDock) return;
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
          <Pressable
            onPress={() => onTabChange("network", { networkLayout: "hub" })}
            style={({ pressed }) => [
              styles.webBrandWrap,
              pressed && { opacity: 0.88 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open Pulse network hub"
          >
            <View>
              <Text style={styles.webBrandTitle}>
                PULSE
                <Text style={styles.webBrandDotText}>.</Text>
              </Text>
            </View>
          </Pressable>

          <WebNavMirrorToggle
            items={navItems}
            activeIndex={Math.max(
              0,
              navItems.findIndex((item) => item.active),
            )}
            onSelect={(index) => {
              const item = navItems[index];
              if (item) onTabChange(item.id);
            }}
            onWarmAt={(index) => {
              const item = navItems[index];
              if (item) onWarmTab(item.id);
            }}
          />

          <View
            style={[
              styles.webUtilityWrap,
              (showNotifications || showInvitations) && styles.webUtilityWrapAboveDrawer,
            ]}
          >
            <AnimatedPress
              style={styles.webHeaderIconHit}
              activeOpacity={0.72}
              onPressIn={warmChatRoute}
              onPress={() => {
                setShowNotifications(false);
                setShowInvitations(false);
                router.push(ROUTES.CHAT as Parameters<typeof router.push>[0]);
              }}
            >
              <MessageSquare
                size={22}
                color={WEB_HEADER_ICON.muted}
                strokeWidth={WEB_HEADER_ICON.stroke}
              />
              {messageUnreadCount > 0 ? (
                <View style={[styles.webHeaderIconDot, styles.webHeaderIconDotChat]} />
              ) : null}
            </AnimatedPress>
            <View style={styles.webPopoverAnchor} ref={notificationsPopoverRootRef}>
              <AnimatedPress
                style={styles.webHeaderIconHit}
                activeOpacity={0.72}
                onPress={() => {
                  setShowNotifications((v) => !v);
                  setShowInvitations(false);
                }}
              >
                <NotificationBellIcon
                  size={22}
                  color={
                    showNotifications ? WEB_HEADER_ICON.active : WEB_HEADER_ICON.muted
                  }
                  strokeWidth={WEB_HEADER_ICON.stroke}
                  badgeCount={showNotifications ? 0 : notificationCount}
                />
              </AnimatedPress>
            </View>
            <View style={styles.webPopoverAnchor} ref={invitationsPopoverRootRef}>
              <AnimatedPress
                style={styles.webHeaderIconHit}
                activeOpacity={0.72}
                onPress={() => {
                  setShowInvitations((v) => !v);
                  setShowNotifications(false);
                }}
              >
                <Inbox
                  size={22}
                  color={showInvitations ? WEB_HEADER_ICON.active : WEB_HEADER_ICON.muted}
                  strokeWidth={WEB_HEADER_ICON.stroke}
                />
                {pendingInvites > 0 && !showInvitations ? (
                  <View style={[styles.webHeaderIconDot, styles.webHeaderIconDotInbox]} />
                ) : null}
              </AnimatedPress>
            </View>
            <AnimatedPress
              onPress={onProfilePress}
              style={styles.webAvatarBtn}
              activeOpacity={0.88}
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

      <RegistryWebDrawer
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        hostRef={registryDrawerRef}
      >
        <AlertRegistryPanel
          layout="drawer"
          filterTab={notifTab}
          onFilterTabChange={setNotifTab}
          onClose={() => setShowNotifications(false)}
          onSync={refreshRegistry}
          syncing={notifActionId != null}
          finance={{
            onOpenDetail: openAlertDetail,
            onRejectSalary: (id) => void handleSalaryReject(id),
            onPaySalary: openLedgerForSalaryPayment,
            onViewSalaryArchive: handleViewSalaryArchive,
            onMarkSharedRead: (id) => void markSharedLedgerRead(id),
            onSharedAction: (item) => void handleSharedAction(item),
            onDismissOps: (ops) => void handleDismissOps(ops),
            onOpenOps: handleOpenOps,
            busySalaryId: notifActionId,
          }}
        />
      </RegistryWebDrawer>

      <RegistryWebDrawer
        visible={showInvitations}
        onClose={() => setShowInvitations(false)}
        hostRef={registryDrawerRef}
      >
        <InboundProtocolPanel
          layout="drawer"
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
          onOpenInviteDetail={(item) => {
            setShowInvitations(false);
            businessConnectionModal?.presentConnectionInvite(item);
          }}
          onManageAll={() => {
            setShowInvitations(false);
            router.push({
              pathname: "/network",
              params: { view: "requests", ts: String(Date.now()) },
            } as never);
          }}
        />
      </RegistryWebDrawer>
      </Fragment>
    );
  }

  return (
    <DemoTabBarMobileFooter
      activeTab={activeTab}
      isChatRoute={isChatRoute}
      isCompactMobile={isCompactMobile}
      footerPadBottom={footerPadBottom}
      messageUnreadCount={messageUnreadCount}
      pendingInvites={pendingInvites}
      activeLoadCount={activeLoadCount}
      onTabChange={onTabChange}
      onOpenChat={openMessages}
      onOpenChatWarm={openMessagesFromPressIn}
      onCollapseNetworkDock={collapseNetworkDock}
      onWarmTab={onWarmTab}
    />
  );
}

/** Metronic utility toolbar — outline icons, no squircle chrome. */
const WEB_HEADER_ICON = {
  muted: "#5E6278",
  active: "#181C32",
  stroke: 1.85,
} as const;

const styles = StyleSheet.create({
  staticIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
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
    ...Platform.select({
      web: { cursor: "pointer" as const },
    }),
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
    gap: 18,
    minWidth: 120,
    justifyContent: "flex-end",
    paddingRight: 4,
  },
  webUtilityWrapAboveDrawer: {
    position: "relative",
    zIndex: 250,
  },
  webPopoverAnchor: {
    position: "relative",
    zIndex: 40,
  },
  webHeaderIconHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  webHeaderIconDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  webHeaderIconDotChat: {
    backgroundColor: "#50CD89",
  },
  webHeaderIconDotInbox: {
    backgroundColor: Theme.teslaRed,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
    borderWidth: 1.5,
    borderColor: "#181C32",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  webAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#181C32",
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
    width: "100%",
    height: "100%",
    borderRadius: 19,
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
