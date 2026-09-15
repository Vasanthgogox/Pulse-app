/**
 * Shared document-row derivation — used by the Trip Detail document table,
 * the Compliance trip card, the list-level table's expandable rows, and the
 * document review sheet, so all four surfaces agree on exactly the same
 * Missing/Pending/Verified/Rejected classification from one place.
 */
import {
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  type ComplianceDocumentRow,
  type ComplianceDocumentStatus,
} from "@/features/tripCompliance/tripCompliance.types";

export const DOC_TYPE_LABEL: Record<string, string> = {
  lr: "LR",
  invoice: "Invoice",
  eway_bill: "E-way Bill",
  insurance: "Insurance",
  rc: "RC",
  pod: "POD",
  manifest: "Trip Manifest",
  loading_slip: "Loading Slip",
};

export function labelForDocType(type: string): string {
  return DOC_TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

export type ComplianceDocRowStatus = ComplianceDocumentStatus | "missing";

export type ComplianceDocRow = {
  key: string;
  type: string;
  required: boolean;
  status: ComplianceDocRowStatus;
  doc: ComplianceDocumentRow | null;
};

/** Required-type rows first (with synthesized "missing" rows), then any extra uploaded, non-required documents. */
export function deriveComplianceDocumentRows(documents: ComplianceDocumentRow[]): ComplianceDocRow[] {
  const byType = new Map(documents.map((d) => [d.document_type, d]));
  const requiredRows: ComplianceDocRow[] = REQUIRED_COMPLIANCE_DOCUMENT_TYPES.map((type) => {
    const doc = byType.get(type) ?? null;
    return { key: type, type, required: true, status: doc ? doc.status : "missing", doc };
  });
  const extraRows: ComplianceDocRow[] = documents
    .filter((d) => !REQUIRED_COMPLIANCE_DOCUMENT_TYPES.includes(d.document_type ?? ""))
    .map((d) => ({ key: d.id, type: d.document_type ?? "document", required: false, status: d.status, doc: d }));
  return [...requiredRows, ...extraRows];
}

/** Progress is always measured against required documents only. */
export function complianceProgress(rows: ComplianceDocRow[]): { verified: number; total: number } {
  const required = rows.filter((r) => r.required);
  return { verified: required.filter((r) => r.status === "verified").length, total: required.length };
}
