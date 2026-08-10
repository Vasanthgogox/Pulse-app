/**
 * Driver fullscreen Pulse story viewer — Mission layout aligned with
 * business StoryDetailScreen + StoryBroadcastPreview.
 */
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { StoryBroadcastPreview } from "@/features/network/components/StoryBroadcastPreview";
import type { PostRow } from "@/features/network/services/posts.service";
import { getStoryPreview } from "@/features/network/services/posts.service";
import {
  loadMaterialLabel,
  splitLocationParts,
} from "@/features/network/utils/storyDisplay";
import type { DriverReachStoryRow } from "@/features/reach/services/driverReferrals.service";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Megaphone,
  Rocket,
  X,
  XCircle,
} from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;
const STORY_DURATION = 15000;

export type DriverPulseStoryViewerProps = {
  postId: string;
  story?: DriverReachStoryRow | null;
  shipperName?: string | null;
  onClose: () => void;
  footerAction?: {
    label: string;
    hint?: string;
    onPress: () => void;
  } | null;
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function previewToPost(
  preview: {
    id: string;
    organization_id: string;
    org_name: string;
    type: PostRow["type"];
    origin: string | null;
    destination: string | null;
    load_date: string | null;
    vehicle_type: string | null;
    expires_at: string | null;
    is_active: boolean;
  },
  story?: DriverReachStoryRow | null,
): PostRow {
  return {
    id: preview.id,
    organization_id: preview.organization_id,
    org_name: preview.org_name || story?.org_name || "Pulse",
    org_avatar_seed: null,
    org_avatar_url: story?.org_logo_url ?? null,
    author_user_id: "",
    type: preview.type,
    content: story?.snapshot_content ?? null,
    origin: preview.origin ?? story?.snapshot_origin ?? null,
    destination: preview.destination ?? story?.snapshot_destination ?? null,
    load_date: preview.load_date,
    vehicle_type: preview.vehicle_type ?? story?.snapshot_vehicle_type ?? null,
    weight_tonnes: null,
    rate_offer: null,
    material: story?.snapshot_material ?? null,
    expires_at: preview.expires_at ?? story?.expires_at ?? null,
    is_active: preview.is_active,
    view_count: 0,
    bid_count: 0,
    created_at: story?.published_at ?? new Date().toISOString(),
    is_sponsored: true,
    reach_campaign_id: story?.campaign_id ?? null,
  };
}

function BidToShipperBanner({
  story,
  shipperName,
}: {
  story: DriverReachStoryRow;
  shipperName: string;
}) {
  if (story.direct_bid_status) {
    const amount = story.direct_bid_amount ?? 0;
    const status = story.direct_bid_status;
    const isAccepted = status === "accepted";
    const isRejected = status === "rejected";
    return (
      <View
        style={[
          styles.bidStatusBanner,
          isRejected && styles.bidStatusBannerRejected,
        ]}
      >
        {isAccepted ? (
          <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
        ) : isRejected ? (
          <XCircle size={16} color={Theme.negative} strokeWidth={2.5} />
        ) : (
          <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
        )}
        <View style={styles.bidStatusText}>
          <Text style={styles.bidStatusLabel}>
            {isAccepted
              ? "Bid accepted by shipper"
              : isRejected
                ? "Bid not accepted"
                : `Your bid to ${shipperName}`}
          </Text>
          <Text style={styles.bidStatusAmount}>
            ₹{Math.round(amount).toLocaleString("en-IN")}
            {!isAccepted && !isRejected ? " · waiting for shipper" : ""}
          </Text>
        </View>
        <View
          style={[
            styles.bidStatusBadge,
            isAccepted
              ? styles.bidBadgeAccepted
              : isRejected
                ? styles.bidBadgeRejected
                : styles.bidBadgePending,
          ]}
        >
          <Text style={styles.bidStatusBadgeText}>{status.toUpperCase()}</Text>
        </View>
      </View>
    );
  }

  if (story.referral_status === "bid_submitted") {
    return (
      <View style={styles.bidStatusBanner}>
        <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
        <View style={styles.bidStatusText}>
          <Text style={styles.bidStatusLabel}>Fleet bid to {shipperName}</Text>
          <Text style={styles.bidStatusAmount}>Your fleet placed a bid on this load</Text>
        </View>
        <View style={[styles.bidStatusBadge, styles.bidBadgeAccepted]}>
          <Text style={styles.bidStatusBadgeText}>FLEET</Text>
        </View>
      </View>
    );
  }

  if (story.referral_status === "recommended" || story.referral_status === "approved") {
    return (
      <View style={[styles.bidStatusBanner, styles.bidStatusBannerPending]}>
        <Clock3 size={16} color={Theme.warning} strokeWidth={2.5} />
        <View style={styles.bidStatusText}>
          <Text style={[styles.bidStatusLabel, styles.bidStatusLabelPending]}>
            {story.referral_status === "approved"
              ? "Fleet is bidding for you"
              : "Recommended to your fleet"}
          </Text>
          <Text style={styles.bidStatusAmount}>
            {story.referral_status === "approved"
              ? `Waiting on ${shipperName}`
              : "Waiting for fleet owner to bid"}
          </Text>
        </View>
        <View style={[styles.bidStatusBadge, styles.bidBadgePending]}>
          <Text style={styles.bidStatusBadgeText}>PENDING</Text>
        </View>
      </View>
    );
  }

  return null;
}

export function DriverPulseStoryViewer({
  postId,
  story = null,
  shipperName,
  onClose,
  footerAction = null,
}: DriverPulseStoryViewerProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const previewQ = useQuery({
    queryKey: ["q", "posts", "story-preview", "driver", postId],
    queryFn: async () => {
      const { preview, error } = await getStoryPreview(postId);
      if (error) throw error;
      return preview;
    },
    enabled: Boolean(postId),
    staleTime: 30_000,
    retry: 1,
  });

  const post = useMemo(() => {
    if (previewQ.data) return previewToPost(previewQ.data, story);
    // Instant paint from feed snapshot while preview RPC loads
    if (story?.post_id) {
      return previewToPost(
        {
          id: story.post_id,
          organization_id: story.campaign_org_id,
          org_name: story.org_name,
          type: (story.snapshot_post_type as PostRow["type"]) || "LOAD",
          origin: story.snapshot_origin,
          destination: story.snapshot_destination,
          load_date: null,
          vehicle_type: story.snapshot_vehicle_type,
          expires_at: story.expires_at,
          is_active: true,
        },
        story,
      );
    }
    return null;
  }, [previewQ.data, story]);

  useEffect(() => {
    if (!post?.id) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) onCloseRef.current();
    });
    return () => anim.stop();
  }, [post?.id, progress]);

  useEffect(() => {
    if (!post?.id) return;
    footerFade.setValue(0);
    Animated.timing(footerFade, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [post?.id, footerFade]);

  const resolvedShipper =
    (shipperName ?? story?.org_name ?? post?.org_name ?? "shipper").trim() || "shipper";

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const body = (() => {
    if (!post && previewQ.isLoading) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Theme.driverEmerald} />
          <Text style={styles.loadingText}>Opening story…</Text>
        </View>
      );
    }

    if (!post) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
          <Pressable style={styles.topBarIconBtn} onPress={onClose}>
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
          <Megaphone size={28} color={MUTED} strokeWidth={1.8} />
          <Text style={styles.notFoundTitle}>Story unavailable</Text>
          <Text style={styles.notFoundBody}>
            This market story could not be loaded. Pull to refresh on Stories and try again.
          </Text>
          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Close</Text>
          </Pressable>
        </View>
      );
    }

    const isLoad = post.type === "LOAD" && Boolean(post.origin && post.destination);
    const originParts = splitLocationParts(post.origin);
    const destinationParts = splitLocationParts(post.destination);
    const loadMaterial = loadMaterialLabel(post, story?.snapshot_title ?? "Load");

    return (
      <View style={styles.container}>
        {isLoad ? <View style={styles.ambientGlow} pointerEvents="none" /> : null}

        <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        </View>

        <View style={[styles.topBar, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
          <View style={styles.topBarLeft}>
            <View style={styles.topBarText}>
              <View style={styles.orgBrandRow}>
                <Text style={styles.orgTitle} numberOfLines={1}>
                  {post.org_name}
                </Text>
              </View>
              <View style={styles.topBarSubRow}>
                <Text style={styles.timeAgoLabel}>{timeAgo(post.created_at)}</Text>
                <Pressable
                  style={styles.sponsoredTag}
                  onPress={() =>
                    Alert.alert(
                      "Sponsored",
                      "This load has been promoted through Pulse Reach.",
                    )
                  }
                  hitSlop={6}
                >
                  <Rocket size={9} color={Theme.accentBrown} strokeWidth={2.25} />
                  <Text style={styles.sponsoredTagText}>Sponsored</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.topBarIconBtn,
              pressed && styles.topBarIconBtnPressed,
            ]}
            onPress={onClose}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close story"
          >
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
        </View>

        <View style={styles.centerStage} pointerEvents="none">
          {isLoad ? (
            <StoryBroadcastPreview
              post={post}
              loadMaterial={loadMaterial}
              originParts={originParts}
              destinationParts={destinationParts}
              loadTargetRate={post.rate_offer}
              storyKey={post.id}
            />
          ) : (
            <View style={styles.fallbackHero}>
              <View style={styles.fallbackIcon}>
                <Megaphone size={30} color={Theme.driverEmerald} strokeWidth={1.8} />
              </View>
              <Text style={styles.fallbackKicker}>SPONSORED LOAD</Text>
              <Text style={styles.fallbackTitle} numberOfLines={4}>
                {[post.origin, post.destination].filter(Boolean).join(" → ") ||
                  post.vehicle_type ||
                  post.org_name}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.watermark} pointerEvents="none">
          <PulseBrandMark
            wordColor={INK}
            dotColor={INK}
            textStyle={styles.watermarkText}
          />
        </View>

        <Animated.View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              opacity: footerFade,
            },
          ]}
        >
          {story ? (
            <BidToShipperBanner story={story} shipperName={resolvedShipper} />
          ) : null}

          {footerAction ? (
            <Pressable
              style={({ pressed }) => [
                styles.authorizeBtn,
                pressed && styles.authorizeBtnPressed,
              ]}
              onPress={footerAction.onPress}
            >
              <Text style={styles.authorizeBtnText}>{footerAction.label}</Text>
              {footerAction.hint ? (
                <Text style={styles.authorizeBtnHint}>{footerAction.hint}</Text>
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.authorizeBtnPressed,
              ]}
              onPress={onClose}
            >
              <Text style={styles.secondaryBtnText}>Done</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    );
  })();

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
  },
  notFoundTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: INK,
  },
  notFoundBody: {
    fontSize: 13,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
  },
  ambientGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,120,87,0.04)",
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  progressTrack: {
    flex: 1,
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
    gap: 10,
    paddingBottom: 6,
  },
  topBarLeft: {
    flex: 1,
    minWidth: 0,
  },
  topBarText: {
    gap: 3,
  },
  orgBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orgTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.2,
  },
  topBarSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeAgoLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
  },
  sponsoredTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Theme.accentBrownMuted,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sponsoredTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.accentBrown,
    textTransform: "uppercase",
  },
  topBarIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  topBarIconBtnPressed: {
    opacity: 0.85,
  },
  centerStage: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  fallbackHero: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  fallbackIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldMuted,
  },
  fallbackKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: Theme.driverEmerald,
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: INK,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  watermark: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
    transform: [{ translateY: -28 }],
  },
  watermarkText: {
    fontSize: 56,
    fontWeight: "900",
    color: INK,
    opacity: 0.03,
    letterSpacing: -1.2,
    fontStyle: "italic",
  },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.loadStatusTabBorderSoft,
    backgroundColor: "rgba(255,255,255,0.96)",
    gap: 8,
  },
  bidStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,185,129,0.22)",
  },
  bidStatusBannerPending: {
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.28)",
  },
  bidStatusBannerRejected: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.22)",
  },
  bidStatusText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bidStatusLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: INK,
  },
  bidStatusLabelPending: {
    color: Theme.warning,
  },
  bidStatusAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
  },
  bidStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bidBadgePending: {
    backgroundColor: Theme.driverEmerald,
  },
  bidBadgeAccepted: {
    backgroundColor: "#10b981",
  },
  bidBadgeRejected: {
    backgroundColor: Theme.negative,
  },
  bidStatusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.textOnPrimary,
  },
  authorizeBtn: {
    borderRadius: 14,
    backgroundColor: INK,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 2,
    minHeight: 52,
    justifyContent: "center",
  },
  authorizeBtnPressed: {
    opacity: 0.9,
  },
  authorizeBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  authorizeBtnHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
  },
  secondaryBtn: {
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: INK,
  },
  doneBtn: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: Theme.driverEmerald,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
});
