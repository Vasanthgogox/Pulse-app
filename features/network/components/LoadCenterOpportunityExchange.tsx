/**
 * Load Center — opportunity exchange strip.
 * Get load: open LOAD stories + sponsored load ads from the network.
 * Give load: idle VEHICLE_AVAILABILITY stories + sponsored capacity ads.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { LoadCenterSidebarFindEmpty } from "@/features/network/components/LoadCenterSidebarFindEmpty";
import Theme from "@/constants/Theme";
import type { PostRow } from "@/features/network/services/posts.service";
import {
  formatCapacityMaterial,
  formatStoryDate,
  isFleetOwnerCapacityPost,
  splitLocationParts,
} from "@/features/network/utils/storyDisplay";
import { shouldHideLoadStoryFromAuthor } from "@/features/network/utils/storyLoadVisibility.util";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { formatINR } from "@/lib/format";
import { useNetworkFeedQuery } from "@/lib/queries/usePostsQuery";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  MapPin,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type LoadCenterOpportunityMode = "give" | "get";

type LoadCenterOpportunityExchangeProps = {
  orgId: string | null;
  mode: LoadCenterOpportunityMode;
  /** Trim outer horizontal padding when already inside a padded canvas. */
  embedded?: boolean;
  /** Full-width horizontal strip below the search bar. */
  fullBleed?: boolean;
  /**
   * Vertical stack for a Kanban column (e.g. Get Load → Open Market).
   * Full-width cards; returns null when there are no matching posts.
   */
  columnStack?: boolean;
  /**
   * Left Give Load rail: header + vertical idle-capacity cards
   * (replaces Story / Pulse Reach promo banners).
   */
  sidebarStack?: boolean;
  /**
   * Orgs in my suppliers book (linked). LOAD posts from supplier-only
   * counterparties are hidden in Get Load — same rule as Find Work.
   */
  supplierOrgIds?: ReadonlySet<string>;
  /** Orgs in my clients book (linked). Overrides supplier hide when dual-role. */
  clientOrgIds?: ReadonlySet<string>;
};

const MAX_CARDS = 12;

function filterOpportunityPosts(
  posts: PostRow[],
  orgId: string,
  mode: LoadCenterOpportunityMode,
  supplierOrgIds?: ReadonlySet<string>,
  clientOrgIds?: ReadonlySet<string>,
): PostRow[] {
  const wantType = mode === "get" ? "LOAD" : "VEHICLE_AVAILABILITY";
  const suppliers = supplierOrgIds ?? EMPTY_ORG_SET;
  const clients = clientOrgIds ?? EMPTY_ORG_SET;
  const matched = posts.filter((p) => {
    if (!p.is_active) return false;
    if ((p.type ?? "").toUpperCase() !== wantType) return false;

    // Fleet Owner organic capacity (null org) — include in Give Load / Find vehicles.
    // Same posts model; not connection-gated; docs/private fleet fields never in payload.
    if (mode === "give" && isFleetOwnerCapacityPost(p)) return true;

    // Hide own-org stories from the "nearby" rail.
    if (p.organization_id != null && p.organization_id === orgId) return false;

    if (
      mode === "get" &&
      shouldHideLoadStoryFromAuthor({
        authorOrgId: p.organization_id,
        supplierOrgIds: suppliers,
        clientOrgIds: clients,
      })
    ) {
      return false;
    }
    return true;
  });

  matched.sort((a, b) => {
    const aSponsored = a.is_sponsored ? 1 : 0;
    const bSponsored = b.is_sponsored ? 1 : 0;
    if (aSponsored !== bSponsored) return bSponsored - aSponsored;
    // Prefer FO / organic capacity after ads so Idle capacity isn't ads-only.
    if (mode === "give") {
      const aFo = isFleetOwnerCapacityPost(a) ? 1 : 0;
      const bFo = isFleetOwnerCapacityPost(b) ? 1 : 0;
      if (aFo !== bFo) return bFo - aFo;
    }
    return (
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
    );
  });

  return matched.slice(0, MAX_CARDS);
}

const EMPTY_ORG_SET: ReadonlySet<string> = new Set();

export function OpportunityCard({
  post,
  mode,
  onPress,
  fillWidth = false,
}: {
  post: PostRow;
  mode: LoadCenterOpportunityMode;
  onPress: () => void;
  fillWidth?: boolean;
}) {
  const isSponsored = !!post.is_sponsored;
  const isLoad = mode === "get";
  const isFleetCapacity = isFleetOwnerCapacityPost(post);
  const rawLogo = post.org_avatar_url?.trim() ?? "";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    rawLogo.startsWith("http") ? rawLogo : null,
  );

  useEffect(() => {
    let mounted = true;
    if (!rawLogo || rawLogo.startsWith("http")) {
      setAvatarUrl(rawLogo || null);
      return;
    }
    getSignedAvatarUrl(rawLogo).then((signed) => {
      if (mounted) setAvatarUrl(signed ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [rawLogo]);

  const originParts = splitLocationParts(post.origin);
  const destinationParts = splitLocationParts(
    isLoad ? post.destination : post.destination || "Anywhere",
  );
  const vehicle = post.vehicle_type?.trim() || (isLoad ? "Any vehicle" : "Capacity");
  const material = formatCapacityMaterial(post.material);
  const rate =
    post.rate_offer != null && Number.isFinite(post.rate_offer)
      ? formatINR(post.rate_offer)
      : null;
  const posted = post.created_at ? formatStoryDate(post.created_at) : null;
  const displayOrgName = (post.org_name ?? "").trim() || "Fleet availability";
  const shortName = isFleetCapacity
    ? "Fleet"
    : (displayOrgName.split(/\s+/)[0] ?? displayOrgName);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        fillWidth && styles.cardFillWidth,
        isSponsored && styles.cardSponsored,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        isSponsored
          ? `Sponsored ${isLoad ? "load" : "capacity"} from ${displayOrgName}`
          : isFleetCapacity
            ? `Fleet availability ${vehicle}`
            : `${isLoad ? "Indent from network" : "Idle vehicle"} from ${displayOrgName}`
      }
    >
      <View style={styles.cardTop}>
        <PartyAvatar
          name={displayOrgName}
          avatarUrl={avatarUrl}
          avatarSeed={post.org_avatar_seed}
          entityType="supplier"
          size={24}
        />
        <View style={styles.cardTopText}>
          <Text style={styles.orgName} numberOfLines={1}>
            {isFleetCapacity ? "Fleet availability" : shortName}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {isSponsored
              ? isLoad
                ? "Sponsored load"
                : "Sponsored capacity"
              : isFleetCapacity
                ? "Driver capacity"
              : isLoad
                ? "Indent from network"
                : "Network capacity"}
            {posted ? ` · ${posted}` : ""}
          </Text>
        </View>
        {isSponsored ? (
          <View style={styles.adsPill}>
            <Text style={styles.adsPillText}>Ad</Text>
          </View>
        ) : (
          <View style={styles.networkPill}>
            <Text style={styles.networkPillText}>
              {isFleetCapacity ? "Fleet" : "Network"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.heroRow}>
        <Text style={styles.kicker} numberOfLines={1}>
          {isLoad ? "Open indent" : "Open capacity"}
        </Text>
        <Text style={styles.heroTitle} numberOfLines={1}>
          {vehicle}
        </Text>
      </View>

      <View style={styles.routeStrip}>
        <View style={styles.routeCityCol}>
          <View style={styles.dotOrigin} />
          <Text style={styles.routeCity} numberOfLines={1}>
            {originParts.city}
          </Text>
        </View>
        <ArrowRight size={11} color={Theme.loadAddButtonText} strokeWidth={2.25} />
        <View style={[styles.routeCityCol, styles.routeCityColEnd]}>
          <View style={styles.dotDest} />
          <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
            {destinationParts.city}
          </Text>
        </View>
      </View>

      {(material || rate) && (
        <View style={styles.specRow}>
          {material ? (
            <View style={styles.specChip}>
              <MapPin size={10} color={Theme.loadStatusTabTextMuted} strokeWidth={2.2} />
              <Text style={styles.specText} numberOfLines={1}>
                {material}
              </Text>
            </View>
          ) : null}
          {rate ? (
            <View style={[styles.specChip, styles.specChipRate]}>
              <Text style={styles.specRateText} numberOfLines={1}>
                {rate}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.ctaText}>
          {isLoad ? "View & bid" : "View capacity"}
        </Text>
        <ArrowRight size={11} color={Theme.primary} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

export function useLoadCenterOpportunityPosts(
  orgId: string | null,
  mode: LoadCenterOpportunityMode,
  supplierOrgIds?: ReadonlySet<string>,
  clientOrgIds?: ReadonlySet<string>,
): { posts: PostRow[]; isLoading: boolean } {
  const feedQ = useNetworkFeedQuery(orgId, { enabled: !!orgId });
  const posts = useMemo(
    () =>
      orgId
        ? filterOpportunityPosts(
            feedQ.data ?? [],
            orgId,
            mode,
            supplierOrgIds,
            clientOrgIds,
          )
        : [],
    [feedQ.data, orgId, mode, supplierOrgIds, clientOrgIds],
  );
  return { posts, isLoading: feedQ.isLoading };
}

export function LoadCenterOpportunityExchange({
  orgId,
  mode,
  embedded = false,
  fullBleed = false,
  columnStack = false,
  sidebarStack = false,
  supplierOrgIds,
  clientOrgIds,
}: LoadCenterOpportunityExchangeProps) {
  const router = useRouter();
  const { posts, isLoading } = useLoadCenterOpportunityPosts(
    orgId,
    mode,
    supplierOrgIds,
    clientOrgIds,
  );

  const sponsoredCount = posts.filter((p) => p.is_sponsored).length;
  const networkCount = posts.length - sponsoredCount;
  const isGet = mode === "get";
  const title = isGet
    ? sidebarStack
      ? "Advertised loads"
      : "Open opportunities"
    : "Idle capacity nearby";
  const subtitle = isGet
    ? sidebarStack
      ? "Indents from network you can bid on"
      : "Sponsored load ads and indents from network you can bid on"
    : "Sponsored capacity ads and fleet vehicle Stories";
  const loadingSidebarText = isGet ? "Finding loads…" : "Finding capacity…";

  const openStory = (post: PostRow) => {
    router.push({
      pathname: "/(modals)/story-detail",
      params: {
        postId: post.id,
        ...(post.organization_id
          ? { orgId: post.organization_id }
          : {}),
        storyType: post.type,
      },
    });
  };

  if (!orgId) return null;

  if (columnStack || sidebarStack) {
    if (isLoading && posts.length === 0) {
      if (!sidebarStack) return null;
      return (
        <View style={[styles.wrap, styles.wrapSidebar, embedded && styles.wrapEmbedded]}>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Theme.accentBrown} />
            <Text style={styles.loadingText}>{loadingSidebarText}</Text>
          </View>
        </View>
      );
    }
    if (posts.length === 0) {
      if (!sidebarStack) return null;
      return (
        <View style={[styles.wrap, styles.wrapSidebar, embedded && styles.wrapEmbedded]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSub} numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
          </View>
          <LoadCenterSidebarFindEmpty mode={mode} plain />
        </View>
      );
    }

    const cards = posts.map((post) => (
      <OpportunityCard
        key={post.id}
        post={post}
        mode={mode}
        fillWidth
        onPress={() => openStory(post)}
      />
    ));

    if (columnStack) {
      return <View style={styles.columnStack}>{cards}</View>;
    }

    return (
      <View style={[styles.wrap, styles.wrapSidebar, embedded && styles.wrapEmbedded]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSub} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          <View style={styles.countCluster}>
            {sponsoredCount > 0 ? (
              <View style={styles.countPillAds}>
                <Text style={styles.countPillAdsText}>{sponsoredCount} Ads</Text>
              </View>
            ) : null}
            {networkCount > 0 ? (
              <View style={styles.countPillNet}>
                <Text style={styles.countPillNetText}>{networkCount} live</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.columnStack}>{cards}</View>
      </View>
    );
  }

  if (isLoading && posts.length === 0) {
    return (
      <View
        style={[
          styles.wrap,
          embedded && styles.wrapEmbedded,
          fullBleed && styles.wrapFullBleed,
        ]}
      >
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Theme.accentBrown} />
          <Text style={styles.loadingText}>Finding opportunities…</Text>
        </View>
      </View>
    );
  }
  if (posts.length === 0) return null;

  return (
    <View
      style={[
        styles.wrap,
        embedded && styles.wrapEmbedded,
        fullBleed && styles.wrapFullBleed,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.countCluster}>
          {sponsoredCount > 0 ? (
            <View style={styles.countPillAds}>
              <Text style={styles.countPillAdsText}>{sponsoredCount} Ads</Text>
            </View>
          ) : null}
          {networkCount > 0 ? (
            <View style={styles.countPillNet}>
              <Text style={styles.countPillNetText}>{networkCount} live</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={fullBleed}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          fullBleed && styles.scrollFullBleed,
        ]}
        style={fullBleed ? styles.scrollViewFullBleed : undefined}
      >
        {posts.map((post) => (
          <OpportunityCard
            key={post.id}
            post={post}
            mode={mode}
            onPress={() => openStory(post)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_W = 228;

const cardShadow = Platform.select({
  web: {
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.95) inset, 0 8px 22px rgba(15, 23, 42, 0.09), 0 2px 6px rgba(15, 23, 42, 0.04)",
  } as object,
  ios: {
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  android: { elevation: 3 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 0,
    paddingTop: 0,
  },
  wrapEmbedded: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  wrapFullBleed: {
    width: "100%",
    marginBottom: 0,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 10,
    gap: 8,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  wrapSidebar: {
    width: "100%",
    flexGrow: 1,
    marginBottom: 0,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    gap: 10,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.05)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      } as object,
      default: {},
    }),
  },
  scrollViewFullBleed: {
    width: "100%",
    marginHorizontal: 0,
  },
  scrollFullBleed: {
    paddingVertical: 4,
    paddingRight: 4,
    flexGrow: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  headerText: { flex: 1, minWidth: 0, gap: 1 },
  headerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
  },
  countCluster: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  countPillAds: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.accentBrown,
  },
  countPillAdsText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  countPillNet: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  countPillNetText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.success,
  },
  scroll: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 4,
  },
  columnStack: {
    width: "100%",
    gap: 8,
    marginBottom: 2,
  },
  card: {
    width: CARD_W,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 6,
    overflow: "hidden",
    ...cardShadow,
  },
  cardFillWidth: {
    width: "100%",
    alignSelf: "stretch",
  },
  cardSponsored: {
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.cardWhite,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  cardTopText: { flex: 1, minWidth: 0, gap: 0 },
  orgName: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  adsPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.accentBrown,
    flexShrink: 0,
  },
  adsPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  networkPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    flexShrink: 0,
  },
  networkPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  metaLine: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  heroRow: {
    gap: 2,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  heroTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  routeStrip: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  routeCityCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  routeCityColEnd: {
    justifyContent: "flex-end",
  },
  dotOrigin: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.success,
    flexShrink: 0,
  },
  dotDest: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.accentBrown,
    flexShrink: 0,
  },
  routeCity: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  routeCityEnd: {
    textAlign: "right",
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  specChipRate: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  specText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    maxWidth: 120,
  },
  specRateText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.success,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 2,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.primary,
  },
});
