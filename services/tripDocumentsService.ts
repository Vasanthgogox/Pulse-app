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

/**
 * Postgres/PostgREST: table missing from DB or not in API schema cache (`supabase db push`).
 * When true after a successful storage upload, callers can treat POD as stored and use storage-only metadata.
 */
export function isTripDocumentsMetaTableUnavailable(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err?.message && !err?.code) return false;
  const m = String(err.message ?? "").toLowerCase();
  const code = String(err.code ?? "").toUpperCase();
  if (code === "42P01") return true;
  if (m.includes("schema cache")) return true;
  if (m.includes("could not find the table") && m.includes("trip_documents")) return true;
  if (m.includes("relation") && m.includes("trip_documents") && m.includes("does not exist"))
    return true;
  return false;
}

/** PostgREST: table not exposed / not in schema cache (HTTP 404 on /rest/v1/trip_documents). */
export function isTripDocumentsRestEndpointMissing(
  err: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").toUpperCase();
  if (code === "PGRST205") return true;
  if (err.status === 404) return true;
  if (isTripDocumentsMetaTableUnavailable(err)) return true;
  const m = String(err.message ?? "").toLowerCase();
  if (m.includes("trip_documents") && m.includes("not found")) return true;
  return false;
}

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

export interface UploadTripChatImageResult {
  fileName: string;
  mimeType: string | null;
  storagePath: string;
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
    if (isTripDocumentsMetaTableUnavailable(insertError)) {
      const now = new Date().toISOString();
      const syntheticId = `storage-meta-${randomUUID()}`;
      return {
        doc: {
          id: syntheticId,
          trip_id: tripId,
          file_name: file.fileName,
          storage_path: path,
          mime_type: file.mimeType || null,
          size_bytes: file.arrayBuffer.byteLength,
          uploaded_at: now,
          uploaded_by: uploadedBy,
        },
        error: null,
      };
    }
    return {
      doc: null,
      error: new Error(insertError.message),
    };
  }

  return { doc: row as TripDocumentRow, error: null };
}

/**
 * Upload a trip image for chat/progress updates only (non-POD).
 * Stores the file under a dedicated folder and does not create a trip_documents row.
 */
export async function uploadTripChatImage(
  tripId: string,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string },
): Promise<{ result: UploadTripChatImageResult | null; error: Error | null }> {
  const ext = file.fileName.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tripId}/chat/${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file.arrayBuffer, {
      contentType: file.mimeType || "image/jpeg",
      upsert: false,
    });
  if (uploadError) {
    return {
      result: null,
      error: new Error(uploadError.message),
    };
  }
  return {
    result: {
      fileName: file.fileName,
      mimeType: file.mimeType || null,
      storagePath: path,
    },
    error: null,
  };
}

/**
 * Remove a POD file from storage and the trip_documents row (when present).
 * Synthetic IDs from storage fallback list still delete by storage_path only.
 */
export async function deleteTripDocument(doc: TripDocumentRow): Promise<{ error: Error | null }> {
  const { error: storageErr } = await supabase().storage.from(BUCKET).remove([doc.storage_path]);

  const synthetic = doc.id.startsWith("storage-") || doc.id.startsWith("storage-meta-");
  if (!synthetic) {
    const { error: dbErr } = await supabase().from("trip_documents").delete().eq("id", doc.id);
    if (dbErr) {
      // REST 404 / PGRST205: relation missing from API — storage remove still clears the file.
      if (!storageErr && isTripDocumentsRestEndpointMissing(dbErr)) {
        return { error: null };
      }
      if (storageErr) return { error: new Error(storageErr.message) };
      return { error: new Error(dbErr.message) };
    }
  }

  if (storageErr) {
    return { error: new Error(storageErr.message) };
  }
  return { error: null };
}
