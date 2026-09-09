import {
  applyLedgerReportView,
  EMPTY_LEDGER_REPORT_VIEW,
  toReportIsoDate,
} from "./ledgerReportTable.util";

const keys = ["rowType", "date", "status", "party"];

const rows = [
  { rowType: "TRIP", date: "8 Sep", dateIso: "2026-09-08", status: "IN TRANSIT", party: "Apollo" },
  { rowType: "TXN", date: "7 Sep", dateIso: "2026-09-07", status: "MATCH_FOUND", party: "Luminous" },
  { rowType: "BAL", date: "8 Sep", dateIso: "2026-09-08", status: "STATEMENT", party: "Trip Balance" },
];

describe("ledgerReportTable.util", () => {
  it("parses iso dates from timestamps", () => {
    expect(toReportIsoDate("2026-09-08T10:00:00.000Z")).toBe("2026-09-08");
  });

  it("filters by date range, status, type, and sorts", () => {
    const view = applyLedgerReportView(
      rows,
      {
        ...EMPTY_LEDGER_REPORT_VIEW,
        dateFrom: "2026-09-08",
        dateTo: "2026-09-08",
        typeValues: ["TRIP", "BAL"],
        statusValues: ["IN TRANSIT"],
        sortKey: "party",
        sortDir: "asc",
      },
      keys,
    );
    expect(view.map((r) => r.rowType)).toEqual(["TRIP"]);
  });

  it("searches across cells", () => {
    const view = applyLedgerReportView(
      rows,
      { ...EMPTY_LEDGER_REPORT_VIEW, search: "lumi" },
      keys,
    );
    expect(view).toHaveLength(1);
    expect(view[0].party).toBe("Luminous");
  });
});
