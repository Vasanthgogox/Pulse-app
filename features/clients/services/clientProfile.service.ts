import { supabase } from '@/lib/supabase';

export type UpdateClientHubProfileData = {
  legal_name?: string | null;
  trade_name?: string | null;
  gstin?: string | null;
  pan_number?: string | null;
  cin?: string | null;
  msme_number?: string | null;
  industry?: string | null;
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
  registered_address?: string | null;
  billing_address?: string | null;
  corporate_address?: string | null;
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

  if (patch.legal_name !== undefined) updates.legal_name = trimOrNull(patch.legal_name);
  if (patch.trade_name !== undefined) updates.trade_name = trimOrNull(patch.trade_name);
  if (patch.gstin !== undefined) updates.gstin = trimOrNull(patch.gstin);
  if (patch.pan_number !== undefined) updates.pan_number = trimOrNull(patch.pan_number);
  if (patch.cin !== undefined) updates.cin = trimOrNull(patch.cin);
  if (patch.msme_number !== undefined) updates.msme_number = trimOrNull(patch.msme_number);
  if (patch.industry !== undefined) updates.industry = trimOrNull(patch.industry);
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
  if (patch.registered_address !== undefined) {
    updates.registered_address = trimOrNull(patch.registered_address);
  }
  if (patch.billing_address !== undefined) {
    updates.billing_address = trimOrNull(patch.billing_address);
  }
  if (patch.corporate_address !== undefined) {
    updates.corporate_address = trimOrNull(patch.corporate_address);
  }
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
