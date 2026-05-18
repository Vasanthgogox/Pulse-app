/**
 * Discover tab — search all orgs globally, connect with one tap.
 * Smart recommendations: scored by mutual connections, location match, lane overlap.
 * Shows "WHY" reason chips per card. Sort: recommended first, then alphabetical.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { PartyAvatar } from '@/components/PartyAvatar';
import {
  NetworkLoadMoreButton,
  networkCompactListStyle,
  useNetworkListPagination,
} from '@/features/network/components/NetworkCompactRows';
import {
  NETWORK_PROFILE_AVATAR_SIZE_DISCOVER,
  NETWORK_PROFILE_CARD_HEIGHT,
  NETWORK_PROFILE_CARD_RADIUS,
  NETWORK_PROFILE_COVER_HEIGHT,
} from "@/features/network/constants/networkProfileCardLayout";
import { discoverOrganizations, type DiscoverOrg } from '@/features/network/services/discover.service';
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
import { useConnectionRequestsSentQuery, useInvalidateNetwork } from '@/lib/queries/useNetworkQueries';
import { queryKeys } from '@/lib/queryKeys';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
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

function chunkBySize<T>(arr: T[], size: number): T[][] {
  if (size < 1) return arr.length ? [arr] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Maps RPC-enriched discover row to scored card model (DB already sorted). */
function mapDiscoverOrgToScored(org: DiscoverOrg): ScoredOrg {
  const signals: RecommendationSignal[] = [];
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;
  const laneOverlaps = org.lane_overlap_count ?? 0;

  if (mutuals > 0) {
    signals.push({
      type: "mutual",
      label: `${mutuals} mutual${mutuals === 1 ? "" : "s"}`,
    });
  }
  if (laneOverlaps >= 1 || org.is_in_user_trip_city) {
    signals.push({ type: "location", label: "Active on your routes" });
  }
  if (laneOverlaps >= 2) {
    signals.push({
      type: "lane",
      label: `${laneOverlaps} lane overlaps`,
    });
  }

  const score =
    typeof org.recommendation_score === "number"
      ? org.recommendation_score
      : signals.length === 0
        ? -1
        : 0;

  return { ...org, score, signals };
}

function discoverOrgLocationFallback(org: DiscoverOrg) {
  if (!org.city && !org.state && !org.address_line) return null;
  return {
    city: org.city ?? null,
    state: org.state ?? null,
    address_line: org.address_line ?? null,
  };
}

// --- Org card ---

function OrgCard({
  org,
  locationFallback,
  totalTrips,
  ratingValue,
  onConnect,
  onCancel,
  loading,
  onOpenProfile,
  stretchCellHeight,
}: {
  org: ScoredOrg;
  locationFallback?: { city?: string | null; state?: string | null; address_line?: string | null } | null;
  totalTrips?: number | null;
  ratingValue?: number | null;
  onConnect: () => void;
  onCancel: () => void;
  loading: boolean;
  onOpenProfile?: () => void;
  /** When true (embedded hub grid), card fills the row cell height so tiles align. */
  stretchCellHeight?: boolean;
}) {
  const { t } = useLanguage();
  const scale = useRef(new Animated.Value(1)).current;
  const status = org.connection_status;
  const isConnected = status === 'approved';
  const isPending = status === 'pending';
  const isRecommended = org.score > 0;
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;
  const hasMutuals = mutuals > 0;
  const resolvedRating =
    ratingValue ?? org.rating ?? org.average_rating ?? null;
  const rating =
    typeof resolvedRating === 'number' && Number.isFinite(resolvedRating)
      ? resolvedRating.toFixed(1)
      : null;
  const businessLocation = getBusinessLocation(org, locationFallback);
  const showTrips =
    typeof totalTrips === 'number' && totalTrips >= 0;

  const onIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={[
      styles.card,
      stretchCellHeight && styles.cardFixedHeightEmbedded,
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
      </View>

      <View style={styles.profileBlock}>
        <Pressable onPress={onOpenProfile} style={styles.profileBlockPress}>
          <View style={styles.profileHeroStack}>
            <View style={styles.heroAvatar}>
              <PartyAvatar
                name={org.name}
                initialsColorSeed={org.id}
                avatarSeed={org.avatar_seed}
                entityType="client"
                size={NETWORK_PROFILE_AVATAR_SIZE_DISCOVER}
                borderStyle={styles.heroAvatarImage}
              />
            </View>
            <View style={styles.profileMetricsRow}>
              {showTrips ? (
                <View style={styles.hubMetricPill}>
                  <Text style={styles.hubTripsText} numberOfLines={1}>
                    {totalTrips} trip{totalTrips === 1 ? '' : 's'}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.hubMetricPill,
                  styles.hubMetricPillRating,
                  !rating && styles.hubMetricPillRatingEmpty,
                ]}
              >
                {rating ? (
                  <Star
                    size={10}
                    color={Theme.driverGold}
                    fill={Theme.driverGold}
                    strokeWidth={2.2}
                  />
                ) : null}
                <Text
                  style={[
                    styles.hubRatingText,
                    !rating && styles.hubRatingTextEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {rating ?? 'No rating'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.orgName} numberOfLines={1} ellipsizeMode="tail">
            {org.name.toUpperCase()}
          </Text>
          <View style={styles.locationRow}>
            <MapPin
              size={10}
              color={businessLocation ? Theme.textMutedDemo : Theme.textSecondary}
              strokeWidth={2.4}
            />
            {businessLocation ? (
              <Text style={styles.locationText} numberOfLines={1}>
                {businessLocation}
              </Text>
            ) : (
              <Text style={styles.locationTextEmpty} numberOfLines={1}>
                {t('networkDiscoverLocationNotSet')}
              </Text>
            )}
          </View>
        </Pressable>
        <View style={styles.cardMetaStack}>
          <View style={[styles.discoveryMetaChip, hasMutuals && styles.discoveryMetaChipStrong]}>
            <Users size={9} color={hasMutuals ? Theme.textOnPrimary : Theme.textSecondary} strokeWidth={2.5} />
            <Text style={[styles.discoveryMetaText, hasMutuals && styles.discoveryMetaTextStrong]} numberOfLines={1}>
              {hasMutuals ? `${mutuals} mutual${mutuals === 1 ? '' : 's'}` : 'No mutuals'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardFooter}>
        {isConnected ? (
          <View style={styles.footerAction}>
            <Check size={13} color={Theme.textPrimaryDark} strokeWidth={2.5} />
            <Text style={styles.footerActionText} numberOfLines={1}>Connected</Text>
          </View>
        ) : isPending ? (
          <View style={styles.pendingFooter}>
            <View style={[styles.footerAction, styles.footerActionPending, styles.footerActionFlex]}>
              <Clock3 size={12} color={Theme.warning} strokeWidth={2.4} />
              <Text style={styles.footerActionText} numberOfLines={1}>Request sent</Text>
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
                <LoadingIndicator size={12} color={Theme.textPrimaryDark} />
              ) : (
                <X size={12} color={Theme.textPrimaryDark} strokeWidth={2.5} />
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.footerAction, styles.footerActionPrimary, loading && styles.footerActionLoading]}
            onPress={onConnect}
            onPressIn={onIn}
            onPressOut={onOut}
            disabled={loading}
          >
            {loading ? (
              <LoadingIndicator size={12} color={Theme.textPrimaryDark} />
            ) : (
              <>
                <UserPlus size={13} color={Theme.textPrimaryDark} strokeWidth={2.5} />
                <Text style={styles.footerActionText} numberOfLines={1}>Send request</Text>
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
const DISCOVER_GRID_GAP_PX = 8;
const DISCOVER_EMBEDDED_CARD_HEIGHT = NETWORK_PROFILE_CARD_HEIGHT;
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

  const invalidateNetwork = useInvalidateNetwork(orgId);
  const search = searchProp ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;

  const scoredOrgs = useMemo<ScoredOrg[]>(
    () => orgs.map(mapDiscoverOrgToScored),
    [orgs],
  );

  const connectableOrgs = useMemo(
    () => scoredOrgs.filter((o) => {
      const status = String(o.connection_status ?? 'none').toLowerCase();
      const role = String(o.profile_role ?? '').toLowerCase();
      // Show all non-connected users (including pending sent/received requests).
      // Exclude only connected users and drivers.
      return status !== 'approved' && role !== 'driver';
    }),
    [scoredOrgs],
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

  const getDiscoverOrgCardMetrics = useCallback((targetOrg: DiscoverOrg) => ({
    totalTrips: targetOrg.trip_count ?? null,
    ratingValue: targetOrg.average_rating ?? targetOrg.rating ?? null,
  }), []);

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

  const discoverListOrgs = useMemo(
    () => (search ? connectableOrgs : [...recommended, ...rest]),
    [connectableOrgs, recommended, rest, search],
  );

  const discoverPaginationKey = `${search}:${discoverListOrgs.length}`;

  const {
    visibleItems: visibleDiscoverOrgs,
    hasMore: hasMoreDiscover,
    remaining: remainingDiscover,
    loadMore: loadMoreDiscover,
  } = useNetworkListPagination(discoverListOrgs, discoverPaginationKey);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const display = embedded
      ? discoverListOrgs
      : discoverListOrgs.slice(0, discoverDisplayCap);
    if (search && display.length > 0 && !embedded) {
      items.push({ _type: 'header', label: 'Fresh profiles', count: connectableOrgs.length });
    }
    for (const org of display) items.push({ _type: 'org', org });
    return items;
  }, [connectableOrgs, discoverListOrgs, discoverDisplayCap, embedded, search]);

  const embeddedDiscoverRows = useMemo(
    () => chunkBySize(visibleDiscoverOrgs, discoverColumnCount),
    [visibleDiscoverOrgs, discoverColumnCount],
  );

  const embeddedProfileCardBody = (
    <View style={[styles.discoverCardList, networkCompactListStyle]}>
      {embeddedDiscoverRows.map((row, rowIndex) => (
        <View key={`discover-row-${rowIndex}`} style={styles.discoverGridRow}>
          {row.map((org) => (
            <View key={org.id} style={styles.discoverGridCellEmbeddedFlex}>
              <View style={styles.discoverGridCardWrapStretch}>
                <OrgCard
                  org={org}
                  locationFallback={discoverOrgLocationFallback(org)}
                  {...getDiscoverOrgCardMetrics(org)}
                  onConnect={() => tryBeginConnectionRequest(org)}
                  onCancel={() => void handleCancelRequest(org)}
                  loading={connecting === org.id}
                  stretchCellHeight
                  onOpenProfile={() => {
                    const metrics = getDiscoverOrgCardMetrics(org);
                    onOpenProfile?.({
                      ...org,
                      rating_value: metrics.ratingValue,
                      location_value: getBusinessLocation(
                        org,
                        discoverOrgLocationFallback(org),
                      ),
                    });
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ))}
      {hasMoreDiscover ? (
        <NetworkLoadMoreButton
          remaining={remainingDiscover}
          onPress={loadMoreDiscover}
        />
      ) : null}
    </View>
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
          {loading && <LoadingIndicator size={14} color={Theme.primary} />}
        </View>
      ) : loading ? (
        <View style={styles.inlineLoading}>
          <LoadingIndicator size={14} color={Theme.primary} />
        </View>
      ) : null}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {embedded ? (
        <View>
          {discoverListOrgs.length === 0 && !loading ? (
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
          ) : discoverListOrgs.length === 0 && loading ? (
            <View style={styles.embeddedGridLoading}>
              <LoadingIndicator size="small" color={Theme.primary} />
            </View>
          ) : (
            embeddedProfileCardBody
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
                locationFallback={discoverOrgLocationFallback(item.org)}
                {...getDiscoverOrgCardMetrics(item.org)}
                onConnect={() => tryBeginConnectionRequest(item.org)}
                onCancel={() => void handleCancelRequest(item.org)}
                loading={connecting === item.org.id}
                onOpenProfile={() => {
                  const metrics = getDiscoverOrgCardMetrics(item.org);
                  onOpenProfile?.({
                    ...item.org,
                    rating_value: metrics.ratingValue,
                    location_value: getBusinessLocation(item.org),
                  });
                }}
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
                <LoadingIndicator size={14} color={Theme.textPrimaryDark} />
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
  compactList: {},
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
  discoverCardList: {
    width: "100%",
    gap: 8,
  },
  listStatic: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 16,
    width: "100%",
    flexDirection: "column",
    gap: DISCOVER_GRID_GAP_PX,
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
  discoverGridCellEmbeddedFlex: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  discoverGridCellEmbeddedFixedHeight: {
    height: DISCOVER_EMBEDDED_CARD_HEIGHT,
    minHeight: DISCOVER_EMBEDDED_CARD_HEIGHT,
    maxHeight: DISCOVER_EMBEDDED_CARD_HEIGHT,
  },
  discoverGridCardWrap: {
    width: "100%",
    minWidth: 0,
  },
  discoverGridCardWrapStretch: {
    flex: 1,
    alignSelf: "stretch",
  },
  card: {
    width: "100%",
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: NETWORK_PROFILE_CARD_RADIUS,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.055,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    overflow: 'hidden',
    flexDirection: "column",
  },
  cardStretchEmbedded: {
    flex: 1,
    height: "100%",
  },
  cardFixedHeightEmbedded: {
    height: DISCOVER_EMBEDDED_CARD_HEIGHT,
    minHeight: DISCOVER_EMBEDDED_CARD_HEIGHT,
    maxHeight: DISCOVER_EMBEDDED_CARD_HEIGHT,
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
    height: NETWORK_PROFILE_COVER_HEIGHT,
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
    top: 6,
    right: 6,
    minHeight: 16,
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 8,
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
    includeFontPadding: false,
  },
  profileBlock: {
    position: "relative",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  profileBlockFlex: {
    flex: 1,
    minHeight: 0,
    justifyContent: "flex-start",
  },
  profileBlockPress: {
    alignItems: "center",
    width: "100%",
  },
  profileHeroStack: {
    alignItems: "center",
    width: "100%",
    marginTop: -22,
    paddingHorizontal: 4,
    zIndex: 5,
    gap: 6,
  },
  profileMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
  },
  hubMetricPill: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    flexShrink: 1,
    maxWidth: "48%",
  },
  hubMetricPillRating: {
    gap: 4,
  },
  hubMetricPillRatingEmpty: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 20,
  },
  hubTripsText: {
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 9,
  },
  hubRatingText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  hubRatingTextEmpty: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: -0.1,
  },
  heroAvatar: {
    width: NETWORK_PROFILE_AVATAR_SIZE_DISCOVER + 4,
    height: NETWORK_PROFILE_AVATAR_SIZE_DISCOVER + 4,
    borderRadius: (NETWORK_PROFILE_AVATAR_SIZE_DISCOVER + 4) / 2,
    overflow: "hidden",
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroAvatarImage: {
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  info: { flex: 1, gap: 5 },
  orgName: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 12,
    height: 12,
    maxHeight: 12,
    width: "100%",
    paddingHorizontal: 6,
    includeFontPadding: false,
    flexShrink: 1,
  },
  locationRow: {
    height: 12,
    maxHeight: 12,
    width: "100%",
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
    paddingHorizontal: 4,
  },
  locationText: {
    fontSize: 8,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    lineHeight: 11,
    textAlign: "center",
    includeFontPadding: false,
  },
  locationTextEmpty: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
    lineHeight: 11,
    textAlign: "center",
    opacity: 0.85,
    includeFontPadding: false,
  },
  cardMetaStack: {
    width: "100%",
    paddingHorizontal: 6,
    marginTop: 0,
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryMetaChip: {
    minHeight: 18,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  discoveryMetaChipStrong: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  discoveryMetaText: {
    fontSize: 7,
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
  cardFooter: {
    minHeight: 28,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    alignItems: "stretch",
    justifyContent: "center",
  },
  footerAction: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  footerActionPrimary: {
    borderColor: Theme.textPrimaryDark,
    width: "100%",
  },
  footerActionPending: {
    borderColor: Theme.borderMedium,
  },
  footerActionFlex: {
    flex: 1,
    minWidth: 0,
  },
  footerActionLoading: {
    opacity: 0.72,
  },
  footerActionText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  pendingFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  cancelRequestBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    flexShrink: 0,
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
