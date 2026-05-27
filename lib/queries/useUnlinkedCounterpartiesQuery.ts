import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import {
  getUnlinkedCounterparties,
  linkCounterpartyToOrg,
  type UnlinkedCounterparty,
} from "@/features/network/services/counterparties.service";

export function useUnlinkedCounterpartiesQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.unlinkedCounterparties(orgId ?? ""),
    queryFn: async () => {
      const res = await getUnlinkedCounterparties(orgId!);
      if (res.error) throw res.error;
      return res.counterparties;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useLinkCounterpartyMutation(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: linkCounterpartyToOrg,
    onMutate: async (variables) => {
      await qc.cancelQueries({
        queryKey: queryKeys.unlinkedCounterparties(orgId),
      });
      const previous = qc.getQueryData<UnlinkedCounterparty[]>(
        queryKeys.unlinkedCounterparties(orgId),
      );
      qc.setQueryData<UnlinkedCounterparty[]>(
        queryKeys.unlinkedCounterparties(orgId),
        (old) =>
          old?.filter(
            (c) =>
              !(
                c.counterparty_name === variables.counterpartyName &&
                c.counterparty_type === variables.counterpartyType
              ),
          ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(
          queryKeys.unlinkedCounterparties(orgId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.unlinkedCounterparties(orgId),
      });
    },
  });
}
