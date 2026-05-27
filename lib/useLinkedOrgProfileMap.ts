import { getLinkedOrgProfilesBatch } from "@/features/clients/services/clients.service";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type LinkedOrgDisplay = { avatarUrl?: string; avatarSeed?: string };

/**
 * Fetches display profiles (avatar URL + seed) for all linked org IDs found in
 * the given client and supplier lists. Results are cached by TanStack Query.
 */
export function useLinkedOrgProfileMap(
  clients: readonly { linked_organization_id?: string | null }[],
  suppliers: readonly { linked_organization_id?: string | null }[],
): Record<string, LinkedOrgDisplay> {
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      const id = (c.linked_organization_id ?? "").trim();
      if (id) set.add(id);
    }
    for (const s of suppliers) {
      const id = (s.linked_organization_id ?? "").trim();
      if (id) set.add(id);
    }
    return Array.from(set).sort();
  }, [clients, suppliers]);

  const { data = {} } = useQuery({
    queryKey: queryKeys.linkedOrgDisplay(ids),
    queryFn: async () => {
      const profiles = await getLinkedOrgProfilesBatch(ids);
      const result: Record<string, LinkedOrgDisplay> = {};
      for (const [oid, profile] of Object.entries(profiles)) {
        result[oid] = {
          avatarUrl: (profile.avatarUrl ?? "").trim() || undefined,
          avatarSeed: (profile.avatarSeed ?? "").trim() || undefined,
        };
      }
      return result;
    },
    enabled: ids.length > 0,
    staleTime: STALE.moderate,
  });

  return data;
}
