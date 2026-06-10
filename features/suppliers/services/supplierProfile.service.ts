import { supabase } from '@/lib/supabase';

export type OnboardingAgreementStatus =
  | 'pending'
  | 'draft'
  | 'signed'
  | 'expired'
  | 'terminated';

export type UpdateSupplierOnboardingData = {
  onboarding_agreement_status?: OnboardingAgreementStatus;
  onboarding_agreement_signed_at?: string | null;
  onboarding_agreement_storage_path?: string | null;
  onboarding_agreement_notes?: string | null;
  vehicle_types?: string[];
  operating_areas?: string[];
};

function trimOrNull(v: string | undefined | null): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

export async function updateSupplierOnboarding(
  orgId: string,
  supplierId: string,
  patch: UpdateSupplierOnboardingData,
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.onboarding_agreement_status !== undefined) {
    updates.onboarding_agreement_status = patch.onboarding_agreement_status;
  }
  if (patch.onboarding_agreement_signed_at !== undefined) {
    updates.onboarding_agreement_signed_at = patch.onboarding_agreement_signed_at;
  }
  if (patch.onboarding_agreement_storage_path !== undefined) {
    updates.onboarding_agreement_storage_path = trimOrNull(patch.onboarding_agreement_storage_path);
  }
  if (patch.onboarding_agreement_notes !== undefined) {
    updates.onboarding_agreement_notes = trimOrNull(patch.onboarding_agreement_notes);
  }
  if (patch.vehicle_types !== undefined) updates.vehicle_types = patch.vehicle_types;
  if (patch.operating_areas !== undefined) updates.operating_areas = patch.operating_areas;

  if (Object.keys(updates).length <= 1) return { error: null };

  const { error } = await supabase()
    .from('suppliers')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', supplierId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}
