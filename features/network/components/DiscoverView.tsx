/**
 * Discover tab — search all orgs globally, connect with one tap.
 * Smart recommendations: scored by mutual connections, location match, lane overlap.
 * Shows "WHY" reason chips per card. Sort: recommended first, then alphabetical.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { PartyAvatar } from '@/components/PartyAvatar';
import { discoverOrganizations, type DiscoverOrg } from '@/features/network/services/discover.service';
import { getOrganizationLocationsByIds } from '@/features/organization/services/organization.service';
import { showAppAlert } from "@/lib/appAlert";
import { todayPendingInviteCountFromSent } from "@/lib/todayPendingInviteCount";
import {
  cancelPendingConnectionRequestByOrgPair,
  CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
  CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
  createConnectionRequest,
  DAILY_CONNECTION_INVITE_LIMIT,
  type ConnectionRequestRow,
  looksLikeConnectionRateLimitError,
} from "@/services/connectionRequestsService";
import { useConnectionRequestsSentQuery, useIndentsQuery, useInvalidateNetwork, useNetworkFeedQuery } from '@/lib/queries';
import { queryKeys } from '@/lib/queryKeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock3,
  Compass,
  MapPin,
  Search,
  Sparkles,
  Star,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

interface DiscoverViewProps {
  orgId: string;
  /** When true, render the hub grid instead of a standalone scrolling list. */
  embedded?: boolean;
  /**
   * When true with `embedded`, grid scrolls inside a bounded area so the parent can keep
   * a static section header (e.g. Network tab "Grow your network").
   */
  embeddedScrollable?: boolean;
  /** Max height of the embedded scroll area; defaults from window size when omitted. */
  embeddedScrollMaxHeight?: number;
  search?: string;
  onSearchChange?: (value: string) => void;
  showSearchChrome?: boolean;
  onOpenProfile?: (org: DiscoverOrg & { rating_value?: number | null; location_value?: string | null }) => void;
  /** Called whenever the daily invite count changes so the parent can display it inline. */
  onInviteCountChange?: (count: number, limit: number) => void;
  /** When true (e.g. header shows max invites), block Send request with daily-limit alert even if query count lags. */
  inviteDailyCapReached?: boolean;
}

// --- Scoring ---

interface RecommendationSignal {
  type: 'mutual' | 'location' | 'lane';
  label: string;
}

interface ScoredOrg extends DiscoverOrg {
  score: number;
  signals: RecommendationSignal[];
}

function getBusinessLocation(
  org: DiscoverOrg,
  fallback?: { city?: string | null; state?: string | null; address_line?: string | null } | null,
): string | null {
  const candidate = (
    org as DiscoverOrg & {
      business_location?: string | null;
      location?: string | null;
      city?: string | null;
      state?: string | null;
      headquarters?: string | null;
      address_line?: string | null;
    }
  );
  const cityState = [candidate.city, candidate.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ')
    .trim();
  if (cityState) return cityState;

  const fallbackCityState = [fallback?.city, fallback?.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ')
    .trim();
  if (fallbackCityState) return fallbackCityState;

  const direct =
    candidate.business_location ??
    candidate.location ??
    candidate.headquarters ??
    (candidate.address_line?.trim() ? candidate.address_line.trim() : null) ??
    null;
  if (direct && direct.trim()) {
    const parts = direct
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return direct.trim();
  }
  return null;
}

function extractCity(location: string | null | undefined): string {
  if (!location) return '';
  return location.split(',')[0].trim().toLowerCase();
}

function chunkBySize<T>(arr: T[], size: number): T[][] {
  if (size < 1) return arr.length ? [arr] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function scoreOrgs(
  orgs: DiscoverOrg[],
  myLocations: Set<string>,
  feedOrgLocations: Map<string, Set<string>>,
): ScoredOrg[] {
  return orgs.map((org) => {
    const signals: RecommendationSignal[] = [];
    let score = 0;
    const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;

    if (mutuals > 0) {
      score += 2;
      signals.push({
        type: "mutual",
        label: `${mutuals} mutual${mutuals === 1 ? "" : "s"}`,
      });
    }

    const orgPostCities = feedOrgLocations.get(org.id);
    if (orgPostCities) {
      let matches = 0;
      for (const city of orgPostCities) {
        if (myLocations.has(city)) matches++;
      }
      if (matches >= 1) {
        score += 2;
        signals.push({ type: 'location', label: 'Active on your routes' });
      }
      if (matches >= 2) {
        score += 1;
        signals.push({ type: 'lane', label: `${matches} lane overlaps` });
      }
    }

    if (signals.length === 0) score = -1;
    return { ...org, score, signals };
  });
}

// --- Org card ---

function OrgCard({ org, locationFallback, onConnect, onCancel, loading, onOpenProfile }: {
  org: ScoredOrg;
  locationFallback?: { city?: string | null; state?: string | null; address_line?: string | null } | null;
  onConnect: () => void;
  onCancel: () => void;
  loading: boolean;
  onOpenProfile?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const status = org.connection_status;
  const isConnected = status === 'approved';
  const isPending = status === 'pending';
  const isRecommended = org.score > 0;
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;
  const hasMutuals = mutuals > 0;
  const ratingValue = org.rating ?? org.average_rating ?? null;
  const rating = typeof ratingValue === "number" && Number.isFinite(ratingValue)
    ? ratingValue.toFixed(1)
    : null;
  const businessLocation = getBusinessLocation(org, locationFallback);

  const onIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={[
      styles.card,
      isConnected && styles.cardConnected,
      isRecommended && !isConnected && !isPending && styles.cardRecommended,
      { transform: [{ scale }] },
    ]}>
      <View style={styles.discoverCover}>
        <View style={styles.discoverCoverOrb} />
        <View style={styles.discoverCoverOrbSmall} />
        <View style={styles.discoverCoverPlane} />
        <View style={styles.coverSignalChip}>
          <Text style={styles.coverSignalText}>
            {isConnected ? "CONNECTED" : isPending ? "REQUEST SENT" : "LIVE"}
          </Text>
        </View>
        <View style={[styles.coverRatingNode, !rating && styles.coverRatingNodeEmpty]}>
          {rating ? (
            <Star size={10} color={Theme.driverGold} fill={Theme.driverGold} strokeWidth={2.2} />
          ) : null}
          <Text style={[styles.coverRatingText, !rating && styles.coverRatingTextEmpty]}>
            {rating ?? "No rating"}
          </Text>
        </View>
      </View>

      <View style={styles.discoveryHero}>
        <Pressable onPress={onOpenProfile} style={styles.discoveryHeroPress}>
        <View style={styles.avatar}>
          <PartyAvatar
            name={org.name}
            avatarSeed={org.avatar_seed}
            entityType="client"
            size={62}
            borderStyle={styles.avatarImage}
          />
        </View>
        <Text style={styles.orgName} numberOfLines={1}>{org.name.toUpperCase()}</Text>
        <View style={styles.locationRow}>
          <MapPin size={10} color={Theme.textMutedDemo} strokeWidth={2.4} />
          <Text style={styles.locationText} numberOfLines={1}>
            {businessLocation ?? "Not available"}
          </Text>
        </View>
        </Pressable>
      </View>

      <View style={styles.discoveryMetaStack}>
        <View style={[styles.discoveryMetaChip, hasMutuals && styles.discoveryMetaChipStrong]}>
          <Users size={10} color={hasMutuals ? Theme.textOnPrimary : Theme.textSecondary} strokeWidth={2.5} />
          <Text style={[styles.discoveryMetaText, hasMutuals && styles.discoveryMetaTextStrong]} numberOfLines={1}>
            {hasMutuals ? `${mutuals} mutual${mutuals === 1 ? "" : "s"}` : "No mutuals"}
          </Text>
        </View>
        {isRecommended ? (
          <View style={styles.discoveryMetaChip}>
            <Text style={styles.discoveryMetaText} numberOfLines={1}>
              Active lane overlap
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        {isConnected ? (
          <View style={styles.stateTag}>
            <Check size={13} color={Theme.textPrimaryDark} strokeWidth={2.5} />
            <Text style={styles.stateTagText}>Connected</Text>
          </View>
        ) : isPending ? (
          <View style={styles.pendingActionRow}>
            <View style={styles.stateTag}>
              <Clock3 size={13} color={Theme.warning} strokeWidth={2.5} />
              <Text style={styles.stateTagText}>Request sent</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.cancelRequestBtn,
                pressed && { opacity: 0.72 },
                loading && styles.cancelRequestBtnLoading,
              ]}
              onPress={onCancel}
              disabled={loading}
              hitSlop={8}
              accessibilityLabel={`Cancel request to ${org.name}`}
            >
              {loading ? (
                <ActivityIndicator size={11} color={Theme.textPrimaryDark} />
              ) : (
                <X size={13} color={Theme.textPrimaryDark} strokeWidth={2.7} />
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.connectBtn, loading && styles.connectBtnLoading]}
            onPress={onConnect}
            onPressIn={onIn}
            onPressOut={onOut}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size={12} color={Theme.textPrimaryDark} />
            ) : (
              <>
                <UserPlus size={13} color={Theme.textPrimaryDark} strokeWidth={2.5} />
                <Text style={styles.connectBtnText}>Send request</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Sparkles size={12} color={Theme.textSecondary} />
      <Text style={styles.sectionTitle}>{label.toUpperCase()}</Text>
      {count != null && count > 0 && (
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// --- Main view ---

/** Matches Network tab `isMobileLayout` (<820): 2 cols × 3 rows. Else desktop: 7 cols × 2 rows. */
const DISCOVER_GRID_BREAKPOINT = 820;
const DISCOVER_COLS_DESKTOP = 7;
const DISCOVER_ROWS_DESKTOP = 2;
const DISCOVER_COLS_MOBILE = 2;
const DISCOVER_ROWS_MOBILE = 3;
/** Matches discoverOrganizations fetch limit — show full result set inside embedded scroll. */
const EMBEDDED_SCROLL_ITEM_CAP = 40;
const LIST_STATIC_HORIZONTAL_PAD = 14 * 2;
const DISCOVER_GRID_GAP_PX = 12;
/** Before `onLayout` reports width, cap provisional outer width so 7-up math stays modest vs narrow columns. */
const DISCOVER_EMBEDDED_PROVISIONAL_OUTER_CAP = 520;

export function DiscoverView({
  orgId,
  embedded,
  embeddedScrollable = false,
  embeddedScrollMaxHeight: embeddedScrollMaxHeightProp,
  search: searchProp,
  onSearchChange,
  showSearchChrome = true,
  onOpenProfile,
  onInviteCountChange,
  inviteDailyCapReached = false,
}: DiscoverViewProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /** Measured width of the embedded discover grid (list or outer container), for fixed card columns. */
  const [embeddedListWidth, setEmbeddedListWidth] = useState(0);
  const recordEmbeddedListWidth = useCallback((w: number) => {
    if (w > 0) setEmbeddedListWidth((prev) => Math.max(prev, w));
  }, []);
  const [internalSearch, setInternalSearch] = useState("");
  const [orgs, setOrgs] = useState<DiscoverOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [requestRoleModalOrg, setRequestRoleModalOrg] = useState<ScoredOrg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const sentQ = useConnectionRequestsSentQuery(orgId);

  // Org IDs we've already sent a pending request to (exclude from discover)
  const sentOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of sentQ.data ?? []) {
      if (r.status === 'pending') ids.add(r.to_organization_id);
    }
    return ids;
  }, [sentQ.data]);

  const todayInviteCount = useMemo(
    () => todayPendingInviteCountFromSent(sentQ.data ?? []),
    [sentQ.data],
  );

  const atDailyInviteLimit = useMemo(
    () =>
      todayInviteCount >= DAILY_CONNECTION_INVITE_LIMIT || inviteDailyCapReached === true,
    [todayInviteCount, inviteDailyCapReached],
  );

  useEffect(() => {
    onInviteCountChange?.(todayInviteCount, DAILY_CONNECTION_INVITE_LIMIT);
  }, [todayInviteCount, onInviteCountChange]);

  const feedQ = useNetworkFeedQuery(orgId);
  const indentsQ = useIndentsQuery(orgId);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const search = searchProp ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;

  const myLocations = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    const indents = (indentsQ.data ?? []) as { pickup_area?: string; drop_location?: string }[];
    for (const indent of indents) {
      const pickup = extractCity(indent.pickup_area);
      const drop = extractCity(indent.drop_location);
      if (pickup) set.add(pickup);
      if (drop) set.add(drop);
    }
    return set;
  }, [indentsQ.data]);

  const feedOrgLocations = useMemo<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    for (const post of feedQ.data ?? []) {
      if (post.type !== 'LOAD' && post.type !== 'VEHICLE_AVAILABILITY') continue;
      if (!map.has(post.organization_id)) map.set(post.organization_id, new Set());
      const origin = extractCity(post.origin);
      const dest = extractCity(post.destination);
      if (origin) map.get(post.organization_id)!.add(origin);
      if (dest) map.get(post.organization_id)!.add(dest);
    }
    return map;
  }, [feedQ.data]);

  const scoredOrgs = useMemo<ScoredOrg[]>(() => {
    const scored = scoreOrgs(orgs, myLocations, feedOrgLocations);
    return scored.sort((a, b) => b.score !== a.score ? b.score - a.score : a.name.localeCompare(b.name));
  }, [orgs, myLocations, feedOrgLocations]);

  const connectableOrgs = useMemo(
    () => scoredOrgs.filter((o) => {
      const status = String(o.connection_status ?? 'none').toLowerCase();
      return status === 'none' && !sentOrgIds.has(o.id);
    }),
    [scoredOrgs, sentOrgIds],
  );
  const recommended = connectableOrgs.filter((o) => o.score > 0);
  const rest = connectableOrgs.filter((o) => o.score <= 0);
  /**
   * Column count follows the viewport only — wide window = 7 columns, narrow = 2.
   * Do not use embedded list width here: a narrow discover pane on a desktop would wrongly flip to 2-up.
   */
  const isDiscoverDesktopGrid = windowWidth >= DISCOVER_GRID_BREAKPOINT;
  const discoverColumnCount = isDiscoverDesktopGrid
    ? DISCOVER_COLS_DESKTOP
    : DISCOVER_COLS_MOBILE;
  const discoverRowCap = isDiscoverDesktopGrid
    ? DISCOVER_ROWS_DESKTOP
    : DISCOVER_ROWS_MOBILE;
  const discoverMaxVisible = discoverColumnCount * discoverRowCap;

  const embeddedScrollMaxHeight = useMemo(() => {
    if (embeddedScrollMaxHeightProp != null && embeddedScrollMaxHeightProp > 0) {
      return embeddedScrollMaxHeightProp;
    }
    return Math.min(560, Math.round(windowHeight * 0.48));
  }, [embeddedScrollMaxHeightProp, windowHeight]);

  const discoverDisplayCap = useMemo(
    () =>
      embedded && embeddedScrollable ? EMBEDDED_SCROLL_ITEM_CAP : discoverMaxVisible,
    [embedded, embeddedScrollable, discoverMaxVisible],
  );

  /**
   * Fixed pixel width per card column (same as a full 7- or 2-up row). Rows use `justifyContent:
   * 'flex-start'` so short rows do not stretch cards. Uses measured list/container width when
   * available; until then a capped provisional width avoids one card filling the row.
   */
  const embeddedDiscoverCellWidth = useMemo(() => {
    if (!embedded) return null;
    const cols = discoverColumnCount;
    const gaps = Math.max(0, cols - 1) * DISCOVER_GRID_GAP_PX;
    const windowOuter = Math.max(0, windowWidth - Layout.screenPaddingHorizontal * 2);
    const listOuter =
      embeddedListWidth > 0
        ? embeddedListWidth
        : Math.min(windowOuter, DISCOVER_EMBEDDED_PROVISIONAL_OUTER_CAP);
    const inner = Math.max(0, listOuter - LIST_STATIC_HORIZONTAL_PAD);
    const raw = (inner - gaps) / cols;
    const cell = Number.isFinite(raw) && raw > 0 ? raw : inner / Math.max(cols, 1);
    return Math.max(36, cell);
  }, [embedded, embeddedListWidth, windowWidth, discoverColumnCount]);

  const discoverOrgIds = useMemo(
    () => [...new Set(orgs.map((org) => org.id).filter(Boolean))].sort(),
    [orgs],
  );
  const organizationLocationsQ = useQuery({
    queryKey: ['network', 'discover', 'organization-locations', discoverOrgIds],
    queryFn: async () => {
      const { error: orgErr, locations } = await getOrganizationLocationsByIds(discoverOrgIds);
      if (orgErr) {
        if (__DEV__) console.warn('[DiscoverView] organization locations:', orgErr.message);
        return [];
      }
      return locations;
    },
    enabled: discoverOrgIds.length > 0,
  });
  const organizationLocationById = useMemo(() => {
    const map: Record<string, { city: string | null; state: string | null; address_line: string | null }> = {};
    for (const location of organizationLocationsQ.data ?? []) {
      map[location.id] = {
        city: location.city ?? null,
        state: location.state ?? null,
        address_line: location.address_line ?? null,
      };
    }
    return map;
  }, [organizationLocationsQ.data]);

  const fetchOrgs = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    const { orgs: results, error: err } = await discoverOrganizations(orgId, q, 40, 0);
    if (err) setError('Could not load — run db:push to deploy the migration');
    setOrgs(results);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchOrgs(search), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, fetchOrgs]);

  const closeRequestRoleModal = useCallback(() => {
    if (connecting) return;
    setRequestRoleModalOrg(null);
  }, [connecting]);

  const showInviteLimitExceededAlert = useCallback(() => {
    showAppAlert(CONNECTION_REQUEST_DAILY_LIMIT_TITLE, CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE);
  }, []);

  const tryBeginConnectionRequest = useCallback(
    (org: ScoredOrg) => {
      if (atDailyInviteLimit) {
        showInviteLimitExceededAlert();
        return;
      }
      setRequestRoleModalOrg(org);
    },
    [atDailyInviteLimit, showInviteLimitExceededAlert],
  );

  const handleConnect = async (org: ScoredOrg, mode: "client" | "supplier") => {
    if (atDailyInviteLimit) {
      showInviteLimitExceededAlert();
      return;
    }
    setConnecting(org.id);
    setRequestRoleModalOrg(null);
    const { error, alreadyInvited, requestId } = await createConnectionRequest(orgId, org.id, {
      requestShipperClient: mode === "client",
      requestCarrierSupplier: mode === "supplier",
    });
    setConnecting(null);
    if (error) {
      const msg = error.message;
      if (looksLikeConnectionRateLimitError(msg)) {
        showInviteLimitExceededAlert();
      } else {
        Alert.alert("Could not connect", msg);
      }
      return;
    }
    if (alreadyInvited) {
      setOrgs((prev) => prev.filter((o) => o.id !== org.id));
      invalidateNetwork();
      return;
    }
    setOrgs((prev) => prev.filter((o) => o.id !== org.id));
    if (requestId) {
      queryClient.setQueryData<ConnectionRequestRow[]>(
        queryKeys.connectionRequests.sent(orgId),
        (prev = []) => {
          if (prev.some((r) => r.id === requestId)) return prev;
          const optimistic: ConnectionRequestRow = {
            id: requestId,
            from_organization_id: orgId,
            to_organization_id: org.id,
            request_shipper_client: mode === "client",
            request_carrier_supplier: mode === "supplier",
            status: 'pending',
            created_at: new Date().toISOString(),
            responded_at: null,
            responded_by: null,
            from_org_name: '',
            to_org_name: org.name,
          };
          return [optimistic, ...prev];
        }
      );
    }
    invalidateNetwork();
  };

  const handleCancelRequest = async (org: ScoredOrg) => {
    setConnecting(org.id);
    const { error, deleted } = await cancelPendingConnectionRequestByOrgPair(orgId, org.id);
    setConnecting(null);
    if (error) {
      Alert.alert("Could not cancel request", error.message);
      return;
    }
    if (!deleted) {
      Alert.alert("Request already changed", "Refreshing the latest network state.");
    }
    setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, connection_status: "none" } : o)));
    queryClient.setQueryData<ConnectionRequestRow[]>(
      queryKeys.connectionRequests.sent(orgId),
      (prev = []) => prev.filter((r) => !(r.to_organization_id === org.id && r.status === "pending"))
    );
    invalidateNetwork();
    void fetchOrgs(search);
  };

  type ListItem =
    | { _type: 'header'; label: string; count: number }
    | { _type: 'org'; org: ScoredOrg };

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const display = (search ? connectableOrgs : [...recommended, ...rest]).slice(
      0,
      discoverDisplayCap,
    );
    if (search && display.length > 0) {
      items.push({ _type: 'header', label: 'Fresh profiles', count: connectableOrgs.length });
    }
    for (const org of display) items.push({ _type: 'org', org });
    return items;
  }, [connectableOrgs, recommended, rest, search, discoverDisplayCap]);

  const embeddedDiscoverSections = useMemo(() => {
    const orgItems = listData.filter(
      (item): item is Extract<ListItem, { _type: "org" }> =>
        item._type === "org",
    );
    const header =
      listData.find(
        (item): item is Extract<ListItem, { _type: "header" }> =>
          item._type === "header",
      ) ?? null;
    return {
      header,
      rows: chunkBySize(orgItems, discoverColumnCount),
    };
  }, [listData, discoverColumnCount]);

  const embeddedGridBody = (
    <>
      {embeddedDiscoverSections.header ? (
        <View style={styles.gridHeaderCell}>
          <SectionLabel
            label={embeddedDiscoverSections.header.label}
            count={embeddedDiscoverSections.header.count}
          />
        </View>
      ) : null}
      {embeddedDiscoverSections.rows.map((row, ri) => (
        <View key={`discover-grid-${ri}`} style={styles.discoverGridRow}>
          {row.map((item) => (
            <View
              key={item.org.id}
              style={[
                styles.discoverGridCell,
                embedded &&
                  embeddedDiscoverCellWidth != null && {
                    width: embeddedDiscoverCellWidth,
                    minWidth: embeddedDiscoverCellWidth,
                    maxWidth: embeddedDiscoverCellWidth,
                    flexGrow: 0,
                    flexShrink: 0,
                    alignSelf: "flex-start",
                  },
              ]}
            >
              <View style={styles.discoverGridCardWrap}>
                <OrgCard
                  org={item.org}
                  locationFallback={organizationLocationById[item.org.id]}
                  onConnect={() => tryBeginConnectionRequest(item.org)}
                  onCancel={() => void handleCancelRequest(item.org)}
                  loading={connecting === item.org.id}
                  onOpenProfile={() =>
                    onOpenProfile?.({
                      ...item.org,
                      rating_value:
                        item.org.rating ?? item.org.average_rating ?? null,
                      location_value: getBusinessLocation(item.org),
                    })
                  }
                />
              </View>
            </View>
          ))}
        </View>
      ))}
    </>
  );

  return (
    <View
      style={[styles.container, embedded && styles.containerEmbedded]}
      onLayout={
        embedded
          ? (e) => recordEmbeddedListWidth(e.nativeEvent.layout.width)
          : undefined
      }
    >
      {showSearchChrome ? (
        <View style={styles.searchBox}>
          <Search size={16} color={Theme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by company name..."
            placeholderTextColor={Theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="words"
          />
          {loading && <ActivityIndicator size={14} color={Theme.primary} />}
        </View>
      ) : loading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size={14} color={Theme.primary} />
        </View>
      ) : null}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {embedded ? (
        <View>
          {listData.length === 0 && !loading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Compass size={36} color={Theme.textSecondary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>
                {search ? "No results found" : "Discover your network"}
              </Text>
              <Text style={styles.emptySub}>
                {search
                  ? `No organizations found for "${search}"`
                  : "Search for companies, clients, and suppliers across the country"}
              </Text>
            </View>
          ) : listData.length === 0 && loading ? (
            <View style={styles.embeddedGridLoading}>
              <ActivityIndicator size="small" color={Theme.primary} />
            </View>
          ) : embeddedScrollable ? (
            <ScrollView
              style={[styles.embeddedDiscoverScroll, { maxHeight: embeddedScrollMaxHeight }]}
              contentContainerStyle={styles.listStatic}
              onLayout={(e) => recordEmbeddedListWidth(e.nativeEvent.layout.width)}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {embeddedGridBody}
            </ScrollView>
          ) : (
            <View
              style={styles.listStatic}
              onLayout={(e) => recordEmbeddedListWidth(e.nativeEvent.layout.width)}
            >
              {embeddedGridBody}
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => (item._type === "header" ? `h-${i}` : item.org.id)}
          renderItem={({ item }) => {
            if (item._type === "header") {
              return <SectionLabel label={item.label} count={item.count} />;
            }
            return (
              <OrgCard
                org={item.org}
                locationFallback={organizationLocationById[item.org.id]}
                onConnect={() => tryBeginConnectionRequest(item.org)}
                onCancel={() => void handleCancelRequest(item.org)}
                loading={connecting === item.org.id}
                onOpenProfile={() =>
                  onOpenProfile?.({
                    ...item.org,
                    rating_value: item.org.rating ?? item.org.average_rating ?? null,
                    location_value: getBusinessLocation(item.org),
                  })
                }
              />
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Compass size={36} color={Theme.textSecondary} strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyTitle}>
                  {search ? "No results found" : "Discover your network"}
                </Text>
                <Text style={styles.emptySub}>
                  {search
                    ? `No organizations found for "${search}"`
                    : "Search for companies, clients, and suppliers across the country"}
                </Text>
              </View>
            ) : null
          }
        />
      )}
      <Modal
        visible={Boolean(requestRoleModalOrg)}
        transparent
        animationType="fade"
        onRequestClose={closeRequestRoleModal}
      >
        <View style={styles.requestRoleModalBackdrop}>
          <Pressable
            style={styles.requestRoleModalBackdropTouch}
            onPress={closeRequestRoleModal}
            disabled={Boolean(connecting)}
          />
          <View style={styles.requestRoleModalCard}>
            <Text style={styles.requestRoleModalKicker}>Connection type</Text>
            <Text style={styles.requestRoleModalTitle} numberOfLines={2}>
              {requestRoleModalOrg ? `Invite ${requestRoleModalOrg.name}` : "Invite organization"}
            </Text>
            <Text style={styles.requestRoleModalSubTitle}>
              Choose how this organization should be added to your network.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.requestRoleOptionBtn,
                pressed && styles.requestRoleOptionBtnPressed,
              ]}
              onPress={() =>
                requestRoleModalOrg ? void handleConnect(requestRoleModalOrg, "client") : undefined
              }
              disabled={!requestRoleModalOrg || Boolean(connecting)}
            >
              <Text style={styles.requestRoleOptionTitle}>Add as client</Text>
              <Text style={styles.requestRoleOptionDesc}>
                They appear in your clients list after approval.
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.requestRoleOptionBtn,
                pressed && styles.requestRoleOptionBtnPressed,
              ]}
              onPress={() =>
                requestRoleModalOrg ? void handleConnect(requestRoleModalOrg, "supplier") : undefined
              }
              disabled={!requestRoleModalOrg || Boolean(connecting)}
            >
              <Text style={styles.requestRoleOptionTitle}>Add as supplier</Text>
              <Text style={styles.requestRoleOptionDesc}>
                They appear in your suppliers list after approval.
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.requestRoleCancelBtn,
                pressed && styles.requestRoleCancelBtnPressed,
              ]}
              onPress={closeRequestRoleModal}
              disabled={Boolean(connecting)}
            >
              {connecting ? (
                <ActivityIndicator size={14} color={Theme.textPrimaryDark} />
              ) : (
                <Text style={styles.requestRoleCancelText}>Cancel</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  containerEmbedded: {
    flex: 0,
    flexGrow: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 14,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: Theme.textPrimary, fontWeight: '600' },
  inlineLoading: {
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  errorBanner: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '900', color: Theme.textSecondary, letterSpacing: 1.2, flex: 1,
  },
  resultCount: {
    backgroundColor: Theme.primary + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  resultCountText: { fontSize: 10, fontWeight: '900', color: Theme.primary },
  list: { paddingHorizontal: 14, paddingBottom: 40, gap: 12 },
  embeddedDiscoverScroll: {
    width: "100%",
    alignSelf: "stretch",
  },
  listStatic: {
    paddingHorizontal: 14,
    paddingBottom: 24,
    width: "100%",
    flexDirection: "column",
    gap: 12,
    alignItems: "stretch",
  },
  gridHeaderCell: { width: "100%" },
  discoverGridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "nowrap",
    width: "100%",
    maxWidth: "100%",
    gap: DISCOVER_GRID_GAP_PX,
    justifyContent: "flex-start",
  },
  discoverGridCell: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
  },
  discoverGridCardWrap: {
    width: "100%",
    minWidth: 0,
  },
  card: {
    width: "100%",
    backgroundColor: Theme.screenBackground,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.055,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    overflow: 'hidden',
  },
  cardConnected: { borderColor: Theme.borderLight },
  cardRecommended: { borderColor: Theme.aggregatePillBorder, borderWidth: 1 },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6366f10e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#6366f120',
  },
  recommendedText: { fontSize: 9, fontWeight: '800', color: '#6366f1', letterSpacing: 0.4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  discoverCover: {
    height: 82,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  discoverCoverOrb: {
    position: "absolute",
    width: 132,
    height: 70,
    borderRadius: 66,
    top: -20,
    left: -28,
    backgroundColor: Theme.borderLight,
    transform: [{ rotate: "-9deg" }],
  },
  discoverCoverOrbSmall: {
    position: "absolute",
    width: 92,
    height: 54,
    borderRadius: 46,
    right: -22,
    bottom: -16,
    backgroundColor: Theme.surface,
    transform: [{ rotate: "12deg" }],
  },
  discoverCoverPlane: {
    position: "absolute",
    width: 112,
    height: 52,
    borderRadius: 14,
    right: 28,
    top: 10,
    backgroundColor: Theme.screenBackground,
    opacity: 0.58,
    transform: [{ rotate: "-8deg" }],
  },
  coverSignalChip: {
    position: "absolute",
    top: 8,
    right: 8,
    minHeight: 20,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverSignalText: {
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    letterSpacing: 0.8,
    color: Theme.textPrimaryDark,
  },
  coverRatingNode: {
    position: "absolute",
    right: 8,
    bottom: 8,
    minHeight: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverRatingNodeEmpty: {
    minHeight: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  coverRatingText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  coverRatingTextEmpty: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: -0.1,
  },
  discoveryHero: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  discoveryHeroPress: {
    alignItems: "center",
    width: "100%",
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
    marginTop: -31,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  avatarImage: {
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  info: { flex: 1, gap: 5 },
  orgName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    letterSpacing: -0.2,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 15,
  },
  locationRow: {
    minHeight: 14,
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
    paddingHorizontal: 4,
  },
  locationText: {
    fontSize: 9,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    lineHeight: 12,
    textAlign: "center",
  },
  discoveryMetaStack: {
    width: "100%",
    paddingHorizontal: 8,
    gap: 6,
    marginTop: 2,
    marginBottom: 8,
    alignItems: "center",
  },
  discoveryMetaChip: {
    minHeight: 22,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  discoveryMetaChipStrong: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  discoveryMetaText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  discoveryMetaTextStrong: {
    color: Theme.textOnPrimary,
  },
  detailStack: { marginTop: 14 },
  detailRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    letterSpacing: 0.35,
  },
  ratingPill: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  ratingValue: {
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  memberStack: { flexDirection: "row", alignItems: "center" },
  memberAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.screenBackground,
    backgroundColor: Theme.surface,
  },
  memberAvatarMuted: {
    opacity: 0.55,
  },
  memberAvatarText: { fontSize: 7, fontWeight: "600", fontStyle: "italic", letterSpacing: -0.4, color: Theme.textPrimaryDark },
  mutualCountPill: {
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
    backgroundColor: Theme.textPrimaryDark,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    marginLeft: -4,
    paddingHorizontal: 5,
    maxWidth: 96,
  },
  mutualCountPillEmpty: {
    backgroundColor: Theme.surface,
  },
  mutualCountText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
  },
  mutualCountTextEmpty: {
    color: Theme.textSecondary,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connectedLabel: { fontSize: 10, fontWeight: '700', color: '#10b981' },
  pendingLabel: { fontSize: 10, fontWeight: '700', color: '#f59e0b' },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 34,
    minWidth: 118,
    justifyContent: 'center',
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  connectBtnLoading: { opacity: 0.7 },
  connectBtnText: { fontSize: 10, fontWeight: '700', fontStyle: "italic", color: Theme.textPrimaryDark, letterSpacing: 0.2 },
  cardFooter: {
    minHeight: 50,
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTag: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  stateTagText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  pendingActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  cancelRequestBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.025,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cancelRequestBtnLoading: {
    opacity: 0.68,
  },
  connectedBadge: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#10b98114',
    alignItems: 'center', justifyContent: 'center',
  },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f59e0b14', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '800', color: '#f59e0b' },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 40, gap: 12 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: Theme.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Theme.textPrimary, letterSpacing: -0.3, textAlign: 'center' },
  emptySub: { fontSize: 13, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  embeddedGridLoading: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  requestRoleModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.44)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  requestRoleModalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  requestRoleModalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  requestRoleModalKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  requestRoleModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  requestRoleModalSubTitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 17,
    marginBottom: 4,
  },
  requestRoleOptionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  requestRoleOptionBtnPressed: {
    opacity: 0.8,
  },
  requestRoleOptionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  requestRoleOptionDesc: {
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  requestRoleCancelBtn: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  requestRoleCancelBtnPressed: {
    opacity: 0.75,
  },
  requestRoleCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  inviteCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  inviteCounterText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textSecondary,
    letterSpacing: 0.3,
  },
});
