/**
 * Vehicle documents — upload, view, delete for RC, insurance, fitness, PUC.
 * Storage: vehicle-documents bucket, path {orgId}/{vehicleId}/{docType}.{ext}.
 * Metadata: vehicles.documents JSONB column (no separate table).
 *
 * Edge cases handled:
 *  - File size/type validation before upload
 *  - Rollback: if DB update fails after storage upload, the orphaned file is removed
 *  - Re-upload (upsert): overwrites same path, so no orphan files accumulate
 *  - Delete: removes storage object + clears JSONB key in one call
 */
import { supabase } from '@/lib/supabase';
import type { VehicleDocuments, DocumentWithExpiry } from '../utils/vehicleDocuments.util';

const BUCKET = 'vehicle-documents';
const SIGNED_URL_EXPIRY_SEC = 3600;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export interface UploadVehicleDocumentResult {
  storagePath: string | null;
  error: Error | null;
}

export interface DeleteVehicleDocumentResult {
  error: Error | null;
}

/**
 * Validate file before attempting an upload. Returns null if valid, or an error message.
 * O(1) — two constant-time checks.
 */
export function validateDocumentFile(file: { arrayBuffer: ArrayBuffer; mimeType: string }): string | null {
  if (!file.arrayBuffer?.byteLength) return 'File is empty';
  if (file.arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES)
    return `File too large (${(file.arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`;
  const mime = (file.mimeType ?? '').toLowerCase();
  if (mime && !ALLOWED_MIME_TYPES.has(mime))
    return `Unsupported file type (${mime}). Use JPEG, PNG, WebP, or PDF.`;
  return null;
}

/**
 * Get a time-limited signed URL for viewing a vehicle document.
 * O(1) — single Supabase RPC.
 */
export async function getVehicleDocumentViewUrl(storagePath: string): Promise<string | null> {
  if (!storagePath?.trim()) return null;
  const { data, error } = await supabase()
    .storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Upload a document file for a vehicle. Returns storage path on success.
 *
 * Path scheme: {orgId}/{vehicleId}/{docType}.{ext}
 *   → deterministic per doc type, so re-upload overwrites (no orphan files).
 *
 * O(1) — one storage write (upsert).
 */
export async function uploadVehicleDocument(
  orgId: string,
  vehicleId: string,
  docType: keyof VehicleDocuments,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string; blob?: Blob },
): Promise<UploadVehicleDocumentResult> {
  const validationError = validateDocumentFile(file);
  if (validationError) return { storagePath: null, error: new Error(validationError) };

  const ext = file.fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${orgId}/${vehicleId}/${docType}.${ext}`;

  const { error } = await supabase()
    .storage
    .from(BUCKET)
    .upload(path, file.blob ?? file.arrayBuffer, {
      contentType: file.mimeType || 'image/jpeg',
      upsert: true,
    });

  if (error) return { storagePath: null, error: new Error(error.message) };
  return { storagePath: path, error: null };
}

/**
 * Remove a vehicle document from storage.
 * O(1) — single storage delete.
 */
export async function deleteVehicleDocumentFile(storagePath: string): Promise<DeleteVehicleDocumentResult> {
  if (!storagePath?.trim()) return { error: null };
  const { error } = await supabase()
    .storage
    .from(BUCKET)
    .remove([storagePath]);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Full upload + DB save in a single transaction-like call.
 * If the DB update fails, the uploaded file is rolled back (deleted).
 *
 * O(1) — one storage write + one DB update (+ optional rollback delete).
 */
export async function uploadAndSaveVehicleDocument(
  orgId: string,
  vehicleId: string,
  docType: keyof VehicleDocuments,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string; blob?: Blob },
  expiryDate: string,
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  // 1. Upload to storage
  const { storagePath, error: uploadErr } = await uploadVehicleDocument(orgId, vehicleId, docType, file);
  if (uploadErr || !storagePath) return { documents: null, error: uploadErr ?? new Error('Upload failed') };

  // 2. Build updated JSONB
  const updated: VehicleDocuments = { ...(existingDocuments ?? {}) };
  updated[docType] = {
    url: storagePath,
    expiryDate,
    uploadedAt: new Date().toISOString(),
  };

  // 3. Persist to vehicles.documents
  const { data: savedRow, error: dbError } = await supabase()
    .from('vehicles')
    .update({ documents: updated })
    .eq('organization_id', orgId)
    .eq('id', vehicleId)
    .select('id, documents')
    .maybeSingle();

  if (dbError || !savedRow) {
    // Rollback: remove the just-uploaded file so we don't leave orphans
    await deleteVehicleDocumentFile(storagePath).catch(() => {});
    return {
      documents: null,
      error: new Error(
        dbError?.message ??
          'Vehicle document metadata was not saved (row not found or insufficient permission).',
      ),
    };
  }

  const persistedDocs = (savedRow.documents ?? {}) as VehicleDocuments;
  return { documents: persistedDocs, error: null };
}

/**
 * Delete a document type for a vehicle (storage file + clear JSONB key).
 *
 * O(1) — one storage delete + one DB update.
 */
export async function deleteVehicleDocument(
  orgId: string,
  vehicleId: string,
  docType: keyof VehicleDocuments,
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  const doc: DocumentWithExpiry | undefined = existingDocuments?.[docType];
  const storagePath = doc?.url;

  // Remove storage file (best-effort; even if missing, clear JSONB)
  if (storagePath?.trim()) {
    await deleteVehicleDocumentFile(storagePath).catch(() => {});
  }

  const updated: VehicleDocuments = { ...(existingDocuments ?? {}) };
  delete updated[docType];

  const { error: dbError } = await supabase()
    .from('vehicles')
    .update({ documents: updated })
    .eq('organization_id', orgId)
    .eq('id', vehicleId);

  if (dbError) return { documents: null, error: new Error(dbError.message) };
  return { documents: updated, error: null };
}
