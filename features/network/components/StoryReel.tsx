/**
 * Network stories row — circular avatars with gradient rings (unseen / seen).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { type PostRow } from "@/features/network/services/posts.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
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
}

/** Matches hub connection list avatar (NetworkPartyHubListCard). */
const STORY_AVATAR = 56;
const STORY_RING = STORY_AVATAR + 8;

const RING_UNSEEN = ["#f43f5e", "#f59e0b", "#a855f7", "#6366f1"] as const;
const RING_SEEN = ["#cbd5e1", "#94a3b8"] as const;
const RING_MINE_ACTIVE = ["#6366f1", "#22d3ee", "#10b981"] as const;
const RING_MINE_IDLE = ["#e2e8f0", "#cbd5e1"] as const;

const ACCENT_TOKENS = [Theme.teslaRed, Theme.darkGreen, Theme.primary, "#8b5cf6"] as const;

function seedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ACCENT_TOKENS.length;
  return ACCENT_TOKENS[h];
}

function storySeenKey(post: PostRow): string {
  return `${post.organization_id}:${post.type}`;
}

function StoryGradientRing({
  colors,
  children,
}: {
  colors: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={[...colors]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.ringGradient}
    >
      <View style={styles.ringGap}>{children}</View>
    </LinearGradient>
  );
}

function StoryAvatar({
  name,
  avatarUrl,
  avatarSeed,
  entityType = "supplier" as const,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: "client" | "supplier" | "driver";
}) {
  return (
    <PartyAvatar
      name={name}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      entityType={entityType}
      size={STORY_AVATAR}
      style={styles.avatarPlain}
      borderStyle={styles.avatarPlain}
    />
  );
}

function StoryBubble({
  label,
  ringColors,
  onPress,
  onPressIn,
  onPressOut,
  scale,
  children,
  badge,
}: {
  label: string;
  ringColors: readonly string[];
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  scale?: Animated.Value;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [styles.storyItem, pressed && styles.storyItemPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={scale ? { transform: [{ scale }] } : undefined}>
        <View style={styles.ringStack}>
          <StoryGradientRing colors={ringColors}>{children}</StoryGradientRing>
          {badge}
        </View>
      </Animated.View>
      <Text style={styles.storyName} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function BroadcastStory({
  post,
  seen,
  onPress,
}: {
  post: PostRow;
  seen: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const accent = seedColor(post.organization_id);
  const rawPost = post as PostRow & {
    org_avatar_url?: string | null;
    avatar_url?: string | null;
  };
  const postAvatarUrl = rawPost.org_avatar_url ?? rawPost.avatar_url ?? null;
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
      />
    </StoryBubble>
  );
}

export function StoryReel({
  posts,
  orgId,
  onCreatePost,
  embedded = false,
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

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, embedded && styles.scrollEmbedded]}
      >
        <View style={styles.mineCluster}>
          <StoryBubble
            label="Mine"
            ringColors={mineRing}
            onPress={() => {
            if (!latestOwnStory) {
              onCreatePost();
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
            <View
              style={styles.addBadge}
              {...(Platform.OS === "web"
                ? {
                    // @ts-expect-error -- RNW supports onClick on View
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
              <Plus size={14} color={Theme.textOnPrimary} strokeWidth={2.6} />
            </View>
          }
        >
          <StoryAvatar
            name={profile?.displayName ?? profile?.full_name ?? "Mine"}
            avatarUrl={profile?.avatar_url ?? null}
            avatarSeed={profile?.avatar_seed ?? null}
            entityType="supplier"
          />
          </StoryBubble>
          <View style={styles.pulseStoryWatermark} pointerEvents="none">
            <Text style={styles.watermarkPulse}>Pulse.</Text>
            <Text style={styles.watermarkStory}>story</Text>
          </View>
        </View>

        {stories.map((post) => (
          <BroadcastStory
            key={post.id}
            post={post}
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
    paddingTop: 8,
    paddingBottom: 8,
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
  mineCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 4,
    flexShrink: 0,
    paddingVertical: 2,
  },
  pulseStoryWatermark: {
    alignSelf: "center",
    justifyContent: "center",
    opacity: 0.11,
    minWidth: 52,
  },
  watermarkPulse: {
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.8,
    lineHeight: 24,
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
  storyItem: {
    width: 72,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  storyItemPressed: {
    opacity: 0.92,
  },
  ringStack: {
    position: "relative",
    width: STORY_RING,
    height: STORY_RING,
    alignItems: "center",
    justifyContent: "center",
  },
  ringGradient: {
    width: STORY_RING,
    height: STORY_RING,
    borderRadius: STORY_RING / 2,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringGap: {
    width: STORY_AVATAR + 3,
    height: STORY_AVATAR + 3,
    borderRadius: (STORY_AVATAR + 3) / 2,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.primary,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  storyName: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textAlign: "center",
    width: "100%",
    lineHeight: 13,
  },
});
