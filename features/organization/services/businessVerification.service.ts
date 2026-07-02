import { supabase } from '@/lib/supabase';
import type { AddressProofType, RegistrationType } from '@/types/organization';

const VERIFICATION_BUCKET = 'verification-documents';

// Mirrors the bucket + register_verification_document RPC constraints in
// 20261111000000_verification_documents_registry.sql — checked client-side
// too so the user gets an inline error instead of a failed upload/RPC call.
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
];

export type VerificationDocumentType =
  | 'gst_certificate'
  | 'pan_card'
  | 'address_proof_lease'
  | 'address_proof_utility_bill'
  | 'address_proof_other';

export function validateDocumentFile(file: {
  mimeType: string;
  sizeBytes?: number;
}): string | null {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimeType)) {
    return 'Unsupported file type. Please upload a JPG, PNG, WEBP, HEIC, or PDF.';
  }
  if (file.sizeBytes != null && file.sizeBytes > MAX_DOCUMENT_BYTES) {
    return 'File is too large. Maximum size is 10 MB.';
  }
  return null;
}

// ─── GSTIN validation ─────────────────────────────────────────────────────────

export type GstinValidationResult =
  | { valid: true;  status: 'ACTIVE' | 'MANUAL_REVIEW'; registry_name?: string }
  | { valid: false; reason: string; message: string; registry_name?: string };

export async function validateGstin(
  gstin: string,
  declaredCompanyName: string,
): Promise<GstinValidationResult> {
  const { data: { session } } = await supabase().auth.getSession();
  const token = session?.access_token ?? '';

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/validate-gstin`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ gstin, declared_company_name: declaredCompanyName }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { valid: false, reason: json.reason ?? 'VALIDATION_FAILED', message: json.message ?? 'GSTIN validation failed.' };
    }
    return json as GstinValidationResult;
  } catch {
    // Network error: treat as manual review, don't block the user
    return { valid: true, status: 'MANUAL_REVIEW' };
  }
}

// ─── Address proof upload ──────────────────────────────────────────────────────

export interface AddressProofFile {
  uri:      string;
  mimeType: string;
  fileName: string;
  base64?:  string;
}

async function readFileBytes(uri: string, base64?: string): Promise<Uint8Array> {
  if (base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export interface DocVerifyResult {
  passed:          boolean;
  route_to_manual: boolean;
  message:         string;
  score?:          number;
}

/** Calls gemini-doc-verify right after upload. Network/config failures are
 *  treated as pass-through (route to manual review server-side later) rather
 *  than blocking the user — the authoritative check still runs post-submit
 *  in the async worker regardless of this result. */
async function verifyUploadedDocument(
  documentType: VerificationDocumentType,
  storagePath:  string,
  typedGstin?:  string,
  typedPan?:    string,
): Promise<DocVerifyResult | null> {
  const { data: { session } } = await supabase().auth.getSession();
  const token = session?.access_token ?? '';
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/gemini-doc-verify`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        document_type: documentType,
        storage_path:  storagePath,
        typed_gstin:   typedGstin,
        typed_pan:     typedPan,
      }),
    });
    if (!res.ok) return null; // config/network issue — don't block on it
    return await res.json() as DocVerifyResult;
  } catch {
    return null;
  }
}

export async function uploadAddressProof(
  orgId:     string,
  file:      AddressProofFile,
  proofType?: AddressProofType,
): Promise<{ path: string | null; error: Error | null; verify: DocVerifyResult | null }> {
  const bytes = await readFileBytes(file.uri, file.base64);

  const formatError = validateDocumentFile({ mimeType: file.mimeType, sizeBytes: bytes.byteLength });
  if (formatError) return { path: null, error: new Error(formatError), verify: null };

  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${orgId}/address-proof-${Date.now()}.${ext}`;

  const { error } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .upload(path, bytes, { contentType: file.mimeType, upsert: true });

  if (error) return { path: null, error: new Error(error.message), verify: null };

  const documentType: VerificationDocumentType =
    proofType === 'lease' ? 'address_proof_lease'
    : proofType === 'utility_bill' ? 'address_proof_utility_bill'
    : 'address_proof_other';

  const verify = await verifyUploadedDocument(documentType, path);
  if (verify && !verify.passed) {
    await supabase().storage.from(VERIFICATION_BUCKET).remove([path]);
    return { path: null, error: new Error(verify.message), verify };
  }

  return { path, error: null, verify };
}

// ─── Generic verification document upload (GST cert, PAN card, …) ─────────────

export interface VerificationDocumentFile {
  uri:      string;
  mimeType: string;
  fileName: string;
  base64?:  string;
}

export async function uploadVerificationDocument(
  orgId:        string,
  documentType: VerificationDocumentType,
  file:         VerificationDocumentFile,
  typedValues?: { gstin?: string; pan?: string },
): Promise<{ path: string | null; error: Error | null; verify: DocVerifyResult | null }> {
  const bytes = await readFileBytes(file.uri, file.base64);

  const formatError = validateDocumentFile({ mimeType: file.mimeType, sizeBytes: bytes.byteLength });
  if (formatError) return { path: null, error: new Error(formatError), verify: null };

  const ext  = file.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${orgId}/${documentType}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .upload(path, bytes, { contentType: file.mimeType, upsert: true });

  if (uploadError) return { path: null, error: new Error(uploadError.message), verify: null };

  const verify = await verifyUploadedDocument(documentType, path, typedValues?.gstin, typedValues?.pan);

  // Gemini explicitly rejected the document (mismatch/unreadable) — remove
  // the file and don't register it, so a bad upload never counts toward
  // "document uploaded" in the wizard or submit_business_verification.
  if (verify && !verify.passed) {
    await supabase().storage.from(VERIFICATION_BUCKET).remove([path]);
    return { path: null, error: new Error(verify.message), verify };
  }

  const { error: rpcError } = await supabase().rpc('register_verification_document', {
    p_org_id:        orgId,
    p_document_type: documentType,
    p_storage_path:  path,
    p_mime_type:      file.mimeType,
    p_size_bytes:     bytes.byteLength,
  });

  if (rpcError) return { path: null, error: new Error(rpcError.message), verify };
  return { path, error: null, verify };
}

export interface VerificationDocumentRecord {
  id:             string;
  document_type:  VerificationDocumentType;
  storage_path:   string;
  mime_type:      string;
  size_bytes:     number;
  status:         'UPLOADED' | 'OCR_PASSED' | 'OCR_FAILED' | 'MANUAL_REVIEW' | 'REPLACED';
  created_at:     string;
}

export async function getVerificationDocuments(
  orgId: string,
): Promise<{ documents: VerificationDocumentRecord[]; error: Error | null }> {
  const { data, error } = await supabase().rpc('get_verification_documents', { p_org_id: orgId });
  if (error) return { documents: [], error: new Error(error.message) };
  return { documents: (data ?? []) as VerificationDocumentRecord[], error: null };
}

export async function getAddressProofSignedUrl(
  storagePath: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  const { data } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  return data?.signedUrl ?? null;
}

// ─── Submit for verification ───────────────────────────────────────────────────

export interface SubmitVerificationPayload {
  registration_type?:  RegistrationType;
  address_pincode?:    string;
  address_proof_path?: string;
  address_proof_type?: AddressProofType;
}

export async function submitBusinessVerification(
  orgId:   string,
  payload: SubmitVerificationPayload,
): Promise<{ ok: boolean; frozen_at: string | null; error: Error | null }> {
  const { data, error } = await supabase().rpc('submit_business_verification', {
    p_org_id:             orgId,
    p_registration_type:  payload.registration_type  ?? null,
    p_address_pincode:    payload.address_pincode     ?? null,
    p_address_proof_path: payload.address_proof_path  ?? null,
    p_address_proof_type: payload.address_proof_type  ?? null,
  });

  if (error) return { ok: false, frozen_at: null, error: new Error(error.message) };
  const result = data as { ok: boolean; frozen_at: string };
  return { ok: result.ok, frozen_at: result.frozen_at, error: null };
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:               string;
  previous_status:  string | null;
  new_status:       string;
  rejection_reasons: { checklist: string[]; notes: string } | null;
  notes:            string | null;
  created_at:       string;
}

export async function getVerificationAuditLog(
  orgId: string,
): Promise<{ entries: AuditLogEntry[]; error: Error | null }> {
  const { data, error } = await supabase()
    .from('verification_audit_logs')
    .select('id, previous_status, new_status, rejection_reasons, notes, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return { entries: [], error: new Error(error.message) };
  return { entries: (data ?? []) as AuditLogEntry[], error: null };
}
