import { parseLrFieldsFromOcrResult } from "../lrDocumentOcr.util";

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
