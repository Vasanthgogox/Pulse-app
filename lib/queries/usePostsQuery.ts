import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  getNetworkFeed,
  createPost,
  type CreatePostInput,
  type PostRow,
} from '@/features/network/services/posts.service';
import { queryKeys } from '@/lib/queryKeys';

export function useNetworkFeedQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.posts.feed(orgId ?? ''),
    queryFn: async () => {
      const res = await getNetworkFeed(orgId!, 30, 0);
      if (res.error) throw res.error;
      return res.posts;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function useCreatePostMutation(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(input),
    onSuccess: () => {
      if (orgId) {
        qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
      }
    },
  });
}

export function useInvalidatePosts(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (orgId) void qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
  };
}

/**
 * After a post is deactivated/deleted: remove it from cached feed immediately, then refetch.
 * Ensures Network / Discover UI updates without waiting on background invalidation (important on web).
 */
export function useAfterPostDeleted(orgId: string | null) {
  const qc = useQueryClient();
  return useCallback(
    async (postId: string) => {
      if (!orgId) return;
      const feedKey = queryKeys.posts.feed(orgId);
      qc.setQueryData<PostRow[]>(feedKey, (old) => {
        if (!old) return old;
        return old.filter((p) => p.id !== postId);
      });
      await qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
    },
    [orgId, qc],
  );
}
