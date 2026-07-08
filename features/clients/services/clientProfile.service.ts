/**
 * Core client hub profile adapter — delegates to CustomerService.
 */
import { CustomerService } from '@/lib/platform';
import type { UpdateClientHubProfileInput } from '@/lib/platform';

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

function toPlatformInput(patch: UpdateClientHubProfileData): UpdateClientHubProfileInput {
  return {
    legalName: patch.legal_name,
    tradeName: patch.trade_name,
    gstin: patch.gstin,
    panNumber: patch.pan_number,
    cin: patch.cin,
    msmeNumber: patch.msme_number,
    industry: patch.industry,
    tanNumber: patch.tan_number,
    kamName: patch.kam_name,
    kamEmail: patch.kam_email,
    kamPhone: patch.kam_phone,
    billingContactName: patch.billing_contact_name,
    billingContactEmail: patch.billing_contact_email,
    billingContactPhone: patch.billing_contact_phone,
    potentialVolume: patch.potential_volume,
    projectedContractRevenue: patch.projected_contract_revenue,
    paymentTermsLabel: patch.payment_terms_label,
    invoiceFrequencyLabel: patch.invoice_frequency_label,
    clientCode: patch.client_code,
    iecNumber: patch.iec_number,
    operatingRegions: patch.operating_regions,
    registeredAddress: patch.registered_address,
    billingAddress: patch.billing_address,
    corporateAddress: patch.corporate_address,
    remarks: patch.remarks,
  };
}

export async function updateClientHubProfile(
  orgId: string,
  clientId: string,
  patch: UpdateClientHubProfileData,
): Promise<{ error: Error | null }> {
  try {
    await CustomerService.updateHubProfile(orgId, clientId, toPlatformInput(patch));
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
