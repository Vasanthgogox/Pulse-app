import {
  STATUS_TABS,
  resolveGetLoadDoneOutcome,
  resolveGetLoadMobileCardLabels,
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
      awardedByName: "Acme Logistics",
    });
    expect(c.kicker).toBe("AWARDED");
    expect(c.amountInr).toBe(30000);
    expect(c.targetRateInr).toBe(50000);
    expect(c.awardedByName).toBe("Acme Logistics");
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

describe("resolveGetLoadDoneOutcome", () => {
  it("marks cancelled indents as CANCELLED and non-interactive", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "cancelled" },
      { status: "rejected" },
      false,
    );
    expect(o.kind).toBe("cancelled");
    expect(o.kicker).toBe("CANCELLED");
    expect(o.statusLabel).toBe("cancelled");
    expect(o.channelLabel).toBe("Indent cancelled");
    expect(o.interactive).toBe(false);
  });

  it("marks completed/closed as LOST when we did not win", () => {
    for (const status of ["completed", "closed", "awarded"]) {
      const o = resolveGetLoadDoneOutcome(
        { status },
        { status: "rejected" },
        false,
        false,
      );
      expect(o.kind).toBe("lost");
      expect(o.kicker).toBe("LOST");
      expect(o.footerLabel).toBe("Allocated to another bidder");
      expect(o.interactive).toBe(false);
    }
  });

  it("prefers LOST over REJECTED when indent is terminal and we lost", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "completed" },
      { status: "rejected" },
      false,
      false,
    );
    expect(o.kind).toBe("lost");
    expect(o.statusLabel).toBe("lost");
  });

  it("marks won + completed as CONVERTED even without a trip row yet", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "completed" },
      { status: "accepted" },
      false,
      true,
    );
    expect(o.kind).toBe("converted");
    expect(o.kicker).toBe("CONVERTED");
    expect(o.statusLabel).toBe("converted");
    expect(o.channelLabel).toBe("Won · converted to trip");
  });

  it("marks linked trips as CONVERTED", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "completed" },
      { status: "accepted" },
      true,
      true,
    );
    expect(o.kind).toBe("converted");
    expect(o.kicker).toBe("CONVERTED");
  });

  it("marks quote rejected as REJECTED when indent is not terminal-awarded", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "open" },
      { status: "rejected" },
      false,
    );
    expect(o.kind).toBe("declined");
    expect(o.kicker).toBe("REJECTED");
    expect(o.statusLabel).toBe("rejected");
  });

  it("marks expired indents as EXPIRED", () => {
    const o = resolveGetLoadDoneOutcome({ status: "expired" }, null, false);
    expect(o.kind).toBe("expired");
    expect(o.kicker).toBe("EXPIRED");
  });
});

describe("resolveGetLoadMobileCardLabels Done tab", () => {
  it("surfaces LOST labels for completed indents without a win", () => {
    const labels = resolveGetLoadMobileCardLabels(
      "DONE",
      "REJECTED",
      { id: "i1", status: "completed", load_type: "General" },
      { status: "rejected", amount: 1000 },
      new Set(),
      false,
    );
    expect(labels.statusLabel).toBe("lost");
    expect(labels.rightFooter).toBe("Allocated to another bidder");
  });

  it("surfaces CONVERTED when we won", () => {
    const labels = resolveGetLoadMobileCardLabels(
      "DONE",
      "CONVERTED",
      { id: "i1", status: "completed", load_type: "General" },
      { status: "accepted", amount: 1000 },
      new Set(["i1"]),
      true,
    );
    expect(labels.statusLabel).toBe("converted");
    expect(labels.rightFooter).toBe("On books");
  });
});
