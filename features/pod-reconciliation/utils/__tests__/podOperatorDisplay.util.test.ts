import {
  podOperatorDisplayName,
  podTripLane,
} from "../podOperatorDisplay.util";

describe("pod operator display", () => {
  it("treats trips without supplier_id as asset", () => {
    expect(podTripLane({ supplier_id: null })).toBe("asset");
    expect(podTripLane({ supplier_id: "sup-1" })).toBe("market");
    expect(podTripLane({ supplier_id: "sup-1", trip_payout_mode: "asset" })).toBe(
      "asset",
    );
  });

  it("shows driver name for asset trips", () => {
    expect(
      podOperatorDisplayName({
        lane: "asset",
        supplierName: "",
        driverName: "Ravi",
      }),
    ).toBe("Ravi");
  });

  it("shows supplier name for market trips", () => {
    expect(
      podOperatorDisplayName({
        lane: "market",
        supplierName: "AJIO",
        driverName: "Ravi",
      }),
    ).toBe("AJIO");
  });
});
