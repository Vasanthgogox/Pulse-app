import {
  STATUS_TABS,
  statusMatchesFilter,
} from "@/features/network/utils/loadCenter.model";

/**
 * Regression cover for the Open-tab status set.
 *
 * A DB trigger (set_indent_quoted_on_direct_quote) flips an indent from
 * broadcast -> quoted on the FIRST bid from ANY org. `status` is a single
 * shared field, not per-viewer, so excluding `quoted` from Open removed a
 * still-biddable load from every other supplier's Open tab after one bid —
 * suppressing exactly the competing bids a broadcast (or paid Reach campaign)
 * exists to attract.
 */
describe("loadCenter status tabs", () => {
  it("keeps a quoted load in Open so other suppliers can still bid", () => {
    expect(statusMatchesFilter("quoted", "OPEN")).toBe(true);
  });

  it("still lists quoted under the Quoted tab", () => {
    expect(statusMatchesFilter("quoted", "QUOTED")).toBe(true);
  });

  it("does not leak terminal or awarded loads into Open", () => {
    for (const s of ["awarded", "completed", "cancelled", "closed", "expired"]) {
      expect(statusMatchesFilter(s, "OPEN")).toBe(false);
    }
  });

  it("keeps pre-bid statuses in Open", () => {
    for (const s of ["open", "pending", "broadcast", "draft"]) {
      expect(statusMatchesFilter(s, "OPEN")).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(statusMatchesFilter("QUOTED", "OPEN")).toBe(true);
  });

  it("Open and Awarded remain disjoint", () => {
    const open = STATUS_TABS.find((t) => t.id === "OPEN")!.statuses;
    const awarded = STATUS_TABS.find((t) => t.id === "AWARDED")!.statuses;
    expect(open.filter((s) => awarded.includes(s))).toEqual([]);
  });
});
