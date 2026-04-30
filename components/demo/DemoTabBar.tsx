/**
 * Unified shell footer + bottom nav (Q-unified-base aligned).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useConnectionRequestsReceivedQuery, useConnectionRequestsSentQuery } from "@/lib/queries";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  getSalaryRequestsByOrganization,
  updateSalaryRequestStatus,
  type SalaryRequestWithDriverRow,
} from "@/services/salaryRequestsService";
import {
  getSharedLedgerNotifications,
  markSharedLedgerNotificationRead,
  type SharedLedgerNotificationRow,
} from "@/services/sharedLedgerNotificationsService";
import {
  approveConnectionRequest,
  cancelConnectionRequest,
  rejectConnectionRequest,
} from "@/services/connectionRequestsService";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { Command } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const springBounce = { damping: 14, stiffness: 400 };
const springSettle = { damping: 18, stiffness: 320 };

function sharedLedgerActionLabel(
  eventType: SharedLedgerNotificationRow["event_type"],
): string {
  if (eventType === "dispute_received") return "Review";
  if (eventType === "dispute_status_changed") return "Status";
  if (eventType === "pending_partner_followup") return "Follow up";
  if (eventType === "mismatch_detected") return "Compare";
  return "Fix";
}

function resolveSharedActionKind(
  eventType: SharedLedgerNotificationRow["event_type"],
  payload: Record<string, unknown>,
):
  | "review_dispute"
  | "raise_dispute"
  | "fix_records"
  | "compare_now"
  | "follow_up"
  | "view_status" {
  const explicit = typeof payload.cta_kind === "string" ? payload.cta_kind : "";
  if (
    explicit === "review_dispute" ||
    explicit === "raise_dispute" ||
    explicit === "fix_records" ||
    explicit === "compare_now" ||
    explicit === "follow_up" ||
    explicit === "view_status"
  ) {
    return explicit;
  }
  if (eventType === "dispute_received") return "review_dispute";
  if (eventType === "pending_partner_followup") return "follow_up";
  if (eventType === "mismatch_detected") return "compare_now";
  if (eventType === "partner_only_ghost") return "fix_records";
  return "view_status";
}

/** Wraps content with a pop-in animation when selected. */
function AnimatedTabIcon({
  selected,
  children,
}: {
  selected: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withSpring(1.15, springBounce),
        withSpring(1.05, springSettle),
      );
    } else {
      scale.value = withSpring(1, springSettle);
    }
  }, [selected]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        animatedStyle,
        styles.animatedIconWrap,
        Platform.OS === "web" && styles.animatedIconWrapWeb,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function AnimatedPress({
  children,
  style,
  onPress,
  activeOpacity = 0.9,
}: {
  children: React.ReactNode;
  style?: any;
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

function AnimatedNavPill({
  active,
  onPress,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onPress?: () => void;
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
  const router = useRouter();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const [notifTab, setNotifTab] = useState<"active" | "history">("active");
  const [inviteTab, setInviteTab] = useState<"received" | "sent">("received");
  const [salaryRequests, setSalaryRequests] = useState<SalaryRequestWithDriverRow[]>([]);
  const [sharedNotifications, setSharedNotifications] = useState<
    SharedLedgerNotificationRow[]
  >([]);
  const [notifActionId, setNotifActionId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const notificationsPopoverRootRef = useRef<any>(null);
  const invitationsPopoverRootRef = useRef<any>(null);
  const orgId = currentOrganization?.id ?? null;
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const pendingInvites = (receivedQ.data ?? []).filter((r) => r.status === "pending").length;
  const receivedInviteItems = useMemo(
    () =>
      (receivedQ.data ?? [])
        .filter((r) => r.status === "pending")
        .slice(0, 6)
        .map((r) => {
          const row = r as any;
          const reqClient = Boolean(row.request_shipper_client);
          const reqSupplier = Boolean(row.request_carrier_supplier);
          return {
            id: String(row.id ?? Math.random()),
            name:
              row.from_org_name ??
              row.requester_name ??
              row.from_party_name ??
              "Network user",
            type: reqClient && reqSupplier ? "CLIENT+SUPPLIER" : reqClient ? "CLIENT" : reqSupplier ? "SUPPLIER" : "PARTY",
          };
        }),
    [receivedQ.data]
  );
  const sentInviteItems = useMemo(
    () =>
      (sentQ.data ?? [])
        .filter((r) => r.status === "pending")
        .slice(0, 6)
        .map((r) => {
          const row = r as any;
          const reqClient = Boolean(row.request_shipper_client);
          const reqSupplier = Boolean(row.request_carrier_supplier);
          return {
            id: String(row.id ?? Math.random()),
            name:
              row.to_org_name ??
              row.receiver_name ??
              row.to_party_name ??
              "Network user",
            type: reqClient && reqSupplier ? "CLIENT+SUPPLIER" : reqClient ? "CLIENT" : reqSupplier ? "SUPPLIER" : "PARTY",
          };
        }),
    [sentQ.data]
  );

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
    let cancelled = false;
    const orgId = currentOrganization?.id ?? "";
    if (!orgId) {
      setNotificationCount(0);
      setSalaryRequests([]);
      return;
    }
    const loadNotificationCount = async () => {
      const [{ requests }, sharedRes] = await Promise.all([
        getSalaryRequestsByOrganization(orgId),
        getSharedLedgerNotifications(orgId, "all"),
      ]);
      if (cancelled) return;
      setSalaryRequests(requests);
      const sharedRows = sharedRes.notifications ?? [];
      setSharedNotifications(sharedRows);
      setNotificationCount(
        requests.filter((r) => r.status === "pending").length +
          sharedRows.filter((n) => n.status === "open").length,
      );
    };
    void loadNotificationCount();
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, activeTab]);
  const activeSalaryRequests = useMemo(
    () => salaryRequests.filter((r) => r.status === "pending"),
    [salaryRequests]
  );
  const historySalaryRequests = useMemo(
    () => salaryRequests.filter((r) => r.status !== "pending"),
    [salaryRequests]
  );
  const activeSharedNotifications = useMemo(
    () => sharedNotifications.filter((n) => n.status === "open"),
    [sharedNotifications],
  );
  const historySharedNotifications = useMemo(
    () => sharedNotifications.filter((n) => n.status !== "open"),
    [sharedNotifications],
  );
  const refreshSalaryRequests = async () => {
    if (!orgId) return;
    const [{ requests }, sharedRes] = await Promise.all([
      getSalaryRequestsByOrganization(orgId),
      getSharedLedgerNotifications(orgId, "all"),
    ]);
    setSalaryRequests(requests);
    const sharedRows = sharedRes.notifications ?? [];
    setSharedNotifications(sharedRows);
    setNotificationCount(
      requests.filter((r) => r.status === "pending").length +
        sharedRows.filter((n) => n.status === "open").length,
    );
  };
  const handleSalaryReject = async (requestId: string) => {
    setNotifActionId(requestId);
    const { error } = await updateSalaryRequestStatus(requestId, "rejected");
    setNotifActionId(null);
    if (!error) await refreshSalaryRequests();
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
        await markSharedLedgerNotificationRead(item.id, orgId);
        await refreshSalaryRequests();
      }
    },
    [orgId, refreshSalaryRequests, router],
  );
  const handleInviteAction = async (requestId: string, action: "approve" | "reject" | "cancel") => {
    if (!orgId) return;
    setInviteActionId(requestId);
    if (action === "approve") await approveConnectionRequest(requestId, orgId);
    if (action === "reject") await rejectConnectionRequest(requestId, orgId);
    if (action === "cancel") await cancelConnectionRequest(requestId);
    setInviteActionId(null);
    await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
  };

  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useLanguage();

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

  const dockBottom = insets.bottom;
  const verticalPad = Math.max(dockBottom / 4, 4);
  const bottomPad = verticalPad + 6;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inNotifications =
        !!notificationsPopoverRootRef.current &&
        typeof notificationsPopoverRootRef.current.contains === "function" &&
        notificationsPopoverRootRef.current.contains(target);
      const inInvitations =
        !!invitationsPopoverRootRef.current &&
        typeof invitationsPopoverRootRef.current.contains === "function" &&
        invitationsPopoverRootRef.current.contains(target);
      if (inNotifications || inInvitations) return;
      setShowNotifications(false);
      setShowInvitations(false);
    };
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown);
    };
  }, []);

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
        icon: "route",
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
      <View style={[styles.webTopShell, Platform.OS === "web" && ({ backdropFilter: "blur(24px)" } as any)]}>
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
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
              />
            ))}
          </View>

          <View style={styles.webUtilityWrap}>
            <View style={styles.webPopoverAnchor} ref={notificationsPopoverRootRef}>
              <AnimatedPress
                style={styles.webBellBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setShowNotifications((v) => !v);
                  setShowInvitations(false);
                }}
              >
                <FontAwesome5 name="bell" size={16} color="#64748b" />
                {notificationCount > 0 ? (
                  <View style={styles.webBellBadge}>
                    <Text style={styles.webBellBadgeText}>
                      {notificationCount > 9 ? "9+" : String(notificationCount)}
                    </Text>
                  </View>
                ) : null}
              </AnimatedPress>
              {showNotifications ? (
                <View style={styles.webPopoverCard}>
                  <View style={styles.webPopoverHeadDark}>
                    <Text style={styles.webPopoverHeadTitle}>Alert Registry</Text>
                  </View>
                  <View style={styles.webPopoverTabsWrap}>
                    <TouchableOpacity
                      style={[
                        styles.webPopoverTabBtn,
                        notifTab === "active" && styles.webPopoverTabBtnActive,
                      ]}
                      onPress={() => setNotifTab("active")}
                    >
                      <Text
                        style={[
                          styles.webPopoverTabBtnText,
                          notifTab === "active" && styles.webPopoverTabBtnTextActive,
                        ]}
                      >
                        ACTIVE
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.webPopoverTabBtn,
                        notifTab === "history" && styles.webPopoverTabBtnActive,
                      ]}
                      onPress={() => setNotifTab("history")}
                    >
                      <Text
                        style={[
                          styles.webPopoverTabBtnText,
                          notifTab === "history" && styles.webPopoverTabBtnTextActive,
                        ]}
                      >
                        HISTORY
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.webPopoverScroll}
                    contentContainerStyle={styles.webPopoverBody}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    {(notifTab === "active"
                      ? activeSalaryRequests.length + activeSharedNotifications.length
                      : historySalaryRequests.length + historySharedNotifications.length) === 0 ? (
                      <Text style={styles.webPopoverEmpty}>
                        {notifTab === "active" ? "No action required" : "No history yet"}
                      </Text>
                    ) : (
                      <>
                        {(notifTab === "active"
                          ? activeSharedNotifications
                          : historySharedNotifications
                        )
                          .map((item) => (
                            <View key={item.id} style={styles.webNotifRow}>
                              <View style={styles.webNotifLeft}>
                                <View style={styles.webNotifAvatar}>
                                  <Text style={styles.webNotifAvatarText}>SL</Text>
                                </View>
                                <View style={styles.webNotifTextWrap}>
                                  <Text style={styles.webNotifName} numberOfLines={1}>
                                    {item.title}
                                  </Text>
                                  <Text style={styles.webNotifMeta}>
                                    SHARED LEDGER ·{" "}
                                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                    })}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.webNotifRight}>
                                <Text style={styles.webNotifAmount}>
                                  {item.amount_meta != null && Number(item.amount_meta) > 0
                                    ? `₹${Number(item.amount_meta).toLocaleString("en-IN")}`
                                    : "—"}
                                </Text>
                                {notifTab === "active" ? (
                                  <View style={styles.webNotifActions}>
                                    <TouchableOpacity
                                      style={styles.webNotifRejectBtn}
                                      onPress={async () => {
                                        if (!orgId) return;
                                        await markSharedLedgerNotificationRead(item.id, orgId);
                                        await refreshSalaryRequests();
                                      }}
                                    >
                                      <Text style={styles.webNotifRejectBtnText}>Read</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.webNotifPayBtn}
                                      onPress={() => void handleSharedAction(item)}
                                    >
                                      <Text style={styles.webNotifPayBtnText}>
                                        {sharedLedgerActionLabel(item.event_type)}
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <Text style={styles.webNotifStatus}>
                                    {String(item.status ?? "").toUpperCase()}
                                  </Text>
                                )}
                              </View>
                            </View>
                          ))}
                        {(notifTab === "active" ? activeSalaryRequests : historySalaryRequests)
                          .map((req) => (
                          <View key={req.id} style={styles.webNotifRow}>
                            <View style={styles.webNotifLeft}>
                              <View style={styles.webNotifAvatar}>
                                <Text style={styles.webNotifAvatarText}>
                                  {(req.drivers?.name ?? "D").slice(0, 1).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.webNotifTextWrap}>
                                <Text style={styles.webNotifName} numberOfLines={1}>
                                  {req.drivers?.name ?? "Driver"} requested payment
                                </Text>
                                <Text style={styles.webNotifMeta}>
                                  {req.request_type.replace("_", "-")} · {new Date(req.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.webNotifRight}>
                              <Text style={styles.webNotifAmount}>{`₹${Number(req.amount ?? 0).toLocaleString("en-IN")}`}</Text>
                              {notifTab === "active" ? (
                                <View style={styles.webNotifActions}>
                                  <TouchableOpacity
                                    style={styles.webNotifRejectBtn}
                                    onPress={() => void handleSalaryReject(req.id)}
                                    disabled={notifActionId === req.id}
                                  >
                                    <Text style={styles.webNotifRejectBtnText}>Reject</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.webNotifPayBtn}
                                    onPress={() => openLedgerForSalaryPayment(req)}
                                  >
                                    <Text style={styles.webNotifPayBtnText}>Pay now</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <Text style={styles.webNotifStatus}>
                                  {String(req.status ?? "").toUpperCase()}
                                </Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </>
                    )}
                  </ScrollView>
                </View>
              ) : null}
            </View>
            <View style={styles.webPopoverAnchor} ref={invitationsPopoverRootRef}>
              <AnimatedPress
                style={styles.webBellBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setShowInvitations((v) => !v);
                  setShowNotifications(false);
                }}
              >
                <View style={styles.webInviteIconWrap}>
                  <FontAwesome5 name="inbox" size={15} color="#64748b" />
                  {pendingInvites > 0 ? <View style={styles.webInviteDot} /> : null}
                </View>
              </AnimatedPress>
              {showInvitations ? (
                <View style={[styles.webPopoverCard, styles.webInvitationPopoverCard]}>
                  <View style={styles.webPopoverHeadDark}>
                    <Text style={styles.webPopoverHeadTitle}>Inbound Protocol</Text>
                    <Text style={styles.webPopoverHeadBadge}>
                      {pendingInvites} pending
                    </Text>
                  </View>
                  <View style={styles.webPopoverTabsWrap}>
                    <TouchableOpacity
                      style={[
                        styles.webPopoverTabBtn,
                        inviteTab === "received" && styles.webPopoverTabBtnActive,
                      ]}
                      onPress={() => setInviteTab("received")}
                    >
                      <Text
                        style={[
                          styles.webPopoverTabBtnText,
                          inviteTab === "received" && styles.webPopoverTabBtnTextActive,
                        ]}
                      >
                        RECEIVED
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.webPopoverTabBtn,
                        inviteTab === "sent" && styles.webPopoverTabBtnActive,
                      ]}
                      onPress={() => setInviteTab("sent")}
                    >
                      <Text
                        style={[
                          styles.webPopoverTabBtnText,
                          inviteTab === "sent" && styles.webPopoverTabBtnTextActive,
                        ]}
                      >
                        SENT
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.webPopoverBody}>
                    {(inviteTab === "received" ? receivedInviteItems : sentInviteItems).length === 0 ? (
                      <Text style={styles.webPopoverEmpty}>No pending invitations</Text>
                    ) : (
                      (inviteTab === "received" ? receivedInviteItems : sentInviteItems).map((item) => (
                        <View key={item.id} style={styles.webInviteRow}>
                          <View style={styles.webInviteCode}>
                            <Text style={styles.webInviteCodeText}>
                              {item.name.slice(0, 2).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.webInviteTextWrap}>
                            <Text style={styles.webInviteName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.webInviteType}>{item.type}</Text>
                          </View>
                          {inviteTab === "received" ? (
                            <View style={styles.webInviteActionsInline}>
                              <TouchableOpacity
                                style={styles.webInviteGhostBtn}
                                onPress={() => void handleInviteAction(item.id, "reject")}
                                disabled={inviteActionId === item.id}
                              >
                                <Text style={styles.webInviteGhostBtnText}>Ignore</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.webInvitePrimaryBtn}
                                onPress={() => void handleInviteAction(item.id, "approve")}
                                disabled={inviteActionId === item.id}
                              >
                                <Text style={styles.webInvitePrimaryBtnText}>
                                  {inviteActionId === item.id ? "..." : "Accept"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.webInviteGhostBtn}
                              onPress={() => void handleInviteAction(item.id, "cancel")}
                              disabled={inviteActionId === item.id}
                            >
                              <Text style={styles.webInviteGhostBtnText}>
                                {inviteActionId === item.id ? "..." : "Recall"}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.webPopoverFooterBtn}
                    onPress={() => {
                      setShowInvitations(false);
                      router.push({
                        pathname: "/network",
                        params: { view: "requests", ts: String(Date.now()) },
                      } as never);
                    }}
                  >
                    <Text style={styles.webPopoverFooterBtnText}>Manage All Requests</Text>
                  </TouchableOpacity>
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
    );
  }

  return (
    <View
      style={[
        styles.footerWrap,
        { paddingTop: verticalPad, paddingBottom: bottomPad },
      ]}
    >
      <View style={[styles.mobileFooterRow, isCompactMobile && styles.mobileFooterRowCompact]}>
        <TouchableOpacity
          style={[styles.mobileEdgeBtn, isCompactMobile && styles.mobileEdgeBtnCompact]}
          activeOpacity={0.85}
          accessibilityLabel="Control hub"
          accessibilityRole="button"
        >
          <Command size={16} color="#ffffff" strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={[styles.glassDock, isCompactMobile && styles.glassDockCompact]}>
          <View style={styles.tabsRow}>
            {/* Column 1: Fiscal — pill behind when active */}
            <View style={styles.dockColumn}>
              <View
                style={[
                  styles.activePill,
                  isFiscal && styles.activePillVisible,
                ]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("finance")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isFiscal}>
                  <FontAwesome5
                    name="credit-card"
                    size={18}
                    color={isFiscal ? "#ffffff" : "#94a3b8"}
                    solid={isFiscal}
                  />
                  <Text style={[styles.dockLabel, isFiscal && styles.dockLabelActive]}>
                    {t("finance").toUpperCase()}
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>

            {/* Column 2: Trips — route icon (voyage/fleet) */}
            <View style={styles.dockColumn}>
              <View
                style={[styles.activePill, isTrips && styles.activePillVisible]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("trips")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isTrips}>
                  <FontAwesome5
                    name="route"
                    size={18}
                    color={isTrips ? "#ffffff" : "#94a3b8"}
                    solid={isTrips}
                  />
                  <Text style={[styles.dockLabel, isTrips && styles.dockLabelActive]}>
                    {t("trips").toUpperCase()}
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>

            {/* Column 3: Network */}
            <View style={styles.dockColumn}>
              <View
                style={[
                  styles.activePill,
                  isNetwork && styles.activePillVisible,
                ]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("network")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isNetwork}>
                  <FontAwesome5
                    name="users"
                    size={18}
                    color={isNetwork ? "#ffffff" : "#94a3b8"}
                    solid={isNetwork}
                  />
                  <Text style={[styles.dockLabel, isNetwork && styles.dockLabelActive]}>
                    {t("network").toUpperCase()}
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>

            {/* Column 4: Load Center */}
            <View style={styles.dockColumn}>
              <View
                style={[
                  styles.activePill,
                  isLoadCenter && styles.activePillVisible,
                ]}
              >
                <View style={styles.activePillAccent} />
              </View>
              <TouchableOpacity
                style={styles.dockButton}
                onPress={() => onTabChange("loadCenter")}
                activeOpacity={0.9}
                hitSlop={{
                  top: Layout.touchTargetHitSlop,
                  bottom: Layout.touchTargetHitSlop,
                  left: Layout.touchTargetHitSlop,
                  right: Layout.touchTargetHitSlop,
                }}
              >
                <AnimatedTabIcon selected={isLoadCenter}>
                  <FontAwesome5
                    name="truck-loading"
                    size={15}
                    color={
                      isLoadCenter ? Theme.textOnPrimary : Theme.textMutedDemo
                    }
                    solid={isLoadCenter}
                  />
                  <Text
                    style={[
                      styles.dockLabel,
                      styles.dockLabelCompact,
                      isLoadCenter && styles.dockLabelActive,
                    ]}
                  >
                    LOAD
                  </Text>
                </AnimatedTabIcon>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={onProfilePress}
          style={[styles.mobileProfileBtn, isCompactMobile && styles.mobileProfileBtnCompact]}
          activeOpacity={0.85}
          accessibilityLabel="Profile"
          accessibilityRole="button"
        >
          {profileAvatarUri ? (
            <Image
              source={{ uri: profileAvatarUri }}
              style={styles.mobileProfileAvatar}
            />
          ) : (
            <Text style={styles.mobileAvatarText}>{initials}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  animatedIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  animatedIconWrapWeb: {
    flexDirection: "column",
    gap: 3,
  },
  footerWrap: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "transparent",
    paddingHorizontal: 6,
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
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    position: "relative",
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
    fontWeight: "900",
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
    fontWeight: "900",
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
  },
  webPopoverTabBtnTextActive: {
    color: "#ffffff",
  },
  webPopoverScroll: {
    maxHeight: 360,
  },
  webPopoverBody: {
    padding: 10,
    gap: 8,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 10,
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
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  webNotifMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
  webNotifRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  webNotifAmount: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
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
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
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
  shellFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    paddingBottom: 8,
  },
  shellFooterBrand: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textMutedDemo,
  },
  shellFooterMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
});
