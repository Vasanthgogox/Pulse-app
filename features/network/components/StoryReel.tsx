/**
 * Network broadcasts row — compact market signal cards.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { PartyAvatar } from "@/components/PartyAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { type PostRow } from "@/features/network/services/posts.service";
import { getInitials } from "@/lib/stringUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Package, Plus, Radio, Truck } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface StoryReelProps {
  posts: PostRow[];
  orgId?: string;
  orgName?: string;
  onCreatePost: () => void;
  headerActions?: React.ReactNode;
}

const ACCENT_TOKENS = [Theme.teslaRed, Theme.darkGreen, Theme.primary, Theme.textPrimaryDark] as const;
function seedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ACCENT_TOKENS.length;
  return ACCENT_TOKENS[h];
}

function withAlpha(hex: string, a: string): string {
  if (hex.length === 7) return `${hex}${a}`;
  return hex;
}

function shortPlace(value: string | null | undefined): string {
  const clean = (value ?? "").split(",")[0]?.trim();
  return clean || "Open lane";
}

function previewText(post: PostRow): string {
  if (post.type === "VEHICLE_AVAILABILITY") {
    return (post.vehicle_type?.trim() || "VEHICLE AVAILABLE").toUpperCase();
  }
  if (post.type === "LOAD") {
    const route = `${shortPlace(post.origin)} → ${shortPlace(post.destination)}`;
    const requiredVehicle = post.vehicle_type?.trim() || "VEHICLE REQUIRED";
    return `${requiredVehicle.toUpperCase()} · ${route}`;
  }
  const fromContent = (post.content ?? "").trim();
  if (fromContent.length > 0) return fromContent;
  return "Network update";
}

function timeAgoShort(iso: string | null | undefined): string {
  if (!iso) return "now";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function storySeenKey(post: PostRow): string {
  return `${post.organization_id}:${post.type}`;
}

function BroadcastCard({
  post,
  onPress,
  seen,
}: {
  post: PostRow;
  onPress: () => void;
  seen: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const color = seedColor(post.organization_id);
  const isLoad = post.type === "LOAD";
  const isVehicle = post.type === "VEHICLE_AVAILABILITY";
  const storyPreview = previewText(post);
  const meta = `${isLoad ? "LOAD" : "CAPACITY"} · ${timeAgoShort(post.created_at)}`;
  const rawPost = post as PostRow & {
    org_avatar_url?: string | null;
    avatar_url?: string | null;
  };
  const postAvatarUrl = rawPost.org_avatar_url ?? rawPost.avatar_url ?? null;
  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.storyItem, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={
            seen
              ? [withAlpha(Theme.textSection, "66"), withAlpha(Theme.textSection, "2A")]
              : [withAlpha(color, "66"), withAlpha(color, "28")]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storyRing}
        >
          <View style={styles.storyAvatar}>
            <PartyAvatar
              name={post.org_name}
              avatarUrl={postAvatarUrl}
              avatarSeed={post.org_avatar_seed}
              entityType="supplier"
              size={64}
              borderStyle={styles.storyAvatarImage}
            />
            <View style={[styles.storyAvatarIconWrap, { borderColor: withAlpha(color, "44") }]}>
              {isLoad ? (
                <Package size={12} color={color} strokeWidth={2.2} />
              ) : isVehicle ? (
                <Truck size={12} color={color} strokeWidth={2.2} />
              ) : (
                <Text style={[styles.initials, { color }]}>{getInitials(post.org_name)}</Text>
              )}
            </View>
          </View>
        </LinearGradient>
        <Text style={styles.storyName} numberOfLines={1}>
          {post.org_name.toUpperCase()}
        </Text>
        <Text style={styles.storyMeta} numberOfLines={1}>
          {meta}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function StoryReel({ posts, orgId, onCreatePost, headerActions }: StoryReelProps) {
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

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Pressable
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
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}
        >
          <View style={styles.storyItem}>
            <LinearGradient
              colors={
                hasOwnStories
                  ? [withAlpha(Theme.primary, "A8"), withAlpha(Theme.darkGreen, "A8")]
                  : [withAlpha(Theme.textSection, "66"), withAlpha(Theme.textSection, "2A")]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.launchRing}
            >
              <View style={styles.launchAvatarWrap}>
                <PartyAvatar
                  name={profile?.displayName ?? profile?.full_name ?? "Mine"}
                  avatarUrl={profile?.avatar_url ?? null}
                  avatarSeed={profile?.avatar_seed ?? null}
                  entityType="supplier"
                  size={64}
                  borderStyle={styles.storyAvatarImage}
                />
              </View>
              <Pressable
                style={styles.mineAddIconWrap}
                onPress={(event) => {
                  event.stopPropagation();
                  router.push("/(modals)/create-post");
                }}
                hitSlop={8}
              >
                <Plus size={12} color={Theme.textOnPrimary} strokeWidth={2.8} />
              </Pressable>
            </LinearGradient>
            <Text style={styles.storyName}>Mine</Text>
            <Text style={styles.storyMeta} numberOfLines={1}>
              {hasOwnStories ? `${ownStoryQueue.length} ${ownStoryQueue.length > 1 ? "stories" : "story"}` : "Add story"}
            </Text>
          </View>
        </Pressable>
        {stories.map((post) => (
          <BroadcastCard
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
    backgroundColor: "transparent",
    paddingTop: 12,
    paddingBottom: 16,
  },
  scroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 20,
    alignItems: "center",
    paddingRight: 28,
  },
  storyItem: {
    width: 108,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  storyRing: {
    width: 96,
    height: 96,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  storyAvatar: {
    width: 90,
    height: 90,
    borderRadius: 30,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "visible",
  },
  storyAvatarImage: {
    borderWidth: 1.5,
    borderColor: Theme.networkCardBackground,
  },
  storyAvatarPreview: {
    width: "76%",
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    lineHeight: 10.5,
    color: Theme.textMutedDemo,
    textAlign: "center",
    opacity: 0.86,
    letterSpacing: 0.08,
  },
  storyAvatarIconWrap: {
    position: "absolute",
    top: -5,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  launchRing: {
    width: 96,
    height: 96,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.12)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    padding: 2.5,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  launchAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  mineAddIconWrap: {
    position: "absolute",
    right: 10,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.primary,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  initials: {
    fontSize: 12,
    fontWeight: "800",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  storyName: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textAlign: "center",
    width: "100%",
  },
  storyMeta: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
    width: "100%",
  },
});
