import { useMemo } from "react";

import {
  useIndentsQuery,
  useMarketIndentsQuery,
  useMyDirectQuotesQuery,
} from "@/lib/queries/useIndentsQuery";

const TERMINAL = new Set(["completed", "cancelled"]);

/**
 * Loads tab badge count for the mobile footer only.
 * Queries stay disabled when `enabled` is false (e.g. desktop web top nav).
 */
export function useTabBarActiveLoadCount(
  orgId: string | null,
  enabled: boolean,
): number {
  const org = enabled && orgId ? orgId : null;
  // Badge queries are non-blocking for tab switches — stale data is fine for a count pill.
  const dockIndentsQ = useIndentsQuery(org);
  const dockMarketIndentsQ = useMarketIndentsQuery(org);
  const dockMyQuotesQ = useMyDirectQuotesQuery(org);

  return useMemo(() => {
    if (!org) return 0;
    const awardedToMeIds = new Set(
      (dockMyQuotesQ.data ?? [])
        .filter((q) => String(q.status ?? "").toLowerCase() === "accepted")
        .map((q) => q.indent_id),
    );
    const activeIds = new Set<string>();

    for (const indent of dockIndentsQ.data ?? []) {
      const status = String(indent.status ?? "").toLowerCase();
      if (TERMINAL.has(status)) continue;
      if (indent.organization_id === org) activeIds.add(indent.id);
    }

    for (const indent of dockMarketIndentsQ.data ?? []) {
      const status = String(indent.status ?? "").toLowerCase();
      if (TERMINAL.has(status)) continue;
      const target = String(indent.circulation_target ?? "").toLowerCase();
      const isMarketVisible =
        target === "integrated_supplier" || target === "both";
      if (!isMarketVisible) continue;
      if (status === "awarded") {
        if (awardedToMeIds.has(indent.id)) activeIds.add(indent.id);
        continue;
      }
      activeIds.add(indent.id);
    }

    return activeIds.size;
  }, [org, dockIndentsQ.data, dockMarketIndentsQ.data, dockMyQuotesQ.data]);
}
