/**
 * Network tab: two sub-tabs — Manage Network (reference UI) and Load (Load Board).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { type IndentRow } from "@/features/indents";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import {
    useClientsQuery,
    useConnectionRequestsReceivedQuery,
    useConnectionRequestsSentQuery,
    useDriverInvitesSentQuery,
    useDriversQuery,
    useInvalidateNetwork,
    useSuppliersQuery,
} from "@/lib/queries";
import { useRefreshWithFeedback } from "@/lib/useRefreshWithFeedback";
import {
    approveConnectionRequest,
    createConnectionRequest,
    getConnectionInviteeByPhone,
    rejectConnectionRequest,
} from "@/services/connectionRequestsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { Building2, CircleCheck, Truck, User } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Platform,
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

type NetworkSegment = "ALL" | "SENT" | "RECEIVED";
type NodeKindFilter = "ALL" | "CLIENT" | "SUPPLIER" | "DRIVER";
type SubTab = "manage" | "load";

interface NetworkNode {
  id: string;
  name: string;
  type: "CLIENT" | "SUPPLIER" | "DRIVER";
  status: "INTEGRATED" | "PENDING" | "OFFLINE" | "DISCONNECTED";
  direction?: "SENT" | "RECEIVED";
  availableOnApp?: boolean;
  isIntegrated: boolean;
  phone?: string | null;
}

type RequestKind =
  | "CLIENT"
  | "SUPPLIER"
  | "CLIENT_AND_SUPPLIER"
  | "DRIVER_INVITE";
interface RequestItem {
  id: string;
  type: "RECEIVED" | "SENT";
  kind: RequestKind;
  from_org_name: string;
  to_org_name: string;
  status: string;
  created_at: string;
  row?: import("@/services/connectionRequestsService").ConnectionRequestRow;
}

function requestKind(row: RequestItem["row"]): RequestKind {
  if (!row) return "CLIENT";
  if (row.request_shipper_client && row.request_carrier_supplier)
    return "CLIENT_AND_SUPPLIER";
  if (row.request_shipper_client) return "CLIENT";
  return "SUPPLIER";
}

function toRequestItems(
  received: RequestItem["row"][],
  sent: RequestItem["row"][],
  driverInvites: {
    id: string;
    from_org_name: string | null;
    driver_name: string | null;
    status: string;
    created_at: string;
  }[],
): RequestItem[] {
  const items: RequestItem[] = [];
  received.forEach((row) => {
    if (!row) return;
    items.push({
      id: row.id,
      type: "RECEIVED",
      kind: requestKind(row),
      from_org_name: row.from_org_name ?? "Unknown",
      to_org_name: row.to_org_name ?? "Unknown",
      status: row.status,
      created_at: row.created_at,
      row,
    });
  });
  sent.forEach((row) => {
    if (!row) return;
    items.push({
      id: row.id,
      type: "SENT",
      kind: requestKind(row),
      from_org_name: row.from_org_name ?? "Unknown",
      to_org_name: row.to_org_name ?? "Unknown",
      status: row.status,
      created_at: row.created_at,
      row,
    });
  });
  driverInvites.forEach((d) => {
    items.push({
      id: d.id,
      type: "SENT",
      kind: "DRIVER_INVITE",
      from_org_name: d.from_org_name ?? "Unknown",
      // For driver-invite "sent" requests we display the invitee's name in the card.
      to_org_name: d.driver_name ?? "Driver",
      status: d.status,
      created_at: d.created_at,
    });
  });
  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return items;
}

const EMERALD = "#10b981";
const ROSE_500 = "#f43f5e";

function formatRequestStatus(status: string): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "UNKNOWN";
  if (normalized === "approved") return "APPROVED";
  if (normalized === "rejected") return "REJECTED";
  if (normalized === "pending") return "PENDING";
  return normalized.replace(/_/g, " ").toUpperCase();
}

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [subTab, setSubTab] = useState<SubTab>("manage");
  const [segment, setSegment] = useState<NetworkSegment>("ALL");
  const [nodeKind, setNodeKind] = useState<NodeKindFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const syncToastOpacity = useRef(new Animated.Value(0)).current;
  const syncToastTranslate = useRef(new Animated.Value(-16)).current;

  const triggerSyncToast = useCallback(() => {
    setShowSuccess(true);
    syncToastOpacity.setValue(0);
    syncToastTranslate.setValue(-16);
    Animated.parallel([
      Animated.spring(syncToastOpacity, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
      }),
      Animated.spring(syncToastTranslate, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(syncToastOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(syncToastTranslate, {
            toValue: -16,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => setShowSuccess(false));
      }, 1200);
    });
  }, [syncToastOpacity, syncToastTranslate]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [sendingNodeId, setSendingNodeId] = useState<string | null>(null);

  const {
    data: clients = [],
    isPending: clientsLoading,
    refetch: refetchClients,
  } = useClientsQuery(orgId);
  const {
    data: suppliers = [],
    isPending: suppliersLoading,
    refetch: refetchSuppliers,
  } = useSuppliersQuery(orgId);
  const {
    data: drivers = [],
    isPending: driversLoading,
    refetch: refetchDrivers,
  } = useDriversQuery(orgId);
  const {
    data: received = [],
    isPending: recLoading,
    refetch: refetchReceived,
  } = useConnectionRequestsReceivedQuery(orgId);
  const { data: sent = [], refetch: refetchSent } =
    useConnectionRequestsSentQuery(orgId);
  const { data: driverInvites = [], refetch: refetchDriverInvites } =
    useDriverInvitesSentQuery(orgId);

  const nodes = useMemo((): NetworkNode[] => {
    const list: NetworkNode[] = [];
    clients.forEach((c) => {
      const row = c as {
        linked_organization_id?: string | null;
        is_integrated?: boolean;
        phone?: string | null;
      };
      const isIntegrated = Boolean(
        row.is_integrated ?? row.linked_organization_id,
      );
      list.push({
        id: c.id,
        name: (c.name || c.contact_person || "Unnamed").toUpperCase(),
        type: "CLIENT",
        status: "INTEGRATED",
        availableOnApp: Boolean(
          row.linked_organization_id ?? row.is_integrated,
        ),
        isIntegrated,
        phone: row.phone ?? (c as { phone?: string }).phone ?? null,
      });
    });
    suppliers.forEach((s) => {
      const row = s as {
        linked_organization_id?: string | null;
        supplier_type?: string;
        phone?: string | null;
      };
      const isIntegrated =
        row.supplier_type === "integrated" ||
        Boolean(row.linked_organization_id);
      list.push({
        id: s.id,
        name: (
          s.name ||
          s.company_name ||
          s.contact_person ||
          "Unnamed"
        ).toUpperCase(),
        type: "SUPPLIER",
        status: "INTEGRATED",
        availableOnApp: Boolean(row.linked_organization_id),
        isIntegrated,
        phone: row.phone ?? (s as { phone?: string }).phone ?? null,
      });
    });
    drivers.forEach((d) => {
      const leftAt = (d as { left_at?: string | null }).left_at;
      const isDisconnected = leftAt != null && leftAt !== "";
      list.push({
        id: d.id,
        name: (d.name || "Unnamed").toUpperCase(),
        type: "DRIVER",
        status: isDisconnected ? "DISCONNECTED" : "INTEGRATED",
        availableOnApp: !isDisconnected,
        isIntegrated: !isDisconnected,
      });
    });
    return list;
  }, [clients, suppliers, drivers]);

  const requestItems = useMemo(
    () => toRequestItems(received, sent, driverInvites),
    [received, sent, driverInvites],
  );

  const loading = clientsLoading || suppliersLoading || driversLoading;
  const loadingRequests = recLoading;
  const invalidateNetwork = useInvalidateNetwork(orgId);

  const refetchAll = useCallback(
    () =>
      Promise.all([
        refetchClients(),
        refetchSuppliers(),
        refetchDrivers(),
        refetchReceived(),
        refetchSent(),
        refetchDriverInvites(),
      ]),
    [
      refetchClients,
      refetchSuppliers,
      refetchDrivers,
      refetchReceived,
      refetchSent,
      refetchDriverInvites,
    ],
  );
  const { refreshing, onRefresh } = useRefreshWithFeedback(refetchAll);

  const handleApprove = async (requestId: string) => {
    setActionError(null);
    setActingRequestId(requestId);
    const { error } = await approveConnectionRequest(requestId);
    setActingRequestId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    invalidateNetwork();
    triggerSyncToast();
  };

  const handleReject = async (requestId: string) => {
    setActionError(null);
    setActingRequestId(requestId);
    const { error } = await rejectConnectionRequest(requestId);
    setActingRequestId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    invalidateNetwork();
    triggerSyncToast();
  };

  const handleSendInviteOrRequest = useCallback(
    async (node: NetworkNode) => {
      if (!orgId) {
        setActionError("No organization loaded.");
        return;
      }
      setActionError(null);
      setSendingNodeId(node.id);
      try {
        const phone = (node.phone ?? "").trim().replace(/\s+/g, "");
        const isClientOrSupplier =
          node.type === "CLIENT" || node.type === "SUPPLIER";
        if (isClientOrSupplier && phone.length >= 8) {
          const { error: lookupErr, invitee } =
            await getConnectionInviteeByPhone(phone);
          if (!lookupErr && invitee) {
            const { error: createErr } = await createConnectionRequest(
              orgId,
              invitee.organization_id,
              {
                requestShipperClient: node.type === "CLIENT",
                requestCarrierSupplier: node.type === "SUPPLIER",
              },
            );
            invalidateNetwork();
            setSendingNodeId(null);
            if (createErr) {
              setActionError(createErr.message);
              return;
            }
            triggerSyncToast();
            return;
          }
        }
        await Share.share({
          message:
            "Join me on Q to sync our ledger and manage trips. Download the Q app.",
          title: "Invite to Q",
        });
      } catch {
        // ignore
      } finally {
        setSendingNodeId(null);
      }
    },
    [orgId, invalidateNetwork],
  );

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return nodes.filter((n) => {
      const matchesSearch =
        !q ||
        n.name.toLowerCase().includes(q) ||
        (n.type === "CLIENT" && "client".includes(q)) ||
        (n.type === "SUPPLIER" && "supplier".includes(q)) ||
        (n.type === "DRIVER" && "driver".includes(q));
      if (!matchesSearch) return false;
      if (nodeKind !== "ALL" && n.type !== nodeKind) return false;
      return true;
    });
  }, [nodes, nodeKind, searchQuery]);

  const filteredRequests = useMemo(() => {
    return requestItems.filter((item) => {
      if (segment === "SENT" && item.type !== "SENT") return false;
      if (segment === "RECEIVED" && item.type !== "RECEIVED") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const displayName =
        item.type === "RECEIVED" ? item.from_org_name : item.to_org_name;
      return (displayName ?? "").toLowerCase().includes(q);
    });
  }, [requestItems, searchQuery, segment]);

  const pendingRequestCount = requestItems.filter(
    (item) => item.type === "RECEIVED" && item.status === "pending",
  ).length;

  const handleAddPress = useCallback(() => {
    if (segment !== "ALL") return;
    if (nodeKind === "CLIENT") router.push("/(modals)/add-client");
    else if (nodeKind === "SUPPLIER") router.push("/(modals)/add-supplier");
    else if (nodeKind === "DRIVER") router.push("/(modals)/add-driver");
  }, [router, segment, nodeKind]);

  if (subTab === "load") {
    return (
      <View
        style={[styles.container, { backgroundColor: Theme.darkBackground, paddingTop: insets.top + Layout.tabBarHeight + 20 }]}
      >
        <View
          style={[
            styles.blackBlock,
            styles.blackBlockLoad,
            { paddingTop: 12 },
          ]}
        >
          <View style={styles.darkHeaderRow}>
            <View style={styles.darkHeaderLeft}>
              <View style={styles.darkHeaderTitleWrap}>
                <Text style={styles.darkHeaderTitle}>NETWORK HUB</Text>
                <Text style={styles.darkHeaderSubtitle}>Managing Partners</Text>
              </View>
            </View>
            <View style={styles.darkHeaderRight}>
              <View style={styles.bellWrap}>
                <FontAwesome
                  name="bell"
                  size={18}
                  color={Theme.textOnDarkMuted}
                />
              </View>
              <TouchableOpacity
                style={styles.avatarBtn}
                onPress={() => router.push("/(tabs)/profile")}
                activeOpacity={0.8}
              >
                <FontAwesome
                  name="user"
                  size={16}
                  color={Theme.textOnDarkMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.mainTabRow}>
            <TouchableOpacity
              style={styles.mainTab}
              onPress={() => setSubTab("manage")}
              activeOpacity={0.8}
            >
              <Text style={styles.mainTabText}>Manage Network</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mainTab, styles.mainTabActive]}
              onPress={() => setSubTab("load")}
              activeOpacity={0.8}
            >
              <Text style={[styles.mainTabText, styles.mainTabTextActive]}>
                Load
              </Text>
              <View style={styles.mainTabUnderline} />
            </TouchableOpacity>
          </View>
        </View>
        <LoadCenterView
          contentTopPadding={0}
          onCreateIndentPress={() =>
            router.push("/create-indent" as import("expo-router").Href)
          }
          onIndentPress={(indent: IndentRow) =>
            router.push(`/indent/${indent.id}` as import("expo-router").Href)
          }
        />
      </View>
    );
  }

  const MANAGE_CONTENT_BG = "#f4f5f7";

  return (
    <View style={[styles.container, { backgroundColor: Theme.darkBackground, paddingTop: insets.top + Layout.tabBarHeight + 20 }]}>
      {/* Sync toast — small animated pill, non-blocking */}
      {showSuccess && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.syncToast,
            {
              top: insets.top + 12,
              opacity: syncToastOpacity,
              transform: [{ translateY: syncToastTranslate }],
            },
          ]}
        >
          <View style={styles.syncToastIcon}>
            <FontAwesome name="check" size={11} color="#fff" />
          </View>
          <Text style={styles.syncToastText}>Sync complete</Text>
        </Animated.View>
      )}

      {/* Single black block: title, Manage|Load tabs, segment tabs, search (finance-style) */}
      <View style={[styles.blackBlock, { paddingTop: 12 }]}>
        <View style={styles.darkHeaderRow}>
          <View style={styles.darkHeaderLeft}>
            <View style={styles.darkHeaderTitleWrap}>
              <Text style={styles.darkHeaderTitle}>NETWORK HUB</Text>
              <Text style={styles.darkHeaderSubtitle}>Managing Partners</Text>
            </View>
          </View>
          <View style={styles.darkHeaderRight}>
            <View style={styles.bellWrap}>
              <FontAwesome
                name="bell"
                size={18}
                color={Theme.textOnDarkMuted}
              />
              {pendingRequestCount > 0 && <View style={styles.bellBadge} />}
            </View>
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => router.push("/(tabs)/profile")}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="user"
                size={16}
                color={Theme.textOnDarkMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Manage Network | Load — black tabs (body), Load-style */}
        <View style={styles.mainTabRow}>
          <TouchableOpacity
            style={[styles.mainTab, styles.mainTabActive]}
            onPress={() => setSubTab("manage")}
            activeOpacity={0.8}
          >
            <Text style={[styles.mainTabText, styles.mainTabTextActive]}>
              Manage Network
            </Text>
            <View style={styles.mainTabUnderline} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mainTab}
            onPress={() => setSubTab("load")}
            activeOpacity={0.8}
          >
            <Text style={styles.mainTabText}>Load</Text>
          </TouchableOpacity>
        </View>

        {/* Segment tabs: All, Sent, Received + add contact — Load-style ScrollView */}
        <View style={styles.filterHeaderRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterScrollContent}
          >
            {(["ALL", "SENT", "RECEIVED"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setSegment(tab)}
                style={styles.filterTab}
                activeOpacity={0.8}
              >
                <View style={styles.filterTabLabelRow}>
                  <Text
                    style={[
                      styles.filterTabText,
                      segment === tab && styles.filterTabTextActive,
                    ]}
                  >
                    {tab}
                  </Text>
                  {tab === "RECEIVED" && pendingRequestCount > 0 && (
                    <View
                      style={[
                        styles.filterTabBadge,
                        segment === tab && styles.filterTabBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterTabBadgeText,
                          segment === tab && styles.filterTabBadgeTextActive,
                        ]}
                      >
                        {pendingRequestCount}
                      </Text>
                    </View>
                  )}
                </View>
                {segment === tab && <View style={styles.filterTabUnderline} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          {segment === "ALL" &&
          (nodeKind === "CLIENT" ||
            nodeKind === "SUPPLIER" ||
            nodeKind === "DRIVER") ? (
            <TouchableOpacity
              style={styles.filterAddBtn}
              onPress={handleAddPress}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="user-plus"
                size={14}
                color={Theme.textOnDark}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Search + Type filter — inside black block */}
        <View style={styles.searchRowDark}>
          <View style={styles.searchWrapDark}>
            <FontAwesome
              name="search"
              size={14}
              color={Theme.textOnDarkMuted}
              style={styles.searchIconDark}
            />
            <TextInput
              style={styles.searchInputDark}
              placeholder="Find by name..."
              placeholderTextColor={Theme.textOnDarkMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.typeFilterWrapDark}>
            {(["ALL", "CLIENT", "SUPPLIER", "DRIVER"] as const).map((kind) => (
              <TouchableOpacity
                key={kind}
                style={[
                  styles.typeFilterChipDark,
                  nodeKind === kind && styles.typeFilterChipDarkActive,
                ]}
                onPress={() => setNodeKind(kind)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.typeFilterChipTextDark,
                    nodeKind === kind && styles.typeFilterChipTextDarkActive,
                  ]}
                >
                  {kind === "ALL"
                    ? "All"
                    : kind.charAt(0) + kind.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {actionError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {actionError}
          </Text>
          <TouchableOpacity onPress={() => setActionError(null)} hitSlop={12}>
            <Text style={styles.errorBannerDismiss}>{t("dismiss")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Content area: rounded top, light bg — Load-style layout */}
      <View
        style={[
          styles.manageContentWrap,
          { backgroundColor: MANAGE_CONTENT_BG },
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + Layout.tabBarHeight + insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          }
        >
          {segment !== "ALL" ? (
            loadingRequests ? (
              <Text style={styles.loadingText}>{t("loadingRequests")}</Text>
            ) : filteredRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome name="users" size={48} color={Theme.textMuted} />
                <Text style={styles.emptyStateText}>Empty Registry</Text>
              </View>
            ) : (
              filteredRequests.map((item) => {
                const displayName =
                  item.type === "RECEIVED"
                    ? item.from_org_name
                    : item.to_org_name;
                const isReceivedPending =
                  item.type === "RECEIVED" && item.status === "pending";
                return (
                  <View key={item.id} style={styles.nodeCard}>
                    <View style={styles.nodeCardLeft}>
                      <View
                        style={[styles.nodeIconWrap, styles.nodeIconWrapMuted]}
                      >
                        <Building2
                          size={18}
                          strokeWidth={1.5}
                          color={Theme.iconSecondary}
                        />
                      </View>
                      <View style={styles.nodeCardText}>
                        <Text style={styles.nodeName} numberOfLines={1}>
                          {displayName}
                        </Text>
                        <Text style={styles.nodeMeta}>
                          {item.kind.replace("_", " + ")} •{" "}
                          {item.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {isReceivedPending && item.row ? (
                      <View style={styles.nodeActions}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => handleApprove(item.id)}
                          disabled={actingRequestId === item.id}
                          activeOpacity={0.8}
                        >
                          {actingRequestId === item.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <FontAwesome
                              name="user-plus"
                              size={14}
                              color="#fff"
                            />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rejectBtn}
                          onPress={() => handleReject(item.id)}
                          disabled={actingRequestId === item.id}
                          activeOpacity={0.8}
                        >
                          <FontAwesome
                            name="close"
                            size={14}
                            color={ROSE_500}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.pendingPill}>
                        <Text style={styles.pendingPillText}>
                          {formatRequestStatus(item.status)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )
          ) : loading ? (
            <Text style={styles.loadingText}>Loading…</Text>
          ) : filteredNodes.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="users" size={48} color={Theme.textMuted} />
              <Text style={styles.emptyStateText}>Empty Registry</Text>
            </View>
          ) : (
            filteredNodes.map((node) => {
              const onPlatform = node.availableOnApp ?? node.isIntegrated;
              return (
                <View key={node.id} style={styles.nodeCard}>
                  <TouchableOpacity
                    style={styles.nodeCardLeft}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (node.type === "CLIENT")
                        router.push(`/client/${node.id}`);
                      else if (node.type === "SUPPLIER")
                        router.push(`/supplier/${node.id}`);
                      else if (node.type === "DRIVER")
                        router.push(`/driver/${node.id}`);
                    }}
                  >
                    <View
                      style={[
                        styles.nodeIconWrap,
                        onPlatform
                          ? styles.nodeIconWrapActive
                          : styles.nodeIconWrapMuted,
                      ]}
                    >
                      {node.type === "DRIVER" ? (
                        <User
                          size={18}
                          strokeWidth={1.5}
                          color={
                            onPlatform ? Theme.darkGreen : Theme.iconSecondary
                          }
                        />
                      ) : node.type === "SUPPLIER" ? (
                        <Truck
                          size={18}
                          strokeWidth={1.5}
                          color={
                            onPlatform ? Theme.darkGreen : Theme.iconSecondary
                          }
                        />
                      ) : (
                        <Building2
                          size={18}
                          strokeWidth={1.5}
                          color={
                            onPlatform ? Theme.darkGreen : Theme.iconSecondary
                          }
                        />
                      )}
                      <View
                        style={[
                          styles.connectionDot,
                          onPlatform
                            ? styles.connectionDotActive
                            : styles.connectionDotMuted,
                        ]}
                      />
                    </View>
                    <View style={styles.nodeCardText}>
                      <Text style={styles.nodeName} numberOfLines={1}>
                        {node.name}
                      </Text>
                      <Text style={styles.nodeMeta}>
                        {node.type} • {onPlatform ? "ON APP" : "OFF-GRID"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.nodeActions}>
                    {node.status === "INTEGRATED" &&
                    node.availableOnApp !== false ? (
                      <View style={styles.activePill}>
                        <CircleCheck
                          size={12}
                          strokeWidth={1.7}
                          color={Theme.darkGreen}
                          style={{ marginRight: 5 }}
                        />
                        <Text style={styles.activePillText}>Active</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.connectBtn,
                          !onPlatform && styles.inviteBtn,
                        ]}
                        onPress={() => handleSendInviteOrRequest(node)}
                        disabled={sendingNodeId === node.id}
                        activeOpacity={0.8}
                      >
                        {sendingNodeId === node.id ? (
                          <ActivityIndicator
                            size="small"
                            color={
                              onPlatform
                                ? Theme.textOnPrimary
                                : Theme.textPrimaryDark
                            }
                          />
                        ) : (
                          <Text
                            style={[
                              styles.connectBtnText,
                              !onPlatform && styles.inviteBtnText,
                            ]}
                          >
                            {onPlatform ? "Connect" : "Invite"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Add screens are full-screen routes to ensure exact parity. */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  blackBlock: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  blackBlockLoad: {
    paddingBottom: 0,
  },
  manageContentWrap: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    overflow: "hidden",
  },
  darkHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  darkHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  darkHeaderTitleWrap: {},
  darkHeaderTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2,
    color: Theme.textOnDark,
    textTransform: "uppercase",
  },
  darkHeaderSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 4,
    fontStyle: "italic",
  },
  darkHeaderRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  bellWrap: { position: "relative" },
  bellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ROSE_500,
    borderWidth: 2,
    borderColor: Theme.darkBackground,
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterScroll: {
    maxHeight: 36,
    flex: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  filterScrollContent: {
    paddingLeft: 4,
    paddingRight: 24,
    gap: 16,
    flexGrow: 0,
  },
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  filterTab: {
    position: "relative" as const,
    paddingVertical: 8,
    marginRight: 6,
  },
  filterTabLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  filterTabText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  filterTabTextActive: { color: Theme.textOnDark },
  filterTabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterTabBadgeActive: {
    backgroundColor: Theme.darkSurface,
  },
  filterTabBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textAlign: "center",
  },
  filterTabBadgeTextActive: {
    color: Theme.textOnDark,
  },
  filterTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Theme.teslaRed,
  },
  filterAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(248,250,252,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  mainTabRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  mainTab: { position: "relative" as const, paddingVertical: 8 },
  mainTabActive: {},
  mainTabText: {
    fontSize: 8,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: Theme.textOnDarkMuted,
  },
  mainTabTextActive: { color: Theme.textOnDark },
  mainTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Theme.teslaRed,
  },
  searchRowDark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  searchWrapDark: {
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
  searchIconDark: { marginRight: 6 },
  searchInputDark: {
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
  typeFilterWrapDark: {
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
  typeFilterChipDark: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  typeFilterChipDarkActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  typeFilterChipTextDark: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typeFilterChipTextDarkActive: {
    color: Theme.textOnDark,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  typeFilterWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  typeFilterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeFilterChipActive: {
    backgroundColor: Theme.surfaceGray,
  },
  typeFilterChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  typeFilterChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: Theme.negative,
    padding: 12,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: Theme.negative,
    marginRight: 8,
  },
  errorBannerDismiss: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.negative,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
  },
  loadingText: { padding: 24, textAlign: "center", color: Theme.textSecondary },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 16,
  },
  nodeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: "transparent",
  },
  nodeCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minWidth: 0,
  },
  nodeIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeIconWrapActive: { backgroundColor: "transparent" },
  nodeIconWrapMuted: { backgroundColor: Theme.surface },
  connectedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: EMERALD,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionDot: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 12,
    height: 12,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  connectionDotActive: {
    backgroundColor: EMERALD,
  },
  connectionDotMuted: {
    backgroundColor: Theme.textSecondary,
  },
  nodeCardText: { flex: 1, minWidth: 0 },
  nodeName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  nodeMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginTop: 3,
  },
  nodeActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: EMERALD,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(244,63,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  pendingPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  connectBtn: {
    minWidth: 92,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: Theme.darkBackground,
  },
  connectBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  inviteBtn: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  inviteBtnText: { color: "#cbd5e1" },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 92,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  syncToast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 7,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  syncToastIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: EMERALD,
    alignItems: "center",
    justifyContent: "center",
  },
  syncToastText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  modalKeyboard: { width: "100%" },
  addModalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  addModalHandle: {
    width: 48,
    height: 4,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  addModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  addModalForm: { gap: 20 },
  addModalLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontStyle: "italic",
  },
  addModalInput: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: Theme.textPrimaryDark,
  },
  addModalInputText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  addModalRow: { flexDirection: "row", gap: 16 },
  addModalField: { flex: 1 },
  addModalSubmit: {
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  addModalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});
