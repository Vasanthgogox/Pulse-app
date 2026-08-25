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
  formatIndianVehicleNumberInput,
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

/** Fixed AA 00 AA 0000 plates only (e.g. TN 17 AS 2202). */
const VALID_PLATES = [
  "TN17AS2202",
  "TN01CM2026",
  "MH12DE1433",
  "KA05MG1234",
  "HR26DK8337",
  "UP32AB1234",
];

describe("Indian vehicle plate entry (fixed AA 00 AA 0000)", () => {
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

  it.each([
    "",
    "TN",
    "TN17",
    "TN17AS",
    "TN17AS220",
    "TN1AS2202",
    "TN17A2202",
    "ABCD",
    "12345",
    "22BH1234AB",
    "TN01C2026",
    "TN091234",
  ])("treats incomplete or non-fixed %s as invalid", (partial) => {
    expect(isIndianVehiclePlateValid(partial)).toBe(false);
    if (partial.length === 0) {
      expect(validateIndianVehicleNumber(partial)).toBe("Required");
    } else {
      expect(validateIndianVehicleNumber(partial)).toMatch(/valid vehicle number/i);
    }
  });

  it("formats input with fixed spacing", () => {
    expect(formatIndianVehicleNumberInput("tn17as2202")).toBe("TN 17 AS 2202");
    expect(formatIndianVehicleNumberInput("TN17")).toBe("TN 17");
    expect(formatIndianVehicleNumberInput("TN17AS")).toBe("TN 17 AS");
  });

  it("formats stored plates for display and leaves non-Indian values alone", () => {
    expect(formatIndianVehicleNumber("TN17AS2202")).toBe("TN 17 AS 2202");
    expect(formatIndianVehicleNumber("tn 17 as 2202")).toBe("TN 17 AS 2202");
    expect(formatIndianVehicleNumber("TRK-SEED-001")).toBe("TRK-SEED-001");
  });

  it("marks every segment done for a complete plate", () => {
    const guide = getIndianVehicleSegmentGuide("TN 17 AS 2202");
    expect(guide.map((s) => s.label)).toEqual(["AA", "00", "AA", "0000"]);
    expect(guide.every((s) => s.done)).toBe(true);
  });

  it("switches keypad by fixed segment", () => {
    expect(getIndianVehicleKeyboardKind("")).toBe("letters");
    expect(getIndianVehicleKeyboardKind("TN")).toBe("numbers");
    expect(getIndianVehicleKeyboardKind("TN17")).toBe("letters");
    expect(getIndianVehicleKeyboardKind("TN17AS")).toBe("numbers");
    expect(getIndianVehicleAllowedNext("TN")).toEqual({
      letters: false,
      digits: true,
    });
    expect(getIndianVehicleAllowedNext("TN17")).toEqual({
      letters: true,
      digits: false,
    });
    expect(getIndianVehicleAllowedNext("TN17AS")).toEqual({
      letters: false,
      digits: true,
    });
  });

  it("rejects a letter during the district segment", () => {
    expect(appendIndianVehicleChar("TN 1", "A")).toBe("TN 1");
    expect(appendIndianVehicleChar("TN 17", "A")).toBe("TN 17 A");
  });

  it("hints match the fixed mask", () => {
    expect(getIndianVehicleFormatHint("")).toMatch(/state code/i);
    expect(getIndianVehicleFormatHint("TN")).toMatch(/district/i);
    expect(getIndianVehicleFormatHint("TN17")).toMatch(/series/i);
    expect(getIndianVehicleFormatHint("TN17AS")).toMatch(/4 digits/i);
  });
});
