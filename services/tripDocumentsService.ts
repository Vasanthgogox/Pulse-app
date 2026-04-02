/**
 * Trip documents (e.g. POD) — list and upload for a trip.
 * Storage: trip-documents bucket, path {tripId}/{uuid}.{ext}.
 * Table: trip_documents (trip_id, file_name, storage_path, mime_type, size_bytes, uploaded_by).
 *
 * Complexity: O(n) where n = documents for this trip. Primary: indexed DB lookup by trip_id.
 * If DB returns no rows (e.g. RLS blocks supplier or insert failed), fallback: storage list
 * by prefix {tripId}/ — O(k) for k files in that folder. See docs/TRIP_DOCUMENTS_RLS_AND_STORAGE.md
 * for required RLS and storage policies so suppliers can see driver uploads.
 */
import { supabase } from "@/lib/supabase";

const BUCKET = "trip-documents";

/** Generate a UUID v4-style string (React Native has no global crypto). */
function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface TripDocumentRow {
  id: string;
  trip_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface UploadTripDocumentResult {
  doc: TripDocumentRow | null;
  error: Error | null;
}

const SIGNED_URL_EXPIRY_SEC = 3600;

/**
 * Get a URL to view a trip document (POD). Uses a signed URL so it works for private buckets.
 * Use for "View" in the app.
 */
export async function getDocumentViewUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase()
    .storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);
  if (error || !data?.signedUrl) {
    const { data: publicData } = supabase().storage.from(BUCKET).getPublicUrl(storagePath);
    return publicData.publicUrl;
  }
  return data.signedUrl;
}

/**
 * List documents for a trip (e.g. POD). Used to show count and enable Complete.
 * 1) Reads from trip_documents table (indexed by trip_id) — O(1) query.
 * 2) If table returns no rows, fallback: list storage prefix {tripId}/ so POD still
 *    shows when the file exists in storage but the table row is missing (e.g. RLS or insert failure).
 *    Storage list by prefix is O(k) where k = files in that folder; typically 1–5.
 */
export async function getDocumentsByTripId(
  tripId: string
): Promise<{ documents: TripDocumentRow[]; error: Error | null }> {
  const { data, error } = await supabase()
    .from("trip_documents")
    .select("id, trip_id, file_name, storage_path, mime_type, uploaded_at")
    .eq("trip_id", tripId)
    .order("uploaded_at", { ascending: false });
  let tableError: Error | null = null;
  let rows: Pick<
    TripDocumentRow,
    "id" | "trip_id" | "file_name" | "storage_path" | "mime_type" | "uploaded_at"
  >[] = [];
  if (error) {
    // RLS or other SELECT error — attempt storage fallback below before surfacing error.
    tableError = new Error(error.message);
  } else {
    rows = (data ?? []) as Pick<
      TripDocumentRow,
      "id" | "trip_id" | "file_name" | "storage_path" | "mime_type" | "uploaded_at"
    >[];
    if (rows.length > 0) return { documents: rows as TripDocumentRow[], error: null };
  }

  // Fallback: list storage folder for this trip so dispatcher/supplier can still preview POD
  const { data: listData, error: listError } = await supabase()
    .storage
    .from(BUCKET)
    .list(tripId, { limit: 50, sortBy: { column: "updated_at", order: "desc" } });
  if (listError || !listData || listData.length === 0) {
    return {
      documents: [],
      error: tableError ?? (listError ? new Error(listError.message) : null),
    };
  }

  const fallbackRows: TripDocumentRow[] = listData
    .filter((f) => f.name && /\./.test(f.name))
    .map((f) => {
      const fileName = f.name.includes("/") ? f.name.split("/").pop()! : f.name;
      const storagePath = f.name.includes("/") ? f.name : `${tripId}/${f.name}`;
      const fileWithMeta = f as { id?: string; updated_at?: string };
      return {
        id: fileWithMeta.id ?? `storage-${tripId}-${fileName}`,
        trip_id: tripId,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: null,
        size_bytes: null,
        uploaded_at: fileWithMeta.updated_at ?? new Date().toISOString(),
        uploaded_by: null,
      };
    })
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
  return { documents: fallbackRows, error: null };
}

/**
 * Upload a POD file for a trip. Caller provides file bytes and metadata.
 * uploaded_by should be the current user (auth.uid()) so the connected user is recorded.
 */
export async function uploadTripDocument(
  tripId: string,
  uploadedBy: string,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string }
): Promise<UploadTripDocumentResult> {
  const ext = file.fileName.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tripId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file.arrayBuffer, {
      contentType: file.mimeType || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return {
      doc: null,
      error: new Error(uploadError.message),
    };
  }

  const { data: row, error: insertError } = await supabase()
    .from("trip_documents")
    .insert({
      trip_id: tripId,
      file_name: file.fileName,
      storage_path: path,
      mime_type: file.mimeType || null,
      size_bytes: file.arrayBuffer.byteLength,
      uploaded_by: uploadedBy,
    })
    .select("id, trip_id, file_name, storage_path, mime_type, size_bytes, uploaded_at, uploaded_by")
    .single();

  if (insertError) {
    return {
      doc: null,
      error: new Error(insertError.message),
    };
  }

  return { doc: row as TripDocumentRow, error: null };
}
