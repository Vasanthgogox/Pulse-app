import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBidsForPost,
  getMyBidForPost,
  submitBid,
  acceptBid,
  rejectBid,
  withdrawBid,
} from '@/features/network/services/bids.service';
import { queryKeys } from '@/lib/queryKeys';

export function useBidsForPostQuery(postId: string | null) {
  return useQuery({
    queryKey: queryKeys.bids.forPost(postId ?? ''),
    queryFn: async () => {
      const res = await getBidsForPost(postId!);
      if (res.error) throw res.error;
      return res.bids;
    },
    enabled: !!postId,
    staleTime: 20_000,
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
    staleTime: 20_000,
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
    },
  });
}

export function useAcceptBidMutation(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => acceptBid(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
    },
  });
}

export function useRejectBidMutation(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => rejectBid(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bids.forPost(postId) });
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
    },
  });
}
