import { bucketGetLoadIndentsForKanban } from "@/features/network/utils/getLoadKanban.util";
import type { IndentRow } from "@/features/indents";

function load(partial: Partial<IndentRow> & { id: string }): IndentRow {
  return partial as IndentRow;
}

describe("getLoadKanban.util", () => {
  it("puts claimed outcomes under Claimed with in-transit vs completed splits", () => {
    const buckets = bucketGetLoadIndentsForKanban(
      [load({ id: "open1" }), load({ id: "bid1" })],
      [load({ id: "awarded1" })],
      [load({ id: "claimed1" }), load({ id: "transit1" })],
      new Map([["bid1", {}]]),
      { isInTransit: (id) => id === "transit1" },
    );
    expect(buckets.OPEN.map((l) => l.id)).toEqual(["open1"]);
    expect(buckets.QUOTED.map((l) => l.id)).toEqual(["bid1"]);
    expect(buckets.AWARDED.map((l) => l.id)).toEqual(["awarded1"]);
    expect(buckets.CLAIMED.map((l) => l.id)).toEqual(["claimed1", "transit1"]);
    expect(buckets.CLAIMED_IN_TRANSIT.map((l) => l.id)).toEqual(["transit1"]);
    expect(buckets.CLAIMED_COMPLETED.map((l) => l.id)).toEqual(["claimed1"]);
  });
});
