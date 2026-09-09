import {
  buildEwayBillStripRows,
  ewayBillFieldsStoragePath,
  isEwayBillMetaPath,
  parseEwayFieldValues,
  serializeEwayFieldEntries,
  serializeEwayFieldValues,
} from "../ewayBillFields.util";

describe("parseEwayFieldValues", () => {
  it("reads a plain e-way number", () => {
    expect(parseEwayFieldValues("202274977039")).toEqual({
      ewayNo: "202274977039",
      createdDate: "",
      validTill: "",
      docNo: "",
    });
  });

  it("reads JSON saved from the pencil editor", () => {
    expect(
      parseEwayFieldValues(
        serializeEwayFieldValues({
          ewayNo: "202274977039",
          createdDate: "01-Sep-26",
          validTill: "03-Sep-26",
          docNo: "262718182",
        }),
      ),
    ).toEqual({
      ewayNo: "202274977039",
      createdDate: "01-Sep-26",
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
  it("shows typed e-way fields without using an LR document", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldValues({
          ewayNo: "202274977039",
          createdDate: "2026-09-01",
          validTill: "2026-09-03",
          docNo: "262718182",
        }),
        storagePath: ewayBillFieldsStoragePath("trip-1"),
      },
    });
    expect(rows).toEqual([
      {
        id: "eway_bill-entry-0",
        entryIndex: 0,
        ewayNo: "202274977039",
        createdDate: "01-Sep-26",
        validTill: "03-Sep-26",
        docNo: "262718182",
        canView: false,
      },
    ]);
  });

  it("does not copy the LR number into e-way columns", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Pending",
      },
    });
    expect(rows[0]).toMatchObject({
      ewayNo: "—",
      createdDate: "—",
      validTill: "—",
      docNo: "—",
      canView: false,
    });
  });

  it("shows one table row for each saved e-way number", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldEntries([
          {
            ewayNo: "111111111111",
            createdDate: "01-Sep-26",
            validTill: "03-Sep-26",
            docNo: "LR-1",
          },
          {
            ewayNo: "222222222222",
            createdDate: "02-Sep-26",
            validTill: "04-Sep-26",
            docNo: "LR-2",
          },
        ]),
        storagePath: ewayBillFieldsStoragePath("trip-1"),
      },
    });
    expect(rows.map((row) => row.ewayNo)).toEqual([
      "111111111111",
      "222222222222",
    ]);
    expect(rows[1]).toMatchObject({
      entryIndex: 1,
      createdDate: "02-Sep-26",
      validTill: "04-Sep-26",
      docNo: "LR-2",
    });
  });
});
