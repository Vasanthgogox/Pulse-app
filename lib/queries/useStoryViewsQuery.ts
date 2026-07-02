import { useMutation, useQuery } from '@tanstack/react-query';
import { recordStoryView, getStoryViews } from '@/features/network/services/story-views.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useStoryViewsQuery(postId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.storyViews.forPost(postId ?? ''),
    queryFn: async () => {
      const res = await getStoryViews(postId!);
      if (res.error) throw res.error;
      return res.views;
    },
    enabled: !!postId && enabled,
    staleTime: STALE.moderate,
    refetchOnWindowFocus: true,
  });
}

export function useRecordStoryViewMutation() {
  return useMutation({
    mutationFn: ({ postId, orgId, orgName }: { postId: string; orgId: string; orgName: string }) =>
      recordStoryView(postId, orgId, orgName),
  });
}
