import { getIdentityDb } from '@/lib/supabase';

export type PlatformOrganization = {
  id: string;
  name: string;
};

function mapOrganization(row: { id: string; name?: string | null }): PlatformOrganization {
  return {
    id: row.id,
    name: row.name?.trim() || 'Organization',
  };
}

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = String(error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  );
}

/** Primary org for the signed-in user (created during Core sign-up / team invite). */
export async function getPrimaryOrganizationForUser(
  userId: string,
): Promise<PlatformOrganization | null> {
  const db = getIdentityDb();
  if (!db) return null;

  const { data: memberships, error: membershipError } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);

  if (!membershipError && memberships?.length) {
    const organizationId = memberships[0].organization_id;
    const { data: organization, error: organizationError } = await db
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle();

    if (!organizationError && organization) {
      return mapOrganization(organization);
    }
  }

  const { data: rpcOrgs, error: rpcError } = await db.rpc('get_organizations_for_user');
  if (!rpcError) {
    const rpcList = Array.isArray(rpcOrgs) ? rpcOrgs : rpcOrgs ? [rpcOrgs] : [];
    if (rpcList.length) {
      return mapOrganization(rpcList[0] as { id: string; name?: string | null });
    }
  } else if (!isMissingRpcError(rpcError)) {
    return null;
  }

  const { data: ownedOrg, error: ownerError } = await db
    .from('organizations')
    .select('id, name')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();

  if (!ownerError && ownedOrg) {
    return mapOrganization(ownedOrg);
  }

  return null;
}
