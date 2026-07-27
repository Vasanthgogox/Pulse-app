/**
 * Load Center — opportunity exchange strip.
 * Get load: open LOAD stories + sponsored load ads from the network.
 * Give load: idle VEHICLE_AVAILABILITY stories + sponsored capacity ads.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { PostRow } from "@/features/network/services/posts.service";
import {
  formatStoryDate,
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
  Megaphone,
  Sparkles,
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
    if (p.organization_id === orgId) return false;
    if (!p.is_active) return false;
    if (p.type !== wantType) return false;
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
    return (
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
    );
  });

  return matched.slice(0, MAX_CARDS);
}

const EMPTY_ORG_SET: ReadonlySet<string> = new Set();

function OpportunityCard({
  post,
  mode,
  onPress,
}: {
  post: PostRow;
  mode: LoadCenterOpportunityMode;
  onPress: () => void;
}) {
  const isSponsored = !!post.is_sponsored;
  const isLoad = mode === "get";
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
  const material = post.material?.trim();
  const rate =
    post.rate_offer != null && Number.isFinite(post.rate_offer)
      ? formatINR(post.rate_offer)
      : null;
  const posted = post.created_at ? formatStoryDate(post.created_at) : null;
  const shortName = post.org_name.trim().split(/\s+/)[0] ?? post.org_name;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSponsored && styles.cardSponsored,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        isSponsored
          ? `Sponsored ${isLoad ? "load" : "capacity"} from ${post.org_name}`
          : `${isLoad ? "Open load" : "Idle vehicle"} from ${post.org_name}`
      }
    >
      <View style={styles.cardTop}>
        <PartyAvatar
          name={post.org_name}
          avatarUrl={avatarUrl}
          avatarSeed={post.org_avatar_seed}
          entityType="supplier"
          size={32}
        />
        <View style={styles.cardTopText}>
          <Text style={styles.orgName} numberOfLines={1}>
            {shortName}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {isSponsored
              ? isLoad
                ? "Sponsored load"
                : "Sponsored capacity"
              : isLoad
                ? "Network load story"
                : "Network vehicle story"}
            {posted ? ` · ${posted}` : ""}
          </Text>
        </View>
        {isSponsored ? (
          <View style={styles.adsPill}>
            <Text style={styles.adsPillText}>Ad</Text>
          </View>
        ) : (
          <View style={styles.networkPill}>
            <Text style={styles.networkPillText}>Network</Text>
          </View>
        )}
      </View>

      <Text style={styles.kicker} numberOfLines={1}>
        {isLoad ? "Load broadcast" : "Capacity broadcast"}
      </Text>
      <Text style={styles.heroTitle} numberOfLines={2}>
        {vehicle}
      </Text>

      <View style={styles.routeStrip}>
        <View style={styles.routeEndpoint}>
          <View style={styles.dotOrigin} />
          <Text style={styles.routeCity} numberOfLines={1}>
            {originParts.city}
          </Text>
          {originParts.state ? (
            <Text style={styles.routeState} numberOfLines={1}>
              {originParts.state}
            </Text>
          ) : null}
        </View>
        <View style={styles.routeArrowWrap}>
          <View style={styles.routeLine} />
          <ArrowRight size={14} color={Theme.loadAddButtonText} strokeWidth={2.25} />
          <View style={styles.routeLine} />
        </View>
        <View style={[styles.routeEndpoint, styles.routeEndpointEnd]}>
          <View style={styles.dotDest} />
          <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
            {destinationParts.city}
          </Text>
          {destinationParts.state ? (
            <Text style={[styles.routeState, styles.routeStateEnd]} numberOfLines={1}>
              {destinationParts.state}
            </Text>
          ) : null}
        </View>
      </View>

      {material || rate ? (
        <View style={styles.specRow}>
          {material ? (
            <View style={styles.specChip}>
              <MapPin size={11} color={Theme.loadStatusTabTextMuted} strokeWidth={2.2} />
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
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.ctaText}>
          {isLoad ? "View & bid" : "View capacity"}
        </Text>
        <ArrowRight size={12} color={Theme.primary} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

export function LoadCenterOpportunityExchange({
  orgId,
  mode,
  embedded = false,
  supplierOrgIds,
  clientOrgIds,
}: LoadCenterOpportunityExchangeProps) {
  const router = useRouter();
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

  const sponsoredCount = posts.filter((p) => p.is_sponsored).length;
  const networkCount = posts.length - sponsoredCount;
  const isGet = mode === "get";
  const title = isGet
    ? "Open opportunities"
    : "Idle capacity nearby";
  const subtitle = isGet
    ? "Sponsored load ads and network freight stories you can bid on"
    : "Sponsored capacity ads and idle vehicle stories in your network";

  if (!orgId) return null;
  if (feedQ.isLoading && posts.length === 0) {
    return (
      <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Theme.accentBrown} />
          <Text style={styles.loadingText}>Finding opportunities…</Text>
        </View>
      </View>
    );
  }
  if (posts.length === 0) return null;

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          {isGet ? (
            <Megaphone size={14} color={Theme.accentBrown} strokeWidth={2.2} />
          ) : (
            <Sparkles size={14} color={Theme.accentBrown} strokeWidth={2.2} />
          )}
        </View>
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {posts.map((post) => (
          <OpportunityCard
            key={post.id}
            post={post}
            mode={mode}
            onPress={() => {
              router.push({
                pathname: "/(modals)/story-detail",
                params: {
                  postId: post.id,
                  orgId: post.organization_id,
                  storyType: post.type,
                },
              });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_W = 260;

const cardShadow = Platform.select({
  web: {
    boxShadow:
      "0 8px 28px rgba(77, 54, 54, 0.08), 0 2px 8px rgba(205, 233, 247, 0.45)",
  } as object,
  ios: {
    shadowColor: "#4D3636",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  android: { elevation: 3 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    marginBottom: 14,
    paddingTop: 2,
  },
  wrapEmbedded: {
    marginHorizontal: 0,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Theme.accentBrownMuted,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textRouteCard,
    lineHeight: 15,
  },
  countCluster: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  countPillAds: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.accentBrown,
  },
  countPillAdsText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  countPillNet: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  countPillNetText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.success,
  },
  scroll: {
    gap: 12,
    paddingVertical: 4,
    paddingRight: 4,
  },
  card: {
    width: CARD_W,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    overflow: "hidden",
    ...cardShadow,
  },
  cardSponsored: {
    borderColor: Theme.accentBrownBorder,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTopText: { flex: 1, minWidth: 0, gap: 1 },
  orgName: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.loadAddButtonText,
    letterSpacing: -0.2,
  },
  adsPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.accentBrown,
    flexShrink: 0,
  },
  adsPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  networkPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    flexShrink: 0,
  },
  networkPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.pulseIndigo,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metaLine: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.loadStatusTabTextMuted,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: Theme.pulseIndigo,
    textAlign: "center",
    marginTop: 2,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.loadAddButtonText,
    letterSpacing: -0.4,
    textAlign: "center",
    lineHeight: 22,
  },
  routeStrip: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  routeEndpoint: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    alignItems: "flex-start",
  },
  routeEndpointEnd: {
    alignItems: "flex-end",
  },
  dotOrigin: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.success,
    marginBottom: 1,
  },
  dotDest: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.accentBrown,
    marginBottom: 1,
  },
  routeCity: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.loadAddButtonText,
    letterSpacing: -0.2,
  },
  routeCityEnd: {
    textAlign: "right",
  },
  routeState: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.loadStatusTabTextMuted,
  },
  routeStateEnd: {
    textAlign: "right",
  },
  routeArrowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    paddingHorizontal: 2,
  },
  routeLine: {
    width: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.loadStatusTabBorderSoft,
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  specChipRate: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  specText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.loadStatusTabTextMuted,
    maxWidth: 120,
  },
  specRateText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.success,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 2,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
});
