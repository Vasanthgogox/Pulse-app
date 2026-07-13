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
    // Uses the global refetchOnWindowFocus:false default — story-view counts are
    // moderate-stale and refreshed via mutation/realtime; refetching on every
    // window focus was redundant network load with no freshness benefit.
  });
}

export function useRecordStoryViewMutation() {
  return useMutation({
    mutationFn: ({ postId, orgId, orgName }: { postId: string; orgId: string; orgName: string }) =>
      recordStoryView(postId, orgId, orgName),
  });
}
