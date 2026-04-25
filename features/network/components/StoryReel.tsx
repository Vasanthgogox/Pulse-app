/**
 * Network broadcasts row — compact market signal cards.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { type PostRow } from "@/features/network/services/posts.service";
import { getInitials } from "@/lib/stringUtils";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Package, Plus, Radio, Truck } from "lucide-react-native";
import React, { useRef } from "react";
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

function BroadcastCard({ post, onPress }: { post: PostRow; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const color = seedColor(post.organization_id);
  const isLoad = post.type === "LOAD";
  const isVehicle = post.type === "VEHICLE_AVAILABILITY";
  const storyPreview = previewText(post);
  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.storyItem, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[withAlpha(color, "50"), withAlpha(color, "20")]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storyRing}
        >
          <View style={styles.storyAvatar}>
            <Text style={styles.storyAvatarPreview} numberOfLines={3}>
              {storyPreview}
            </Text>
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
      </Animated.View>
    </Pressable>
  );
}

export function StoryReel({ posts, orgId, onCreatePost, headerActions }: StoryReelProps) {
  const router = useRouter();
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
  const ordered = [...ownStories, ...otherStories];
  for (const p of ordered) {
    const storyKey = `${p.organization_id}:${p.type}`;
    if (!seenStoryKeys.has(storyKey)) {
      seenStoryKeys.add(storyKey);
      stories.push(p);
    }
    if (stories.length >= 20) break;
  }
  const storyQueueIds = stories.map((s) => s.id).join(",");

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionKicker}>Network broadcasts</Text>
          <Text style={styles.sectionTitle}>Live load and capacity signals</Text>
        </View>
        <View style={styles.headerRightRow}>
          <View style={styles.livePill}>
            <Radio size={11} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            <Text style={styles.livePillText}>{stories.length}</Text>
          </View>
          {headerActions}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Pressable onPress={onCreatePost} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
          <View style={styles.storyItem}>
            <View style={styles.launchRing}>
              <View style={styles.launchIcon}>
              <Plus size={18} color={Theme.textOnPrimary} strokeWidth={2.5} />
              </View>
            </View>
            <Text style={styles.storyName}>Mine</Text>
            <Text style={styles.storyMeta} numberOfLines={1}>Add story</Text>
          </View>
        </Pressable>
        {stories.map((post) => (
          <BroadcastCard
            key={post.id}
            post={post}
            onPress={() =>
              router.push({
                pathname: "/(modals)/story-detail",
                params: {
                  postId: post.id,
                  orgId: post.organization_id,
                  storyType: post.type,
                  queue: storyQueueIds,
                },
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.screenBackground,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionKicker: {
    ...Typography.subTabLabel,
    fontSize: 9,
    color: Theme.textMutedDemo,
    letterSpacing: 1.8,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  livePill: {
    minHeight: 24,
    minWidth: 40,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  livePillText: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
    alignItems: "flex-start",
    paddingRight: 24,
  },
  storyItem: {
    width: 72,
    alignItems: "center",
    paddingVertical: 2,
  },
  storyRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  storyAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "visible",
  },
  storyAvatarPreview: {
    width: "82%",
    fontSize: 6.6,
    fontWeight: "700",
    fontStyle: "italic",
    lineHeight: 8,
    color: Theme.textMutedDemo,
    textAlign: "center",
    opacity: 0.86,
    letterSpacing: 0.05,
  },
  storyAvatarIconWrap: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  launchRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  launchIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 12,
    fontWeight: "800",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  storyName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    textAlign: "center",
    width: "100%",
  },
  storyMeta: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
    textAlign: "center",
    width: "100%",
  },
});
