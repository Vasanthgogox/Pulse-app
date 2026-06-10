import { supabase } from '@/lib/supabase';

export type UpdateClientHubProfileData = {
  tan_number?: string | null;
  kam_name?: string | null;
  kam_email?: string | null;
  kam_phone?: string | null;
  billing_contact_name?: string | null;
  billing_contact_email?: string | null;
  billing_contact_phone?: string | null;
  potential_volume?: number | null;
  projected_contract_revenue?: number | null;
  payment_terms_label?: string | null;
  invoice_frequency_label?: string | null;
  client_code?: string | null;
  iec_number?: string | null;
  operating_regions?: string[] | null;
  remarks?: string | null;
};

function trimOrNull(v: string | undefined | null): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

export async function updateClientHubProfile(
  orgId: string,
  clientId: string,
  patch: UpdateClientHubProfileData,
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.tan_number !== undefined) updates.tan_number = trimOrNull(patch.tan_number);
  if (patch.kam_name !== undefined) updates.kam_name = trimOrNull(patch.kam_name);
  if (patch.kam_email !== undefined) updates.kam_email = trimOrNull(patch.kam_email);
  if (patch.kam_phone !== undefined) updates.kam_phone = trimOrNull(patch.kam_phone);
  if (patch.billing_contact_name !== undefined) {
    updates.billing_contact_name = trimOrNull(patch.billing_contact_name);
  }
  if (patch.billing_contact_email !== undefined) {
    updates.billing_contact_email = trimOrNull(patch.billing_contact_email);
  }
  if (patch.billing_contact_phone !== undefined) {
    updates.billing_contact_phone = trimOrNull(patch.billing_contact_phone);
  }
  if (patch.potential_volume !== undefined) updates.potential_volume = patch.potential_volume;
  if (patch.projected_contract_revenue !== undefined) {
    updates.projected_contract_revenue = patch.projected_contract_revenue;
  }
  if (patch.payment_terms_label !== undefined) {
    updates.payment_terms_label = trimOrNull(patch.payment_terms_label);
  }
  if (patch.invoice_frequency_label !== undefined) {
    updates.invoice_frequency_label = trimOrNull(patch.invoice_frequency_label);
  }
  if (patch.client_code !== undefined) updates.client_code = trimOrNull(patch.client_code);
  if (patch.iec_number !== undefined) updates.iec_number = trimOrNull(patch.iec_number);
  if (patch.operating_regions !== undefined) updates.operating_regions = patch.operating_regions;
  if (patch.remarks !== undefined) updates.notes = trimOrNull(patch.remarks);

  if (Object.keys(updates).length <= 1) return { error: null };

  const { error } = await supabase()
    .from('clients')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', clientId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}
