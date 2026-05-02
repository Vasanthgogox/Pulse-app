import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBidsForPost,
  getMyBidForPost,
  submitBid,
  updateBid,
  acceptBid,
  rejectBid,
  withdrawBid,
} from '@/features/network/services/bids.service';
import { queryKeys } from '@/lib/queryKeys';

function invalidateIndentOfferCounts(qc: QueryClient) {
  qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) && q.queryKey[0] === 'indents' && q.queryKey[1] === 'offer-counts',
  });
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
    staleTime: 300_000,
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
    staleTime: 300_000,
  });
}

export function useSubmitBidMutation(postId: string | null, orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; note?: string }) =>
      submitBid({ postId: postId!, bidderOrganizationId: orgId!, ...input }),
    onSuccess: () => {
      if (postId) {
        qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
        qc.invalidateQueries({ queryKey: queryKeys.bids.myBid(postId, orgId ?? '') });
        qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
      }
      invalidateIndentOfferCounts(qc);
    },
  });
}

export function useUpdateBidMutation(postId: string | null, orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bidId, amount, note }: { bidId: string; amount: number; note?: string }) =>
      updateBid(bidId, orgId!, amount, note),
    onSuccess: () => {
      if (postId) {
        qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
        qc.invalidateQueries({ queryKey: queryKeys.bids.myBid(postId, orgId ?? '') });
      }
      invalidateIndentOfferCounts(qc);
    },
  });
}

export function useAcceptBidMutation(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => acceptBid(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
      invalidateIndentOfferCounts(qc);
    },
  });
}

export function useRejectBidMutation(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => rejectBid(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
      invalidateIndentOfferCounts(qc);
    },
  });
}

export function useWithdrawBidMutation(postId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => withdrawBid(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
      qc.invalidateQueries({ queryKey: queryKeys.bids.myBid(postId, orgId) });
      invalidateIndentOfferCounts(qc);
    },
  });
}
