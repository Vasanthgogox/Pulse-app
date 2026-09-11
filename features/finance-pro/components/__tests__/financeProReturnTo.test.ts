import { parseSafeReturnTo, returnToLabel, withReturnTo } from "../financeProReturnTo";

describe("parseSafeReturnTo", () => {
  it("allows Finance Pro and nested POD return", () => {
    expect(parseSafeReturnTo("/finance-pro")).toBe("/finance-pro");
    expect(parseSafeReturnTo("/finance-pro/receivables")).toBe("/finance-pro/receivables");
    expect(
      parseSafeReturnTo("/pod-reconciliation?returnTo=%2Ffinance-pro"),
    ).toBe("/pod-reconciliation?returnTo=%2Ffinance-pro");
  });

  it("rejects open redirects", () => {
    expect(parseSafeReturnTo("https://evil.example")).toBeNull();
    expect(parseSafeReturnTo("//evil.example")).toBeNull();
    expect(parseSafeReturnTo("/trips")).toBeNull();
    expect(parseSafeReturnTo("/finance-pro?next=/trips")).toBeNull();
  });
});

describe("returnToLabel", () => {
  it("names the originating product", () => {
    expect(returnToLabel("/finance-pro/invoices")).toBe("Back to Finance Pro");
    expect(returnToLabel("/pod-reconciliation")).toBe("Back to Pulse POD");
  });
});

describe("withReturnTo", () => {
  it("appends a query param", () => {
    expect(withReturnTo("/invoicing-execute", "/finance-pro")).toBe(
      "/invoicing-execute?returnTo=%2Ffinance-pro",
    );
  });
});
