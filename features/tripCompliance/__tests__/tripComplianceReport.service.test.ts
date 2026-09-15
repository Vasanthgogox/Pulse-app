import { complianceReportToCsv, type ComplianceReportRow } from "@/features/tripCompliance/services/tripComplianceReport.service";

const ROW: ComplianceReportRow = {
  tripId: "TRP001",
  tripDisplayNumber: "TRP001",
  tripStatus: "delivered",
  client: "Acme, Inc.", // deliberately contains a comma to exercise CSV escaping
  driver: "Ravi",
  vehicle: "KA01AB1234",
  complianceStatus: "Payment Settled",
  documentStatus: "5/5 verified",
  complianceVerifiedAt: "2026-09-01T00:00:00Z",
  advanceAmount: "5000",
  advanceStatus: "PROCESSED",
  advanceUtr: "UTR001",
  advancePaidAt: "2026-09-02",
  deliveryDate: "2026-09-05",
  hardCopyPodStatus: "RECEIVED",
  courier: "BlueDart",
  awb: "AWB123",
  balanceAmount: "2000",
  balanceStatus: "PAID",
  balanceUtr: "UTR002",
  balancePaidAt: "2026-09-06",
  settlementStatus: "SETTLED",
};

describe("complianceReportToCsv", () => {
  it("includes every required field in the header, in order", () => {
    const csv = complianceReportToCsv([ROW]);
    const header = csv.split("\n")[0];
    expect(header).toBe(
      [
        "Trip ID",
        "Trip Status",
        "Client",
        "Driver",
        "Vehicle",
        "Compliance Status",
        "Document Status",
        "Compliance Verified At",
        "Advance Amount",
        "Advance Status",
        "Advance UTR",
        "Advance Paid At",
        "Delivery Date",
        "Hard Copy POD Status",
        "Courier",
        "AWB",
        "Balance Amount",
        "Balance Status",
        "Balance UTR",
        "Balance Paid At",
        "Settlement Status",
      ].join(","),
    );
  });

  it("escapes a value containing a comma", () => {
    const csv = complianceReportToCsv([ROW]);
    expect(csv).toContain('"Acme, Inc."');
  });

  it("produces one data line per row plus the header", () => {
    const csv = complianceReportToCsv([ROW, { ...ROW, tripId: "TRP002" }]);
    expect(csv.split("\n")).toHaveLength(3);
  });
});
