import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNetworkFeed, createPost, type CreatePostInput } from '@/features/network/services/posts.service';
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
    staleTime: 30_000,
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
    if (orgId) qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
  };
}
