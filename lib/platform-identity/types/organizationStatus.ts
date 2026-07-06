import { supabase } from '@/lib/supabase';

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED';

export type OrganizationSummary = {
  id: string;
  name: string;
  status: OrganizationStatus;
};

export const DEFAULT_ORGANIZATION_STATUS: OrganizationStatus = 'ACTIVE';

export function isOrganizationJoinable(status: OrganizationStatus): boolean {
  return status === 'ACTIVE';
}

export function organizationStatusBlockedMessage(
  orgName: string,
  status: OrganizationStatus,
): string {
  switch (status) {
    case 'SUSPENDED':
      return `${orgName} is temporarily suspended. Contact your administrator.`;
    case 'ARCHIVED':
      return `${orgName} has been archived and is no longer accepting members.`;
    case 'DELETED':
      return `${orgName} is no longer available.`;
    default:
      return `Cannot join ${orgName} at this time.`;
  }
}

const VALID_STATUSES: OrganizationStatus[] = ['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETED'];

function normalizeStatus(value: string | null | undefined): OrganizationStatus {
  const upper = (value ?? '').toUpperCase();
  return VALID_STATUSES.includes(upper as OrganizationStatus)
    ? (upper as OrganizationStatus)
    : DEFAULT_ORGANIZATION_STATUS;
}

/** Load organization platform_status from DB (migration 20261107050000). */
export async function loadOrganizationStatus(
  organizationId?: string,
): Promise<OrganizationSummary | null> {
  if (!organizationId) return null;

  try {
    const { data, error } = await supabase()
      .from('organizations')
      .select('id, name, platform_status')
      .eq('id', organizationId)
      .maybeSingle();

    if (error || !data) {
      return { id: organizationId, name: '', status: DEFAULT_ORGANIZATION_STATUS };
    }

    return {
      id: data.id,
      name: data.name ?? '',
      status: normalizeStatus((data as { platform_status?: string }).platform_status),
    };
  } catch {
    return { id: organizationId, name: '', status: DEFAULT_ORGANIZATION_STATUS };
  }
}
