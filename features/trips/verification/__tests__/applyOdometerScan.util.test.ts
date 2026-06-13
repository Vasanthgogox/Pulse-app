import {
  normalizeOdometerRaw,
  odometerReadingsEquivalent,
  buildOdometerScanConfirmState,
  reconcileOdometerScanWithReading,
} from "../applyOdometerScan.util";

describe("normalizeOdometerRaw", () => {
  it("strips commas and whitespace", () => {
    expect(normalizeOdometerRaw(" 128,456 ")).toBe("128456");
  });

  it("normalizes decimals to one place", () => {
    expect(normalizeOdometerRaw("128456.04")).toBe("128456");
  });

  it("returns empty for blank input", () => {
    expect(normalizeOdometerRaw("")).toBe("");
    expect(normalizeOdometerRaw("   ")).toBe("");
  });
});

describe("odometerReadingsEquivalent", () => {
  it("treats comma-formatted values as equal", () => {
    expect(odometerReadingsEquivalent("128456", "128,456")).toBe(true);
  });

  it("returns false when values differ", () => {
    expect(odometerReadingsEquivalent("128456", "128457")).toBe(false);
  });
});

describe("buildOdometerScanConfirmState", () => {
  it("carries pending KM for apply flow", () => {
    const state = buildOdometerScanConfirmState("128456", "128000", 1.2);
    expect(state.phase).toBe("confirm");
    expect(state.pendingKm).toBe("128456");
  });
});

describe("reconcileOdometerScanWithReading", () => {
  const appliedComplete = {
    phase: "complete" as const,
    message: "128456 KM applied · review and save",
    appliedFields: ["KM reading"],
    pendingKm: null,
    stepIndex: 3,
    processingSec: 1.1,
  };

  it("re-enables confirm when edited value differs from OCR", () => {
    const next = reconcileOdometerScanWithReading(appliedComplete, "128456", "128000");
    expect(next.phase).toBe("confirm");
    expect(next.pendingKm).toBe("128456");
    expect(next.appliedFields).toEqual([]);
  });

  it("returns confirmed complete when values match again", () => {
    const confirm = reconcileOdometerScanWithReading(appliedComplete, "128456", "128000");
    const next = reconcileOdometerScanWithReading(confirm, "128456", "128456");
    expect(next.phase).toBe("complete");
    expect(next.pendingKm).toBeNull();
    expect(next.appliedFields).toEqual(["KM reading"]);
  });

  it("ignores reconcile while scan is still analyzing", () => {
    const analyzing = {
      phase: "analyzing" as const,
      message: "Reading…",
      stepIndex: 1,
    };
    const next = reconcileOdometerScanWithReading(analyzing, "128456", "999");
    expect(next).toBe(analyzing);
  });
});
