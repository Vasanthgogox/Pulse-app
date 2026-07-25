import { useQuery } from '@tanstack/react-query';
import { getWalletBalance } from '@/features/reach/services/wallet.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useReachWalletQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.wallet(orgId ?? ''),
    queryFn: async () => {
      const res = await getWalletBalance(orgId!);
      if (res.error) throw res.error;
      return res.balance;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}
