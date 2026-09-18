/**
 * Shared document-row derivation — used by the Trip Detail document table,
 * the Compliance trip card, the list-level table's expandable rows, and the
 * document review sheet, so all four surfaces agree on exactly the same
 * Missing/Pending/Verified/Rejected classification from one place.
 */
import {
  COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  type ComplianceDocumentRow,
  type ComplianceDocumentStatus,
  type ComplianceEntityDocument,
} from "@/features/tripCompliance/tripCompliance.types";
import { isEntityDocumentSlotVerified } from "@/features/tripCompliance/utils/complianceChecklist.util";

export const DOC_TYPE_LABEL: Record<string, string> = {
  lr: "LR",
  invoice: "Invoice",
  eway_bill: "E-way Bill",
  pod: "POD",
  manifest: "Trip Manifest",
  loading_slip: "Loading Slip",
  insurance: "Insurance",
  rc: "RC",
  fitness: "FC",
  permit: "Permit",
  pollution: "Pollution",
  road_tax: "Tax",
  license: "Driving License",
  aadhaar: "Aadhaar",
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
  entityDoc: ComplianceEntityDocument | null;
};

function rowForType(
  type: string,
  required: boolean,
  byType: Map<string | null, ComplianceDocumentRow>,
): ComplianceDocRow {
  const doc = byType.get(type) ?? null;
  return { key: type, type, required, status: doc ? doc.status : "missing", doc, entityDoc: null };
}

function latestEntityDoc(documents: ComplianceEntityDocument[]): ComplianceEntityDocument | null {
  const usable = documents.filter((doc) => doc.status !== "replaced");
  const list = usable.length > 0 ? usable : documents;
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

function entityRowStatus(doc: ComplianceEntityDocument | null, now = new Date()): ComplianceDocRowStatus {
  if (!doc) return "missing";
  if (doc.status === "rejected") return "rejected";
  if (doc.status === "pending") return "pending";
  if (isEntityDocumentSlotVerified(doc, now)) return "verified";
  return "pending";
}

/** Required vehicle or driver types from `entity_documents`. */
export function deriveEntityComplianceRows(
  types: readonly string[],
  documents: ComplianceEntityDocument[],
  now = new Date(),
): ComplianceDocRow[] {
  const byType = new Map<string, ComplianceEntityDocument[]>();
  for (const doc of documents) {
    const list = byType.get(doc.doc_type) ?? [];
    list.push(doc);
    byType.set(doc.doc_type, list);
  }
  return types.map((type) => {
    const entityDoc = latestEntityDoc(byType.get(type) ?? []);
    return {
      key: type,
      type,
      required: true,
      status: entityRowStatus(entityDoc, now),
      doc: null,
      entityDoc,
    };
  });
}

/** Required trip types first, then other trip upload options only. */
export function deriveComplianceDocumentRows(documents: ComplianceDocumentRow[]): ComplianceDocRow[] {
  const byType = new Map(documents.map((d) => [d.document_type, d]));
  const requiredRows = REQUIRED_COMPLIANCE_DOCUMENT_TYPES.map((type) => rowForType(type, true, byType));
  const otherRows = COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES.map((type) => rowForType(type, false, byType));
  return [...requiredRows, ...otherRows];
}

/** Progress is always measured against required documents only. */
export function complianceProgress(rows: ComplianceDocRow[]): { verified: number; total: number } {
  const required = rows.filter((r) => r.required);
  return { verified: required.filter((r) => r.status === "verified").length, total: required.length };
}
