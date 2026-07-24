/**
 * Network stories row — circular avatars with gradient rings (unseen / seen).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { type PostRow } from "@/features/network/services/posts.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface StoryReelProps {
  posts: PostRow[];
  orgId?: string;
  orgName?: string;
  onCreatePost: () => void;
  headerActions?: React.ReactNode;
  /** Inside desktop 80% story column — trim outer horizontal padding. */
  embedded?: boolean;
  /**
   * Whether this org may post/broadcast load stories. Asset-only orgs can
   * view stories but never create them (they cannot give load). Default true.
   */
  canCreatePost?: boolean;
}

type StoryMetrics = {
  avatar: number;
  ring: number;
  itemWidth: number;
  labelSize: number;
  labelLineHeight: number;
  addBadge: number;
  plusSize: number;
};

/** Mobile / stacked layout — compact story bubbles. */
const STORY_METRICS_DEFAULT: StoryMetrics = {
  avatar: 56,
  ring: 64,
  itemWidth: 72,
  labelSize: 10,
  labelLineHeight: 13,
  addBadge: 24,
  plusSize: 14,
};

/** Desktop story column (embedded 80% row) — larger avatars and labels. */
const STORY_METRICS_EMBEDDED: StoryMetrics = {
  avatar: 72,
  ring: 84,
  itemWidth: 92,
  labelSize: 12,
  labelLineHeight: 15,
  addBadge: 28,
  plusSize: 16,
};

function storyMetricsFor(embedded: boolean): StoryMetrics {
  return embedded ? STORY_METRICS_EMBEDDED : STORY_METRICS_DEFAULT;
}

const RING_UNSEEN = ["#f43f5e", "#f59e0b", Theme.brandBluePressed, Theme.brandBlueInk] as const;
const RING_SEEN = ["#cbd5e1", "#94a3b8"] as const;
const RING_MINE_ACTIVE = ["#4D3636", "#22d3ee", "#10b981"] as const;
const RING_MINE_IDLE = ["#e2e8f0", "#cbd5e1"] as const;

const ACCENT_TOKENS = [Theme.accentGold, Theme.darkGreen, Theme.primary, Theme.brandBluePressed] as const;

function seedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ACCENT_TOKENS.length;
  return ACCENT_TOKENS[h];
}

function storySeenKey(post: PostRow): string {
  return `${post.organization_id}:${post.type}`;
}

function StoryAvatar({
  name,
  avatarUrl,
  avatarSeed,
  entityType = "supplier" as const,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: "client" | "supplier" | "driver";
  size: number;
}) {
  return (
    <PartyAvatar
      name={name}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      entityType={entityType}
      size={size}
      style={styles.avatarPlain}
      borderStyle={styles.avatarPlain}
    />
  );
}

function StoryGradientRingSized({
  colors,
  ringSize,
  gapSize,
  children,
}: {
  colors: readonly string[];
  ringSize: number;
  gapSize: number;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={[colors[0], colors[1]] as const}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.ringGradientBase,
        { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
      ]}
    >
      <View
        style={[
          styles.ringGapBase,
          {
            width: gapSize,
            height: gapSize,
            borderRadius: gapSize / 2,
          },
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

function StoryBubble({
  label,
  ringColors,
  metrics,
  onPress,
  onPressIn,
  onPressOut,
  scale,
  children,
  badge,
}: {
  label: string;
  ringColors: readonly string[];
  metrics: StoryMetrics;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  scale?: Animated.Value;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const gapSize = metrics.avatar + 3;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.storyItem,
        { width: metrics.itemWidth },
        pressed && styles.storyItemPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={scale ? { transform: [{ scale }] } : undefined}>
        <View
          style={[
            styles.ringStack,
            { width: metrics.ring, height: metrics.ring },
          ]}
        >
          <StoryGradientRingSized
            colors={ringColors}
            ringSize={metrics.ring}
            gapSize={gapSize}
          >
            {children}
          </StoryGradientRingSized>
          {badge}
        </View>
      </Animated.View>
      <Text
        style={[
          styles.storyName,
          { fontSize: metrics.labelSize, lineHeight: metrics.labelLineHeight },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BroadcastStory({
  post,
  seen,
  onPress,
  metrics,
}: {
  post: PostRow;
  seen: boolean;
  onPress: () => void;
  metrics: StoryMetrics;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const accent = seedColor(post.organization_id);
  // org_avatar_url is a storage PATH (org-logo-*.jpg), not a URL — sign it before
  // rendering. Same pattern as NetworkDesktopProfilePanel: http passthrough, else sign.
  const rawLogo = post.org_avatar_url?.trim() ?? "";
  const [postAvatarUrl, setPostAvatarUrl] = useState<string | null>(
    rawLogo.startsWith("http") ? rawLogo : null,
  );
  useEffect(() => {
    let mounted = true;
    if (!rawLogo || rawLogo.startsWith("http")) {
      setPostAvatarUrl(rawLogo || null);
      return;
    }
    getSignedAvatarUrl(rawLogo).then((signed) => {
      if (mounted) setPostAvatarUrl(signed ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [rawLogo]);
  const ringColors = seen
    ? RING_SEEN
    : ([accent, RING_UNSEEN[1], RING_UNSEEN[2]] as const);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();

  const shortName = post.org_name.trim().split(/\s+/)[0] ?? post.org_name;

  return (
    <StoryBubble
      label={shortName}
      ringColors={ringColors}
      metrics={metrics}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      scale={scale}
    >
      <StoryAvatar
        name={post.org_name}
        avatarUrl={postAvatarUrl}
        avatarSeed={post.org_avatar_seed}
        entityType="supplier"
        size={metrics.avatar}
      />
    </StoryBubble>
  );
}

export function StoryReel({
  posts,
  orgId,
  onCreatePost,
  embedded = false,
  canCreatePost = true,
}: StoryReelProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [seenKeys, setSeenKeys] = useState<Record<string, true>>({});
  const seenStorageKey = `q:stories:seen:${orgId ?? "global"}`;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(seenStorageKey)
      .then((raw) => {
        if (!mounted) return;
        if (!raw) {
          setSeenKeys({});
          return;
        }
        const parsed = JSON.parse(raw) as Record<string, true>;
        setSeenKeys(parsed && typeof parsed === "object" ? parsed : {});
      })
      .catch(() => {
        if (mounted) setSeenKeys({});
      });
    return () => {
      mounted = false;
    };
  }, [seenStorageKey]);

  const markStorySeen = useCallback(
    (post: PostRow) => {
      const key = storySeenKey(post);
      setSeenKeys((prev) => {
        if (prev[key]) return prev;
        const next = { ...prev, [key]: true as const };
        AsyncStorage.setItem(seenStorageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [seenStorageKey],
  );

  const businessOnly = [...posts]
    .filter((p) => p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY")
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
  const seenStoryKeys = new Set<string>();
  const stories: PostRow[] = [];
  const ownStories: PostRow[] = [];
  const otherStories: PostRow[] = [];
  for (const p of businessOnly) {
    if (p.organization_id === orgId) ownStories.push(p);
    else otherStories.push(p);
  }
  const ordered = [...otherStories];
  for (const p of ordered) {
    const storyKey = `${p.organization_id}:${p.type}`;
    if (!seenStoryKeys.has(storyKey)) {
      seenStoryKeys.add(storyKey);
      stories.push(p);
    }
    if (stories.length >= 20) break;
  }
  const ownStoryQueue = [...ownStories].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );
  const latestOwnStory = ownStoryQueue[0];
  const storyQueueIds = stories.map((s) => s.id).join(",");
  const ownStoryQueueIds = ownStoryQueue.map((s) => s.id).join(",");
  const hasOwnStories = ownStoryQueue.length > 0;

  const mineRing = hasOwnStories ? RING_MINE_ACTIVE : RING_MINE_IDLE;
  const metrics = storyMetricsFor(embedded);

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          embedded && styles.scrollEmbedded,
          embedded && styles.scrollEmbeddedDesktop,
        ]}
      >
        <View style={[styles.mineCluster, embedded && styles.mineClusterEmbedded]}>
          <StoryBubble
            label="Mine"
            ringColors={mineRing}
            metrics={metrics}
            onPress={() => {
            if (!latestOwnStory) {
              // Asset-only orgs can't post loads — the empty bubble is a no-op.
              if (canCreatePost) onCreatePost();
              return;
            }
            markStorySeen(latestOwnStory);
            router.push({
              pathname: "/(modals)/story-detail",
              params: {
                postId: latestOwnStory.id,
                orgId: latestOwnStory.organization_id,
                storyType: latestOwnStory.type,
                queue: ownStoryQueueIds,
              },
            });
          }}
          badge={
            canCreatePost ? (
            <View
              style={[
                styles.addBadge,
                {
                  width: metrics.addBadge,
                  height: metrics.addBadge,
                  borderRadius: metrics.addBadge / 2,
                },
              ]}
              {...(Platform.OS === "web"
                ? {
                    onClick: (e: { stopPropagation: () => void }) => {
                      e.stopPropagation();
                      router.push("/(modals)/create-post");
                    },
                  }
                : {
                    onStartShouldSetResponder: () => true,
                    onResponderRelease: () => router.push("/(modals)/create-post"),
                  })}
              hitSlop={8}
              {...(Platform.OS !== "web" && { accessibilityRole: "button" as const })}
              accessibilityLabel="Add story"
            >
              <Plus size={metrics.plusSize} color={Theme.textPrimaryDark} strokeWidth={2.6} />
            </View>
            ) : undefined
          }
        >
          <StoryAvatar
            name={profile?.displayName ?? profile?.full_name ?? "Mine"}
            avatarUrl={profile?.avatar_url ?? null}
            avatarSeed={profile?.avatar_seed ?? null}
            entityType="supplier"
            size={metrics.avatar}
          />
          </StoryBubble>
          <View
            style={[styles.pulseStoryWatermark, embedded && styles.pulseStoryWatermarkEmbedded]}
            pointerEvents="none"
          >
            <PulseBrandMark
              size="lg"
              textStyle={[styles.watermarkPulse, embedded && styles.watermarkPulseEmbedded]}
            />
            <Text style={[styles.watermarkStory, embedded && styles.watermarkStoryEmbedded]}>
              story
            </Text>
          </View>
        </View>

        {stories.map((post) => (
          <BroadcastStory
            key={post.id}
            post={post}
            metrics={metrics}
            seen={!!seenKeys[storySeenKey(post)]}
            onPress={() => {
              markStorySeen(post);
              router.push({
                pathname: "/(modals)/story-detail",
                params: {
                  postId: post.id,
                  orgId: post.organization_id,
                  storyType: post.type,
                  queue: storyQueueIds,
                },
              });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  wrapEmbedded: {
    paddingTop: 10,
    paddingBottom: 10,
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 10,
    alignItems: "center",
    paddingRight: 12,
    paddingVertical: 2,
  },
  scrollEmbedded: {
    paddingHorizontal: 0,
    paddingRight: 8,
  },
  scrollEmbeddedDesktop: {
    gap: 14,
    paddingVertical: 4,
  },
  mineCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 4,
    flexShrink: 0,
    paddingVertical: 2,
  },
  mineClusterEmbedded: {
    gap: 14,
    marginRight: 8,
    paddingVertical: 4,
  },
  pulseStoryWatermark: {
    alignSelf: "center",
    justifyContent: "center",
    opacity: 0.11,
    minWidth: 52,
  },
  pulseStoryWatermarkEmbedded: {
    opacity: 0.12,
    minWidth: 64,
  },
  watermarkPulse: {
    fontWeight: '700',
  },
  watermarkPulseEmbedded: {
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1,
  },
  watermarkStory: {
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    lineHeight: 19,
    alignSelf: "flex-end",
    marginTop: -2,
  },
  watermarkStoryEmbedded: {
    fontSize: 20,
    lineHeight: 23,
  },
  storyItem: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  storyItemPressed: {
    opacity: 0.92,
  },
  ringStack: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ringGradientBase: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringGapBase: {
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    padding: 1.5,
  },
  avatarPlain: {
    overflow: "hidden",
    borderWidth: 0,
    borderColor: "transparent",
  },
  addBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: Theme.loadMainTabBg,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.loadMainTabBg,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  storyName: {
    marginTop: 6,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textAlign: "center",
    width: "100%",
  },
});
