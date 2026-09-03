/**
 * Presentation-layer types for the trip document vault.
 * Defined here (not in TripDetailFinanceView) so the hook layer can import
 * them without creating an inverted dependency on a UI component.
 */

export type DocCategory = "vehicle" | "trip" | "driver" | "lr";

export interface TripDocFile {
  id: string;
  label: string;
  type: string;
  storagePath: string;
  documentId?: string;
}

export interface TripDocItem {
  id: string;
  label: string;
  type: string;
  status: "Verified" | "Uploaded" | "Pending";
  /** When set, preview modal can fetch and show the file (e.g. Driver POD from trip_documents). */
  storagePath?: string;
  /** Optional backend document id for future use (e.g. multiple PODs). */
  documentId?: string;
  /** Which storage bucket to resolve signed URLs from. Default: 'trip' (trip-documents bucket). */
  docSource?: "trip" | "vehicle";
  /** Optional grouping metadata for downstream preview behavior. */
  category?: DocCategory;
  /** Extra files nested in this slot (one card, many uploads). */
  files?: TripDocFile[];
}

export function canAddMoreTripDocs(
  doc: Pick<TripDocItem, "category" | "docSource"> | null | undefined,
): boolean {
  if (!doc) return false;
  if (doc.docSource === "vehicle" || doc.category === "vehicle") return false;
  return doc.category === "lr" || doc.category === "trip" || doc.category === "driver";
}

function pathLooksLikePdf(value?: string | null): boolean {
  const path = (value ?? "").toLowerCase().split("?")[0];
  return path.endsWith(".pdf");
}

/** True when vault metadata, mime, filename, or storage path identifies a PDF. */
export function isPdfTripDoc(doc: {
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
} | null | undefined): boolean {
  if (!doc) return false;
  if ((doc.type ?? "").toUpperCase() === "PDF") return true;
  if ((doc.mimeType ?? "").toLowerCase().includes("pdf")) return true;
  if (pathLooksLikePdf(doc.fileName)) return true;
  return pathLooksLikePdf(doc.storagePath);
}
