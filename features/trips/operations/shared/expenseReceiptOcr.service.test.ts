import {
  buildReceiptNotes,
  inferCityFromAddress,
  normalizeCity,
  parseIndianAmount,
  parseLiters,
} from "./expenseReceiptOcr.parse.util";
import { normalizeExpenseReceiptParsedForTest, resolveOcrAmount } from "./expenseReceiptOcr.service";

describe("expenseReceiptOcr.parse.util", () => {
  it("parses Rs-prefixed Indian amounts", () => {
    expect(parseIndianAmount("Rs.4000.00")).toBe(4000);
    expect(parseIndianAmount("Rs 93.02")).toBeCloseTo(93.02);
  });

  it("parses volume strings with L suffix", () => {
    expect(parseLiters("43.00L")).toBe(43);
    expect(parseLiters("43.00 L")).toBe(43);
  });

  it("extracts city from MC ROAD THANJAVUR address lines", () => {
    expect(inferCityFromAddress("MC ROAD THANJAVUR")).toBe("THANJAVUR");
    expect(normalizeCity("Tamil Nadu")).toBeNull();
  });

  it("builds fuel receipt notes from HP-style fields", () => {
    const notes = buildReceiptNotes(
      {
        bill_no: "419296-ORGNL",
        date: "25/08/2025",
        rate_per_liter: 93.02,
        volume: "43.00L",
        density: "813kg/m3",
        preset: 4000,
        fp_id: "1",
        nozzle_no: "1",
        brand: "HPCL",
      },
      null,
    );

    expect(notes).toContain("Bill 419296-ORGNL");
    expect(notes).toContain("25/08/2025");
    expect(notes).toContain("Rate ₹93.02/L");
    expect(notes).toContain("43 L");
    expect(notes).toContain("HPCL");
  });
});

describe("normalizeExpenseReceiptParsedForTest", () => {
  it("normalizes HP fuel bill JSON into form fields", () => {
    const result = normalizeExpenseReceiptParsedForTest({
      vendor_name: { value: "BR AGENCIES", confidence: 0.92 },
      brand: { value: "HPCL", confidence: 0.9 },
      address: { value: "MC ROAD THANJAVUR", confidence: 0.88 },
      sale: { value: 4000, confidence: 0.95 },
      volume: { value: "43.00L", confidence: 0.93 },
      rate_per_liter: { value: 93.02, confidence: 0.9 },
      bill_no: { value: "419296-ORGNL", confidence: 0.94 },
      date: { value: "25/08/2025", confidence: 0.9 },
      density: { value: "813kg/m3", confidence: 0.85 },
      preset: { value: 4000, confidence: 0.8 },
      fp_id: { value: "1", confidence: 0.7 },
      nozzle_no: { value: "1", confidence: 0.7 },
      bill_kind: { value: "fuel", confidence: 0.95 },
    });

    expect(resolveOcrAmount(result)).toBe(4000);
    expect(result.liters?.value).toBe(43);
    expect(result.vendorName?.value).toBe("BR AGENCIES");
    expect(result.city?.value).toBe("THANJAVUR");
    expect(result.notes?.value).toContain("Bill 419296-ORGNL");
    expect(result.notes?.value).toContain("43 L");
    expect(result.detectedBillKind?.value).toBe("fuel");
  });

  it("maps sale alias when amount_inr is missing", () => {
    const result = normalizeExpenseReceiptParsedForTest({
      sale: { value: "Rs.4000.00", confidence: 0.9 },
      volume: { value: 43, confidence: 0.88 },
    });

    expect(resolveOcrAmount(result)).toBe(4000);
    expect(result.liters?.value).toBe(43);
  });
});
