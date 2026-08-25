import { isDeployTripDetailsReady } from "@/features/indents/utils/indentDeployTripDetails.util";

describe("isDeployTripDetailsReady", () => {
  it("is ready with a valid date even when weight/type/product are empty", () => {
    expect(isDeployTripDetailsReady("2026-08-25", "", "", "")).toBe(true);
  });

  it("is not ready with an invalid date", () => {
    expect(isDeployTripDetailsReady("25-08-2026", "16", "Taurus", "Steel")).toBe(
      false,
    );
  });
});
