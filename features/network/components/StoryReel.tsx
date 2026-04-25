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
import { ArrowUpRight, MapPin, Plus, Radio, Truck } from "lucide-react-native";
import React, { useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface StoryReelProps {
  posts: PostRow[];
  orgId?: string;
  orgName?: string;
  onCreatePost: () => void;
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

function BroadcastCard({ post, onPress }: { post: PostRow; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const color = seedColor(post.organization_id);
  const isLoad = post.type === "LOAD";
  const isVehicle = post.type === "VEHICLE_AVAILABILITY";
  const typeLabel = isLoad ? "LOAD" : isVehicle ? "CAPACITY" : "UPDATE";
  const routeLabel = isLoad || isVehicle
    ? `${shortPlace(post.origin)} → ${shortPlace(post.destination)}`
    : post.content ?? "Network update";
  const metaLabel = post.vehicle_type || post.material || `${post.bid_count} bids`;
  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.broadcastCard, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[withAlpha(color, "16"), Theme.screenBackground]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardWash}
        />
        <View style={styles.cardTop}>
          <View style={[styles.signalIcon, { backgroundColor: withAlpha(color, "12") }]}>
            {isLoad ? (
              <Truck size={17} color={color} strokeWidth={2.2} />
            ) : isVehicle ? (
              <MapPin size={17} color={color} strokeWidth={2.2} />
            ) : (
              <Text style={[styles.initials, { color }]}>{getInitials(post.org_name)}</Text>
            )}
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.orgName} numberOfLines={1}>{post.org_name}</Text>
            <Text style={styles.routeLabel} numberOfLines={1}>{routeLabel}</Text>
          </View>
          <ArrowUpRight size={14} color={Theme.textSecondary} strokeWidth={2.3} />
        </View>
        <View style={styles.cardBottom}>
          <View style={[styles.typePill, { borderColor: withAlpha(color, "35") }]}>
            <Text style={[styles.typePillText, { color }]}>{typeLabel}</Text>
          </View>
          <Text style={styles.metaLabel} numberOfLines={1}>{metaLabel}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function StoryReel({ posts, onCreatePost }: StoryReelProps) {
  const router = useRouter();
  const businessOnly = posts.filter(
    (p) => p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY",
  );
  const seenOrgs = new Set<string>();
  const stories: PostRow[] = [];
  for (const p of businessOnly) {
    if (!seenOrgs.has(p.organization_id)) {
      seenOrgs.add(p.organization_id);
      stories.push(p);
    }
    if (stories.length >= 12) break;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionKicker}>Network broadcasts</Text>
          <Text style={styles.sectionTitle}>Live load and capacity signals</Text>
        </View>
        <View style={styles.livePill}>
          <Radio size={11} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          <Text style={styles.livePillText}>{stories.length}</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Pressable onPress={onCreatePost} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
          <View style={styles.launchCard}>
            <View style={styles.launchIcon}>
              <Plus size={18} color={Theme.textOnPrimary} strokeWidth={2.5} />
            </View>
            <View style={styles.launchTextBlock}>
              <Text style={styles.launchTitle}>Launch</Text>
              <Text style={styles.launchSub} numberOfLines={1}>Post load or vehicle</Text>
            </View>
            <ArrowUpRight size={14} color={Theme.textSecondary} strokeWidth={2.3} />
          </View>
        </Pressable>
        {stories.map((post) => (
          <BroadcastCard
            key={post.id}
            post={post}
            onPress={() =>
              router.push({
                pathname: "/(modals)/story-detail",
                params: { postId: post.id, orgId: post.organization_id },
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_W = 220;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.screenBackground,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 12,
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
    fontSize: 14,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  livePill: {
    minHeight: 28,
    minWidth: 48,
    paddingHorizontal: 10,
    borderRadius: 14,
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
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  scroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 10,
    alignItems: "stretch",
    paddingRight: 24,
  },
  launchCard: {
    width: 188,
    minHeight: 86,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderStyle: "dashed",
    backgroundColor: Theme.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  launchIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  launchTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  launchTitle: {
    fontSize: 13,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  launchSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  broadcastCard: {
    width: CARD_W,
    minHeight: 86,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  cardWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 42,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  signalIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  initials: {
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  orgName: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  routeLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  cardBottom: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  typePill: {
    minHeight: 22,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  typePillText: {
    fontSize: 8,
    fontWeight: "800",
    fontStyle: "italic",
    letterSpacing: 0.6,
  },
  metaLabel: {
    flex: 1,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
  },
});
