import {
  buildEwayBillStripRows,
  ewayBillFieldsStoragePath,
  isEwayBillMetaPath,
  parseEwayFieldValues,
  serializeEwayFieldValues,
} from "../ewayBillFields.util";

describe("parseEwayFieldValues", () => {
  it("reads a plain e-way number", () => {
    expect(parseEwayFieldValues("202274977039")).toEqual({
      ewayNo: "202274977039",
      validTill: "",
      docNo: "",
    });
  });

  it("reads JSON saved from the pencil editor", () => {
    expect(
      parseEwayFieldValues(
        serializeEwayFieldValues({
          ewayNo: "202274977039",
          validTill: "03-Sep-26",
          docNo: "262718182",
        }),
      ),
    ).toEqual({
      ewayNo: "202274977039",
      validTill: "03-Sep-26",
      docNo: "262718182",
    });
  });
});

describe("isEwayBillMetaPath", () => {
  it("detects the metadata-only fields file", () => {
    expect(isEwayBillMetaPath("trip-1/eway_bill/fields.json")).toBe(true);
    expect(isEwayBillMetaPath("trip-1/eway_bill/abc.pdf")).toBe(false);
    expect(isEwayBillMetaPath(undefined, "eway-fields.json")).toBe(true);
  });
});

describe("buildEwayBillStripRows", () => {
  it("shows typed fields and uses the LR for preview when no e-way file exists", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldValues({
          ewayNo: "202274977039",
          validTill: "2026-09-03",
          docNo: "262718182",
        }),
        storagePath: ewayBillFieldsStoragePath("trip-1"),
      },
      lrDoc: {
        id: "lr",
        label: "LR Document",
        type: "PDF",
        status: "Uploaded",
        storagePath: "trip-1/lr/scan.pdf",
        documentNumber: "LR-9",
      },
    });
    expect(rows).toEqual([
      {
        id: "eway_bill",
        ewayNo: "202274977039",
        validTill: "03-Sep-26",
        docNo: "262718182",
        canView: true,
      },
    ]);
  });

  it("falls back to the LR number when doc no was not typed", () => {
    const rows = buildEwayBillStripRows({
      lrDoc: {
        id: "lr",
        label: "LR Document",
        type: "PDF",
        status: "Uploaded",
        storagePath: "trip-1/lr/scan.pdf",
        documentNumber: "BHD-4026",
      },
    });
    expect(rows[0]).toMatchObject({
      ewayNo: "—",
      validTill: "—",
      docNo: "BHD-4026",
      canView: true,
    });
  });
});
