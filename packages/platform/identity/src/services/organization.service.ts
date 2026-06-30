import type {
  CommandResult,
  CreateOrganizationRequest,
  CreateBusinessUnitRequest,
  BusinessUnitDto,
  OrganizationDto,
} from '@pulse/contracts';
import { PlatformError, ErrorCodes } from '@pulse/contracts';
import type { IdentityConfig } from '../config';
import { createServiceDb } from '../db/client';
import { OrganizationRepository } from '../repositories/organization.repository';
import { UserRepository } from '../repositories/user.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { assertOrgAdmin } from './permissions.helper';

export class OrganizationService {
  private readonly db;

  constructor(_config: IdentityConfig) {
    this.db = createServiceDb({
      url:            _config.supabaseUrl,
      serviceRoleKey: _config.supabaseServiceKey,
      anonKey:        _config.supabaseAnonKey,
    });
  }

  async createOrganization(
    body: CreateOrganizationRequest,
    authUserId: string,
    email: string,
    displayName?: string,
  ): Promise<CommandResult<OrganizationDto>> {
    const userRepo = new UserRepository(this.db);
    const existingUser = await userRepo.findByAuthUserId(authUserId);
    if (existingUser) {
      const memberships = await new MembershipRepository(this.db).listActiveForUser(existingUser.id);
      if (memberships.length > 0) {
        throw new PlatformError(ErrorCodes.ORG_ALREADY_EXISTS, 'User already belongs to an organization', 409);
      }
    }

    const repo = new OrganizationRepository(this.db);
    const result = await repo.createOrganization({
      name:        body.name,
      legalName:   body.legalName,
      authUserId,
      email,
      displayName,
    });

    return { data: result.organization, statusCode: 201 };
  }

  async createBusinessUnit(
    body: CreateBusinessUnitRequest,
    authUserId?: string,
  ): Promise<CommandResult<BusinessUnitDto>> {
    if (authUserId) await assertOrgAdmin(this.db, authUserId, body.organizationId);
    const repo = new OrganizationRepository(this.db);
    const bu = await repo.createBusinessUnit({
      organizationCode: body.organizationId,
      name:             body.name,
      unitCode:         body.code,
    });
    return { data: bu, statusCode: 201 };
  }
}
