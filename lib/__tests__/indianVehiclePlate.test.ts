import {
  appendIndianVehicleChar,
  applyIndianVehicleKeystroke,
  getIndianVehicleAllowedNext,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardKind,
  getIndianVehicleSegmentGuide,
  isIndianVehiclePlateValid,
} from "@/lib/indianVehicleInput.util";
import {
  formatIndianVehicleNumber,
  normalizeVehicleNumberForMatch,
} from "@/lib/format";
import { validateIndianVehicleNumber } from "@/lib/validation";

/** Simulate the custom keypad: one character at a time through the filter. */
function typeOut(plate: string): string {
  let value = "";
  for (const ch of normalizeVehicleNumberForMatch(plate)) {
    value = appendIndianVehicleChar(value, ch);
  }
  return value;
}

/**
 * Indian plates are variable-length: the series block may be absent, 1, 2 or 3
 * letters, and the district may be 1-3 digits. The old fixed 2-2-2-4 mask
 * silently dropped keystrokes for every shape except LL NN LL NNNN.
 */
const VALID_PLATES = [
  "TN01CM2026", // standard 2-letter series
  "TN01C2026", // single-letter series
  "TN091234", // no series (older plate)
  "UP32ABC1234", // 3-letter series
  "TN100AB1234", // 3-digit district
  "DL8CAF5031", // 1-digit district + 3-letter series
  "22BH1234AB", // Bharat series
  "MH12DE1433",
  "KA05MG1234",
  "HR26DK8337",
];

describe("Indian vehicle plate entry", () => {
  it.each(VALID_PLATES)("types %s without dropping characters", (plate) => {
    const typed = typeOut(plate);
    expect(normalizeVehicleNumberForMatch(typed)).toBe(plate);
    expect(isIndianVehiclePlateValid(typed)).toBe(true);
  });

  it.each(VALID_PLATES)("accepts %s pasted in one go", (plate) => {
    const pasted = applyIndianVehicleKeystroke(plate);
    expect(normalizeVehicleNumberForMatch(pasted)).toBe(plate);
    expect(isIndianVehiclePlateValid(pasted)).toBe(true);
  });

  it.each(VALID_PLATES)("validateIndianVehicleNumber accepts %s", (plate) => {
    expect(validateIndianVehicleNumber(plate)).toBeNull();
    expect(validateIndianVehicleNumber(formatIndianVehicleNumber(plate))).toBeNull();
  });

  it.each(["", "TN", "TN01", "TN01CM", "ABCD", "12345", "22BH1234"])(
    "treats incomplete %s as invalid",
    (partial) => {
      expect(isIndianVehiclePlateValid(partial)).toBe(false);
      if (partial.length === 0) {
        expect(validateIndianVehicleNumber(partial)).toBe("Required");
      } else {
        expect(validateIndianVehicleNumber(partial)).toMatch(/valid vehicle number/i);
      }
    },
  );

  it("formats stored plates for display and leaves non-Indian values alone", () => {
    expect(formatIndianVehicleNumber("TN25CM7892")).toBe("TN 25 CM 7892");
    expect(formatIndianVehicleNumber("tn 25 cm 7892")).toBe("TN 25 CM 7892");
    expect(formatIndianVehicleNumber("TRK-SEED-001")).toBe("TRK-SEED-001");
  });

  it("drops the series chip once the plate clearly has none", () => {
    const guide = getIndianVehicleSegmentGuide("TN 09 1234");
    expect(guide.map((s) => s.done)).toEqual([true, true, false, true]);
  });

  it("marks every segment done for a complete standard plate", () => {
    const guide = getIndianVehicleSegmentGuide("TN 01 CM 2026");
    expect(guide.every((s) => s.done)).toBe(true);
  });

  it("keeps the number pad after one district digit so TN 09… can be typed", () => {
    expect(getIndianVehicleKeyboardKind("TN0")).toBe("numbers");
    expect(getIndianVehicleAllowedNext("TN0")).toEqual({
      letters: true,
      digits: true,
    });
    expect(appendIndianVehicleChar("TN 0", "9")).toBe("TN 09");
  });

  it("still allows a second series letter after the first (not locked to one)", () => {
    expect(getIndianVehicleAllowedNext("TN0I")).toEqual({
      letters: true,
      digits: true,
    });
    expect(appendIndianVehicleChar("TN 0 I", "M")).toBe("TN 0 IM");
    expect(appendIndianVehicleChar("TN 0 I", "1")).toBe("TN 0 I 1");
    expect(getIndianVehicleSegmentGuide("TN 0 I").map((s) => s.label)).toEqual([
      "AA",
      "00",
      "AA",
      "0000",
    ]);
    expect(getIndianVehicleFormatHint("TN 0 I")).toMatch(/series letters/i);
  });

  it("prefers letters once a typical 2-digit district is filled", () => {
    expect(getIndianVehicleKeyboardKind("TN09")).toBe("letters");
  });
});
