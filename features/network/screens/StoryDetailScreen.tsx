/**
 * Full-screen story viewer — Pulse "Mission" layout.
 * Own posts: show WhatsApp-style viewer list.
 * Other posts: show existing bid + edit bid flow.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BidSheet } from "@/features/network/components/bidding/BidSheet";
import { StoryBroadcastPreview } from "@/features/network/components/StoryBroadcastPreview";
import { StoryOwnerFooterActions } from "@/features/network/components/StoryDetailFooterActions";
import { StoryOwnerBidsSheet } from "@/features/network/components/bidding/StoryOwnerBidsSheet";
import { StoryViewersSheet } from "@/features/network/components/StoryViewersSheet";
import {
  deactivatePost,
  getPostById,
  isPostVisibleForOrg,
  type PostRow,
} from "@/features/network/services/posts.service";
import {
  getIndentDisplayNumber,
  getVisibleIndentById,
  resolveSupplierTargetDisplayRate,
} from "@/features/indents/services/indents.service";
import {
  buildStoryOwnerBidRows,
  storyOwnerBidsLabel,
} from "@/features/network/utils/bidding/storyOwnerBids.util";
import {
  buildStoryOwnerViewRows,
  storyOwnerViewsLabel,
  toStoryViewRows,
} from "@/features/network/utils/storyOwnerViews.util";
import { useNetworkFeedQuery, useAfterPostDeleted, useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { useBidsForPostQuery, useMyBidQuery } from "@/lib/queries/useBidsQuery";
import { useIndentDirectQuotesQuery } from "@/lib/queries";
import { useStoryViewsQuery, useRecordStoryViewMutation } from "@/lib/queries/useStoryViewsQuery";
import { confirmDialog } from "@/lib/confirmDialog";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import {
  CheckCircle2,
  Clock3,
  Edit3,
  MapPin,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  X,
  Truck,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  useWindowDimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function buildPulseStoryPublicUrl(
  postId: string,
  orgId: string,
  storyType: 'LOAD' | 'VEHICLE_AVAILABILITY' | 'UPDATE',
): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, '') || '';
  const params = new URLSearchParams({
    postId,
    orgId,
    storyType,
    queue: postId,
  });
  const qs = params.toString();
  if (webBase !== '') {
    return `${webBase}/story-detail?${qs}`;
  }
  return Linking.createURL(`/story-detail?${qs}`);
}

const STORY_DURATION = 15000;
const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;

const PALETTE = [
  "#4D3636", "#8b5cf6", "#ec4899", "#f43f5e",
  "#10b981", "#3b82f6", "#f59e0b", "#0ea5e9",
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
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function storyHeadline(post: PostRow, isLoad: boolean, isVehicle: boolean): string {
  const t = post.content?.trim();
  if (t) return t;
  if (isLoad && post.origin && post.destination) {
    const mat = post.material?.trim();
    if (mat) return `${mat} · ${post.origin} → ${post.destination}`;
    return `${post.origin} → ${post.destination}`;
  }
  if (isVehicle && post.origin) return `Available @ ${post.origin}`;
  return "Active broadcast";
}

function storyTypeLabel(post: PostRow): string {
  if (post.type === "LOAD") return "LOAD BROADCAST";
  if (post.type === "VEHICLE_AVAILABILITY") return "CAPACITY ALERT";
  return "NETWORK UPDATE";
}

function splitLocationParts(value: string | null | undefined): {
  city: string;
  state: string;
} {
  const raw = (value ?? "").trim();
  if (!raw) return { city: "—", state: "" };
  const [city, ...rest] = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: city || raw,
    state: rest.join(", "),
  };
}

function loadMaterialLabel(post: PostRow, fallbackHeadline: string): string {
  const material = post.material?.trim();
  if (material) return material;
  const beforeRoute = fallbackHeadline.split("→")[0]?.split("•")[0]?.split("·")[0]?.trim();
  return beforeRoute || "Load";
}

// ── Progress segment ────────────────────────────────────────────────────────

function ProgressSegment({ index, current, progress }: { index: number; current: number; progress: Animated.Value }) {
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" });
  if (index < current) return <View style={[ps.track, { flex: 1 }]}><View style={[ps.fill, { width: "100%" }]} /></View>;
  if (index === current) return <View style={[ps.track, { flex: 1 }]}><Animated.View style={[ps.fill, { width }]} /></View>;
  return <View style={[ps.track, { flex: 1 }]} />;
}

const ps = StyleSheet.create({
  track: { height: 3, backgroundColor: Theme.surfaceBorder, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: INK, borderRadius: 2 },
});

function StoryContentEntrance({
  storyKey,
  children,
}: {
  storyKey: string;
  children: React.ReactNode;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(22)).current;

  useEffect(() => {
    fade.setValue(0);
    rise.setValue(22);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(rise, {
        toValue: 0,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  }, [storyKey, fade, rise]);

  return (
    <Animated.View
      style={[entrance.wrap, { opacity: fade, transform: [{ translateY: rise }] }]}
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
}

const entrance = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", gap: 0 },
});

// ── Main screen ─────────────────────────────────────────────────────────────

export default function StoryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const isDesktopPreview = viewportWidth >= 1024;
  const params = useLocalSearchParams<{ orgId?: string; postId?: string; storyType?: string; queue?: string }>();
  const { currentOrganization } = useOrganization();
  const myOrgId = currentOrganization?.id ?? "";
  const invalidatePosts = useInvalidatePosts(myOrgId);
  const afterPostDeleted = useAfterPostDeleted(currentOrganization?.id ?? null);

  const feedQ = useNetworkFeedQuery(myOrgId);
  const allowLoadPosts = currentOrganization?.capabilities?.canBid ?? true;
  const allPosts = useMemo(
    () => (feedQ.data ?? []).filter((post) => isPostVisibleForOrg(post, { allowLoadPosts })),
    [feedQ.data, allowLoadPosts],
  );

  const isBusinessPost = (p: PostRow) => p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY";

  const targetOrgId = params.orgId ?? "";
  const queueIds = useMemo(
    () => (params.queue ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    [params.queue],
  );
  const targetStoryType =
    params.storyType === "LOAD" || params.storyType === "VEHICLE_AVAILABILITY" ? params.storyType : null;

  const storiesByOrgType = allPosts.filter(
    (p) => p.organization_id === targetOrgId && isBusinessPost(p) && (targetStoryType ? p.type === targetStoryType : true),
  );
  const storiesFromQueue = useMemo(() => {
    if (queueIds.length === 0) return [];
    const byId = new Map(allPosts.map((p) => [p.id, p] as const));
    return queueIds.map((id) => byId.get(id)).filter((p): p is PostRow => !!p && isBusinessPost(p));
  }, [queueIds, allPosts]);
  const seedPost = allPosts.find((p) => p.id === params.postId && isBusinessPost(p));
  const storyList: PostRow[] =
    storiesFromQueue.length > 0 ? storiesFromQueue
    : storiesByOrgType.length > 0 ? storiesByOrgType
    : seedPost ? [seedPost]
    : [];

  // Direct fetch by postId when feed cache is empty (e.g. opened via shared URL).
  const directPostQ = useQuery({
    queryKey: ["q", "posts", "direct", params.postId],
    queryFn: async () => {
      const { post } = await getPostById(params.postId!);
      return post;
    },
    enabled: Boolean(params.postId && storyList.length === 0),
    staleTime: 30_000,
  });
  const directPost = directPostQ.data ?? null;
  const resolvedStoryList: PostRow[] = storyList.length > 0 ? storyList : directPost ? [directPost] : [];
  const isLoadingPost = storyList.length === 0 && directPostQ.isLoading;

  const [current, setCurrent] = useState(0);
  const [bidPost, setBidPost] = useState<PostRow | null>(null);
  const [editBidMode, setEditBidMode] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [showViewers, setShowViewers] = useState(false);
  const [showBids, setShowBids] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const goNext = useCallback(() => {
    if (current < resolvedStoryList.length - 1) { progress.setValue(0); setCurrent((c) => c + 1); }
    else router.back();
  }, [current, resolvedStoryList.length, progress, router]);

  const goPrev = useCallback(() => {
    if (current > 0) { progress.setValue(0); setCurrent((c) => c - 1); }
  }, [current, progress]);

  useEffect(() => {
    if (resolvedStoryList.length === 0) return;
    if (animRef.current) animRef.current.stop();
    progress.setValue(0);
    animRef.current = Animated.timing(progress, { toValue: 1, duration: STORY_DURATION, easing: Easing.linear, useNativeDriver: false });
    animRef.current.start(({ finished }) => { if (finished) goNext(); });
    return () => { if (animRef.current) animRef.current.stop(); };
  }, [current, resolvedStoryList.length, goNext, progress]);

  const initialStoryIndex = useMemo(() => {
    const targetPostId = params.postId ?? "";
    if (!targetPostId || resolvedStoryList.length === 0) return 0;
    const idx = resolvedStoryList.findIndex((p) => p.id === targetPostId);
    return idx >= 0 ? idx : 0;
  }, [resolvedStoryList, params.postId]);

  useEffect(() => { setCurrent(initialStoryIndex); progress.setValue(0); }, [initialStoryIndex, progress]);

  const post = resolvedStoryList[current];

  useEffect(() => {
    if (!post) return;
    footerFade.setValue(0);
    Animated.timing(footerFade, {
      toValue: 1,
      duration: 480,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [post?.id, footerFade, post]);
  const linkedIndentQ = useQuery({
    queryKey: ["q", "indents", "story-target", myOrgId, post?.source_indent_id],
    queryFn: async () => {
      const { indent, error } = await getVisibleIndentById(
        myOrgId,
        post!.source_indent_id!,
      );
      if (error) throw error;
      return indent;
    },
    enabled: Boolean(myOrgId && post?.source_indent_id && post.type === "LOAD"),
    staleTime: 60_000,
  });
  const loadTargetRate = resolveSupplierTargetDisplayRate(
    linkedIndentQ.data?.supplier_target,
    linkedIndentQ.data?.client_price,
    post?.rate_offer,
  );
  const color = post ? seedColor(post.organization_id) : PALETTE[0];
  const isLoad = post?.type === "LOAD";
  const isVehicle = post?.type === "VEHICLE_AVAILABILITY";

  const isOwnPost = useMemo(() => !!myOrgId && !!post && post.organization_id === myOrgId, [myOrgId, post]);
  const canBidOnLoad = Boolean(isLoad && !isOwnPost && myOrgId && post);
  const canContactVehicle = Boolean(isVehicle && !isOwnPost && myOrgId);
  const isDeletingCurrent = deletingPostId != null && deletingPostId === post?.id;

  // Fetch my existing bid on current post (for non-own load posts)
  const myBidQ = useMyBidQuery(canBidOnLoad ? (post?.id ?? null) : null, myOrgId || null);
  const myBid = myBidQ.data ?? null;

  // Record view (fire-and-forget, once per post per session)
  const recordView = useRecordStoryViewMutation();
  const recordViewMutate = recordView.mutate;
  useEffect(() => {
    if (!post || isOwnPost || !myOrgId) return;
    if (recordedViewsRef.current.has(post.id)) return;
    recordedViewsRef.current.add(post.id);
    if (__DEV__) console.log('[story-views] recording view for post', post.id, 'org', myOrgId);
    recordViewMutate({ postId: post.id, orgId: myOrgId, orgName: currentOrganization?.name ?? "" });
  }, [post?.id, isOwnPost, myOrgId, currentOrganization?.name, recordViewMutate]);

  // Fetch viewers (own posts only)
  const viewsQ = useStoryViewsQuery(isOwnPost ? (post?.id ?? null) : null, isOwnPost);
  const views = viewsQ.data ?? [];

  const ownerIndentId =
    isOwnPost && isLoad ? (post?.source_indent_id ?? null) : null;
  const storyBidsQ = useBidsForPostQuery(
    isOwnPost && isLoad ? (post?.id ?? null) : null,
  );
  const ownerQuotesQ = useIndentDirectQuotesQuery(ownerIndentId);
  const ownerBidRows = useMemo(
    () =>
      buildStoryOwnerBidRows(storyBidsQ.data ?? [], ownerQuotesQ.data ?? []),
    [storyBidsQ.data, ownerQuotesQ.data],
  );
  const ownerBidsLoading = storyBidsQ.isLoading || ownerQuotesQ.isLoading;
  const ownerViewRows = useMemo(
    () => buildStoryOwnerViewRows(views, ownerBidRows),
    [views, ownerBidRows],
  );
  const ownerViewsLoading =
    viewsQ.isLoading || (ownerBidsLoading && views.length === 0);
  const indentDisplayLabel = linkedIndentQ.data
    ? getIndentDisplayNumber(linkedIndentQ.data)
    : null;

  const headline = post ? storyHeadline(post, Boolean(isLoad), Boolean(isVehicle)) : "";
  const originParts = splitLocationParts(post?.origin);
  const destinationParts = splitLocationParts(post?.destination);
  const loadMaterial = post && isLoad ? loadMaterialLabel(post, headline) : "";
  const availabilityLabel = useMemo(() => {
    if (!post || !isVehicle) return null;
    const first = post.content?.split("·")[0]?.trim();
    if (first) return first;
    if (post.load_date?.trim()) return post.load_date.trim();
    return null;
  }, [post, isVehicle]);
  const vehicleTypeHeadline = useMemo(() => (!post || !isVehicle) ? "" : post.vehicle_type?.trim().toUpperCase() || "VEHICLE", [post, isVehicle]);
  const vehicleAvailabilityText = useMemo(() => (!post || !isVehicle) ? "" : availabilityLabel || "Available now", [post, isVehicle, availabilityLabel]);
  const storyDateLabel = useMemo(() => post ? formatStoryDate(post.created_at) : "", [post]);
  const heroLabel = useMemo(() => post ? storyTypeLabel(post) : "", [post]);

  const handleDeletePost = useCallback(async () => {
    if (!post || !isOwnPost || isDeletingCurrent) return;
    const ok = await confirmDialog(
      "Delete story?",
      "This story will be removed from your network broadcasts.",
      { confirmText: "Delete", destructive: true },
    );
    if (!ok) return;
    setDeletingPostId(post.id);
    const { error } = await deactivatePost(post.id, myOrgId);
    setDeletingPostId(null);
    if (error) {
      Alert.alert("Could not delete", error.message);
      return;
    }
    await afterPostDeleted(post.id);
    router.back();
  }, [post, isOwnPost, isDeletingCurrent, myOrgId, afterPostDeleted, router]);

  const handleShareWhatsApp = useCallback(async () => {
    if (!post || !myOrgId) return;
    const storyUrl = buildPulseStoryPublicUrl(post.id, myOrgId, post.type);
    const routeLabel =
      isLoad && post.origin && post.destination
        ? `${(post.origin || "—").toUpperCase()} → ${(post.destination || "—").toUpperCase()}`
        : post.content?.trim() || "Network Story";

    const message = `Load broadcast · ${routeLabel}\n\nView & bid:\n${storyUrl}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(storyUrl, { dialogTitle: message });
      } else {
        // Fallback for when Sharing is not available
        await Sharing.shareAsync(storyUrl, { dialogTitle: message });
      }
    } catch {
      await Sharing.shareAsync(storyUrl, { dialogTitle: message });
    }
  }, [post, myOrgId, isLoad]);


  if (!post) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingHorizontal: Layout.screenPaddingHorizontal }]}>
        <Pressable
          style={[styles.topBarIconBtn, { marginTop: 8, alignSelf: "flex-start" }]}
          onPress={() => router.back()}
        >
          <X size={16} color={INK} strokeWidth={2.25} />
        </Pressable>
        {isLoadingPost
          ? <ActivityIndicator size="large" color={Theme.primary} />
          : <Text style={{ color: Theme.textMuted, fontSize: 14, fontWeight: '500' }}>Story not found</Text>
        }
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoad ? <View style={styles.ambientGlow} pointerEvents="none" /> : null}
      <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
        {resolvedStoryList.map((_, i) => (
          <ProgressSegment key={i} index={i} current={current} progress={progress} />
        ))}
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, isDesktopPreview && styles.topBarDesktop, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
        <View style={styles.topBarLeft}>
          <View style={styles.topBarText}>
            <View style={styles.orgBrandRow}>
              <Text style={[styles.orgTitle, (post.org_name ?? '').trim().toUpperCase() === "PULSE" && styles.orgTitlePulse]} numberOfLines={1}>
                {post.org_name}
              </Text>
              {(post.org_name ?? '').trim().toUpperCase() === "PULSE" ? <View style={styles.pulseGreenDot} /> : null}
            </View>
            <Text style={styles.timeAgoLabel}>{timeAgo(post.created_at)}</Text>
          </View>
        </View>
        <View style={styles.topBarActions}>
          {isOwnPost ? (
            <Pressable
              style={({ pressed }) => [
                styles.topBarIconBtn,
                styles.topBarDeleteBtn,
                isDeletingCurrent && styles.topBarIconBtnDisabled,
                pressed && styles.topBarIconBtnPressed,
              ]}
              onPress={handleDeletePost}
              disabled={isDeletingCurrent}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Delete story"
            >
              <Trash2 size={14} color={Theme.teslaRed} strokeWidth={2.25} />
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.topBarIconBtn, pressed && styles.topBarIconBtnPressed]}
            onPress={() => router.back()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close story"
          >
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />
      </View>

      {/* Center payload */}
      <View style={[styles.centerStage, isDesktopPreview && styles.centerStageDesktop]} pointerEvents="none">
        {isLoad && post.origin && post.destination ? (
          <StoryBroadcastPreview
            post={post}
            loadMaterial={loadMaterial}
            originParts={originParts}
            destinationParts={destinationParts}
            loadTargetRate={loadTargetRate}
            isDesktopPreview={isDesktopPreview}
            storyKey={post.id}
          />
        ) : (
          <StoryContentEntrance storyKey={post.id}>
            <View style={[styles.iconHero, isDesktopPreview && styles.iconHeroDesktop, { backgroundColor: color + "18" }]}>
              {isVehicle ? (
                <Truck size={isDesktopPreview ? 40 : 30} color={color} strokeWidth={1.8} />
              ) : (
                <Sparkles size={isDesktopPreview ? 40 : 30} color={color} strokeWidth={1.8} />
              )}
            </View>
            <Text style={[styles.kicker, isDesktopPreview && styles.kickerDesktop, { color }]}>{heroLabel}</Text>
            <Text style={[styles.heroTitle, isDesktopPreview && styles.heroTitleDesktop]} numberOfLines={6}>
              {isVehicle ? `${vehicleTypeHeadline} AVAILABLE` : headline}
            </Text>

            {isVehicle ? (
              <View style={[styles.vehicleAvailabilityBlock, isDesktopPreview && styles.vehicleAvailabilityBlockDesktop]}>
                <View style={styles.vehicleAvailabilityLine}>
                  <Clock3 size={14} color={MUTED} />
                  <Text style={[styles.vehicleAvailabilityText, isDesktopPreview && styles.vehicleAvailabilityTextDesktop]}>
                    {vehicleAvailabilityText}
                  </Text>
                </View>
                {storyDateLabel ? (
                  <Text style={[styles.vehicleDateText, isDesktopPreview && styles.vehicleDateTextDesktop]}>
                    {storyDateLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {isVehicle ? (
              <View style={[styles.vehicleLocationsCard, isDesktopPreview && styles.vehicleLocationsCardDesktop]}>
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

            {isVehicle && post.vehicle_type ? (
              <View style={[styles.metaRow, isDesktopPreview && styles.metaRowDesktop]}>
                <View style={styles.metaChip}>
                  <Truck size={10} color={MUTED} />
                  <Text style={styles.metaChipText}>{post.vehicle_type}</Text>
                </View>
              </View>
            ) : null}
          </StoryContentEntrance>
        )}
      </View>

      <View style={[styles.watermark, isDesktopPreview && styles.watermarkDesktop]} pointerEvents="none">
        <Text style={styles.watermarkText}>PULSE</Text>
      </View>

      {/* Footer */}
      <Animated.View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 8, opacity: footerFade }]}>
        {isOwnPost && isLoad && (
          <StoryOwnerFooterActions
            viewsLabel={storyOwnerViewsLabel(ownerViewRows.length, ownerViewsLoading)}
            bidsLabel={storyOwnerBidsLabel(ownerBidRows.length, ownerBidsLoading)}
            hint="This is your broadcast — others can place bids on this indent."
            primaryLabel="Open load center"
            onViewersPress={() => setShowViewers(true)}
            onBidsPress={ownerIndentId ? () => setShowBids(true) : undefined}
            onPrimaryPress={() => router.push(ROUTES.PULSE_LOADS)}
            onShareWhatsApp={handleShareWhatsApp}
          />
        )}

        {isOwnPost && isVehicle && (
          <StoryOwnerFooterActions
            viewsLabel={storyOwnerViewsLabel(ownerViewRows.length, ownerViewsLoading)}
            hint="Your vehicle availability is visible to your network."
            primaryLabel="Done"
            onViewersPress={() => setShowViewers(true)}
            onPrimaryPress={() => router.back()}
            onShareWhatsApp={handleShareWhatsApp}
          />
        )}

        {canBidOnLoad && post && (
          myBid ? (
            /* Already bid — show status + edit */
            <>
              <View style={styles.bidStatusBanner}>
                <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
                <View style={styles.bidStatusText}>
                  <Text style={styles.bidStatusLabel}>Bid submitted</Text>
                  <Text style={styles.bidStatusAmount}>₹{myBid.amount.toLocaleString("en-IN")}{myBid.note ? ` · ${myBid.note}` : ""}</Text>
                </View>
                <View style={[styles.bidStatusBadge, myBid.status === "accepted" ? styles.bidBadgeAccepted : myBid.status === "rejected" ? styles.bidBadgeRejected : styles.bidBadgePending]}>
                  <Text style={styles.bidStatusBadgeText}>{myBid.status.toUpperCase()}</Text>
                </View>
              </View>
              {myBid.status === "pending" && (
                <Pressable
                  style={({ pressed }) => [styles.authorizeBtn, pressed && styles.authorizeBtnPressed]}
                  onPress={() => { setEditBidMode(true); setBidPost(post); }}
                >
                  <Edit3 size={16} color={INK} />
                  <Text style={styles.authorizeBtnText}>Edit bid</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.authorizeBtn, pressed && styles.authorizeBtnPressed]}
              onPress={() => { setEditBidMode(false); setBidPost(post); }}
            >
              <Send size={16} color={INK} />
              <Text style={styles.authorizeBtnText}>Place bid on indent</Text>
            </Pressable>
          )
        )}

        {canContactVehicle && (
          <Pressable
            style={({ pressed }) => [
              styles.authorizeBtn,
              styles.authorizeBtnSolid,
              { backgroundColor: color },
              pressed && styles.authorizeBtnSolidPressed,
            ]}
            onPress={() => router.back()}
          >
            <MessageSquare size={16} color={Theme.textOnPrimary} />
            <Text style={[styles.authorizeBtnText, styles.authorizeBtnTextOnFill]}>Contact & message</Text>
          </Pressable>
        )}

        {!isOwnPost && (canBidOnLoad || canContactVehicle) && (
          <Pressable style={styles.messageGhost} onPress={() => router.back()}>
            <MessageSquare size={16} color={INK} />
            <Text style={styles.messageGhostText}>Message</Text>
          </Pressable>
        )}
      </Animated.View>

      <BidSheet
        visible={bidPost != null}
        post={bidPost}
        orgId={myOrgId}
        existingBid={editBidMode ? myBid : null}
        onClose={() => { setBidPost(null); setEditBidMode(false); }}
        onSuccess={() => {
          invalidatePosts();
          setBidPost(null);
          setEditBidMode(false);
        }}
      />

      <StoryViewersSheet
        visible={showViewers}
        views={post ? toStoryViewRows(ownerViewRows, post.id) : []}
        loading={ownerViewsLoading}
        onClose={() => setShowViewers(false)}
      />

      <StoryOwnerBidsSheet
        visible={showBids}
        bids={ownerBidRows}
        loading={ownerBidsLoading}
        indentId={ownerIndentId}
        indentLabel={indentDisplayLabel}
        onClose={() => setShowBids(false)}
        onOpenReviewHub={
          ownerIndentId
            ? () => router.push(ROUTES.indentDetail(ownerIndentId) as never)
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground, overflow: "hidden" },
  ambientGlow: {
    position: "absolute",
    top: "18%",
    left: "-12%",
    right: "-12%",
    height: "52%",
    borderRadius: 999,
    backgroundColor: Theme.loadAddButtonBg,
    opacity: 0.42,
    transform: [{ scaleX: 1.15 }],
  },
  progressRow: {
    flexDirection: "row", gap: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10, zIndex: 100, elevation: 100,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
    elevation: 100,
    marginBottom: 6,
  },
  topBarDesktop: { marginBottom: 12 },
  topBarLeft: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, paddingRight: 10 },
  topBarText: { flex: 1, minWidth: 0 },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  topBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  topBarDeleteBtn: {
    backgroundColor: "rgba(220, 38, 38, 0.06)",
    borderColor: "rgba(220, 38, 38, 0.18)",
  },
  topBarIconBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  topBarIconBtnDisabled: {
    opacity: 0.5,
  },
  orgBrandRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  orgTitle: { flexShrink: 1, fontSize: 13, fontWeight: "800", color: INK, letterSpacing: -0.2 },
  orgTitlePulse: { fontStyle: "italic", letterSpacing: -0.45 },
  pulseGreenDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Theme.darkGreen, marginTop: 1, flexShrink: 0 },
  timeAgoLabel: { fontSize: 8, fontWeight: "700", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 1 },
  tapZones: { position: "absolute", top: 100, left: 0, right: 0, bottom: 200, flexDirection: "row", zIndex: 30 },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2.2 },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: -8,
    gap: 0,
  },
  centerStageDesktop: { marginTop: -4, paddingHorizontal: 56 },
  iconHero: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  iconHeroDesktop: { width: 96, height: 96, borderRadius: 28, marginBottom: 16 },
  kicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 8,
  },
  kickerDesktop: { fontSize: 9, letterSpacing: 3, marginBottom: 10 },
  heroTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: INK,
    lineHeight: 28,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -0.6,
    maxWidth: 320,
  },
  heroTitleDesktop: { fontSize: 40, lineHeight: 42, letterSpacing: -1, maxWidth: 980 },
  loadHeroTitleWrap: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    alignItems: "stretch",
    gap: 6,
  },
  loadHeroTitleWrapDesktop: { maxWidth: 640, gap: 8 },
  loadMaterialTitle: {
    maxWidth: "100%",
    fontSize: 22,
    fontWeight: "900",
    color: INK,
    lineHeight: 24,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  loadMaterialTitleDesktop: { fontSize: 36, lineHeight: 38, letterSpacing: -0.9 },
  loadRouteHeadlineRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  loadRouteHeadlinePoint: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  loadRouteHeadlinePointEnd: { alignItems: "flex-end" },
  loadRouteArrow: { marginBottom: 4, flexShrink: 0 },
  loadCityTextEnd: { textAlign: "right" },
  loadStateTextEnd: { textAlign: "right" },
  loadCityText: {
    maxWidth: "100%",
    fontSize: 18,
    fontWeight: "900",
    color: INK,
    lineHeight: 20,
    textAlign: "left",
    fontStyle: "italic",
    letterSpacing: -0.35,
    textTransform: "uppercase",
  },
  loadCityTextDesktop: { fontSize: 28, lineHeight: 30, letterSpacing: -0.6 },
  loadStateText: {
    maxWidth: "100%",
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    lineHeight: 12,
    textAlign: "left",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  loadStateTextDesktop: { fontSize: 13, lineHeight: 15 },
  routeCard: {
    marginTop: 12,
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeCardDesktop: { maxWidth: 640, marginTop: 18, paddingHorizontal: 14, paddingVertical: 12 },
  routeLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  routePoint: { flex: 1, minWidth: 0, gap: 3, alignItems: "flex-start" },
  routeLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  routeDotG: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10b981" },
  routeDot: { width: 6, height: 6, borderRadius: 3 },
  routeText: { fontSize: 12, fontWeight: "800", color: INK, maxWidth: "100%", lineHeight: 15 },
  vehicleAvailabilityBlock: { marginTop: 10, alignItems: "center", gap: 5 },
  vehicleAvailabilityBlockDesktop: { marginTop: 14, gap: 6 },
  vehicleAvailabilityLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  vehicleAvailabilityText: { fontSize: 18, fontWeight: "800", color: INK, fontStyle: "italic", letterSpacing: -0.2, textTransform: "capitalize" },
  vehicleAvailabilityTextDesktop: { fontSize: 20, letterSpacing: -0.25 },
  vehicleDateText: { fontSize: 11, fontWeight: "700", color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" },
  vehicleDateTextDesktop: { fontSize: 12, letterSpacing: 0.75 },
  vehicleLocationsCard: { marginTop: 16, minWidth: "78%", maxWidth: "92%", backgroundColor: Theme.surface, borderRadius: 12, borderWidth: 1, borderColor: Theme.borderMedium, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  vehicleLocationsCardDesktop: { minWidth: "70%", maxWidth: 900, marginTop: 22, paddingHorizontal: 16, paddingVertical: 12 },
  vehicleLocationRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  vehicleLocationLabel: { fontSize: 11, fontWeight: "700", color: MUTED },
  vehicleLocationValue: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "800", color: INK },
  vehicleLocationDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderMedium },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    gap: 6,
    marginTop: 10,
  },
  metaRowDesktop: { marginTop: 14, maxWidth: 640, gap: 8 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  metaChipEmphasis: { backgroundColor: Theme.screenBackground },
  metaChipText: { fontSize: 9, fontWeight: "800", color: MUTED, letterSpacing: 0.1 },
  watermark: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center", transform: [{ translateY: -28 }] },
  watermarkDesktop: { transform: [{ translateY: -36 }] },
  watermarkText: { fontSize: 56, fontWeight: "900", color: INK, opacity: 0.03, letterSpacing: -1.2, fontStyle: "italic" },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.loadStatusTabBorderSoft,
    backgroundColor: "rgba(255,255,255,0.96)",
    gap: 8,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  authorizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 4,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  authorizeBtnPressed: {
    backgroundColor: Theme.loadAddButtonBgPressed,
    transform: [{ scale: 0.985 }],
  },
  authorizeBtnSolid: {
    borderWidth: 0,
  },
  authorizeBtnSolidPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  authorizeBtnText: { fontSize: 13, fontWeight: "800", color: INK, letterSpacing: -0.15 },
  authorizeBtnTextOnFill: { color: Theme.textOnPrimary },
  messageGhost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  messageGhostText: { fontSize: 12, fontWeight: "800", color: INK, letterSpacing: 0.6 },
  // Bid status
  bidStatusBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#10b98110", borderRadius: 14, borderWidth: 1, borderColor: "#10b98130", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  bidStatusText: { flex: 1, minWidth: 0 },
  bidStatusLabel: { fontSize: 10, fontWeight: "900", color: "#10b981", letterSpacing: 0.8, textTransform: "uppercase" },
  bidStatusAmount: { fontSize: 14, fontWeight: "800", color: INK, marginTop: 1 },
  bidStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  bidBadgePending: { backgroundColor: "#f59e0b18" },
  bidBadgeAccepted: { backgroundColor: "#10b98118" },
  bidBadgeRejected: { backgroundColor: "#ef444418" },
  bidStatusBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8, color: MUTED },
});
