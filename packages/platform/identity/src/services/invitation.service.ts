import type { CommandResult, InviteUserRequest, InvitationDto } from '@pulse/contracts';
import type { IdentityConfig } from '../config';
import { createServiceDb } from '../db/client';
import { InvitationRepository } from '../repositories/invitation.repository';
import { UserRepository } from '../repositories/user.repository';
import { assertOrgAdmin } from './permissions.helper';

export class InvitationService {
  private readonly db;

  constructor(config: IdentityConfig) {
    this.db = createServiceDb({
      url:            config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceKey,
      anonKey:        config.supabaseAnonKey,
    });
  }

  async inviteUser(
    body: InviteUserRequest,
    authUserId: string,
    platformJwt = false,
  ): Promise<CommandResult<InvitationDto>> {
    if (!platformJwt) {
      await assertOrgAdmin(this.db, authUserId, body.organizationId);
    }
    const userRepo = new UserRepository(this.db);
    const inviter = await userRepo.findByAuthUserId(authUserId);
    if (!inviter) throw new Error('Inviter not found');

    const repo = new InvitationRepository(this.db);
    const { invitation } = await repo.createInvitation({
      organizationCode: body.organizationId,
      email:            body.email,
      role:             body.role,
      businessUnitCode: body.businessUnitId,
      invitedByUserId:  inviter.id,
    });

    return { data: invitation, statusCode: 201 };
  }
}
