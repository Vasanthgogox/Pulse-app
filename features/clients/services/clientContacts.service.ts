import type { ClientContactRow } from '@/features/clients/types/clientManagement.types';
import { supabase } from '@/lib/supabase';

export type CreateClientContactData = Omit<
  ClientContactRow,
  'id' | 'organization_id' | 'client_id' | 'created_at' | 'updated_at'
>;

export type UpdateClientContactData = Partial<CreateClientContactData>;

export async function getClientContacts(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; contacts: ClientContactRow[] }> {
  const { data, error } = await supabase()
    .from('client_contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return { error: new Error(error.message), contacts: [] };
  return { error: null, contacts: (data ?? []) as ClientContactRow[] };
}

export async function createClientContact(
  orgId: string,
  clientId: string,
  payload: CreateClientContactData,
): Promise<{ error: Error | null; contact: ClientContactRow | null }> {
  const { data, error } = await supabase()
    .from('client_contacts')
    .insert({ organization_id: orgId, client_id: clientId, ...payload })
    .select()
    .single();
  if (error) return { error: new Error(error.message), contact: null };
  return { error: null, contact: data as ClientContactRow };
}

export async function updateClientContact(
  contactId: string,
  payload: UpdateClientContactData,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('client_contacts')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', contactId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteClientContact(
  contactId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('client_contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contactId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
