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

/** Matches trip-documents + vehicle-documents bucket limits (10 MB). */
export const VAULT_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const VAULT_DOC_MAX_MB = VAULT_DOC_MAX_BYTES / (1024 * 1024);
export const VAULT_DOC_TYPES_LABEL = "PDF, JPEG, PNG, WebP";
export const VAULT_DOC_LIMIT_HINT = `${VAULT_DOC_TYPES_LABEL} · ${VAULT_DOC_MAX_MB} MB max per file`;
export const VAULT_DOC_PICKER_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const VAULT_OK_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const VAULT_OK_EXT = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

export function isSupportedVaultDocument(file: {
  name?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): boolean {
  const mime = (file.mimeType ?? "").toLowerCase().trim();
  if (mime) return VAULT_OK_MIME.has(mime);
  const fileName = file.fileName ?? file.name ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ext) return true;
  return VAULT_OK_EXT.has(ext);
}

/** Returns an error string when any picked file is too large or unsupported. */
export function vaultPickerRejectionMessage(
  assets: {
    name?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }[],
): string | null {
  if (assets.length === 0) return null;
  const oversized = assets.filter(
    (asset) => typeof asset.size === "number" && asset.size > VAULT_DOC_MAX_BYTES,
  );
  if (oversized.length > 0) {
    const names = oversized
      .map((asset) => asset.fileName?.trim() || asset.name?.trim() || "A file")
      .join(", ");
    return `${names} ${oversized.length === 1 ? "exceeds" : "exceed"} ${VAULT_DOC_MAX_MB} MB. Each file must be ${VAULT_DOC_MAX_MB} MB or smaller.`;
  }
  const unsupported = assets.filter((asset) => !isSupportedVaultDocument(asset));
  if (unsupported.length > 0) {
    const names = unsupported
      .map((asset) => asset.fileName?.trim() || asset.name?.trim() || "A file")
      .join(", ");
    return `${names} ${unsupported.length === 1 ? "is" : "are"} not supported. Use ${VAULT_DOC_TYPES_LABEL}.`;
  }
  return null;
}

export function canAddMoreTripDocs(
  doc: Pick<TripDocItem, "category" | "docSource" | "id"> | null | undefined,
): boolean {
  if (!doc) return false;
  if (
    doc.category === "vehicle" ||
    doc.docSource === "vehicle" ||
    doc.id === "vehicle-documents"
  ) {
    return true;
  }
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
