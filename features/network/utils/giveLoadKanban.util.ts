/**
 * Give Load Kanban — bucket shipper indents into marketplace stage columns.
 * Column membership matches Load Center status-tab filtering (bid-count
 * for Open Market vs Receiving Bids; DB status for Awarded / Done).
 * Done column tabs: In Transit / Completed (same pattern as Get Load → Claimed).
 */
import type { IndentRow } from "@/features/indents";
import {
  STATUS_TABS,
  statusMatchesFilter,
  type StatusFilterTab,
} from "@/features/network/utils/loadCenter.model";

export type GiveLoadDoneSubTabId = "IN_TRANSIT" | "COMPLETED";

export const GIVE_LOAD_KANBAN_COLUMNS: readonly StatusFilterTab[] = [
  "OPEN",
  "QUOTED",
  "AWARDED",
  "DONE",
];

export type GiveLoadKanbanBuckets = {
  OPEN: IndentRow[];
  QUOTED: IndentRow[];
  AWARDED: IndentRow[];
  /** All done outcomes (union of in-transit + completed). */
  DONE: IndentRow[];
  DONE_IN_TRANSIT: IndentRow[];
  DONE_COMPLETED: IndentRow[];
};

export function emptyGiveLoadKanbanBuckets(): GiveLoadKanbanBuckets {
  return {
    OPEN: [],
    QUOTED: [],
    AWARDED: [],
    DONE: [],
    DONE_IN_TRANSIT: [],
    DONE_COMPLETED: [],
  };
}

export function resolveGiveLoadKanbanColumn(
  load: IndentRow,
  bidCount: number,
): StatusFilterTab {
  const status = (load.status || "").toLowerCase();
  if (statusMatchesFilter(status, "DONE")) return "DONE";
  if (statusMatchesFilter(status, "AWARDED")) return "AWARDED";
  const hasBids = bidCount > 0;
  if (hasBids) return "QUOTED";
  if (statusMatchesFilter(status, "OPEN")) return "OPEN";
  // Fallback for unexpected statuses — park under Done rather than dropping.
  return "DONE";
}

export function bucketGiveLoadIndentsForKanban(
  loads: IndentRow[],
  quoteCounts: Record<string, number>,
  opts?: {
    searchQuery?: string;
    matchesSearch?: (load: IndentRow, query: string) => boolean;
    /** True when the indent’s linked trip is actively in transit. */
    isInTransit?: (indentId: string) => boolean;
  },
): GiveLoadKanbanBuckets {
  const buckets = emptyGiveLoadKanbanBuckets();
  const query = (opts?.searchQuery ?? "").trim();
  const matches = opts?.matchesSearch;
  const inTransit = opts?.isInTransit ?? (() => false);

  for (const load of loads) {
    if (query && matches && !matches(load, query)) continue;
    const bidCount = quoteCounts[load.id] ?? 0;
    const column = resolveGiveLoadKanbanColumn(load, bidCount);
    buckets[column].push(load);
    if (column === "DONE") {
      if (inTransit(load.id)) buckets.DONE_IN_TRANSIT.push(load);
      else buckets.DONE_COMPLETED.push(load);
    }
  }

  return buckets;
}

export function giveLoadKanbanColumnLabel(tabId: StatusFilterTab): string {
  if (tabId === "OPEN") return "My Indents";
  if (tabId === "QUOTED") return "Receiving Bids";
  const tab = STATUS_TABS.find((t) => t.id === tabId);
  return tab?.label ?? tabId;
}
