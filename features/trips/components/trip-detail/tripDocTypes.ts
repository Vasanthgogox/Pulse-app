/**
 * Presentation-layer types for the trip document vault.
 * Defined here (not in TripDetailFinanceView) so the hook layer can import
 * them without creating an inverted dependency on a UI component.
 */

export type DocCategory = "vehicle" | "trip" | "driver";

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
}
