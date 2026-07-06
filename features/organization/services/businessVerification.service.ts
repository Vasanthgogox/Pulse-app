import { supabase } from '@/lib/supabase';
import type { AddressProofType, RegistrationType } from '@/types/organization';

const VERIFICATION_BUCKET = 'verification-documents';

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

export async function uploadAddressProof(
  orgId: string,
  file:  AddressProofFile,
): Promise<{ path: string | null; error: Error | null }> {
  return uploadVerificationDocument(orgId, 'address_proof', file);
}

/** Upload any verification document to the private bucket. */
export async function uploadVerificationDocument(
  orgId: string,
  docType: string,
  file: AddressProofFile,
): Promise<{ path: string | null; error: Error | null }> {
  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const safeType = docType.replace(/[^a-z0-9_]/gi, '_');
  const path = `${orgId}/${safeType}-${Date.now()}.${ext}`;

  const bytes = await readFileBytes(file.uri, file.base64);

  const { error } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .upload(path, bytes, { contentType: file.mimeType, upsert: true });

  if (error) return { path: null, error: new Error(error.message) };
  return { path, error: null };
}

export async function getVerificationDocumentSignedUrl(
  storagePath: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  return getAddressProofSignedUrl(storagePath, ttlSeconds);
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

// ─── Draft saves (pre-submit, inline KYC page) ────────────────────────────────

export type VerificationDraftPayload = {
  registration_type?: RegistrationType | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  address_pincode?: string | null;
  address_proof_path?: string | null;
  address_proof_type?: AddressProofType | null;
};

export async function saveVerificationDraft(
  orgId: string,
  payload: VerificationDraftPayload,
): Promise<{ error: Error | null }> {
  const patch: Record<string, unknown> = {};
  if (payload.registration_type !== undefined) {
    patch.registration_type = payload.registration_type;
  }
  if (payload.address_line !== undefined) {
    patch.address_line = payload.address_line?.trim() || null;
  }
  if (payload.city !== undefined) patch.city = payload.city?.trim() || null;
  if (payload.state !== undefined) patch.state = payload.state?.trim() || null;
  if (payload.address_pincode !== undefined) {
    const digits = payload.address_pincode?.replace(/\D/g, '') ?? '';
    patch.address_pincode = digits || null;
  }
  if (payload.address_proof_path !== undefined) {
    patch.address_proof_path = payload.address_proof_path?.trim() || null;
  }
  if (payload.address_proof_type !== undefined) {
    patch.address_proof_type = payload.address_proof_type;
  }

  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase().from('organizations').update(patch).eq('id', orgId);
  return { error: error ? new Error(error.message) : null };
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
