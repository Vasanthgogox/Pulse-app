import { useQuery } from "@tanstack/react-query";

import { getClientLaneRates } from "@/features/clients/services/clientLaneRates.service";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import { queryKeys } from "@/lib/queryKeys";

export function useClientLaneRatesQuery(
  orgId: string | null | undefined,
  clientId: string | null | undefined,
  search: string = "",
) {
  const trimmed = search.trim();
  return useQuery<ClientLaneRate[], Error>({
    queryKey: queryKeys.clients.laneRates(orgId ?? "", clientId ?? "", trimmed),
    enabled: Boolean(orgId && clientId),
    queryFn: async () => {
      const { error, laneRates } = await getClientLaneRates(orgId!, clientId!, {
        search: trimmed || null,
      });
      if (error) throw error;
      return laneRates;
    },
    staleTime: 60_000,
    // Avoid flicker to empty while the next search page loads.
    placeholderData: (prev) => prev,
  });
}
