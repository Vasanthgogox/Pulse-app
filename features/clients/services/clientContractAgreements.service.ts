import type {
  ClientContractAgreement,
  CommercialModel,
  ContractAgreementStatus,
} from '@/features/clients/types/clientManagement.types';
import { supabase } from '@/lib/supabase';

export type CreateContractAgreementData = {
  contract_number: string;
  title?: string | null;
  status?: ContractAgreementStatus;
  commercial_model?: CommercialModel;
  effective_date?: string | null;
  expiry_date?: string | null;
  renewal_date?: string | null;
  payment_terms?: Record<string, unknown>;
  detention_terms?: Record<string, unknown>;
  penalty_clauses?: Record<string, unknown>;
  claims_terms?: Record<string, unknown>;
  escalation_matrix?: unknown[];
  general_terms?: string | null;
  notes?: string | null;
};

export async function getClientContractAgreements(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; agreements: ClientContractAgreement[] }> {
  const { data, error } = await supabase()
    .from('client_contract_agreements')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('effective_date', { ascending: false, nullsFirst: false });
  if (error) return { error: new Error(error.message), agreements: [] };
  return { error: null, agreements: (data ?? []) as ClientContractAgreement[] };
}

export async function createClientContractAgreement(
  orgId: string,
  clientId: string,
  payload: CreateContractAgreementData,
): Promise<{ error: Error | null; agreement: ClientContractAgreement | null }> {
  const { data, error } = await supabase()
    .from('client_contract_agreements')
    .insert({ organization_id: orgId, client_id: clientId, ...payload })
    .select()
    .single();
  if (error) return { error: new Error(error.message), agreement: null };
  return { error: null, agreement: data as ClientContractAgreement };
}

export async function updateClientContractAgreement(
  agreementId: string,
  payload: Partial<CreateContractAgreementData>,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('client_contract_agreements')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', agreementId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
