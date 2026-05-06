import { getLinkedOrgProfilesBatch } from "@/features/clients/services/clients.service";
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
 * Fetches display profiles for all linked orgs in a single batch RPC call.
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
    void getLinkedOrgProfilesBatch(ids).then((profiles) => {
      if (cancelled) return;
      const next: Record<string, LinkedOrgDisplay> = {};
      for (const [oid, profile] of Object.entries(profiles)) {
        next[oid] = {
          avatarUrl: (profile.avatarUrl ?? "").trim() || undefined,
          avatarSeed: (profile.avatarSeed ?? "").trim() || undefined,
        };
      }
      setMap(next);
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return map;
}
