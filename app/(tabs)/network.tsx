/**
 * Network tab: two sub-tabs — My Network (reference UI) and Load (Load Board).
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getLinkedOrgProfile } from "@/features/clients/services/clients.service";
import {
  cancelDriverInvite,
  getDriverInviteeByPhone,
  getDriverProfileDisplay,
  inviteDriver,
} from "@/features/drivers/services/drivers.service";
import { type IndentRow } from "@/features/indents";
import { LoadCenterView } from "@/features/network/components/LoadCenterView";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { normalizePhoneForInviteeLookup } from "@/lib/phoneLookup";
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
  cancelConnectionRequest,
  createConnectionRequest,
  getConnectionInviteeByPhone,
  getConnectionInviteesByPhones,
  rejectConnectionRequest,
} from "@/services/connectionRequestsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  CheckCircle2,
  CircleCheck,
  Clock3,
  Handshake,
  Info,
  Truck,
  User,
  UserPlus,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getInitials } from "@/lib/stringUtils";

type InvitationSegment = "SENT" | "RECEIVED";
type ManageView = "CONNECTIONS" | "INVITATIONS";
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
  linked_organization_id?: string | null;
  user_id?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
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
  nodeInfo?: Partial<NetworkNode>;
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
    to_user_id?: string | null;
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
        nodeInfo: {
          id: row.from_organization_id,
          type: requestKind(row) === "CLIENT" ? "CLIENT" : requestKind(row) === "SUPPLIER" ? "SUPPLIER" : "CLIENT", // default or handle mixed
          name: row.from_org_name ?? "Unknown",
          isIntegrated: true,
          status: "PENDING",
          linked_organization_id: row.from_organization_id // Needed for lazy fetching
        }
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
        nodeInfo: {
          id: row.to_organization_id,
          type: requestKind(row) === "CLIENT" ? "CLIENT" : requestKind(row) === "SUPPLIER" ? "SUPPLIER" : "CLIENT", // default or handle mixed
          name: row.to_org_name ?? "Unknown",
          isIntegrated: true,
          status: "PENDING",
          linked_organization_id: row.to_organization_id // Needed for lazy fetching
        }
      });
    });
    driverInvites.forEach((d) => {
      items.push({
        id: d.id,
        type: "SENT",
        kind: "DRIVER_INVITE",
        from_org_name: d.from_org_name ?? "Unknown",
        to_org_name: d.driver_name ?? "Driver",
        status: d.status,
        created_at: d.created_at,
        nodeInfo: {
          type: "DRIVER",
          id: d.to_user_id || d.id, // Fallback to invite id
          name: d.driver_name ?? "Driver",
          isIntegrated: true,
          status: "PENDING"
        }
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
/** Trip card primary title color (matches TripExpandableCard). */
const TESLA_BLACK = "#171A20";
/** Manage list panel — original light body (matches pre–dark-list Network). */
const MANAGE_CONTENT_BG = "#f4f5f7";

function formatRequestStatus(status: string): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "UNKNOWN";
  if (normalized === "approved") return "APPROVED";
  if (normalized === "rejected") return "REJECTED";
  if (normalized === "pending") return "PENDING";
  return normalized.replace(/_/g, " ").toUpperCase();
}

function normalizeRequestStatus(status: string): string {
  return (status ?? "").trim().toLowerCase();
}

function getDriverFallbackSeed(id: string): string {
  const value = (id ?? "").trim();
  if (!value) return "driver-1";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash + value.charCodeAt(i)) % 10;
  }
  return `driver-${hash + 1}`;
}

function NetworkAvatar({
  node,
  onPlatform,
  frameSize,
}: {
  node: NetworkNode;
  onPlatform: boolean;
  /** When set, avatar is cropped to a circle of this diameter (hero / stories). */
  frameSize?: number;
}) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let avatarUrl = "";
      let avatarSeed = "";

      // 1. Layer: Check if profile data is already in the node (from optimized bulk fetch)
      if (node.avatar_url || node.avatar_seed) {
        avatarUrl = node.avatar_url || "";
        avatarSeed = node.avatar_seed || "";
      } else if (node.isIntegrated) {
        // 2. Layer: Lazy-fetch if bulk fetch didn't provide it
        try {
          if (node.type === "DRIVER") {
            const { profile } = await getDriverProfileDisplay(node.id);
            if (profile) {
              avatarUrl = profile.avatarUrl || "";
              avatarSeed = profile.avatarSeed || "";
            }
          } else if (node.linked_organization_id) {
            const { profile } = await getLinkedOrgProfile(node.linked_organization_id);
            if (profile) {
              avatarUrl = profile.avatarUrl || "";
              avatarSeed = profile.avatarSeed || "";
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('[NetworkAvatar] Lazy fetch failed:', e);
        }
      }

      if (!mounted) return;

      if (avatarUrl?.startsWith("http")) {
        setUri(avatarUrl);
        return;
      }

      if (avatarUrl?.trim()) {
        const signed = await getSignedAvatarUrl(avatarUrl.trim());
        if (mounted) setUri(signed);
        return;
      }

      if (avatarSeed) {
        const preset =
          node.type === "DRIVER"
            ? getAvatarUriForSeed(avatarSeed)
            : getUser2DAvatarUriForSeed(avatarSeed);
        if (mounted) setUri(preset);
        return;
      }

      if (node.type === "DRIVER") {
        if (mounted) setUri(getAvatarUriForSeed(getDriverFallbackSeed(node.id)));
        return;
      }

      setUri(null);
    })();
    return () => {
      mounted = false;
    };
  }, [
    node.id,
    node.isIntegrated,
    node.type,
    node.linked_organization_id,
    node.avatar_url,
    node.avatar_seed,
  ]);

  const iconSize = frameSize ? Math.round(frameSize * 0.4) : 18;
  const initials = getInitials(node.name);
  const fallbackColor = onPlatform ? Theme.darkGreen : Theme.iconSecondary;

  if (uri) {
    const inner = frameSize ? frameSize - 4 : undefined;
    return (
      <View
        style={[
          styles.nodeAvatarWrap,
          frameSize
            ? {
                width: frameSize,
                height: frameSize,
                borderRadius: frameSize / 2,
                borderWidth: 2,
                borderColor: Theme.primary,
                padding: 2,
                backgroundColor: Theme.screenBackground,
              }
            : null,
        ]}
      >
        <Image
          source={{ uri }}
          style={[
            styles.nodeAvatar,
            inner
              ? {
                  width: inner,
                  height: inner,
                  borderRadius: inner / 2,
                }
              : null,
          ]}
        />
        {node.type === "DRIVER" ? (
          <View style={styles.driverIconBadge}>
            <User size={10} strokeWidth={2} color={Theme.textOnPrimary} />
          </View>
        ) : null}
      </View>
    );
  }

  // If no avatar found but on platform, we could show a more "active" default icon
  // but for now we'll stick to the themed icons.
  const iconWrap =
    frameSize != null ? (
      <View
        style={{
          width: frameSize,
          height: frameSize,
          borderRadius: frameSize / 2,
          borderWidth: 2,
          borderColor: Theme.primary,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Theme.surface,
        }}
      >
        {initials ? (
          <Text
            style={[
              styles.avatarInitials,
              {
                fontSize: Math.max(12, Math.round(frameSize * 0.32)),
                color: fallbackColor,
              },
            ]}
            numberOfLines={1}
          >
            {initials}
          </Text>
        ) : node.type === "DRIVER" ? (
          <User size={iconSize} strokeWidth={1.5} color={fallbackColor} />
        ) : node.type === "SUPPLIER" ? (
          <Truck size={iconSize} strokeWidth={1.5} color={fallbackColor} />
        ) : (
          <Building2 size={iconSize} strokeWidth={1.5} color={fallbackColor} />
        )}
      </View>
    ) : null;

  if (iconWrap) return iconWrap;

  if (initials) {
    return (
      <View style={styles.networkFallbackAvatar}>
        <Text style={[styles.avatarInitialsSmall, { color: fallbackColor }]}>
          {initials}
        </Text>
      </View>
    );
  }

  if (node.type === "DRIVER") {
    return (
      <User
        size={18}
        strokeWidth={1.5}
        color={fallbackColor}
      />
    );
  }
  if (node.type === "SUPPLIER") {
    return (
      <Truck
        size={18}
        strokeWidth={1.5}
        color={fallbackColor}
      />
    );
  }
  return (
    <Building2
      size={18}
      strokeWidth={1.5}
      color={fallbackColor}
    />
  );
}

function shortRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = Date.now() - t;
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

function requestPreviewRole(kind: RequestKind): string {
  if (kind === "DRIVER_INVITE") return "Driver invite";
  if (kind === "CLIENT") return "Add as client";
  if (kind === "SUPPLIER") return "Add as supplier";
  return "Add as client + supplier";
}

export default function NetworkScreen() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeScreen = Platform.OS === "web" && width >= 1024;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab: initialTab, indentId: initialIndentId } = useLocalSearchParams<{ tab?: SubTab; indentId?: string }>();
  const { t } = useLanguage();
   const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const tabBarScrollProps = useTabBarAwareScrollProps();
  const screenTopPad =
    Platform.OS === "web" ? 0 : insets.top + Layout.headerPaddingBelowInset;
  const scrollBottomPad =
    24 + Layout.demoTabBarScrollBottomInset + insets.bottom + 24;
  const [subTab, setSubTab] = useState<SubTab>(initialTab ?? "manage");
  const [highlightedIndentId, setHighlightedIndentId] = useState<string | null>(
    initialIndentId ?? null,
  );
  const [manageView, setManageView] = useState<ManageView>("CONNECTIONS");
  const [invitationSegment, setInvitationSegment] =
    useState<InvitationSegment>("RECEIVED");
  const [showInvitationSearch, setShowInvitationSearch] = useState(false);
  const [phoneOnAppByNodeId, setPhoneOnAppByNodeId] = useState<
    Record<string, boolean>
  >({});
  const [inviteeOrgIdByNodeId, setInviteeOrgIdByNodeId] = useState<
    Record<string, string>
  >({});
  const [nodeKind, setNodeKind] = useState<NodeKindFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const syncToastOpacity = useRef(new Animated.Value(0)).current;
  const syncToastTranslate = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    if (initialIndentId) {
      setSubTab("load");
      setHighlightedIndentId(initialIndentId);
    }
  }, [initialIndentId]);

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
  const [confirmCancelItem, setConfirmCancelItem] = useState<RequestItem | null>(
    null,
  );
  const [acceptTermsItem, setAcceptTermsItem] = useState<RequestItem | null>(
    null,
  );
  const [previewRequestItem, setPreviewRequestItem] = useState<RequestItem | null>(
    null,
  );
  const [previewOpenedAtMs, setPreviewOpenedAtMs] = useState<number>(0);
  const [hoveredRequestId, setHoveredRequestId] = useState<string | null>(null);
  const [dismissedSentRequestIds, setDismissedSentRequestIds] = useState<
    Record<string, true>
  >({});
  const [optimisticallyHiddenInviteSearchNodeIds, setOptimisticallyHiddenInviteSearchNodeIds] =
    useState<Record<string, true>>({});

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
    if (Array.isArray(clients)) {
      clients.forEach((c) => {
        const isIntegrated = Boolean(
          c.is_integrated ?? c.linked_organization_id,
        );
        list.push({
          id: c.id,
          name: (c.name || c.contact_person || "Unnamed").toUpperCase(),
          type: "CLIENT",
          status: "INTEGRATED",
          availableOnApp: Boolean(
            c.linked_organization_id ?? c.is_integrated,
          ),
          isIntegrated,
          phone: c.phone ?? null,
          linked_organization_id: c.linked_organization_id,
          avatar_url: c.avatar_url,
          avatar_seed: c.avatar_seed,
        });
      });
    }
    if (Array.isArray(suppliers)) {
      suppliers.forEach((s) => {
        const isIntegrated =
          s.supplier_type === "integrated" ||
          Boolean(s.linked_organization_id);
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
          availableOnApp: Boolean(s.linked_organization_id),
          isIntegrated,
          phone: s.phone ?? null,
          linked_organization_id: s.linked_organization_id,
          avatar_url: s.avatar_url,
          avatar_seed: s.avatar_seed,
        });
      });
    }
    if (Array.isArray(drivers)) {
      drivers.forEach((d) => {
        const leftAt = d.left_at;
        const isDisconnected = leftAt != null && leftAt !== "";
        list.push({
          id: d.id,
          name: (d.name || "Unnamed").toUpperCase(),
          type: "DRIVER",
          status: isDisconnected ? "DISCONNECTED" : "INTEGRATED",
          availableOnApp: Boolean(d.user_id),
          isIntegrated: !isDisconnected,
          phone: d.phone ?? null,
          user_id: d.user_id,
          avatar_url: d.avatar_url,
          avatar_seed: d.avatar_seed,
        });
      });
    }
    return list;
  }, [clients, suppliers, drivers]);

  const requestItems = useMemo(
    () => toRequestItems(received, sent, driverInvites),
    [received, sent, driverInvites],
  );

  const loading = clientsLoading || suppliersLoading || driversLoading;
  const loadingRequests = recLoading;
  const invalidateNetwork = useInvalidateNetwork(orgId);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const byNodeId: Record<string, boolean> = {};
      const inviteeOrgByNodeId: Record<string, string> = {};
      const withPhone = nodes.filter((n) => (n.phone ?? "").trim().length >= 8);
      if (withPhone.length === 0) {
        if (!cancelled) {
          setPhoneOnAppByNodeId({});
          setInviteeOrgIdByNodeId({});
        }
        return;
      }

      const clientSupplierNodes = withPhone.filter(
        (n) => n.type === "CLIENT" || n.type === "SUPPLIER",
      );
      if (clientSupplierNodes.length > 0) {
        const { inviteesByPhone } = await getConnectionInviteesByPhones(
          clientSupplierNodes.map((n) => n.phone ?? ""),
        );
        clientSupplierNodes.forEach((n) => {
          const key = normalizePhoneForInviteeLookup(n.phone ?? "");
          const invitee = key ? inviteesByPhone.get(key) : undefined;
          byNodeId[n.id] = !!invitee;
          if (invitee?.organization_id) inviteeOrgByNodeId[n.id] = invitee.organization_id;
        });
      }

      const driverNodes = withPhone.filter((n) => n.type === "DRIVER");
      if (driverNodes.length > 0) {
        const rows = await Promise.all(
          driverNodes.map(async (n) => {
            const res = await getDriverInviteeByPhone(n.phone ?? "");
            return { nodeId: n.id, onApp: !!res.user_id };
          }),
        );
        rows.forEach((r) => {
          byNodeId[r.nodeId] = r.onApp;
        });
      }

      if (!cancelled) {
        setPhoneOnAppByNodeId(byNodeId);
        setInviteeOrgIdByNodeId(inviteeOrgByNodeId);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [nodes]);

  const isNodeOnApp = useCallback(
    (node: NetworkNode) => {
      if (node.isIntegrated && node.availableOnApp === true) return true;
      const byPhone = phoneOnAppByNodeId[node.id];
      if (typeof byPhone === "boolean") return byPhone;
      return Boolean(node.availableOnApp);
    },
    [phoneOnAppByNodeId],
  );

  const pendingSentRequestToOrgIds = useMemo(() => {
    const s = new Set<string>();
    (sent ?? []).forEach((row) => {
      if (!row) return;
      if ((row.status ?? "").toLowerCase() !== "pending") return;
      if (row.to_organization_id) s.add(row.to_organization_id);
    });
    return s;
  }, [sent]);

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

  const handleOpenAcceptTerms = (item: RequestItem) => {
    setAcceptTermsItem(item);
  };

  const confirmAcceptWithTerms = async () => {
    if (!acceptTermsItem) return;
    const item = acceptTermsItem;
    setAcceptTermsItem(null);
    await handleApprove(item.id);
  };

  const runCancelRequest = async (item: RequestItem) => {
    setActionError(null);
    setActingRequestId(item.id);
    let err: Error | null = null;
    let deleted = false;
    if (item.kind === "DRIVER_INVITE") {
      const res = await cancelDriverInvite(item.id);
      err = res.error;
      deleted = res.deleted;
    } else {
      const res = await cancelConnectionRequest(item.id);
      err = res.error;
      deleted = res.deleted;
    }
    if (err) {
      setActingRequestId(null);
      setActionError(err.message);
      return;
    }
    if (!deleted) {
      setActingRequestId(null);
      setActionError(
        "Could not cancel this invitation. It may have already been accepted or updated.",
      );
      return;
    }
    // Optimistic removal from list so card disappears immediately.
    setDismissedSentRequestIds((prev) => ({ ...prev, [item.id]: true }));
    if (item.type === "SENT" && item.row?.to_organization_id) {
      const toOrgId = item.row.to_organization_id;
      setOptimisticallyHiddenInviteSearchNodeIds((prev) => {
        if (!prev || Object.keys(prev).length === 0) return prev;
        const next: Record<string, true> = { ...prev };
        for (const [nodeId, orgId] of Object.entries(inviteeOrgIdByNodeId)) {
          if (orgId === toOrgId) delete next[nodeId];
        }
        return next;
      });
    }
    invalidateNetwork();
    triggerSyncToast();
    setActingRequestId(null);
  };

  const handleCancelRequest = (item: RequestItem) => {
    setConfirmCancelItem(item);
  };

  const confirmCancelRequest = async () => {
    if (!confirmCancelItem) return;
    const item = confirmCancelItem;
    setConfirmCancelItem(null);
    await runCancelRequest(item);
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
            setOptimisticallyHiddenInviteSearchNodeIds((prev) => ({
              ...prev,
              [node.id]: true,
            }));
            triggerSyncToast();
            return;
          }
        }
        if (node.type === "DRIVER" && phone.length >= 8) {
          const res = await inviteDriver(
            orgId,
            {
              name: (node.name || "").trim() || "Driver",
              phone: node.phone ?? null,
            },
            currentOrganization?.name ?? null,
          );
          invalidateNetwork();
          setSendingNodeId(null);
          if (res.error) {
            setActionError(res.error.message);
            return;
          }
          // If an in-app invite couldn't be sent (no account yet), share the invite link.
          if (!res.inviteSent) {
            await Share.share({
              message:
                "Join me on Q to sync our ledger and manage trips. Download the Q app.",
              title: "Invite to Q",
            });
          }
          triggerSyncToast();
          return;
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
    [orgId, invalidateNetwork, currentOrganization?.name],
  );

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return nodes.filter((n) => {
      if (manageView === "CONNECTIONS" && !n.isIntegrated) return false;
      if (manageView === "INVITATIONS" && showInvitationSearch && n.isIntegrated)
        return false;
      if (manageView === "INVITATIONS" && showInvitationSearch) {
        if (optimisticallyHiddenInviteSearchNodeIds[n.id]) return false;
        const inviteeOrgId = inviteeOrgIdByNodeId[n.id];
        if (inviteeOrgId && pendingSentRequestToOrgIds.has(inviteeOrgId))
          return false;
      }
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
  }, [
    invitationSegment,
    manageView,
    nodeKind,
    nodes,
    inviteeOrgIdByNodeId,
    optimisticallyHiddenInviteSearchNodeIds,
    pendingSentRequestToOrgIds,
    searchQuery,
    showInvitationSearch,
  ]);

  const filteredRequests = useMemo(() => {
    return requestItems.filter((item) => {
      if (dismissedSentRequestIds[item.id]) return false;
      if (normalizeRequestStatus(item.status) === "approved") return false;
      if (invitationSegment === "SENT" && item.type !== "SENT") return false;
      if (invitationSegment === "RECEIVED" && item.type !== "RECEIVED")
        return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const displayName =
        item.type === "RECEIVED" ? item.from_org_name : item.to_org_name;
      return (displayName ?? "").toLowerCase().includes(q);
    });
  }, [dismissedSentRequestIds, invitationSegment, requestItems, searchQuery]);

  const pendingRequestCount = requestItems.filter(
    (item) =>
      item.type === "RECEIVED" &&
      normalizeRequestStatus(item.status) === "pending",
  ).length;

  const handleAddPress = useCallback(() => {
    if (manageView !== "CONNECTIONS") return;
    if (nodeKind === "CLIENT") router.push("/(modals)/add-client");
    else if (nodeKind === "SUPPLIER") router.push("/(modals)/add-supplier");
    else if (nodeKind === "DRIVER") router.push("/(modals)/add-driver");
  }, [manageView, nodeKind, router]);

  if (subTab === "load") {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: screenTopPad },
        ]}
      >
        <View
          style={[styles.blackBlock, styles.blackBlockLoad, { paddingTop: 4 }]}
        >
          <View style={styles.mainTabRow}>
            <TouchableOpacity
              style={styles.mainTab}
              onPress={() => setSubTab("manage")}
              activeOpacity={0.8}
            >
              <Text style={styles.mainTabText}>My Network</Text>
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
          highlightedIndentId={highlightedIndentId}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: screenTopPad },
      ]}
    >
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

      <View style={[styles.blackBlock, { paddingTop: 4 }]}>
        {/* My Network | Load — black tabs (body), Load-style */}
        <View style={styles.mainTabRow}>
          <TouchableOpacity
            style={[styles.mainTab, styles.mainTabActive]}
            onPress={() => setSubTab("manage")}
            activeOpacity={0.8}
          >
            <Text style={[styles.mainTabText, styles.mainTabTextActive]}>
              My Network
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

        {/* LinkedIn-style section switcher: Connections | Invitations */}
        <View style={styles.manageSwitchRow}>
          <TouchableOpacity
            style={styles.manageSwitchTab}
            onPress={() => setManageView("CONNECTIONS")}
            activeOpacity={0.85}
          >
            <View style={styles.filterTabLabelRow}>
              <Text
                style={[
                  styles.filterTabText,
                  manageView === "CONNECTIONS" && styles.filterTabTextActive,
                ]}
              >
                Connections
              </Text>
            </View>
            {manageView === "CONNECTIONS" ? (
              <View style={styles.filterTabUnderline} />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.manageSwitchTab}
            onPress={() => setManageView("INVITATIONS")}
            activeOpacity={0.85}
          >
            <View style={styles.filterTabLabelRow}>
              <Text
                style={[
                  styles.filterTabText,
                  manageView === "INVITATIONS" && styles.filterTabTextActive,
                ]}
              >
                Invitations
              </Text>
              {pendingRequestCount > 0 ? (
                <View
                  style={[
                    styles.filterTabBadge,
                    manageView === "INVITATIONS" && styles.filterTabBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTabBadgeText,
                      manageView === "INVITATIONS" &&
                        styles.filterTabBadgeTextActive,
                    ]}
                  >
                    {pendingRequestCount}
                  </Text>
                </View>
              ) : null}
            </View>
            {manageView === "INVITATIONS" ? (
              <View style={styles.filterTabUnderline} />
            ) : null}
          </TouchableOpacity>
          {manageView === "CONNECTIONS" &&
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

        {manageView === "INVITATIONS" ? (
          <View style={styles.filterHeaderRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterScrollContent}
            >
              {(["RECEIVED", "SENT"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => {
                    setInvitationSegment(tab);
                    if (showInvitationSearch) {
                      setShowInvitationSearch(false);
                      setSearchQuery("");
                    }
                  }}
                  style={styles.filterTab}
                  activeOpacity={0.8}
                >
                  <View style={styles.filterTabLabelRow}>
                    <Text
                      style={[
                        styles.filterTabText,
                        invitationSegment === tab && styles.filterTabTextActive,
                      ]}
                    >
                      {tab}
                    </Text>
                  </View>
                  {invitationSegment === tab ? (
                    <View style={styles.filterTabUnderline} />
                  ) : null}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.filterTab}
                onPress={() => setShowInvitationSearch(true)}
                activeOpacity={0.8}
              >
                <View style={styles.filterTabLabelRow}>
                  <FontAwesome
                    name="search"
                    size={12}
                    color={
                      showInvitationSearch
                        ? Theme.textOnDark
                        : Theme.textOnDarkMuted
                    }
                  />
                </View>
                {showInvitationSearch ? (
                  <View style={styles.filterTabUnderline} />
                ) : null}
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : null}

        {manageView === "INVITATIONS" && showInvitationSearch ? (
          <View style={styles.invitationSearchRow}>
            <TouchableOpacity
              style={styles.invitationSearchBackBtn}
              onPress={() => {
                setShowInvitationSearch(false);
                setSearchQuery("");
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="arrow-left" size={13} color={Theme.textOnDark} />
            </TouchableOpacity>
            <View style={styles.searchWrapDark}>
              <FontAwesome
                name="search"
                size={14}
                color={Theme.textOnDarkMuted}
                style={styles.searchIconDark}
              />
              <TextInput
                style={styles.searchInputDark}
                placeholder="Search clients, suppliers, drivers..."
                placeholderTextColor={Theme.textOnDarkMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoFocus
              />
            </View>
          </View>
        ) : null}

        {/* Search + Type filter — inside black block */}
        {manageView === "CONNECTIONS" ? (
          <View
            style={[
              styles.searchRowDark,
              styles.searchRowDarkSingle,
            ]}
          >
          <View style={styles.searchWrapDark}>
            <FontAwesome
              name="search"
              size={14}
              color={Theme.textOnDarkMuted}
              style={styles.searchIconDark}
            />
            <TextInput
              style={styles.searchInputDark}
              placeholder={"Search connections..."}
              placeholderTextColor={Theme.textOnDarkMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
          </View>
          {manageView === "CONNECTIONS" ? (
            <View style={styles.typeFilterWrapDark}>
              {(["ALL", "CLIENT", "SUPPLIER", "DRIVER"] as const).map(
                (kind) => (
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
                ),
              )}
            </View>
          ) : null}
          </View>
        ) : null}
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

      {/* Content area: light body; cards match Trips (incl. web 3-col grid). */}
      <View style={styles.manageContentWrap}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          {...tabBarScrollProps}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          }
        >
          {manageView === "CONNECTIONS" &&
          !isLargeScreen &&
          filteredNodes.length > 0 ? (
            <View style={styles.storiesSection}>
              <Text style={styles.storiesSectionLabel}>On your grid</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storiesRow}
              >
                {filteredNodes.slice(0, 24).map((node) => {
                  const onPlatform = isNodeOnApp(node);
                  return (
                    <TouchableOpacity
                      key={`story-${node.id}`}
                      style={styles.storyItem}
                      activeOpacity={0.85}
                      onPress={() => {
                        if (node.type === "CLIENT")
                          router.push(`/client/${node.id}`);
                        else if (node.type === "SUPPLIER")
                          router.push(`/supplier/${node.id}`);
                        else if (node.type === "DRIVER")
                          router.push(`/driver/${node.id}`);
                      }}
                    >
                      <NetworkAvatar
                        node={node}
                        onPlatform={onPlatform}
                        frameSize={54}
                      />
                      <Text style={styles.storyLabel} numberOfLines={1}>
                        {node.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          {manageView === "INVITATIONS" ? (
            showInvitationSearch ? (
              loading ? (
                <Text style={styles.loadingText}>Loading…</Text>
              ) : filteredNodes.length === 0 ? (
                <View style={styles.emptyState}>
                  <FontAwesome name="users" size={48} color={Theme.textMuted} />
                  <Text style={styles.emptyStateText}>No contacts found</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Search by name or phone number to find people to connect with.
                  </Text>
                </View>
              ) : (
                <View style={isLargeScreen ? styles.gridContainer : undefined}>
                  {filteredNodes.map((node) => {
                    const onPlatform = isNodeOnApp(node);
                    const typePillStyle =
                      node.type === "CLIENT"
                        ? styles.networkTypePillClient
                        : node.type === "SUPPLIER"
                          ? styles.networkTypePillSupplier
                          : styles.networkTypePillDriver;
                    const typePillTextStyle =
                      node.type === "CLIENT"
                        ? styles.networkTypePillTextClient
                        : node.type === "SUPPLIER"
                          ? styles.networkTypePillTextSupplier
                          : styles.networkTypePillTextDriver;
                    const isConnected = node.isIntegrated;
                    return (
                      <View
                        key={`invite-search-${node.id}`}
                        style={isLargeScreen ? styles.gridItem : undefined}
                      >
                        <View style={styles.networkCardWrap}>
                          <View
                            style={[
                              styles.networkCard,
                              !isLargeScreen && styles.networkCardElevated,
                            ]}
                          >
                            <View style={styles.networkCardCornerRight}>
                              {node.isIntegrated ? (
                                <View style={styles.networkCardIntegratedBadge}>
                                  <Handshake
                                    size={11}
                                    strokeWidth={1.9}
                                    color={Theme.darkGreen}
                                  />
                                </View>
                              ) : null}
                              <View style={styles.networkCardCornerChevron}>
                                <FontAwesome
                                  name="chevron-right"
                                  size={12}
                                  color={Theme.textMuted}
                                />
                              </View>
                            </View>
                            <View
                              style={styles.networkCardOrb}
                              pointerEvents="none"
                            />
                            <View style={styles.networkCardMainRow}>
                              <TouchableOpacity
                                style={styles.networkCardBody}
                                activeOpacity={0.7}
                                onPress={() => {
                                  if (node.type === "CLIENT")
                                    router.push(
                                      onPlatform
                                        ? `/client/${node.id}?profile=1`
                                        : `/client/${node.id}`,
                                    );
                                  else if (node.type === "SUPPLIER")
                                    router.push(
                                      onPlatform
                                        ? `/supplier/${node.id}?profile=1`
                                        : `/supplier/${node.id}`,
                                    );
                                  else if (node.type === "DRIVER")
                                    router.push(
                                      onPlatform
                                        ? `/driver/${node.id}?profile=1`
                                        : `/driver/${node.id}`,
                                    );
                                }}
                              >
                                <View style={styles.networkCardTop}>
                                  <View style={styles.networkCardTopLeft}>
                                    <View
                                      style={[
                                        styles.networkTypePill,
                                        typePillStyle,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.networkTypePillTextBase,
                                          typePillTextStyle,
                                        ]}
                                      >
                                        {node.type}
                                      </Text>
                                    </View>
                                    <View
                                      style={[
                                        styles.networkTypePill,
                                        onPlatform
                                          ? styles.networkPlatformPillOn
                                          : styles.networkPlatformPillOff,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.networkPlatformPillText,
                                          onPlatform
                                            ? styles.networkPlatformPillTextOn
                                            : styles.networkPlatformPillTextOff,
                                        ]}
                                      >
                                        {onPlatform ? "ON APP" : "OFFLINE"}
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={styles.networkCardTopRight} />
                                </View>
                                <View style={styles.networkCardInner}>
                                  <View style={styles.networkCardInnerRow}>
                                    <View
                                      style={[
                                        styles.networkCardIconWrap,
                                        onPlatform
                                          ? styles.networkCardIconWrapOn
                                          : styles.networkCardIconWrapOff,
                                      ]}
                                    >
                                      <View style={styles.networkAvatarInCard}>
                                        <NetworkAvatar
                                          node={node}
                                          onPlatform={onPlatform}
                                        />
                                      </View>
                                      <View
                                        style={[
                                          styles.connectionDot,
                                          onPlatform
                                            ? styles.connectionDotActive
                                            : styles.connectionDotMuted,
                                        ]}
                                      />
                                    </View>
                                    <View
                                      style={[
                                        styles.networkCardInnerCol,
                                        !isLargeScreen &&
                                          styles.networkCardInnerColSolo,
                                      ]}
                                    >
                                      <View style={styles.networkCardTitleRow}>
                                        <Text
                                          style={styles.networkCardTitleInline}
                                          numberOfLines={1}
                                        >
                                          {node.name}
                                        </Text>

                                        {isConnected ? (
                                          <View style={styles.activePill}>
                                            <CircleCheck
                                              size={12}
                                              strokeWidth={1.7}
                                              color={Theme.darkGreen}
                                              style={{ marginRight: 5 }}
                                            />
                                            <Text style={styles.activePillText}>
                                              Connected
                                            </Text>
                                          </View>
                                        ) : (
                                          <View style={styles.networkActionStack}>
                                            <TouchableOpacity
                                              style={
                                                onPlatform
                                                  ? styles.connectBtn
                                                  : styles.inviteInlineBtn
                                              }
                                              onPress={() =>
                                                handleSendInviteOrRequest(node)
                                              }
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
                                                  style={
                                                    onPlatform
                                                      ? styles.connectBtnText
                                                      : styles.inviteInlineBtnText
                                                  }
                                                >
                                                  {onPlatform
                                                    ? "Send request"
                                                    : "Send invitation"}
                                                </Text>
                                              )}
                                            </TouchableOpacity>
                                            {!onPlatform ? (
                                              <Text style={styles.networkActionHint}>
                                                USER IS NOT IN APP
                                              </Text>
                                            ) : null}
                                          </View>
                                        )}
                                      </View>
                                    </View>
                                  </View>
                                </View>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )
            ) : loadingRequests ? (
              <Text style={styles.loadingText}>{t("loadingRequests")}</Text>
            ) : filteredRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome name="users" size={48} color={Theme.textMuted} />
                <Text style={styles.emptyStateText}>No invitations found</Text>
                <Text style={styles.emptyStateSubtext}>
                  Sent and received invitations will appear here when you start
                  connecting with clients or suppliers.
                </Text>
              </View>
            ) : (
              <View style={isLargeScreen ? styles.gridContainer : undefined}>
                {filteredRequests.map((item) => {
                const displayName =
                  item.type === "RECEIVED"
                    ? item.from_org_name
                    : item.to_org_name;
                const isReceivedPending =
                  item.type === "RECEIVED" && item.status === "pending";
                const isSentPending =
                  item.type === "SENT" && item.status === "pending";
                const showInlineSenderPreview = false;
                const kindLabel =
                  item.kind === "DRIVER_INVITE"
                    ? "DRIVER INVITE"
                    : item.kind === "CLIENT"
                      ? item.type === "SENT"
                        ? "ADD AS CLIENT"
                        : "WANTS TO ADD AS CLIENT"
                      : item.kind === "SUPPLIER"
                        ? item.type === "SENT"
                          ? "ADD AS SUPPLIER"
                          : "WANTS TO ADD AS SUPPLIER"
                        : item.type === "SENT"
                          ? "ADD AS CLIENT + SUPPLIER"
                          : "WANTS TO ADD AS CLIENT + SUPPLIER";
                return (
                  <View
                    key={item.id}
                    style={isLargeScreen ? styles.gridItem : undefined}
                  >
                    <View style={styles.networkCardWrap}>
                      <View style={styles.networkCard}>
                      <View style={styles.networkCardOrb} pointerEvents="none" />
                      <View style={styles.networkCardMainRow}>
                        <Pressable
                          style={styles.networkCardBody}
                          disabled={item.type !== "RECEIVED"}
                          onPress={() => {
                            if (item.type === "RECEIVED") {
                              setPreviewRequestItem((prev) =>
                                prev?.id === item.id ? null : item,
                              );
                              setPreviewOpenedAtMs(Date.now());
                            }
                          }}
                        >
                          <View style={styles.networkCardTop}>
                            <View style={styles.networkCardTopLeft}>
                              <View
                                style={[
                                  styles.networkTypePill,
                                  styles.networkTypePillRequest,
                                ]}
                              >
                                <Text style={styles.networkTypePillTextRequest}>
                                  {item.type === "RECEIVED"
                                    ? "RECEIVED"
                                    : "SENT"}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.networkTypePill,
                                  styles.networkKindPill,
                                ]}
                              >
                                <Text style={styles.networkKindPillText}>
                                  {kindLabel}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.networkCardTopRight}>
                              <View
                                style={[
                                  styles.networkStagePill,
                                  item.status === "pending"
                                    ? styles.networkStagePillPending
                                    : item.status === "approved"
                                      ? styles.networkStagePillOk
                                      : styles.networkStagePillNeutral,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.networkStagePillText,
                                    item.status !== "pending" &&
                                    item.status !== "approved"
                                      ? styles.networkStagePillTextDark
                                      : null,
                                  ]}
                                >
                                  {formatRequestStatus(item.status)}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.networkCardInner}>
                            <View style={styles.networkCardInnerRow}>
                              <View
                                style={[
                                  styles.networkCardIconWrap,
                                  styles.networkCardIconWrapOn, // Assuming active/on platform for requests visually
                                ]}
                              >
                                <View style={styles.networkAvatarInCard}>
                                  {item.nodeInfo ? (
                                    <NetworkAvatar
                                      node={item.nodeInfo as NetworkNode}
                                      onPlatform={true}
                                    />
                                  ) : item.kind === "DRIVER_INVITE" ? (
                                    <User
                                      size={18}
                                      strokeWidth={1.5}
                                      color={Theme.darkGreen}
                                    />
                                  ) : (
                                    <Building2
                                      size={18}
                                      strokeWidth={1.5}
                                      color={Theme.darkGreen}
                                    />
                                  )}
                                </View>
                              </View>
                              <View style={styles.networkCardInnerCol}>
                                <View style={styles.networkCardTitleRow}>
                                  <View style={styles.requestTitleMeta}>
                                    <Text
                                      style={styles.networkCardTitleInline}
                                      numberOfLines={1}
                                    >
                                      {displayName}
                                    </Text>
                                    <Text style={styles.cardTimeAgoInline}>
                                      {shortRelativeTime(item.created_at)}
                                    </Text>
                                  </View>

                                  {isReceivedPending && item.row ? (
                                    <View style={styles.networkCardInlineActions}>
                                      <TouchableOpacity
                                        style={styles.acceptBtn}
                                        onPress={() => handleOpenAcceptTerms(item)}
                                        disabled={actingRequestId === item.id}
                                        activeOpacity={0.8}
                                        hitSlop={{
                                          top: 6,
                                          bottom: 6,
                                          left: 6,
                                          right: 6,
                                        }}
                                      >
                                        {actingRequestId === item.id ? (
                                          <ActivityIndicator
                                            size="small"
                                            color="#fff"
                                          />
                                        ) : (
                                          <FontAwesome
                                            name="check-circle"
                                            size={16}
                                            color="#fff"
                                          />
                                        )}
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.rejectBtn}
                                        onPress={() => handleReject(item.id)}
                                        disabled={actingRequestId === item.id}
                                        activeOpacity={0.8}
                                        hitSlop={{
                                          top: 6,
                                          bottom: 6,
                                          left: 6,
                                          right: 6,
                                        }}
                                      >
                                        <FontAwesome
                                          name="times-circle"
                                          size={16}
                                          color={ROSE_500}
                                        />
                                      </TouchableOpacity>
                                    </View>
                                  ) : null}

                                  {!isReceivedPending && isSentPending ? (
                                    <TouchableOpacity
                                      style={styles.cancelInlineBtn}
                                      onPress={() => handleCancelRequest(item)}
                                      disabled={actingRequestId === item.id}
                                      activeOpacity={0.8}
                                    >
                                      {actingRequestId === item.id ? (
                                        <ActivityIndicator
                                          size="small"
                                          color={Theme.screenBackground}
                                        />
                                      ) : (
                                        <Text style={styles.cancelInlineBtnText}>
                                          Withdraw
                                        </Text>
                                      )}
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </View>
                            </View>

                            {showInlineSenderPreview ? (
                              <View style={styles.requestPreviewCard}>
                                <View style={styles.requestPreviewHeader}>
                                  <View style={styles.requestPreviewAvatar}>
                                    <Text style={styles.requestPreviewAvatarText}>
                                      {getInitials(item.from_org_name || "S")}
                                    </Text>
                                  </View>
                                  <View style={styles.requestPreviewHeaderBody}>
                                    <Text style={styles.requestPreviewHeading}>
                                      {item.from_org_name}
                                    </Text>
                                    <Text style={styles.requestPreviewBodySubtitle}>
                                      Sender information
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.requestPreviewInfoRow}>
                                  <Text style={styles.requestPreviewMetaLabel}>Request</Text>
                                  <Text style={styles.requestPreviewMetaValue}>
                                    {requestPreviewRole(item.kind)}
                                  </Text>
                                </View>
                                <View style={styles.requestPreviewInfoRow}>
                                  <Text style={styles.requestPreviewMetaLabel}>Status</Text>
                                  <Text style={styles.requestPreviewMetaValue}>
                                    {formatRequestStatus(item.status)}
                                  </Text>
                                </View>
                                <View style={styles.requestPreviewInfoRow}>
                                  <Text style={styles.requestPreviewMetaLabel}>Received</Text>
                                  <Text style={styles.requestPreviewMetaValue}>
                                    {shortRelativeTime(item.created_at)}
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                    </View>
                    </View>
                  </View>
                );
              })}
              </View>
            )
          ) : loading ? (
            <Text style={styles.loadingText}>Loading…</Text>
          ) : filteredNodes.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="users" size={48} color={Theme.textMuted} />
              <Text style={styles.emptyStateText}>No connections found</Text>
              <Text style={styles.emptyStateSubtext}>
                Your connected clients, suppliers, and drivers will appear here
                after requests are accepted.
              </Text>
            </View>
          ) : (
            <View
              style={isLargeScreen ? styles.gridContainer : undefined}
            >
              {filteredNodes.map((node) => {
              const onPlatform = isNodeOnApp(node);
              const typePillStyle =
                node.type === "CLIENT"
                  ? styles.networkTypePillClient
                  : node.type === "SUPPLIER"
                    ? styles.networkTypePillSupplier
                    : styles.networkTypePillDriver;
              const typePillTextStyle =
                node.type === "CLIENT"
                  ? styles.networkTypePillTextClient
                  : node.type === "SUPPLIER"
                    ? styles.networkTypePillTextSupplier
                    : styles.networkTypePillTextDriver;
              const stageLabel =
                node.status === "DISCONNECTED" ? "OFFLINE" : "ACTIVE";
              const stagePillStyle =
                node.status === "DISCONNECTED"
                  ? styles.networkStagePillNeutral
                  : styles.networkStagePillOk;
              return (
                <View
                  key={node.id}
                  style={isLargeScreen ? styles.gridItem : undefined}
                >
                  <View style={styles.networkCardWrap}>
                    <View
                      style={[
                        styles.networkCard,
                        !isLargeScreen && styles.networkCardElevated,
                      ]}
                    >
                      <View style={styles.networkCardCornerRight}>
                        <View style={styles.networkCardCornerChevron}>
                          <FontAwesome
                            name="chevron-right"
                            size={12}
                            color={Theme.textMuted}
                          />
                        </View>
                      </View>
                      <View
                        style={styles.networkCardOrb}
                        pointerEvents="none"
                      />
                      <View style={styles.networkCardMainRow}>
                      <TouchableOpacity
                        style={styles.networkCardBody}
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
                        <View style={styles.networkCardTop}>
                          <View style={styles.networkCardTopLeft}>
                            <View
                              style={[styles.networkTypePill, typePillStyle]}
                            >
                              <Text
                                style={[
                                  styles.networkTypePillTextBase,
                                  typePillTextStyle,
                                ]}
                              >
                                {node.type}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.networkTypePill,
                                onPlatform
                                  ? styles.networkPlatformPillOn
                                  : styles.networkPlatformPillOff,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.networkPlatformPillText,
                                  onPlatform
                                    ? styles.networkPlatformPillTextOn
                                    : styles.networkPlatformPillTextOff,
                                ]}
                              >
                                {onPlatform ? "ON APP" : "OFFLINE"}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.networkCardTopRight} />
                        </View>
                        <View style={styles.networkCardInner}>
                          <View style={styles.networkCardInnerRow}>
                            <View
                              style={[
                                styles.networkCardIconWrap,
                                onPlatform
                                  ? styles.networkCardIconWrapOn
                                  : styles.networkCardIconWrapOff,
                              ]}
                            >
                              <View style={styles.networkAvatarInCard}>
                                <NetworkAvatar
                                  node={node}
                                  onPlatform={onPlatform}
                                />
                              </View>
                              <View
                                style={[
                                  styles.connectionDot,
                                  onPlatform
                                    ? styles.connectionDotActive
                                    : styles.connectionDotMuted,
                                ]}
                              />
                            </View>
                            <View
                              style={[
                                styles.networkCardInnerCol,
                                !isLargeScreen && styles.networkCardInnerColSolo,
                              ]}
                            >
                              <View style={styles.networkCardNameRow}>
                                <Text
                                  style={[
                                    styles.networkCardTitleInline,
                                    styles.networkCardNameText,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {node.name}
                                </Text>

                                {node.isIntegrated ? (
                                  <View style={styles.networkCardIntegratedBadge}>
                                    <Handshake
                                      size={16}
                                      strokeWidth={1.9}
                                      color={Theme.darkGreen}
                                    />
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.networkCardActionsCol}>
                        {node.status === "INTEGRATED" &&
                        node.availableOnApp !== false ? (
                          !onPlatform ? (
                            <View style={styles.activePill}>
                              <CircleCheck
                                size={12}
                                strokeWidth={1.7}
                                color={Theme.darkGreen}
                                style={{ marginRight: 5 }}
                              />
                              <Text style={styles.activePillText}>Active</Text>
                            </View>
                          ) : null
                        ) : (
                          <View style={styles.networkActionStack}>
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
                            {!onPlatform ? (
                              <Text style={styles.networkActionHint}>
                                USER IS NOT IN APP
                              </Text>
                            ) : null}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  </View>
                </View>
              );
            })}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Add screens are full-screen routes to ensure exact parity. */}
      <Modal
        transparent
        animationType="fade"
        visible={confirmCancelItem != null}
        onRequestClose={() => setConfirmCancelItem(null)}
      >
        <View style={styles.confirmModalBackdrop}>
          <View style={styles.confirmModalCard}>
            <Text style={styles.confirmModalTitle}>Withdraw Invitation</Text>
            <Text style={styles.confirmModalBody}>
              Are you sure you want to withdraw this invitation?
            </Text>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmModalKeepBtn}
                onPress={() => setConfirmCancelItem(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalKeepText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => void confirmCancelRequest()}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalCancelText}>Yes, Withdraw</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={previewRequestItem != null}
        onRequestClose={() => setPreviewRequestItem(null)}
      >
        <Pressable
          style={[
            styles.confirmModalBackdrop,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          onPress={() => {
            // Guard: avoid instant close when modal mounts mid-gesture.
            if (Date.now() - previewOpenedAtMs < 250) return;
            setPreviewRequestItem(null);
          }}
        >
          {previewRequestItem ? (
            <View style={[styles.confirmModalCard, styles.requestPreviewModalCard]}>
              <View style={styles.requestPreviewAccentBar} />
              <View style={styles.requestPreviewHeader}>
                {previewRequestItem.nodeInfo ? (
                  <NetworkAvatar
                    node={previewRequestItem.nodeInfo as NetworkNode}
                    onPlatform={true}
                    frameSize={44}
                  />
                ) : (
                  <View style={styles.requestPreviewAvatar}>
                    <Text style={styles.requestPreviewAvatarText}>
                      {getInitials(previewRequestItem.from_org_name || "S")}
                    </Text>
                  </View>
                )}
                <View style={styles.requestPreviewHeaderBody}>
                  <Text style={styles.requestPreviewHeading}>
                    {previewRequestItem.from_org_name}
                  </Text>
                  <View style={styles.requestPreviewSubRow}>
                    <Info
                      size={13}
                      strokeWidth={2}
                      color={Theme.textSecondary}
                    />
                    <Text style={styles.requestPreviewBodySubtitle}>
                      Minimal sender information available
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.requestPreviewInfoGrid}>
                <View style={styles.requestPreviewInfoRow}>
                  <View style={styles.requestPreviewInfoLeft}>
                    <UserPlus
                      size={15}
                      strokeWidth={2}
                      color={Theme.textSecondary}
                    />
                    <Text style={styles.requestPreviewMetaLabel}>
                      Request Type
                    </Text>
                  </View>
                  <Text style={styles.requestPreviewMetaValue}>
                    {requestPreviewRole(previewRequestItem.kind)}
                  </Text>
                </View>
                <View style={styles.requestPreviewInfoRow}>
                  <View style={styles.requestPreviewInfoLeft}>
                    <CheckCircle2
                      size={15}
                      strokeWidth={2}
                      color={Theme.textSecondary}
                    />
                    <Text style={styles.requestPreviewMetaLabel}>
                      Current Status
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.requestPreviewStatusBadge,
                      previewRequestItem.status === "approved"
                        ? styles.requestPreviewStatusBadgeApproved
                        : previewRequestItem.status === "rejected"
                          ? styles.requestPreviewStatusBadgeRejected
                          : styles.requestPreviewStatusBadgePending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.requestPreviewStatusText,
                        previewRequestItem.status === "approved"
                          ? styles.requestPreviewStatusTextApproved
                          : previewRequestItem.status === "rejected"
                            ? styles.requestPreviewStatusTextRejected
                            : styles.requestPreviewStatusTextPending,
                      ]}
                    >
                      {formatRequestStatus(previewRequestItem.status)}
                    </Text>
                  </View>
                </View>
                <View style={styles.requestPreviewInfoRow}>
                  <View style={styles.requestPreviewInfoLeft}>
                    <Clock3
                      size={15}
                      strokeWidth={2}
                      color={Theme.textSecondary}
                    />
                    <Text style={styles.requestPreviewMetaLabel}>
                      Time Received
                    </Text>
                  </View>
                  <View style={styles.requestPreviewTimeWrap}>
                    <Text style={styles.requestPreviewMetaValue}>
                      {shortRelativeTime(previewRequestItem.created_at)} ago
                    </Text>
                    <View style={styles.requestPreviewTimeDot} />
                  </View>
                </View>
              </View>
              <View style={styles.requestPreviewFooter}>
                <Text style={styles.requestPreviewFooterText}>
                  Tap anywhere to close preview
                </Text>
                <Text style={styles.requestPreviewFooterHint}>
                  Use the request card actions to accept or reject.
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={acceptTermsItem != null}
        onRequestClose={() => setAcceptTermsItem(null)}
      >
        <View
          style={[
            styles.confirmModalBackdrop,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.confirmModalCard, styles.termsModalCard]}>
            <View style={styles.termsModalHeaderRow}>
              <View style={styles.termsModalHeaderIcon}>
                <CircleCheck
                  size={16}
                  strokeWidth={2}
                  color={Theme.darkGreen}
                />
              </View>
              <View style={styles.termsModalHeaderTextWrap}>
                <Text style={styles.confirmModalTitle}>Accept Invitation</Text>
                <Text style={styles.termsModalSubtitle}>
                  Review terms before activating this connection.
                </Text>
              </View>
            </View>
            <ScrollView
              style={styles.termsModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.confirmModalBody}>
                Please review and accept these Terms and Conditions before
                continuing:
              </Text>
              <View style={styles.termsModalClauseCard}>
                <Text style={styles.termsModalClause}>
                  1. You confirm this organization invitation is legitimate and
                  authorized by your company.
                </Text>
                <Text style={styles.termsModalClause}>
                  2. Accepting this invitation creates an active business
                  connection between both organizations.
                </Text>
                <Text style={styles.termsModalClause}>
                  3. Shared data may include invoices, trip records, contact
                  details, and related business metadata.
                </Text>
                <Text style={styles.termsModalClause}>
                  4. You agree to use this connection lawfully and maintain
                  confidentiality of shared information.
                </Text>
                <Text style={styles.termsModalClause}>
                  5. Your organization remains responsible for actions performed
                  by its authorized team members.
                </Text>
                <Text style={styles.termsModalClause}>
                  6. Access can be revoked later using available controls and
                  role permissions.
                </Text>
              </View>
              <View style={styles.termsModalNotice}>
                <Text style={styles.termsModalNoticeText}>
                  By tapping Confirm, you acknowledge and agree to these terms
                  on behalf of your organization.
                </Text>
              </View>
            </ScrollView>
            <View style={[styles.confirmModalActions, styles.termsModalActions]}>
              <TouchableOpacity
                style={styles.confirmModalKeepBtn}
                onPress={() => setAcceptTermsItem(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmModalKeepText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmModalConfirmBtn,
                  actingRequestId === acceptTermsItem?.id
                    ? styles.modalActionDisabled
                    : null,
                ]}
                onPress={() => void confirmAcceptWithTerms()}
                disabled={actingRequestId === acceptTermsItem?.id}
                activeOpacity={0.8}
              >
                {actingRequestId === acceptTermsItem?.id ? (
                  <ActivityIndicator size="small" color={Theme.screenBackground} />
                ) : (
                  <Text style={styles.confirmModalConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
  },
  blackBlock: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  blackBlockLoad: {
    paddingBottom: 0,
  },
  manageContentWrap: {
    flex: 1,
    backgroundColor: MANAGE_CONTENT_BG,
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
    paddingLeft: 0,
    paddingRight: 24,
    gap: 16,
    flexGrow: 0,
  },
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  manageSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 4,
  },
  manageSwitchTab: {
    position: "relative" as const,
    paddingVertical: 8,
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
  filterAddBtnActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(248,250,252,0.4)",
  },
  invitationSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
  },
  invitationSearchBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  mainTabRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 2,
    marginBottom: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  mainTab: { position: "relative" as const, paddingVertical: 8 },
  mainTabActive: {},
  mainTabText: {
    fontSize: 8,
    fontWeight: "800",
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
    paddingTop: 4,
  },
  searchRowDarkSingle: {
    gap: 0,
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
  scroll: { flex: 1, backgroundColor: MANAGE_CONTENT_BG },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    flexGrow: 1,
    backgroundColor: MANAGE_CONTENT_BG,
  },
  loadingText: {
    padding: 24,
    textAlign: "center",
    color: Theme.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    marginTop: 16,
  },
  emptyStateSubtext: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },
  /** Same grid as Trips tab (`app/(tabs)/trips.tsx`) for web ≥1024px */
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  gridItem: {
    width: "33.333%",
    paddingHorizontal: 8,
  },
  /** TripExpandableCard: wrap + card shell (padding 16, radius 20, marginBottom 12) */
  networkCardWrap: { marginBottom: 12 },
  networkCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 16,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  networkCardElevated: {
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    borderColor: Theme.borderMedium,
  },
  networkCardInnerColSolo: {
    marginLeft: 0,
  },
  storiesSection: {
    marginBottom: 16,
    marginTop: 4,
  },
  storiesSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: Theme.textSecondary,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  storiesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingRight: 8,
  },
  storyItem: {
    width: 72,
    alignItems: "center",
  },
  storyLabel: {
    marginTop: 6,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cardTimeAgo: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: -6,
    marginBottom: 10,
  },
  networkCardOrb: {
    position: "absolute",
    right: -20,
    bottom: -20,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.primary,
    opacity: 0.08,
  },
  networkCardMainRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  networkCardBody: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  networkCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  networkCardTopLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  networkCardTopRight: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 6,
    marginLeft: 8,
    flexShrink: 0,
  },
  networkCardChevron: { marginLeft: 0 },
  networkCardCornerRight: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  networkCardCornerChevron: {
    alignItems: "center",
    justifyContent: "center",
  },
  networkCardIntegratedBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  networkTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: Theme.surfaceGray,
  },
  networkTypePillClient: { borderColor: Theme.primary },
  networkTypePillSupplier: { borderColor: Theme.darkGreen },
  networkTypePillDriver: {
    borderColor: Theme.aggregatePillBorder,
    backgroundColor: Theme.aggregatePillBg,
  },
  networkTypePillRequest: { borderColor: Theme.primary },
  networkTypePillTextBase: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  networkTypePillTextClient: { color: Theme.primary },
  networkTypePillTextSupplier: { color: Theme.darkGreen },
  networkTypePillTextDriver: { color: Theme.aggregatePillText },
  networkTypePillTextRequest: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: Theme.primary,
  },
  networkKindPill: {
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surfaceGray,
  },
  networkKindPillText: {
    fontSize: 6,
    fontWeight: "800",
    color: TESLA_BLACK,
    letterSpacing: 0.3,
  },
  networkPlatformPillOn: { borderColor: Theme.darkGreen },
  networkPlatformPillOff: { borderColor: Theme.borderMedium },
  networkPlatformPillText: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  networkPlatformPillTextOn: { color: Theme.darkGreen },
  networkPlatformPillTextOff: { color: Theme.textMuted },
  networkStagePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  networkStagePillOk: { backgroundColor: Theme.positive },
  networkStagePillPending: { backgroundColor: Theme.warning },
  networkStagePillNeutral: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  networkStagePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.screenBackground,
  },
  networkStagePillTextDark: { color: TESLA_BLACK },
  networkCardTitle: {
    fontSize: 11,
    fontWeight: "500",
    color: TESLA_BLACK,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 12,
  },
  networkCardTitleInline: {
    fontSize: 11,
    fontWeight: "500",
    color: TESLA_BLACK,
    textTransform: "uppercase",
    flexShrink: 1,
    minWidth: 0,
  },
  cardTimeAgoInline: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  networkCardInner: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  networkCardInnerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  requestPreviewCard: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  requestPreviewModalCard: {
    maxWidth: 380,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: "stretch",
    overflow: "hidden",
  },
  requestPreviewAccentBar: {
    width: "100%",
    height: 6,
    backgroundColor: Theme.primary,
  },
  requestPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  requestPreviewHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  requestPreviewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  requestPreviewAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  requestPreviewHeading: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    lineHeight: 22,
  },
  requestPreviewSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  requestPreviewBodySubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  requestPreviewInfoGrid: {
    marginTop: 18,
    marginHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    gap: 14,
  },
  requestPreviewInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  requestPreviewInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  requestPreviewMetaLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  requestPreviewMetaValue: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    textTransform: "uppercase",
    flexShrink: 1,
  },
  requestPreviewStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  requestPreviewStatusBadgePending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  requestPreviewStatusBadgeApproved: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
  },
  requestPreviewStatusBadgeRejected: {
    backgroundColor: "#FFE4E6",
    borderColor: "#FECDD3",
  },
  requestPreviewStatusText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  requestPreviewStatusTextPending: {
    color: "#B45309",
  },
  requestPreviewStatusTextApproved: {
    color: "#15803D",
  },
  requestPreviewStatusTextRejected: {
    color: "#BE123C",
  },
  requestPreviewTimeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requestPreviewTimeDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: Theme.positive,
  },
  requestPreviewFooter: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 4,
  },
  requestPreviewFooterText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  requestPreviewFooterHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  /** Matches TripExpandableCard `cardRouteIconWrap` (36×36, radius 10) */
  networkCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    position: "relative",
  },
  networkCardIconWrapOn: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.surfaceBorder,
  },
  networkCardIconWrapOff: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  networkAvatarInCard: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 8,
  },
  networkCardInnerCol: { flex: 1, minWidth: 0 },
  networkCardInnerLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  /** Matches TripExpandableCard `cardRouteValue` (10 / 800) */
  networkCardInnerMeta: {
    fontSize: 10,
    fontWeight: "800",
    color: TESLA_BLACK,
    textTransform: "uppercase",
  },
  networkCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  networkCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
    width: "100%",
  },
  networkCardNameText: {
    flex: 1,
    minWidth: 0,
  },
  networkCardActionsCol: {
    justifyContent: "flex-end",
    alignItems: "flex-end",
    gap: 8,
    paddingLeft: 4,
  },
  networkCardInlineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  networkActionStack: {
    alignItems: "center",
    gap: 4,
  },
  networkActionHint: {
    maxWidth: 110,
    fontSize: 8,
    fontWeight: "700",
    color: TESLA_BLACK,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  requestTitleMeta: {
    flex: 1,
    minWidth: 0,
  },
  nodeAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    backgroundColor: Theme.surface,
  },
  nodeAvatarWrap: {
    width: "100%",
    height: "100%",
  },
  driverIconBadge: {
    position: "absolute",
    top: -3,
    left: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    borderWidth: 1,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
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
    right: -2,
    bottom: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  connectionDotActive: {
    backgroundColor: EMERALD,
  },
  connectionDotMuted: {
    backgroundColor: Theme.textSecondary,
  },
  nodeCardText: { flex: 1, minWidth: 0 },
  avatarInitials: {
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  avatarInitialsSmall: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  networkFallbackAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1.5,
    borderColor: Theme.surfaceBorder,
  },
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
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: EMERALD,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  requestInlineBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  inviteBtn: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  inviteBtnText: { color: Theme.textPrimaryDark },
  inviteInlineBtn: {
    alignSelf: "flex-end",
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteInlineBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
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
  cancelInlineBtn: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: ROSE_500,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelInlineBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.screenBackground,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  confirmModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  confirmModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
  },
  termsModalCard: {
    maxHeight: "88%",
    paddingBottom: 12,
  },
  termsModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  termsModalHeaderIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  termsModalHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  termsModalSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: Theme.textMuted,
    lineHeight: 16,
  },
  termsModalScroll: {
    marginTop: 8,
    maxHeight: 280,
  },
  termsModalClauseCard: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  termsModalClause: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
    marginTop: 8,
  },
  termsModalNotice: {
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  termsModalNoticeText: {
    fontSize: 11,
    lineHeight: 16,
    color: Theme.textPrimaryDark,
    fontWeight: "600",
  },
  confirmModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  confirmModalBody: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  confirmModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
  termsModalActions: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 12,
    marginTop: 12,
  },
  confirmModalKeepBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
  },
  confirmModalKeepText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  confirmModalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.35)",
    backgroundColor: "rgba(244,63,94,0.15)",
  },
  confirmModalCancelText: {
    fontSize: 11,
    fontWeight: "700",
    color: ROSE_500,
    textTransform: "uppercase",
  },
  confirmModalConfirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: EMERALD,
    backgroundColor: EMERALD,
  },
  confirmModalConfirmText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.screenBackground,
    textTransform: "uppercase",
  },
  modalActionDisabled: {
    opacity: 0.65,
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
