import {
  INDENT_VEHICLE_COUNT_CHIPS,
  INDENT_VEHICLE_COUNT_ERROR,
  INDENT_VEHICLE_COUNT_MAX,
  draftVehicleCountStorageKey,
  indentShareSuccessPath,
  isValidIndentVehicleCount,
  parseIndentVehicleCount,
  resolvedDraftVehicleCount,
  sanitizeIndentVehicleCountInput,
} from "@/features/indents/utils/indentVehicleCount.util";

describe("indent vehicle count validation", () => {
  const valid = ["1", "2", "10", "50"] as const;

  it.each(valid)("%s is valid", (value) => {
    expect(isValidIndentVehicleCount(value)).toBe(true);
    expect(parseIndentVehicleCount(value)).toBe(Number(value));
  });

  it("rejects 0 and 51 as out of range without clamping", () => {
    expect(parseIndentVehicleCount("0")).toBe(0);
    expect(parseIndentVehicleCount("51")).toBe(51);
    expect(isValidIndentVehicleCount("0")).toBe(false);
    expect(isValidIndentVehicleCount("51")).toBe(false);
    expect(INDENT_VEHICLE_COUNT_MAX).toBe(50);
  });

  it.each([
    ["-1", "negative"],
    ["1.5", "decimal"],
    ["", "empty"],
    ["abc", "letters"],
    ["12a", "letters mixed"],
    ["  ", "whitespace"],
  ])("%s (%s) is invalid", (value) => {
    expect(isValidIndentVehicleCount(value)).toBe(false);
    expect(parseIndentVehicleCount(value)).toBeNull();
  });

  it("exposes chips 2–10 and a single error string", () => {
    expect([...INDENT_VEHICLE_COUNT_CHIPS]).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(INDENT_VEHICLE_COUNT_ERROR).toMatch(/1 to 50/);
  });
});

describe("sanitizeIndentVehicleCountInput", () => {
  it("strips letters without turning 1.5 into 15", () => {
    expect(sanitizeIndentVehicleCountInput("abc")).toBe("");
    expect(sanitizeIndentVehicleCountInput("1.5")).toBe("1.5");
    expect(sanitizeIndentVehicleCountInput("-1")).toBe("-1");
    expect(sanitizeIndentVehicleCountInput("12x")).toBe("12");
  });
});

describe("indent share success path", () => {
  it("opens the indent for a single vehicle", () => {
    expect(indentShareSuccessPath(1, "abc")).toBe("/indent/abc");
  });

  it("opens Trips filtered to the INDENT stage for N > 1 — Loads no longer shows My Load", () => {
    expect(indentShareSuccessPath(2, "abc")).toBe("/(tabs)/trips?stage=indent");
    expect(indentShareSuccessPath(5, "abc")).toBe("/(tabs)/trips?stage=indent");
    expect(indentShareSuccessPath(50, "abc")).toBe("/(tabs)/trips?stage=indent");
  });
});

describe("draft vehicle count storage", () => {
  it("keys count by draft id, not as N rows", () => {
    expect(draftVehicleCountStorageKey("draft-1")).toBe(
      "indent_vehicle_count_draft-1",
    );
  });

  it("reopens Vehicles = 5 from stored draft metadata", () => {
    expect(resolvedDraftVehicleCount("5")).toBe("5");
    expect(resolvedDraftVehicleCount("1")).toBe("1");
    expect(resolvedDraftVehicleCount(null)).toBe("1");
    expect(resolvedDraftVehicleCount("51")).toBe("1");
  });
});
