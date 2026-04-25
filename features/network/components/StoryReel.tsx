/**
 * Instagram-style horizontal story reel showing recent posts from network.
 * Tap a story circle → opens post detail.
 */
import Theme from '@/constants/Theme';
import { type PostRow } from '@/features/network/services/posts.service';
import { getInitials } from '@/lib/stringUtils';
import { useRouter } from 'expo-router';
import { Plus, Truck } from 'lucide-react-native';
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface StoryReelProps {
  posts: PostRow[];
  orgId: string;
  orgName: string;
  onCreatePost: () => void;
}

const STORY_GRADIENT: string[] = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#3b82f6', '#0ea5e9',
];

function storyColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i)) % STORY_GRADIENT.length;
  return STORY_GRADIENT[h];
}

interface StoryBubbleProps {
  post: PostRow;
  onPress: () => void;
}

function StoryBubble({ post, onPress }: StoryBubbleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const color = storyColor(post.organization_id);
  const isLoad = post.type === 'LOAD';

  const onPressIn = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.storyItem, { transform: [{ scale }] }]}>
        <View style={[styles.storyRing, { borderColor: isLoad ? '#f59e0b' : color }]}>
          <View style={[styles.storyAvatar, { backgroundColor: color + '22' }]}>
            {isLoad ? (
              <Truck size={18} color={color} />
            ) : (
              <Text style={[styles.storyInitials, { color }]}>
                {getInitials(post.org_name)}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.storyLabel} numberOfLines={1}>
          {post.org_name.split(' ')[0]}
        </Text>
        {isLoad && (
          <View style={styles.loadDot} />
        )}
      </Animated.View>
    </Pressable>
  );
}

export function StoryReel({ posts, onCreatePost }: StoryReelProps) {
  const router = useRouter();

  // Dedupe: one story per org, most recent first
  const seenOrgs = new Set<string>();
  const stories: PostRow[] = [];
  for (const p of posts) {
    if (!seenOrgs.has(p.organization_id)) {
      seenOrgs.add(p.organization_id);
      stories.push(p);
    }
    if (stories.length >= 12) break;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* "Your story" / create post bubble */}
        <Pressable onPress={onCreatePost}>
          <View style={styles.storyItem}>
            <View style={[styles.storyRing, { borderColor: Theme.primary, borderStyle: 'dashed' }]}>
              <View style={[styles.storyAvatar, { backgroundColor: Theme.primary + '15' }]}>
                <Plus size={20} color={Theme.primary} strokeWidth={2.5} />
              </View>
            </View>
            <Text style={[styles.storyLabel, { color: Theme.primary }]}>Post</Text>
          </View>
        </Pressable>

        {stories.map((post) => (
          <StoryBubble
            key={post.id}
            post={post}
            onPress={() =>
              router.push({ pathname: '/(modals)/post-detail', params: { postId: post.id } })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  storyItem: {
    alignItems: 'center',
    width: 64,
  },
  storyRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    padding: 3,
    marginBottom: 5,
  },
  storyAvatar: {
    flex: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyInitials: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  storyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  loadDot: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f59e0b',
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
});
