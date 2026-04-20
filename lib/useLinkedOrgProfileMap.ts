import { getLinkedOrgProfile } from "@/features/clients/services/clients.service";
import { useEffect, useMemo, useState } from "react";

export type LinkedOrgDisplay = { avatarUrl?: string; avatarSeed?: string };

function stableOrgIdsKey(
  clients: readonly { linked_organization_id?: string | null }[],
  suppliers: readonly { linked_organization_id?: string | null }[],
): string {
  const set = new Set<string>();
  for (const c of clients) {
    const id = (c.linked_organization_id ?? "").trim();
    if (id) set.add(id);
  }
  for (const s of suppliers) {
    const id = (s.linked_organization_id ?? "").trim();
    if (id) set.add(id);
  }
  return Array.from(set).sort().join("|");
}

/**
 * Fetches `get_connection_partner_display` once per distinct `linked_organization_id`
 * across clients + suppliers (shared RPC for both sides).
 */
export function useLinkedOrgProfileMap(
  clients: readonly { linked_organization_id?: string | null }[],
  suppliers: readonly { linked_organization_id?: string | null }[],
): Record<string, LinkedOrgDisplay> {
  const idsKey = useMemo(
    () => stableOrgIdsKey(clients, suppliers),
    [clients, suppliers],
  );
  const [map, setMap] = useState<Record<string, LinkedOrgDisplay>>({});

  useEffect(() => {
    const ids = idsKey ? idsKey.split("|").filter(Boolean) : [];
    if (ids.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      ids.map(async (oid) => {
        const { profile } = await getLinkedOrgProfile(oid);
        if (!profile) return [oid, null] as const;
        return [
          oid,
          {
            avatarUrl: (profile.avatarUrl ?? "").trim() || undefined,
            avatarSeed: (profile.avatarSeed ?? "").trim() || undefined,
          } satisfies LinkedOrgDisplay,
        ] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, LinkedOrgDisplay> = {};
      for (const [oid, disp] of pairs) {
        if (disp) next[oid] = disp;
      }
      setMap(next);
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return map;
}
