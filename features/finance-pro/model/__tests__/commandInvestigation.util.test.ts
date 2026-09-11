import { readFileSync } from "fs";
import { join } from "path";
import { buildFinanceProModel } from "../buildFinanceProModel";
import {
  clearCanvasSelection,
  toggleAgeBucketSelection,
  toggleClientSelection,
} from "../canvasContext.util";
import {
  buildCommandPresentation,
  projectCommandModel,
} from "../commandInvestigation.util";
import { EMPTY_CANVAS_SELECTION } from "../financeProTypes";
import type { CustomerLedgerInputs } from "@/features/finance/services/ledgerAggregationRpc.service";

const NOW = new Date("2026-09-12T12:00:00.000Z");

function inputs(partial: Partial<CustomerLedgerInputs>): CustomerLedgerInputs {
  return {
    trip_inputs: [],
    unlinked_payments: [],
    ledger_only_parties: [],
    client_ledger_totals: [],
    ...partial,
  };
}

const clients = [
  { id: "aero", name: "AERO", contact_person: null, is_integrated: false },
  { id: "apple", name: "APPLE", contact_person: null, is_integrated: false },
];

const base = buildFinanceProModel({
  clients,
  now: NOW,
  trips: [
    {
      id: "t1",
      pickup_date: "2026-09-12",
      status: "completed",
      completed_at: "2026-09-12",
      pod_received_at: null,
    },
    {
      id: "t2",
      pickup_date: "2026-07-20",
      status: "completed",
      completed_at: "2026-07-21",
      pod_received_at: "2026-07-22",
    },
  ],
  inputs: inputs({
    trip_inputs: [
      { client_id: "aero", trip_id: "t1", sales: 800, initial_paid: 0 },
      { client_id: "apple", trip_id: "t2", sales: 200, initial_paid: 0 },
    ],
  }),
});

describe("Command investigation binding", () => {
  it("A. no selection → Command presents the base model", () => {
    const command = buildCommandPresentation(base, EMPTY_CANVAS_SELECTION, NOW);
    expect(command.model).toBe(base);
    expect(command.outstanding).toBe(base.outstanding);
    expect(command.outstanding).toBe(1000);
    expect(command.evidenceClients.map((r) => r.id).sort()).toEqual([
      "aero",
      "apple",
    ]);
    expect(command.brief.active).toBe(false);
    expect(command.story).toBeNull();
  });

  it("B. 31–60 updates hero, KPIs, evidence, and story from one filtered model", () => {
    const selection = toggleAgeBucketSelection(EMPTY_CANVAS_SELECTION, "d31_60");
    const command = buildCommandPresentation(base, selection, NOW);
    expect(command.model).not.toBe(base);
    expect(command.outstanding).toBe(200);
    expect(command.outstanding).not.toBe(base.outstanding);
    expect(command.ageTotals.d31_60).toBe(200);
    expect(command.ageTotals.current).toBe(0);
    expect(command.clientsWithBalance).toBe(1);
    expect(command.podBlockedValue).toBe(0);
    expect(command.readyValue).toBe(200);
    expect(command.evidenceClients).toHaveLength(1);
    expect(command.evidenceClients[0]?.id).toBe("apple");
    expect(command.evidenceTrips.every((t) => t.ageBucket === "d31_60")).toBe(
      true,
    );
    expect(command.attention[0]?.title).toBe("APPLE");
    expect(command.brief.outstanding).toBe(200);
    expect(command.brief.largestName).toBe("APPLE");
    expect(command.story).toMatch(/age band/i);
    expect(command.brief.outstanding).toBe(200);
  });

  it("C. AERO updates hero, KPIs, evidence, and story from one AERO model", () => {
    const selection = toggleClientSelection(
      EMPTY_CANVAS_SELECTION,
      "aero",
      "AERO",
    );
    const command = buildCommandPresentation(base, selection, NOW);
    expect(command.outstanding).toBe(800);
    expect(command.outstanding).not.toBe(base.outstanding);
    expect(command.evidenceClients).toHaveLength(1);
    expect(command.evidenceClients[0]?.id).toBe("aero");
    expect(command.evidenceTrips.every((t) => t.clientId === "aero")).toBe(true);
    expect(command.podBlockedValue).toBe(800);
    expect(command.readyValue).toBe(0);
    expect(command.attention[0]?.title).toBe("AERO");
    expect(command.brief.largestName).toBe("AERO");
    expect(command.story).toMatch(/AERO/);
  });

  it("D. Clear restores the exact unfiltered base Command model", () => {
    const selected = toggleAgeBucketSelection(EMPTY_CANVAS_SELECTION, "d31_60");
    const filtered = buildCommandPresentation(base, selected, NOW);
    expect(filtered.outstanding).toBe(200);
    const cleared = buildCommandPresentation(
      base,
      clearCanvasSelection(),
      NOW,
    );
    expect(cleared.model).toBe(base);
    expect(cleared.outstanding).toBe(base.outstanding);
    expect(cleared.evidenceClients.map((r) => r.id).sort()).toEqual([
      "aero",
      "apple",
    ]);
    expect(cleared.brief.active).toBe(false);
    expect(cleared.story).toBeNull();
  });

  it("E. applying a selection does not mutate base", () => {
    const snapshot = {
      outstanding: base.outstanding,
      billed: base.billed,
      current: base.ageTotals.current,
      d31_60: base.ageTotals.d31_60,
      clientOutstanding: base.clientRows.map((r) => r.outstanding),
      tripCount: base.tripFacts.length,
    };
    const selection = toggleAgeBucketSelection(EMPTY_CANVAS_SELECTION, "d31_60");
    projectCommandModel(base, selection, NOW);
    toggleClientSelection(selection, "aero", "AERO");
    buildCommandPresentation(base, selection, NOW);
    expect(base.outstanding).toBe(snapshot.outstanding);
    expect(base.billed).toBe(snapshot.billed);
    expect(base.ageTotals.current).toBe(snapshot.current);
    expect(base.ageTotals.d31_60).toBe(snapshot.d31_60);
    expect(base.clientRows.map((r) => r.outstanding)).toEqual(
      snapshot.clientOutstanding,
    );
    expect(base.tripFacts.length).toBe(snapshot.tripCount);
  });

  it("F. investigation projection does not call Supabase or RPCs", () => {
    const util = readFileSync(
      join(__dirname, "../commandInvestigation.util.ts"),
      "utf8",
    );
    const screen = readFileSync(
      join(__dirname, "../../components/FinanceProCommandScreen.tsx"),
      "utf8",
    );
    expect(util).not.toMatch(/supabase|\.rpc\(/);
    expect(screen).not.toMatch(/supabase|\.rpc\(/);
  });
});
