import type { ClientManagementBundle } from '@/features/clients/types/clientManagement.types';
import { supabase } from '@/lib/supabase';

export async function getClientManagementBundle(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; bundle: ClientManagementBundle | null }> {
  const { data, error } = await supabase().rpc('get_client_management_bundle', {
    p_org_id: orgId,
    p_client_id: clientId,
  });
  if (error) return { error: new Error(error.message), bundle: null };
  if (!data) return { error: null, bundle: null };
  return { error: null, bundle: data as ClientManagementBundle };
}

export async function logClientAuditEvent(
  orgId: string,
  clientId: string,
  entityType: string,
  entityId: string | null,
  action: 'create' | 'update' | 'delete' | 'upload' | 'verify' | 'status_change',
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('log_client_audit', {
    p_org_id: orgId,
    p_client_id: clientId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_action: action,
    p_field_name: fieldName ?? null,
    p_old_value: oldValue ?? null,
    p_new_value: newValue ?? null,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
