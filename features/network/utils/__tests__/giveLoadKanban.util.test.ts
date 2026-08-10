import {
  bucketGiveLoadIndentsForKanban,
  resolveGiveLoadKanbanColumn,
} from "@/features/network/utils/giveLoadKanban.util";
import type { IndentRow } from "@/features/indents";

function load(partial: Partial<IndentRow> & { id: string; status: string }): IndentRow {
  return partial as IndentRow;
}

describe("giveLoadKanban.util", () => {
  it("puts open loads with no bids in Open Market", () => {
    expect(
      resolveGiveLoadKanbanColumn(load({ id: "a", status: "open" }), 0),
    ).toBe("OPEN");
  });

  it("moves open loads with bids to Receiving Bids without requiring quoted status", () => {
    expect(
      resolveGiveLoadKanbanColumn(load({ id: "a", status: "broadcast" }), 2),
    ).toBe("QUOTED");
  });

  it("buckets a mixed set into stage columns", () => {
    const loads = [
      load({ id: "1", status: "open" }),
      load({ id: "2", status: "open" }),
      load({ id: "3", status: "awarded" }),
      load({ id: "4", status: "completed" }),
    ];
    const buckets = bucketGiveLoadIndentsForKanban(loads, {
      "1": 0,
      "2": 3,
      "3": 1,
      "4": 0,
    });
    expect(buckets.OPEN.map((l) => l.id)).toEqual(["1"]);
    expect(buckets.QUOTED.map((l) => l.id)).toEqual(["2"]);
    expect(buckets.AWARDED.map((l) => l.id)).toEqual(["3"]);
    expect(buckets.DONE.map((l) => l.id)).toEqual(["4"]);
    expect(buckets.DONE_COMPLETED.map((l) => l.id)).toEqual(["4"]);
    expect(buckets.DONE_IN_TRANSIT).toHaveLength(0);
  });

  it("splits Done into In Transit vs Completed from trip activity", () => {
    const loads = [
      load({ id: "done1", status: "completed" }),
      load({ id: "transit1", status: "completed" }),
      load({ id: "open1", status: "open" }),
    ];
    const buckets = bucketGiveLoadIndentsForKanban(
      loads,
      { done1: 1, transit1: 1, open1: 0 },
      { isInTransit: (id) => id === "transit1" },
    );
    expect(buckets.DONE.map((l) => l.id)).toEqual(["done1", "transit1"]);
    expect(buckets.DONE_IN_TRANSIT.map((l) => l.id)).toEqual(["transit1"]);
    expect(buckets.DONE_COMPLETED.map((l) => l.id)).toEqual(["done1"]);
  });

  it("applies search filter when provided", () => {
    const loads = [
      load({ id: "1", status: "open", pickup_area: "Bangalore" } as Partial<IndentRow> & {
        id: string;
        status: string;
      }),
      load({ id: "2", status: "open", pickup_area: "Chennai" } as Partial<IndentRow> & {
        id: string;
        status: string;
      }),
    ];
    const buckets = bucketGiveLoadIndentsForKanban(
      loads,
      { "1": 0, "2": 0 },
      {
        searchQuery: "chen",
        matchesSearch: (row, q) =>
          String(row.pickup_area ?? "")
            .toLowerCase()
            .includes(q.toLowerCase()),
      },
    );
    expect(buckets.OPEN.map((l) => l.id)).toEqual(["2"]);
    expect(buckets.QUOTED).toHaveLength(0);
  });
});
