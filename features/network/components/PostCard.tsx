/**
 * Feed post card — UPDATE (text) or LOAD (route + bid) types.
 * Design: dark-navy header card with colored route accent for load posts.
 */
import Theme from '@/constants/Theme';
import { type PostRow } from '@/features/network/services/posts.service';
import { formatINR } from '@/lib/format';
import { getInitials } from '@/lib/stringUtils';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  Clock3,
  MessageCircle,
  Package,
  ThumbsUp,
  Truck,
} from 'lucide-react-native';
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface PostCardProps {
  post: PostRow;
  orgId: string;
  onBid?: (post: PostRow) => void;
  onDetail?: (post: PostRow) => void;
}

const ORG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#3b82f6', '#0ea5e9',
];

function orgColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ORG_COLORS.length;
  return ORG_COLORS[h];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PostCard({ post, orgId, onBid, onDetail }: PostCardProps) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;
  const color = orgColor(post.organization_id);
  const isLoad = post.type === 'LOAD';
  const isMyPost = post.organization_id === orgId;

  const handlePress = () => {
    if (onDetail) {
      onDetail(post);
    } else {
      router.push({ pathname: '/(modals)/post-detail', params: { postId: post.id } });
    }
  };

  const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPress={handlePress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: color + '22' }]}>
            <Text style={[styles.avatarText, { color }]}>{getInitials(post.org_name)}</Text>
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.orgName}>{post.org_name.toUpperCase()}</Text>
            <View style={styles.metaRow}>
              <Clock3 size={10} color={Theme.textSecondary} />
              <Text style={styles.timeText}>{timeAgo(post.created_at)}</Text>
              {isLoad && (
                <View style={styles.loadBadge}>
                  <Truck size={9} color="#f59e0b" />
                  <Text style={styles.loadBadgeText}>LOAD</Text>
                </View>
              )}
            </View>
          </View>
          {post.bid_count > 0 && isLoad && (
            <View style={styles.bidCountBadge}>
              <Text style={styles.bidCountText}>{post.bid_count} bids</Text>
            </View>
          )}
        </View>

        {/* Load post body */}
        {isLoad ? (
          <View style={styles.loadBody}>
            {post.origin && post.destination && (
              <View style={[styles.routeCard, { borderLeftColor: color }]}>
                <View style={styles.routeRow}>
                  <View style={styles.routePoint}>
                    <View style={[styles.routeDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.routeLabel}>FROM</Text>
                    <Text style={styles.routeCity} numberOfLines={1}>{post.origin}</Text>
                  </View>
                  <ArrowRight size={16} color={Theme.textSecondary} />
                  <View style={styles.routePoint}>
                    <View style={[styles.routeDot, { backgroundColor: color }]} />
                    <Text style={styles.routeLabel}>TO</Text>
                    <Text style={styles.routeCity} numberOfLines={1}>{post.destination}</Text>
                  </View>
                </View>

                <View style={styles.loadMeta}>
                  {post.vehicle_type && (
                    <View style={styles.metaChip}>
                      <Truck size={10} color={Theme.textSecondary} />
                      <Text style={styles.metaChipText}>{post.vehicle_type}</Text>
                    </View>
                  )}
                  {post.weight_tonnes != null && (
                    <View style={styles.metaChip}>
                      <Package size={10} color={Theme.textSecondary} />
                      <Text style={styles.metaChipText}>{post.weight_tonnes}T</Text>
                    </View>
                  )}
                  {post.material && (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{post.material}</Text>
                    </View>
                  )}
                </View>

                {post.rate_offer != null && (
                  <View style={styles.rateRow}>
                    <Text style={styles.rateLabel}>OFFERED RATE</Text>
                    <Text style={[styles.rateValue, { color }]}>{formatINR(post.rate_offer)}</Text>
                  </View>
                )}
              </View>
            )}
            {post.content ? <Text style={styles.contentText}>{post.content}</Text> : null}
          </View>
        ) : (
          <View style={styles.updateBody}>
            {post.content ? <Text style={styles.contentText}>{post.content}</Text> : null}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={handlePress}>
            <MessageCircle size={15} color={Theme.textSecondary} />
            <Text style={styles.actionLabel}>View</Text>
          </Pressable>

          {isLoad && !isMyPost && (
            <Pressable
              style={[styles.actionBtn, styles.bidBtn, { backgroundColor: color + '18', borderColor: color + '40' }]}
              onPress={() => onBid?.(post)}
            >
              <ThumbsUp size={14} color={color} />
              <Text style={[styles.actionLabel, { color, fontWeight: '800' }]}>Place Bid</Text>
            </Pressable>
          )}

          {isLoad && isMyPost && post.bid_count > 0 && (
            <Pressable
              style={[styles.actionBtn, styles.bidBtn, { backgroundColor: '#10b981' + '18', borderColor: '#10b981' + '40' }]}
              onPress={handlePress}
            >
              <Text style={[styles.actionLabel, { color: '#10b981', fontWeight: '800' }]}>
                {post.bid_count} Bid{post.bid_count !== 1 ? 's' : ''} Received
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerMeta: { flex: 1 },
  orgName: {
    fontSize: 11,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontWeight: '600',
  },
  loadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f59e0b18',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 4,
  },
  loadBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#f59e0b',
    letterSpacing: 0.5,
  },
  bidCountBadge: {
    backgroundColor: '#6366f118',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  bidCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366f1',
  },
  loadBody: { padding: 14 },
  updateBody: { padding: 14, paddingBottom: 8 },
  routeCard: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  routePoint: {
    flex: 1,
    gap: 2,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  routeLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
  },
  routeCity: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  loadMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  metaChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rateLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  rateValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  contentText: {
    fontSize: 14,
    fontWeight: '500',
    color: Theme.textPrimary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  bidBtn: {
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
});
