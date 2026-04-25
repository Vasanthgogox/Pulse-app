/**
 * Full-screen story viewer — Pulse "Mission" layout (reference: Allies / broadcast payload).
 * Bid / engagement on LOAD is for other orgs only; owners see load-center / done paths.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BidSheet } from "@/features/network/components/BidSheet";
import {
  deactivatePost,
  isPostVisibleForOrg,
  type PostRow,
} from "@/features/network/services/posts.service";
import { formatINR } from "@/lib/format";
import { getInitials } from "@/lib/stringUtils";
import { useNetworkFeedQuery, useInvalidatePosts } from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowRight,
  Clock3,
  MessageSquare,
  MapPin,
  Package,
  Send,
  Sparkles,
  Trash2,
  Truck,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STORY_DURATION = 15000;

const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;

const PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#0ea5e9",
];
function seedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatStoryDate(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function storyHeadline(post: PostRow, isLoad: boolean, isVehicle: boolean): string {
  const t = post.content?.trim();
  if (t) return t;
  if (isLoad && post.origin && post.destination) {
    const mat = post.material?.trim();
    if (mat) return `${mat} · ${post.origin} → ${post.destination}`;
    return `${post.origin} → ${post.destination}`;
  }
  if (isVehicle && post.origin) {
    return `Available @ ${post.origin}`;
  }
  return "Active broadcast";
}

function ProgressSegment({
  index,
  current,
  progress,
}: {
  index: number;
  current: number;
  progress: Animated.Value;
}) {
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  if (index < current) {
    return (
      <View style={[styles.progressTrack, { flex: 1 }]}>
        <View style={[styles.progressFill, { width: "100%" }]} />
      </View>
    );
  }
  if (index === current) {
    return (
      <View style={[styles.progressTrack, { flex: 1 }]}>
        <Animated.View style={[styles.progressFill, { width }]} />
      </View>
    );
  }
  return <View style={[styles.progressTrack, { flex: 1 }]} />;
}

export default function StoryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orgId?: string; postId?: string; storyType?: string; queue?: string }>();
  const { currentOrganization } = useOrganization();
  const myOrgId = currentOrganization?.id ?? "";
  const orgId = myOrgId;
  const invalidatePosts = useInvalidatePosts(orgId);

  const feedQ = useNetworkFeedQuery(orgId);
  const allowLoadPosts = currentOrganization?.capabilities?.canBid ?? true;
  const allPosts = useMemo(
    () => (feedQ.data ?? []).filter((post) => isPostVisibleForOrg(post, { allowLoadPosts })),
    [feedQ.data, allowLoadPosts],
  );

  const isBusinessPost = (p: PostRow) =>
    p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY";

  const targetOrgId = params.orgId ?? "";
  const queueIds = useMemo(
    () =>
      (params.queue ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [params.queue],
  );
  const targetStoryType =
    params.storyType === "LOAD" || params.storyType === "VEHICLE_AVAILABILITY"
      ? params.storyType
      : null;
  const storiesByOrgType: PostRow[] = allPosts.filter(
    (p) =>
      p.organization_id === targetOrgId &&
      isBusinessPost(p) &&
      (targetStoryType ? p.type === targetStoryType : true),
  );
  const storiesFromQueue: PostRow[] = useMemo(() => {
    if (queueIds.length === 0) return [];
    const byId = new Map(allPosts.map((p) => [p.id, p] as const));
    return queueIds.map((id) => byId.get(id)).filter((p): p is PostRow => !!p && isBusinessPost(p));
  }, [queueIds, allPosts]);
  const seedPost = allPosts.find((p) => p.id === params.postId && isBusinessPost(p));
  const storyList: PostRow[] =
    storiesFromQueue.length > 0
      ? storiesFromQueue
      : storiesByOrgType.length > 0
        ? storiesByOrgType
        : seedPost
          ? [seedPost]
          : [];

  const [current, setCurrent] = useState(0);
  const [bidPost, setBidPost] = useState<PostRow | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const goNext = useCallback(() => {
    if (current < storyList.length - 1) {
      progress.setValue(0);
      setCurrent((c) => c + 1);
    } else {
      router.back();
    }
  }, [current, storyList.length, progress, router]);

  const goPrev = useCallback(() => {
    if (current > 0) {
      progress.setValue(0);
      setCurrent((c) => c - 1);
    }
  }, [current, progress]);

  useEffect(() => {
    if (storyList.length === 0) return;
    if (animRef.current) animRef.current.stop();
    progress.setValue(0);
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => {
      if (animRef.current) animRef.current.stop();
    };
  }, [current, storyList.length, goNext, progress]);

  const initialStoryIndex = useMemo(() => {
    const targetPostId = params.postId ?? "";
    if (!targetPostId || storyList.length === 0) return 0;
    const idx = storyList.findIndex((p) => p.id === targetPostId);
    return idx >= 0 ? idx : 0;
  }, [storyList, params.postId]);

  useEffect(() => {
    setCurrent(initialStoryIndex);
    progress.setValue(0);
  }, [initialStoryIndex, progress]);

  const post = storyList[current];
  const color = post ? seedColor(post.organization_id) : PALETTE[0];
  const isLoad = post?.type === "LOAD";
  const isVehicle = post?.type === "VEHICLE_AVAILABILITY";

  const isOwnPost = useMemo(
    () => !!myOrgId && !!post && post.organization_id === myOrgId,
    [myOrgId, post],
  );
  const canBidOnLoad = Boolean(
    isLoad && !isOwnPost && myOrgId && post && post.type === "LOAD",
  );
  const canContactVehicle = Boolean(
    isVehicle && !isOwnPost && myOrgId,
  );
  const isDeletingCurrent = deletingPostId != null && deletingPostId === post?.id;

  const headline = post ? storyHeadline(post, Boolean(isLoad), Boolean(isVehicle)) : "";
  const availabilityLabel = useMemo(() => {
    if (!post || !isVehicle) return null;
    const firstContentChunk = post.content?.split("·")[0]?.trim();
    if (firstContentChunk) return firstContentChunk;
    if (post.load_date?.trim()) return post.load_date.trim();
    return null;
  }, [post, isVehicle]);
  const vehicleTypeHeadline = useMemo(() => {
    if (!post || !isVehicle) return "";
    return post.vehicle_type?.trim().toUpperCase() || "VEHICLE";
  }, [post, isVehicle]);
  const vehicleAvailabilityText = useMemo(() => {
    if (!post || !isVehicle) return "";
    return availabilityLabel || "Available now";
  }, [post, isVehicle, availabilityLabel]);
  const storyDateLabel = useMemo(() => {
    if (!post) return "";
    return formatStoryDate(post.created_at);
  }, [post]);

  const handleDeletePost = useCallback(() => {
    if (!post || !isOwnPost || isDeletingCurrent) return;
    Alert.alert(
      "Delete story?",
      "This story will be removed from your network broadcasts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingPostId(post.id);
            const { error } = await deactivatePost(post.id, myOrgId);
            setDeletingPostId(null);
            if (error) {
              Alert.alert("Could not delete", error.message);
              return;
            }
            invalidatePosts();
            router.back();
          },
        },
      ],
    );
  }, [post, isOwnPost, isDeletingCurrent, invalidatePosts, router]);

  if (!post) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Pressable
          style={[styles.closeBtn, { marginTop: 8, marginLeft: Layout.screenPaddingHorizontal }]}
          onPress={() => router.back()}
        >
          <X size={22} color={INK} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
        {storyList.map((_, i) => (
          <ProgressSegment key={i} index={i} current={current} progress={progress} />
        ))}
      </View>

      {/* Top bar: org + close (reference: floating) */}
      <View style={[styles.topBar, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
        <View style={styles.topBarLeft}>
          <View style={[styles.logoTile, { transform: [{ rotate: "-3deg" }] }]}>
            <Text style={styles.logoTileText}>{getInitials(post.org_name)}</Text>
          </View>
          <View style={styles.topBarText}>
            <View style={styles.orgTitleRow}>
              <Text style={styles.orgTitle} numberOfLines={1}>
                {post.org_name}
              </Text>
              {isOwnPost ? (
                <Pressable
                  style={[styles.inlineDeleteBtn, isDeletingCurrent && styles.inlineDeleteBtnDisabled]}
                  onPress={handleDeletePost}
                  disabled={isDeletingCurrent}
                  hitSlop={8}
                >
                  <Trash2 size={11} color={Theme.teslaRed} strokeWidth={2.5} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.timeAgoLabel}>{timeAgo(post.created_at)}</Text>
          </View>
        </View>
        <Pressable
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <X size={22} color={INK} />
        </Pressable>
      </View>

      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />
      </View>

      {/* Center payload (scroll-free hero) */}
      <View style={styles.centerStage} pointerEvents="none">
        <View style={[styles.iconHero, { backgroundColor: color + "18" }]}>
          {isLoad ? (
            <Package size={44} color={color} strokeWidth={1.8} />
          ) : isVehicle ? (
            <Truck size={44} color={color} strokeWidth={1.8} />
          ) : (
            <Sparkles size={44} color={color} strokeWidth={1.8} />
          )}
        </View>
        <Text style={[styles.kicker, { color }]}>ACTIVE BROADCAST PAYLOAD</Text>
        <Text style={styles.heroTitle} numberOfLines={6}>
          {isVehicle ? `${vehicleTypeHeadline} AVAILABLE` : headline}
        </Text>
        {isVehicle ? (
          <View style={styles.vehicleAvailabilityBlock}>
            <View style={styles.vehicleAvailabilityLine}>
              <Clock3 size={14} color={MUTED} />
              <Text style={styles.vehicleAvailabilityText}>{vehicleAvailabilityText}</Text>
            </View>
            {storyDateLabel ? <Text style={styles.vehicleDateText}>{storyDateLabel}</Text> : null}
          </View>
        ) : null}

        {isLoad && post.origin && post.destination ? (
          <View style={styles.routeLine}>
            <View style={styles.routeDotG} />
            <Text style={styles.routeText} numberOfLines={1}>
              {post.origin}
            </Text>
            <ArrowRight size={16} color={MUTED} />
            <View style={[styles.routeDot, { backgroundColor: color }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {post.destination}
            </Text>
          </View>
        ) : null}

        {isVehicle ? (
          <View style={styles.vehicleLocationsCard}>
            <View style={styles.vehicleLocationRow}>
              <MapPin size={13} color={color} />
              <Text style={styles.vehicleLocationLabel}>Vehicle location:</Text>
              <Text style={styles.vehicleLocationValue} numberOfLines={1}>
                {post.origin?.trim() || "Not set"}
              </Text>
            </View>
            <View style={styles.vehicleLocationDivider} />
            <View style={styles.vehicleLocationRow}>
              <MapPin size={13} color={MUTED} />
              <Text style={styles.vehicleLocationLabel}>Preferred location:</Text>
              <Text style={styles.vehicleLocationValue} numberOfLines={1}>
                {post.destination?.trim() || "Not set"}
              </Text>
            </View>
          </View>
        ) : null}

        {isLoad && (post.vehicle_type != null || post.weight_tonnes != null || post.rate_offer != null) ? (
          <View style={styles.metaRow}>
            {post.vehicle_type ? (
              <View style={styles.metaChip}>
                <Truck size={10} color={MUTED} />
                <Text style={styles.metaChipText}>{post.vehicle_type}</Text>
              </View>
            ) : null}
            {post.weight_tonnes != null ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{post.weight_tonnes}T</Text>
              </View>
            ) : null}
            {post.rate_offer != null ? (
              <View style={[styles.metaChip, styles.metaChipEmphasis, { borderColor: color + "55" }]}>
                <Text style={[styles.metaChipText, { color }]}>{formatINR(post.rate_offer)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {isVehicle && post.vehicle_type ? (
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Truck size={10} color={MUTED} />
              <Text style={styles.metaChipText}>{post.vehicle_type}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.watermark} pointerEvents="none">
        <Text style={styles.watermarkText}>PULSE</Text>
      </View>

      {/* Footer: glassy strip + primary CTA */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 20) + 8 },
        ]}
      >
        {isOwnPost && isLoad && (
          <>
            <Text style={styles.ownerHint}>This is your broadcast — others can place bids on this indent.</Text>
            <Pressable
              style={[styles.authorizeBtn, { backgroundColor: INK }]}
              onPress={() => router.push(ROUTES.PULSE_LOADS)}
            >
              <Text style={styles.authorizeBtnText}>Open load center</Text>
            </Pressable>
          </>
        )}

        {isOwnPost && isVehicle && (
          <>
            <Text style={styles.ownerHint}>Your vehicle availability is visible to your network.</Text>
            <Pressable style={[styles.authorizeBtn, { backgroundColor: INK }]} onPress={() => router.back()}>
              <Text style={styles.authorizeBtnText}>Done</Text>
            </Pressable>
          </>
        )}

        {canBidOnLoad && post && (
          <Pressable
            style={[styles.authorizeBtn, { backgroundColor: INK }]}
            onPress={() => setBidPost(post)}
          >
            <Send size={16} color="#fff" />
            <Text style={styles.authorizeBtnText}>Place bid on indent</Text>
          </Pressable>
        )}

        {canContactVehicle && (
          <Pressable
            style={[styles.authorizeBtn, { backgroundColor: color }]}
            onPress={() => router.back()}
          >
            <MessageSquare size={16} color="#fff" />
            <Text style={styles.authorizeBtnText}>Contact & message</Text>
          </Pressable>
        )}

        {!isOwnPost && (canBidOnLoad || canContactVehicle) && (
          <Pressable style={styles.messageGhost} onPress={() => router.back()}>
            <MessageSquare size={16} color={INK} />
            <Text style={styles.messageGhostText}>Message</Text>
          </Pressable>
        )}
      </View>

      <BidSheet
        visible={bidPost != null}
        post={bidPost}
        orgId={myOrgId}
        onClose={() => setBidPost(null)}
        onSuccess={() => {
          invalidatePosts();
          setBidPost(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
    zIndex: 50,
  },
  progressTrack: {
    height: 3,
    backgroundColor: Theme.surfaceBorder,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: INK,
    borderRadius: 2,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
    marginBottom: 4,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  logoTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: INK,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  logoTileText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    fontStyle: "italic",
  },
  topBarText: { flex: 1, minWidth: 0 },
  orgTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    paddingRight: 2,
  },
  orgTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: INK,
    letterSpacing: -0.3,
  },
  inlineDeleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    zIndex: 60,
  },
  inlineDeleteBtnDisabled: {
    opacity: 0.55,
  },
  timeAgoLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  tapZones: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    bottom: 200,
    flexDirection: "row",
    zIndex: 30,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2.2 },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    marginTop: -16,
  },
  iconHero: {
    width: 100,
    height: 100,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 4,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: INK,
    lineHeight: 36,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -1.1,
  },
  routeLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },
  routeDotG: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeText: {
    fontSize: 14,
    fontWeight: "800",
    color: INK,
    maxWidth: "42%",
  },
  routeSep: { color: MUTED, fontWeight: "800" },
  vehicleAvailabilityBlock: {
    marginTop: 10,
    alignItems: "center",
    gap: 5,
  },
  vehicleAvailabilityLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vehicleAvailabilityText: {
    fontSize: 18,
    fontWeight: "800",
    color: INK,
    fontStyle: "italic",
    letterSpacing: -0.2,
    textTransform: "capitalize",
  },
  vehicleDateText: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  vehicleLocationsCard: {
    marginTop: 16,
    minWidth: "78%",
    maxWidth: "92%",
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  vehicleLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  vehicleLocationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
  },
  vehicleLocationValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "800",
    color: INK,
  },
  vehicleLocationDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  metaChipEmphasis: {
    backgroundColor: Theme.screenBackground,
  },
  metaChipText: { fontSize: 11, fontWeight: "800", color: MUTED },
  watermark: {
    position: "absolute",
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  watermarkText: {
    fontSize: 96,
    fontWeight: "900",
    color: INK,
    opacity: 0.04,
    letterSpacing: -2,
    fontStyle: "italic",
  },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderMedium,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  ownerHint: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 17,
  },
  authorizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  authorizeBtnText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  messageGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  messageGhostText: { fontSize: 12, fontWeight: "800", color: INK, letterSpacing: 0.6 },
});
