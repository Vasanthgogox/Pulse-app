import {
  deriveComplianceDocumentRows,
  complianceProgress,
  labelForDocType,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";

function doc(overrides: Partial<ComplianceDocumentRow>): ComplianceDocumentRow {
  return {
    id: overrides.id ?? "doc-1",
    trip_id: "trip-1",
    document_type: "lr",
    file_name: "f.pdf",
    storage_path: "path",
    uploaded_at: "2026-09-14",
    status: "pending",
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    ...overrides,
  };
}

describe("deriveComplianceDocumentRows", () => {
  it("synthesizes a missing row for every required type with no upload", () => {
    const rows = deriveComplianceDocumentRows([]);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
    expect(rows.map((r) => r.type)).toEqual(["lr", "invoice", "eway_bill", "insurance", "rc"]);
  });

  it("uses the real document's status when one exists for a required type", () => {
    const rows = deriveComplianceDocumentRows([doc({ document_type: "lr", status: "verified" })]);
    const lrRow = rows.find((r) => r.type === "lr");
    expect(lrRow?.status).toBe("verified");
    expect(lrRow?.doc?.status).toBe("verified");
  });

  it("appends non-required uploaded documents as extra, non-required rows", () => {
    const rows = deriveComplianceDocumentRows([doc({ id: "pod-1", document_type: "pod", status: "pending" })]);
    const podRow = rows.find((r) => r.type === "pod");
    expect(podRow?.required).toBe(false);
    expect(rows.filter((r) => r.required)).toHaveLength(5); // still all 5 required rows present (all missing)
  });
});

describe("complianceProgress", () => {
  it("counts only required rows, ignoring extras", () => {
    const rows = deriveComplianceDocumentRows([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "verified" }),
      doc({ id: "3", document_type: "pod", status: "verified" }), // not required — must not count
    ]);
    expect(complianceProgress(rows)).toEqual({ verified: 2, total: 5 });
  });

  it("is 0/5 when nothing is uploaded", () => {
    expect(complianceProgress(deriveComplianceDocumentRows([]))).toEqual({ verified: 0, total: 5 });
  });

  it("is 5/5 once every required type is verified", () => {
    const rows = deriveComplianceDocumentRows(
      ["lr", "invoice", "eway_bill", "insurance", "rc"].map((t, i) =>
        doc({ id: String(i), document_type: t, status: "verified" }),
      ),
    );
    expect(complianceProgress(rows)).toEqual({ verified: 5, total: 5 });
  });
});

describe("labelForDocType", () => {
  it("maps known types to friendly labels", () => {
    expect(labelForDocType("eway_bill")).toBe("E-way Bill");
    expect(labelForDocType("rc")).toBe("RC");
  });

  it("falls back to a humanized form of unknown types", () => {
    expect(labelForDocType("some_new_type")).toBe("some new type");
  });
});
