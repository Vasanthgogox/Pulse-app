import {
  parseLrFieldValues,
  parseLrFieldsFromOcrResult,
  preferredLrDocumentNumber,
  serializeLrFieldValues,
  isLrFieldsMetaPath,
} from "../lrDocumentOcr.util";

describe("parseLrFieldsFromOcrResult", () => {
  it("reads lr_number and date from a POD-style extraction", () => {
    expect(
      parseLrFieldsFromOcrResult({
        kind: "pod_document",
        extraction: {
          header: {
            lr_number: { value: "BHD-4026", confidence: 0.9 },
            date: { value: "28-08-2026", confidence: 0.8 },
          },
        },
      }),
    ).toEqual({ lrNumber: "BHD-4026", lrDate: "28-08-2026" });
  });

  it("reads nested OCROutput.extraction.header", () => {
    expect(
      parseLrFieldsFromOcrResult({
        extraction: {
          extraction: {
            header: {
              lr_number: { value: "AG259" },
              date: { value: "04-09-2026 18:00" },
            },
          },
        },
      }),
    ).toEqual({ lrNumber: "AG259", lrDate: "04-09-2026 18:00" });
  });

  it("reads the first pods[].header when present", () => {
    expect(
      parseLrFieldsFromOcrResult({
        extraction: {
          pods: [
            {
              header: {
                lr_number: "LSC589489",
                date: "03-Sep-26",
              },
            },
          ],
        },
      }),
    ).toEqual({ lrNumber: "LSC589489", lrDate: "03-Sep-26" });
  });
});

describe("preferredLrDocumentNumber", () => {
  it("keeps the number typed in Confirm upload over OCR", () => {
    expect(preferredLrDocumentNumber("AI3583", "AI 3583")).toBe("AI3583");
  });

  it("uses OCR when the user left the field blank", () => {
    expect(preferredLrDocumentNumber("  ", "BHD-4026")).toBe("BHD-4026");
  });
});

describe("parseLrFieldValues / serializeLrFieldValues", () => {
  it("keeps a plain LR number as the number", () => {
    expect(parseLrFieldValues("AI3583")).toEqual({
      lrNumber: "AI3583",
      date: "",
      invoice: "",
    });
  });

  it("round-trips date and invoice beside the LR number", () => {
    const stored = serializeLrFieldValues({
      lrNumber: "AI3583",
      date: "03-09-2026",
      invoice: "INV-12",
    });
    expect(parseLrFieldValues(stored)).toEqual({
      lrNumber: "AI3583",
      date: "03-09-2026",
      invoice: "INV-12",
    });
  });

  it("stores a number-only value as plain text", () => {
    expect(
      serializeLrFieldValues({ lrNumber: "AI3583", date: "", invoice: "" }),
    ).toBe("AI3583");
  });
});

describe("lr fields metadata path", () => {
  it("detects the typed-number fields file", () => {
    expect(isLrFieldsMetaPath("trip-1/lr/fields.json")).toBe(true);
    expect(isLrFieldsMetaPath("trip-1/lr/scan.pdf")).toBe(false);
    expect(isLrFieldsMetaPath(undefined, "lr-fields.json")).toBe(true);
  });
});
