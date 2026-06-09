/**
 * Grow your network tab — Metronic split layout with sidebar widgets and
 * 3-column Team Crew style recommendation grid.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  cancelPendingConnectionRequestByOrgPair,
  CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
  CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
  createConnectionRequest,
  DAILY_CONNECTION_INVITE_LIMIT,
  looksLikeConnectionRateLimitError,
  type ConnectionRequestRow,
} from "@/features/connections/services/connectionRequests.service";
import {
  ConnectionsView,
  type ConnectedOrg,
} from "@/features/network/components/ConnectionsView";
import {
  ConnectionRoleModal,
  type ConnectionInviteRole,
} from "@/features/network/components/ConnectionRoleModal";
import { NetworkDesktopGrowOrgCard } from "@/features/network/components/desktop/NetworkDesktopGrowOrgCard";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useNetworkDiscovery } from "@/features/network/hooks/useNetworkDiscovery";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import {
  isConnectableDiscoverOrg,
  scoreDiscoverOrg,
  type ScoredDiscoverOrg,
} from "@/features/network/utils/discoverRecommendations.util";
import { showAppAlert } from "@/lib/appAlert";
import { todayPendingInviteCountFromSent } from "@/lib/todayPendingInviteCount";
import {
  useConnectionRequestsSentQuery,
  useInvalidateNetwork,
} from "@/lib/queries/useNetworkQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  Search,
  Sparkles,
  UserPlus,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  orgId: string;
  /** Raw search box value (may include phone formatting). */
  search: string;
  /** Term passed to discover RPC — strips phone-like queries. */
  orgSearch: string;
  onSearchChange: (v: string) => void;
  totalConnections: number;
  clientCount: number;
  supplierCount: number;
  discoverInviteCount: number;
  discoverInviteLimit: number;
  onInviteCountChange?: (count: number, limit: number) => void;
  onOpenProfile: (org: DiscoverOrg) => void;
  onPressMutuals: (org: { id: string; name: string }) => void;
  onOpenMutualProfile: (org: MutualConnectionRow) => void;
};

type GrowSortMode = "recommended" | "latest" | "active";
type GrowSignalFilter = "mutual" | "location" | "lane";

const RECOMMENDATION_LIMIT = 9;

function matchesOrgNameSearch(org: DiscoverOrg, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return org.name.toLowerCase().includes(q);
}

function pickLimitedRecommendations(
  rows: readonly ScoredDiscoverOrg[],
  limit: number,
): ScoredDiscoverOrg[] {
  const signalRecommended = rows.filter((o) => o.score > 0);
  const pool = signalRecommended.length > 0 ? signalRecommended : rows;
  return pool.slice(0, limit);
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.salesFilterChip, active && styles.salesFilterChipOn]}
    >
      <Text
        style={[
          styles.salesFilterChipText,
          active && styles.salesFilterChipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function filterGrowOrgs(
  orgs: readonly DiscoverOrg[],
  opts: {
    signals: Set<GrowSignalFilter>;
    sort: GrowSortMode;
    dismissed: Set<string>;
  },
): ScoredDiscoverOrg[] {
  let rows = orgs
    .map(scoreDiscoverOrg)
    .filter(isConnectableDiscoverOrg)
    .filter((o) => !opts.dismissed.has(o.id));

  if (opts.signals.size > 0) {
    rows = rows.filter((o) =>
      o.signals.some((s) => opts.signals.has(s.type as GrowSignalFilter)),
    );
  }

  if (opts.sort === "active") {
    rows = [...rows].sort(
      (a, b) => (b.trip_count ?? 0) - (a.trip_count ?? 0) || b.score - a.score,
    );
  } else if (opts.sort === "latest") {
    rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    rows = [...rows].sort(
      (a, b) => b.score - a.score || (b.trip_count ?? 0) - (a.trip_count ?? 0),
    );
  }

  return rows;
}

export function NetworkDesktopGrowPanel({
  orgId,
  search,
  orgSearch,
  onSearchChange,
  totalConnections,
  clientCount,
  supplierCount,
  discoverInviteCount,
  discoverInviteLimit,
  onInviteCountChange,
  onOpenProfile,
  onPressMutuals,
  onOpenMutualProfile,
}: Props) {
  const queryClient = useQueryClient();
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const { orgs, loading, error, refetch, invalidateCache } = useNetworkDiscovery({
    orgId,
    search: orgSearch,
  });
  const sentQ = useConnectionRequestsSentQuery(orgId);

  const [connections, setConnections] = useState<ConnectedOrg[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [requestRoleModalOrg, setRequestRoleModalOrg] =
    useState<ScoredDiscoverOrg | null>(null);
  const [sentRequestRoles, setSentRequestRoles] = useState<
    Record<string, ConnectionInviteRole>
  >({});
  const [sentOrgSnapshots, setSentOrgSnapshots] = useState<
    Record<string, ScoredDiscoverOrg>
  >({});
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [sortMode, setSortMode] = useState<GrowSortMode>("recommended");
  const [signalFilters, setSignalFilters] = useState<Set<GrowSignalFilter>>(
    () => new Set(),
  );
  const [gridView, setGridView] = useState(true);

  useEffect(() => {
    setSentRequestRoles({});
    setDismissedIds(new Set());
    setSentOrgSnapshots({});
  }, [orgId, orgSearch]);

  const todayInviteCount = useMemo(
    () => todayPendingInviteCountFromSent(sentQ.data ?? []),
    [sentQ.data],
  );

  const atDailyInviteLimit = useMemo(
    () =>
      todayInviteCount >= DAILY_CONNECTION_INVITE_LIMIT ||
      discoverInviteCount >= discoverInviteLimit,
    [todayInviteCount, discoverInviteCount, discoverInviteLimit],
  );

  useEffect(() => {
    onInviteCountChange?.(todayInviteCount, DAILY_CONNECTION_INVITE_LIMIT);
  }, [todayInviteCount, onInviteCountChange]);

  const pendingRoleByOrgId = useMemo(() => {
    const map = new Map<string, ConnectionInviteRole>();
    for (const row of sentQ.data ?? []) {
      if (row.status !== "pending" || !row.to_organization_id) continue;
      if (row.request_shipper_client) map.set(row.to_organization_id, "client");
      else if (row.request_carrier_supplier)
        map.set(row.to_organization_id, "supplier");
    }
    return map;
  }, [sentQ.data]);

  const pendingSentOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of sentQ.data ?? []) {
      if (row.status === "pending" && row.to_organization_id) {
        ids.add(row.to_organization_id);
      }
    }
    return ids;
  }, [sentQ.data]);

  const searchMatchedOrgs = useMemo(
    () => orgs.filter((o) => matchesOrgNameSearch(o, orgSearch)),
    [orgs, orgSearch],
  );

  const filteredOrgs = useMemo(
    () =>
      filterGrowOrgs(searchMatchedOrgs, {
        signals: signalFilters,
        sort: sortMode,
        dismissed: dismissedIds,
      }),
    [searchMatchedOrgs, signalFilters, sortMode, dismissedIds],
  );

  const recommendationCandidates = useMemo(
    () => filteredOrgs.filter((o) => !pendingSentOrgIds.has(o.id)),
    [filteredOrgs, pendingSentOrgIds],
  );

  const growRecommendations = useMemo(
    () =>
      pickLimitedRecommendations(
        recommendationCandidates,
        RECOMMENDATION_LIMIT,
      ),
    [recommendationCandidates],
  );

  const sentRequestOrgs = useMemo(() => {
    const byId = new Map<string, ScoredDiscoverOrg>();
    for (const org of filteredOrgs) {
      if (pendingSentOrgIds.has(org.id)) byId.set(org.id, org);
    }
    for (const [id, snapshot] of Object.entries(sentOrgSnapshots)) {
      if (pendingSentOrgIds.has(id) && !byId.has(id)) byId.set(id, snapshot);
    }
    const ordered: ScoredDiscoverOrg[] = [];
    for (const row of sentQ.data ?? []) {
      if (row.status !== "pending" || !row.to_organization_id) continue;
      const existing = byId.get(row.to_organization_id);
      if (existing) {
        ordered.push(existing);
        continue;
      }
      ordered.push(
        scoreDiscoverOrg({
          id: row.to_organization_id,
          name: row.to_org_name?.trim() || "Organization",
          avatar_seed: null,
          connection_status: "pending",
        }),
      );
    }
    return ordered;
  }, [filteredOrgs, sentOrgSnapshots, pendingSentOrgIds, sentQ.data]);

  const renderGrowOrgCard = (
    org: ScoredDiscoverOrg,
    variant: "grid" | "list",
    opts?: { forcePending?: boolean },
  ) => {
    const pendingRole =
      sentRequestRoles[org.id] ?? pendingRoleByOrgId.get(org.id) ?? null;
    const pending =
      opts?.forcePending ||
      Boolean(pendingRole) ||
      String(org.connection_status ?? "").toLowerCase() === "pending";
    return (
      <NetworkDesktopGrowOrgCard
        key={org.id}
        org={org}
        variant={variant}
        viewerOrgId={orgId}
        pendingRole={pending ? pendingRole : null}
        connecting={connectingId === org.id}
        onOpenProfile={() => onOpenProfile(org)}
        onConnect={() => tryBeginConnectionRequest(org)}
        onCancel={() => void handleCancel(org)}
        onPressMutuals={
          (org.mutual_count ?? 0) > 0
            ? () => onPressMutuals({ id: org.id, name: org.name })
            : undefined
        }
        onPressMutual={onOpenMutualProfile}
        onDismiss={
          pending
            ? undefined
            : () => setDismissedIds((prev) => new Set(prev).add(org.id))
        }
      />
    );
  };

  const connectedProfiles = useMemo(
    () =>
      connections
        .filter((c) => c.is_integrated && c.role !== "DRIVER")
        .slice(0, 4),
    [connections],
  );

  const invitePct = Math.min(
    100,
    Math.round((todayInviteCount / DAILY_CONNECTION_INVITE_LIMIT) * 100),
  );

  const filtersActive = signalFilters.size > 0;

  const clearFilters = () => {
    setSignalFilters(new Set());
    setSortMode("recommended");
  };

  const showInviteLimitExceededAlert = useCallback(() => {
    showAppAlert(
      CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
      CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
    );
  }, []);

  const tryBeginConnectionRequest = useCallback(
    (org: ScoredDiscoverOrg) => {
      if (atDailyInviteLimit) {
        showInviteLimitExceededAlert();
        return;
      }
      setRequestRoleModalOrg(org);
    },
    [atDailyInviteLimit, showInviteLimitExceededAlert],
  );

  const handleConnect = async (
    org: ScoredDiscoverOrg,
    mode: ConnectionInviteRole,
  ) => {
    if (atDailyInviteLimit) {
      showInviteLimitExceededAlert();
      return;
    }
    setConnectingId(org.id);
    const { error: reqErr, alreadyInvited, requestId } =
      await createConnectionRequest(orgId, org.id, {
        requestShipperClient: mode === "client",
        requestCarrierSupplier: mode === "supplier",
      });
    setConnectingId(null);
    setRequestRoleModalOrg(null);
    if (reqErr) {
      if (looksLikeConnectionRateLimitError(reqErr.message)) {
        showInviteLimitExceededAlert();
      } else {
        Alert.alert("Could not connect", reqErr.message);
      }
      return;
    }
    setSentRequestRoles((prev) => ({ ...prev, [org.id]: mode }));
    setSentOrgSnapshots((prev) => ({ ...prev, [org.id]: org }));
    if (!alreadyInvited && requestId) {
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
            status: "pending",
            created_at: new Date().toISOString(),
            responded_at: null,
            responded_by: null,
            from_org_name: "",
            to_org_name: org.name,
          };
          return [optimistic, ...prev];
        },
      );
    }
    invalidateCache();
    invalidateNetwork();
    void refetch();
  };

  const handleCancel = async (org: ScoredDiscoverOrg) => {
    setConnectingId(org.id);
    const { error: cancelErr } = await cancelPendingConnectionRequestByOrgPair(
      orgId,
      org.id,
    );
    setConnectingId(null);
    if (cancelErr) {
      Alert.alert("Could not cancel request", cancelErr.message);
      return;
    }
    setSentRequestRoles((prev) => {
      const next = { ...prev };
      delete next[org.id];
      return next;
    });
    setSentOrgSnapshots((prev) => {
      const next = { ...prev };
      delete next[org.id];
      return next;
    });
    invalidateCache();
    invalidateNetwork();
    void refetch();
  };

  return (
    <View style={styles.salesBody}>
      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={[styles.salesCard, styles.salesCardPad, styles.growInviteBanner]}>
            <View style={styles.growInviteBannerHead}>
              <Sparkles size={14} color={METRONIC.link} />
              <Text style={styles.growInviteBannerTitle}>Grow your network</Text>
            </View>
            <Text style={styles.growInviteBannerSub}>
              {recommendationCandidates.length} organisations to discover ·{" "}
              {totalConnections} connected
            </Text>
            <View style={styles.growInviteProgressTrack}>
              <View
                style={[styles.growInviteProgressFill, { width: `${invitePct}%` }]}
              />
            </View>
            <Text style={styles.growInviteBannerMeta}>
              {todayInviteCount}/{DAILY_CONNECTION_INVITE_LIMIT} invites sent today
            </Text>
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Intelligent filters</Text>
            <Text style={styles.salesFilterHint}>
              Narrow recommendations by match signals
            </Text>

            <Text style={styles.salesFilterGroup}>Sort</Text>
            <View style={styles.tagWrap}>
              <FilterChip
                label="Recommended"
                active={sortMode === "recommended"}
                onPress={() => setSortMode("recommended")}
              />
              <FilterChip
                label="Most active"
                active={sortMode === "active"}
                onPress={() => setSortMode("active")}
              />
              <FilterChip
                label="A–Z"
                active={sortMode === "latest"}
                onPress={() => setSortMode("latest")}
              />
            </View>

            <Text style={styles.salesFilterGroup}>Match signals</Text>
            <View style={styles.tagWrap}>
              <FilterChip
                label="Mutuals"
                active={signalFilters.has("mutual")}
                onPress={() =>
                  setSignalFilters((prev) => toggleSet(prev, "mutual"))
                }
              />
              <FilterChip
                label="Route match"
                active={signalFilters.has("location")}
                onPress={() =>
                  setSignalFilters((prev) => toggleSet(prev, "location"))
                }
              />
              <FilterChip
                label="Lane overlap"
                active={signalFilters.has("lane")}
                onPress={() =>
                  setSignalFilters((prev) => toggleSet(prev, "lane"))
                }
              />
            </View>

            {filtersActive ? (
              <Pressable onPress={clearFilters} style={styles.salesClearBtn}>
                <Text style={styles.salesClearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>
              {connectedProfiles.length} profiles connected
            </Text>
            {connectedProfiles.map((item, idx) => {
              const trips = item.total_trips ?? 0;
              const entityType =
                item.role === "SUPPLIER" ? "supplier" : "client";
              return (
                <Pressable
                  key={`${item.role}-${item.id}`}
                  style={[
                    styles.growConnectedRow,
                    idx === connectedProfiles.length - 1 &&
                      styles.growConnectedRowLast,
                  ]}
                >
                  <PartyAvatar
                    name={item.name}
                    initialsColorSeed={item.id}
                    avatarUrl={item.avatar_url}
                    avatarSeed={item.avatar_seed}
                    entityType={entityType}
                    size={36}
                  />
                  <View style={styles.salesContributorTextCol}>
                    <Text style={styles.salesContributorName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.salesContributorMeta}>
                      {trips} trips · {item.role.toLowerCase()}
                    </Text>
                  </View>
                  <Pressable style={styles.growConnectedMenu}>
                    <MoreVertical size={14} color={METRONIC.muted} />
                  </Pressable>
                </Pressable>
              );
            })}
            {connectedProfiles.length === 0 ? (
              <Text style={styles.salesEmptySide}>
                Connect partners to see them here.
              </Text>
            ) : (
              <Pressable style={styles.growConnectProfileBtn}>
                <UserPlus size={14} color={METRONIC.text} />
                <Text style={styles.growConnectProfileBtnText}>
                  Connect profile
                </Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Network snapshot</Text>
            <View style={styles.salesContributorRow}>
              <Text style={styles.salesContributorMeta}>Clients</Text>
              <Text style={styles.salesContributorName}>{clientCount}</Text>
            </View>
            <View style={styles.salesContributorRow}>
              <Text style={styles.salesContributorMeta}>Suppliers</Text>
              <Text style={styles.salesContributorName}>{supplierCount}</Text>
            </View>
            <View
              style={[
                styles.salesContributorRow,
                styles.salesContributorRowLast,
              ]}
            >
              <Text style={styles.salesContributorMeta}>Discoverable</Text>
              <Text style={styles.salesContributorName}>
                {recommendationCandidates.length}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.mainCol}>
          <View style={styles.growTeamsHeader}>
            <Text style={styles.growTeamsCount}>
              {growRecommendations.length} Partners
            </Text>
            <View style={styles.growViewToggle}>
              <Pressable
                onPress={() => setGridView(true)}
                style={[
                  styles.growViewToggleBtn,
                  gridView && styles.growViewToggleBtnOn,
                ]}
              >
                <LayoutGrid
                  size={15}
                  color={gridView ? METRONIC.link : METRONIC.muted}
                />
              </Pressable>
              <Pressable
                onPress={() => setGridView(false)}
                style={[
                  styles.growViewToggleBtn,
                  !gridView && styles.growViewToggleBtnOn,
                ]}
              >
                <List
                  size={15}
                  color={!gridView ? METRONIC.link : METRONIC.muted}
                />
              </Pressable>
            </View>
          </View>

          <View style={[styles.salesCard, styles.growToolbarCard]}>
            <View style={styles.growToolbarBottom}>
              <View style={styles.salesTableSearch}>
                <Search size={14} color={METRONIC.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Type name, team…"
                  placeholderTextColor={METRONIC.muted}
                  value={search}
                  onChangeText={onSearchChange}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <Pressable
                style={styles.growToolbarPill}
                onPress={() =>
                  setSortMode((m) =>
                    m === "recommended"
                      ? "active"
                      : m === "active"
                        ? "latest"
                        : "recommended",
                  )
                }
              >
                <Text style={styles.growToolbarPillText}>
                  {sortMode === "recommended"
                    ? "Recommended"
                    : sortMode === "active"
                      ? "Most active"
                      : "A–Z"}
                </Text>
                <ChevronDown size={12} color={METRONIC.muted} />
              </Pressable>
              <Pressable style={styles.growToolbarFilterBtn}>
                <Filter size={13} color={Theme.textOnPrimary} />
                <Text style={styles.growToolbarFilterBtnText}>Filters</Text>
              </Pressable>
            </View>
          </View>

          {sentRequestOrgs.length > 0 ? (
            <>
              <View style={styles.growSectionHeader}>
                <Text style={styles.growSectionTitle}>Sent requests</Text>
                <Text style={styles.growSectionSub}>
                  {sentRequestOrgs.length} pending
                </Text>
              </View>
              {gridView ? (
                <View style={[styles.growCardGrid, styles.growSentStack]}>
                  {sentRequestOrgs.map((org) =>
                    renderGrowOrgCard(org, "grid", { forcePending: true }),
                  )}
                </View>
              ) : (
                <View style={styles.growSentStack}>
                  {sentRequestOrgs.map((org) =>
                    renderGrowOrgCard(org, "list", { forcePending: true }),
                  )}
                </View>
              )}
            </>
          ) : null}

          <View style={styles.growSectionHeader}>
            <Text style={styles.growSectionTitle}>Recommended partners</Text>
            <Text style={styles.growSectionSub}>
              Up to {RECOMMENDATION_LIMIT} suggestions
            </Text>
          </View>

          {loading && growRecommendations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <LoadingIndicator color={METRONIC.link} />
            </View>
          ) : error ? (
            <View style={[styles.salesCard, styles.salesCardPad]}>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : growRecommendations.length === 0 ? (
            <View style={[styles.salesCard, styles.salesCardPad]}>
              <Text style={styles.emptyText}>
                {orgSearch.trim()
                  ? "No organisations match your search. Try another name."
                  : "No organisations match your filters. Try clearing filters."}
              </Text>
            </View>
          ) : gridView ? (
            <View style={styles.growCardGrid}>
              {growRecommendations.map((org) => renderGrowOrgCard(org, "grid"))}
            </View>
          ) : (
            <View style={styles.growListStack}>
              {growRecommendations.map((org) => renderGrowOrgCard(org, "list"))}
            </View>
          )}
        </View>
      </View>

      <ConnectionRoleModal
        visible={requestRoleModalOrg != null}
        companyName={requestRoleModalOrg?.name ?? ""}
        submitting={connectingId != null}
        onClose={() => {
          if (connectingId) return;
          setRequestRoleModalOrg(null);
        }}
        onConfirm={(role) => {
          if (!requestRoleModalOrg) return;
          void handleConnect(requestRoleModalOrg, role);
        }}
      />

      <View style={styles.hiddenDataBridge} pointerEvents="none">
        <ConnectionsView
          orgId={orgId}
          embedded
          hubMode
          hubSearch=""
          hubFilter="ALL"
          onConnectionsComputed={setConnections}
        />
      </View>
    </View>
  );
}
