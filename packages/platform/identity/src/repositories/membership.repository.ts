import type { PlatformRole } from '@pulse/contracts';
import { PlatformError, ErrorCodes } from '@pulse/contracts';
import type { IdentitySupabase } from '../db/client';
import { nextCanonicalCode, platformSchema } from '../db/client';

interface MembershipRow {
  id:               string;
  code:             string;
  user_id:          string;
  organization_id:  string;
  business_unit_id: string | null;
  role_id:          number;
  status:           string;
}

interface RoleRow {
  id:   number;
  code: string;
}

export class MembershipRepository {
  constructor(private readonly db: IdentitySupabase) {}

  async getRoleIdByCode(code: PlatformRole): Promise<number> {
    const { data, error } = await platformSchema(this.db)
      .from('roles')
      .select('id, code')
      .eq('code', code)
      .single<RoleRow>();
    if (error) throw error;
    return data.id;
  }

  async createMembership(params: {
    userId:          string;
    organizationId:  string;
    roleId:          number;
    businessUnitId?: string;
  }): Promise<MembershipRow> {
    const code = await nextCanonicalCode(this.db, 'MEM');
    const { data, error } = await platformSchema(this.db)
      .from('memberships')
      .insert({
        code:             code,
        user_id:          params.userId,
        organization_id:  params.organizationId,
        business_unit_id: params.businessUnitId ?? null,
        role_id:          params.roleId,
        status:           'active',
      })
      .select('*')
      .single<MembershipRow>();
    if (error) throw error;
    return data;
  }

  async listActiveForUser(userId: string): Promise<MembershipRow[]> {
    const { data, error } = await platformSchema(this.db)
      .from('memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) throw error;
    return data ?? [];
  }

  async findByCode(code: string): Promise<MembershipRow | null> {
    const { data, error } = await platformSchema(this.db)
      .from('memberships')
      .select('*')
      .eq('code', code)
      .maybeSingle<MembershipRow>();
    if (error) throw error;
    return data;
  }

  async getRoleCode(roleId: number): Promise<PlatformRole> {
    const { data, error } = await platformSchema(this.db)
      .from('roles')
      .select('code')
      .eq('id', roleId)
      .single<{ code: PlatformRole }>();
    if (error) throw error;
    return data.code;
  }

  async getWarehouseCodesForMembership(membershipId: string): Promise<string[]> {
    const { data, error } = await platformSchema(this.db)
      .from('membership_warehouses')
      .select('warehouse_id')
      .eq('membership_id', membershipId);
    if (error) throw error;
    if (!data?.length) return [];

    const ids = data.map(r => r.warehouse_id);
    const { data: wh, error: wErr } = await platformSchema(this.db)
      .from('warehouses')
      .select('code')
      .in('id', ids);
    if (wErr) throw wErr;
    return (wh ?? []).map(r => r.code);
  }

  async assertOrgAdmin(authUserId: string, organizationCode: string): Promise<void> {
    const schema = platformSchema(this.db);

    const { data: user } = await schema
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>();
    if (!user) throw new PlatformError(ErrorCodes.FORBIDDEN, 'User not found', 403);

    const { data: org } = await schema
      .from('organizations')
      .select('id')
      .eq('code', organizationCode)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>();
    if (!org) throw new PlatformError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);

    const { data: membership } = await schema
      .from('memberships')
      .select('role_id')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .maybeSingle<{ role_id: number }>();
    if (!membership) throw new PlatformError(ErrorCodes.FORBIDDEN, 'Not a member', 403);

    const role = await this.getRoleCode(membership.role_id);
    if (role !== 'admin') {
      throw new PlatformError(ErrorCodes.FORBIDDEN, 'Admin required', 403);
    }
  }

  async setMembershipStatus(membershipCode: string, status: 'active' | 'suspended' | 'revoked'): Promise<void> {
    const { error } = await platformSchema(this.db)
      .from('memberships')
      .update({ status })
      .eq('code', membershipCode);
    if (error) throw error;
  }
}
