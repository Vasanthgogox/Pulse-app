import {
  formatRosterInr,
  buildCustomersRosterReport,
  buildSuppliersRosterReport,
  buildDriversRosterReport,
  buildGarageTripRosterReport,
  buildGarageVehicleRosterReport,
} from "../partyRosterReport.util";

describe("formatRosterInr", () => {
  it("matches the table preview: rupee symbol and Indian grouping, no space", () => {
    expect(formatRosterInr(284500)).toBe("₹2,84,500");
    expect(formatRosterInr(0)).toBe("₹0");
    expect(formatRosterInr(-12100)).toBe("-₹12,100");
  });
});

describe("buildCustomersRosterReport", () => {
  it("uses table columns Entity / Trips / Sales / Received / Due", () => {
    const report = buildCustomersRosterReport([
      {
        id: "c1",
        name: "ADANI GROUPS",
        trips: 7,
        billed: 284500,
        received: 17000,
        pending: 267500,
      },
    ]);
    expect(report.columns.map((c) => c.label)).toEqual([
      "Customer Entity",
      "Trips",
      "Sales",
      "Received",
      "Due",
    ]);
    expect(report.rows[0]).toEqual({
      entity: "ADANI GROUPS",
      trips: 7,
      sales: "₹2,84,500",
      received: "₹17,000",
      due: "₹2,67,500",
    });
  });
});

describe("buildSuppliersRosterReport", () => {
  it("uses table columns Entity / Trips / Payables / Paid / Due", () => {
    const report = buildSuppliersRosterReport([
      {
        id: "s1",
        name: "Carrier Co",
        trips: 3,
        payables: 50000,
        paid: 20000,
        due: 30000,
      },
    ]);
    expect(report.columns.map((c) => c.label)).toEqual([
      "Supplier Entity",
      "Trips",
      "Payables",
      "Paid",
      "Due",
    ]);
    expect(report.rows[0].payables).toBe("₹50,000");
    expect(report.rows[0].paid).toBe("₹20,000");
    expect(report.rows[0].due).toBe("₹30,000");
  });
});

describe("buildDriversRosterReport", () => {
  it("maps due→Earned and pending→Pending like the Drivers table", () => {
    const report = buildDriversRosterReport([
      {
        id: "d1",
        name: "SADAM SA",
        trips: 2,
        due: 3500,
        paid: 0,
        pending: 3500,
      },
    ]);
    expect(report.columns.map((c) => c.label)).toEqual([
      "Driver Entity",
      "Trips",
      "Earned",
      "Paid",
      "Pending",
    ]);
    expect(report.rows[0]).toEqual({
      entity: "SADAM SA",
      trips: 2,
      earned: "₹3,500",
      paid: "₹0",
      due: "₹3,500",
    });
  });
});

describe("buildGarage roster reports", () => {
  it("uses Trip / Trips / Sales / Expense / P&L for the trips preview", () => {
    const report = buildGarageTripRosterReport([
      { missionId: "AJI862", sales: 65000, totalExpense: 12000, net: 53000 },
    ]);
    expect(report.columns.map((c) => c.label)).toEqual([
      "Trip",
      "Trips",
      "Sales",
      "Expense",
      "P&L",
    ]);
    expect(report.rows[0]).toEqual({
      entity: "AJI862",
      trips: 1,
      sales: "₹65,000",
      expense: "₹12,000",
      pnl: "₹53,000",
    });
  });

  it("uses Vehicle Entity / Trips / Sales / Expense / P&L for the garage preview", () => {
    const report = buildGarageVehicleRosterReport([
      { name: "KA 01 AB 1234", trips: 4, sales: 100000, expense: 25000, pnl: 75000 },
    ]);
    expect(report.columns[0].label).toBe("Vehicle Entity");
    expect(report.rows[0].pnl).toBe("₹75,000");
  });
});
