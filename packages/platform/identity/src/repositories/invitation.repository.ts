import type { InvitationDto, PlatformRole } from '@pulse/contracts';
import { PlatformError, ErrorCodes } from '@pulse/contracts';
import type { IdentitySupabase } from '../db/client';
import { nextCanonicalCode, platformSchema } from '../db/client';
import { BusinessUnitRepository } from './business-unit.repository';
import { MembershipRepository } from './membership.repository';
import { OrganizationRepository } from './organization.repository';
import { randomBytes, createHash } from 'crypto';

export class InvitationRepository {
  constructor(
    private readonly db: IdentitySupabase,
    private readonly orgRepo = new OrganizationRepository(db),
    private readonly membershipRepo = new MembershipRepository(db),
  ) {}

  async createInvitation(params: {
    organizationCode: string;
    email:            string;
    role:             PlatformRole;
    businessUnitCode?: string;
    invitedByUserId:  string;
    expiresInHours?:  number;
  }): Promise<{ invitation: InvitationDto; token: string }> {
    const org = await this.orgRepo.findByCode(params.organizationCode);
    if (!org) throw new Error('Organization not found');

    const { data: pendingInvite } = await platformSchema(this.db)
      .from('invitations')
      .select('code')
      .eq('organization_id', org.row.id)
      .eq('email', params.email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle<{ code: string }>();
    if (pendingInvite) {
      throw new PlatformError(ErrorCodes.INVITE_ALREADY_PENDING, 'Invitation already pending for this email', 409);
    }

    const buRepo = new BusinessUnitRepository(this.db);
    let businessUnitId: string | null = null;
    if (params.businessUnitCode) {
      businessUnitId = await buRepo.findInternalIdByUnitCode(org.row.id, params.businessUnitCode);
    }

    const roleId = await this.membershipRepo.getRoleIdByCode(params.role);
    const code = await nextCanonicalCode(this.db, 'INV');
    const expiresAt = new Date(Date.now() + (params.expiresInHours ?? 72) * 3600_000).toISOString();

    const { data: inv, error } = await platformSchema(this.db)
      .from('invitations')
      .insert({
        code:                code,
        organization_id:     org.row.id,
        email:               params.email.toLowerCase(),
        role_id:             roleId,
        business_unit_id:    businessUnitId,
        invited_by_user_id:  params.invitedByUserId,
        status:              'pending',
        expires_at:          expiresAt,
      })
      .select('code, organization_id, email, role_id, business_unit_id, status, expires_at')
      .single<{
        code: string;
        email: string;
        status: string;
        expires_at: string;
        role_id: number;
        business_unit_id: string | null;
      }>();
    if (error) throw error;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const { data: invRow } = await platformSchema(this.db)
      .from('invitations')
      .select('id')
      .eq('code', code)
      .single<{ id: string }>();

    await platformSchema(this.db).from('invite_tokens').insert({
      invitation_id: invRow!.id,
      token_hash:    tokenHash,
      expires_at:    expiresAt,
    });

    const role = await this.membershipRepo.getRoleCode(inv.role_id);
    let businessUnitIdOut: string | undefined;
    if (inv.business_unit_id) {
      const buRepo = new BusinessUnitRepository(this.db);
      businessUnitIdOut = (await buRepo.findCodeByInternalId(inv.business_unit_id)) ?? undefined;
    }

    return {
      invitation: {
        id:             inv.code,
        organizationId: params.organizationCode,
        email:          inv.email,
        role,
        businessUnitId: businessUnitIdOut,
        status:         inv.status as InvitationDto['status'],
        expiresAt:      inv.expires_at,
      },
      token: rawToken,
    };
  }
}
