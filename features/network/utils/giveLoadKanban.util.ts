/**
 * Give Load Kanban — bucket shipper indents into marketplace stage columns.
 * Column membership matches Load Center status-tab filtering (bid-count
 * for Open Market vs Receiving Bids; DB status for Awarded / Done).
 * Once a trip exists it leaves Awarded: live trips → In Transit, finished → Delivered.
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

export type GiveLoadTripKanbanStage = "none" | "in_transit" | "delivered";

const TRIP_DELIVERED_STATUSES = new Set([
  "completed",
  "delivered",
  "closed",
  "cancelled",
  "expired",
]);

/** Awarded indent with a trip → In Transit until the trip is delivered. */
export function giveLoadTripKanbanStage(
  trip:
    | { status?: string | null; completed_at?: string | null }
    | null
    | undefined,
): GiveLoadTripKanbanStage {
  if (!trip) return "none";
  if ((trip.completed_at ?? "").trim()) return "delivered";
  const status = (trip.status ?? "").trim().toLowerCase();
  if (!status) return "in_transit";
  if (TRIP_DELIVERED_STATUSES.has(status)) return "delivered";
  return "in_transit";
}

export type GiveLoadKanbanBuckets = {
  OPEN: IndentRow[];
  QUOTED: IndentRow[];
  AWARDED: IndentRow[];
  /** All done outcomes (union of in-transit + delivered). */
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
  tripStage: GiveLoadTripKanbanStage = "none",
): StatusFilterTab {
  if (tripStage === "in_transit" || tripStage === "delivered") return "DONE";
  const status = (load.status || "").toLowerCase();
  if (statusMatchesFilter(status, "DONE")) return "DONE";
  if (statusMatchesFilter(status, "AWARDED")) return "AWARDED";
  const hasBids = bidCount > 0;
  if (hasBids) return "QUOTED";
  if (statusMatchesFilter(status, "OPEN")) return "OPEN";
  return "DONE";
}

export function bucketGiveLoadIndentsForKanban(
  loads: IndentRow[],
  quoteCounts: Record<string, number>,
  opts?: {
    searchQuery?: string;
    matchesSearch?: (load: IndentRow, query: string) => boolean;
    tripStage?: (indentId: string) => GiveLoadTripKanbanStage;
  },
): GiveLoadKanbanBuckets {
  const buckets = emptyGiveLoadKanbanBuckets();
  const query = (opts?.searchQuery ?? "").trim();
  const matches = opts?.matchesSearch;
  const stageOf = opts?.tripStage ?? (() => "none" as const);

  for (const load of loads) {
    if (query && matches && !matches(load, query)) continue;
    const bidCount = quoteCounts[load.id] ?? 0;
    const stage = stageOf(load.id);
    const column = resolveGiveLoadKanbanColumn(load, bidCount, stage);
    buckets[column].push(load);
    if (column === "DONE") {
      if (stage === "in_transit") buckets.DONE_IN_TRANSIT.push(load);
      else buckets.DONE_COMPLETED.push(load);
    }
  }

  return buckets;
}

export function giveLoadKanbanColumnLabel(tabId: StatusFilterTab): string {
  if (tabId === "OPEN") return "My loads";
  if (tabId === "QUOTED") return "Receiving Bids";
  const tab = STATUS_TABS.find((t) => t.id === tabId);
  return tab?.label ?? tabId;
}
