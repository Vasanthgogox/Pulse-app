import {
  STATUS_TABS,
  resolveGiveLoadTicketCommerce,
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

/**
 * Give Load cards previously received no `ticketCommerce` prop, so the card fell
 * back to plain text and printed "2 bids" where the money block belongs — both
 * client_price and supplier_target were populated but never rendered.
 */
describe("give load ticket commerce", () => {
  const base = { client_price: 50000, supplier_target: 45000 };
  const opts = {
    isDone: false,
    isDraft: false,
    awardedAmountInr: null as number | null,
    isAwarded: false,
    bidCount: 0,
    loadTypeDetail: "GENERAL",
  };

  it("leads with the target rate and shows the client rate underneath", () => {
    const c = resolveGiveLoadTicketCommerce("OPEN", base, opts);
    expect(c.kicker).toBe("TARGET RATE");
    expect(c.amountInr).toBe(45000);
    expect(c.targetRateInr).toBe(50000);
    expect(c.referenceLabel).toBe("Client rate");
  });

  it("leads with the awarded amount once a supplier is picked", () => {
    const c = resolveGiveLoadTicketCommerce("AWARDED", base, {
      ...opts,
      isAwarded: true,
      awardedAmountInr: 30000,
    });
    expect(c.kicker).toBe("AWARDED");
    expect(c.amountInr).toBe(30000);
    expect(c.targetRateInr).toBe(50000);
  });

  it("keeps the bid count as a caption instead of replacing the rate", () => {
    const c = resolveGiveLoadTicketCommerce("OPEN", base, { ...opts, bidCount: 2 });
    expect(c.amountInr).toBe(45000);
    expect(c.rightCaption).toBe("2 bids");
  });

  it("falls back to the client rate when no target is set", () => {
    const c = resolveGiveLoadTicketCommerce(
      "OPEN",
      { client_price: 50000, supplier_target: null },
      opts,
    );
    expect(c.kicker).toBe("CLIENT RATE");
    expect(c.amountInr).toBe(50000);
  });

  it("shows no hero amount when both rates are missing or zero", () => {
    const c = resolveGiveLoadTicketCommerce(
      "OPEN",
      { client_price: 0, supplier_target: null },
      opts,
    );
    expect(c.amountInr).toBeNull();
    expect(c.rightCaption).toBe("GENERAL");
  });

  it("drops the money block on done loads", () => {
    const c = resolveGiveLoadTicketCommerce("DONE", base, { ...opts, isDone: true });
    expect(c.amountInr).toBeNull();
    expect(c.rightCaption).toBe("On books");
  });
});
