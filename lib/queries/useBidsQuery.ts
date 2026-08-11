import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  getBidsForPost,
  getDriverDirectBidsForPost,
  getMyBidForPost,
  submitPulseBidWithDirectQuote,
  updateBid,
  acceptBid,
  rejectBid,
  withdrawBid,
} from '@/features/network/services/bids.service';
import { recordStoryView } from '@/features/network/services/story-views.service';
import { queryKeys } from '@/lib/queryKeys';

function invalidateIndentOfferCounts(qc: QueryClient) {
  qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) && q.queryKey[0] === 'indents' && q.queryKey[1] === 'offer-counts',
  });
}

/**
 * Reach Stability: keep bid success cheap.
 * Do not invalidate the full posts feed or all indents lists — those cause
 * story/feed refetch storms under concurrent bidding.
 */
function invalidateAfterBidWrite(
  qc: QueryClient,
  postId: string | null,
  orgId: string | null,
) {
  if (postId) {
    void qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
    void qc.invalidateQueries({ queryKey: queryKeys.bids.directForPost(postId) });
    void qc.invalidateQueries({ queryKey: queryKeys.bids.myBid(postId, orgId ?? '') });
    void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
    void qc.invalidateQueries({ queryKey: queryKeys.storyViews.forPost(postId) });
  }
  // Offer counts only — Load Center "Receiving Bids" badges. Narrower than
  // queryKeys.indents.all which refetches every indent list for the org.
  invalidateIndentOfferCounts(qc);
  if (orgId) {
    void qc.invalidateQueries({
      queryKey: [...queryKeys.indents.finite(orgId), 'my-direct-quotes'],
    });
    void qc.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) });
  }
}

export function useBidsForPostQuery(postId: string | null) {
  return useQuery({
    queryKey: queryKeys.bids.forPost(postId ?? ''),
    queryFn: async () => {
      const res = await getBidsForPost(postId!);
      if (res.error) throw res.error;
      return res.bids;
    },
    enabled: !!postId,
    staleTime: STALE.moderate,
  });
}

export function useDriverDirectBidsForPostQuery(postId: string | null) {
  return useQuery({
    queryKey: queryKeys.bids.directForPost(postId ?? ''),
    queryFn: async () => {
      const res = await getDriverDirectBidsForPost(postId!);
      if (res.error) throw res.error;
      return res.bids;
    },
    enabled: !!postId,
    staleTime: STALE.moderate,
  });
}

export function useMyBidQuery(postId: string | null, orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.bids.myBid(postId ?? '', orgId ?? ''),
    queryFn: async () => {
      const res = await getMyBidForPost(postId!, orgId!);
      if (res.error) throw res.error;
      return res.bid;
    },
    enabled: !!postId && !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useSubmitBidMutation(postId: string | null, orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; note?: string; orgName?: string }) => {
      const res = await submitPulseBidWithDirectQuote({
        postId: postId!,
        bidderOrganizationId: orgId!,
        amount: input.amount,
        note: input.note,
      });
      if (!res.error && postId && orgId) {
        await recordStoryView(postId, orgId, input.orgName?.trim() ?? "");
      }
      return res;
    },
    onSuccess: () => {
      try {
        invalidateAfterBidWrite(qc, postId, orgId);
      } catch { /* cache invalidation failure is non-critical */ }
    },
  });
}

export function useUpdateBidMutation(postId: string | null, orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bidId, amount, note }: { bidId: string; amount: number; note?: string }) =>
      updateBid(bidId, orgId!, amount, note),
    onSuccess: () => {
      try {
        invalidateAfterBidWrite(qc, postId, orgId);
      } catch { /* cache invalidation failure is non-critical */ }
    },
  });
}

export function useAcceptBidMutation(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => acceptBid(bidId),
    onSuccess: () => {
      try {
        qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
        invalidateIndentOfferCounts(qc);
      } catch { /* cache invalidation failure is non-critical */ }
    },
  });
}

export function useRejectBidMutation(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => rejectBid(bidId),
    onSuccess: () => {
      try {
        qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
        invalidateIndentOfferCounts(qc);
      } catch { /* cache invalidation failure is non-critical */ }
    },
  });
}

export function useWithdrawBidMutation(postId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => withdrawBid(bidId),
    onSuccess: () => {
      try {
        qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
        qc.invalidateQueries({ queryKey: queryKeys.bids.myBid(postId, orgId) });
        invalidateIndentOfferCounts(qc);
      } catch { /* cache invalidation failure is non-critical */ }
    },
  });
}
