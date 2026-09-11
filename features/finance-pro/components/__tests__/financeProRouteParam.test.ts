import { financeProRouteParam } from "../financeProRouteParam";

describe("financeProRouteParam", () => {
  it("normalizes arrays and encoded invoice numbers", () => {
    expect(financeProRouteParam(undefined)).toBeNull();
    expect(financeProRouteParam(["abc"])).toBe("abc");
    expect(financeProRouteParam("INV%2F2026-27%2F00003")).toBe("INV/2026-27/00003");
  });
});
