import type { CommandResult, CurrentUserDto, LoginRequest, LoginResponse } from '@pulse/contracts';
import { PlatformError, ErrorCodes } from '@pulse/contracts';
import type { IdentityConfig } from '../config';
import { createServiceDb } from '../db/client';
import { buildClaimsFromSession } from '../jwt/claims';
import { signPlatformToken, verifyPlatformToken } from '../jwt/token';
import { AuthRepository } from '../repositories/auth.repository';
import { BusinessUnitRepository } from '../repositories/business-unit.repository';
import { MembershipRepository } from '../repositories/membership.repository';
import { OrganizationRepository } from '../repositories/organization.repository';
import { UserRepository } from '../repositories/user.repository';
import { WarehouseRepository } from '../repositories/warehouse.repository';

export class AuthService {
  private readonly serviceDb;
  private readonly authRepo: AuthRepository;

  constructor(private readonly config: IdentityConfig) {
    this.serviceDb = createServiceDb({
      url:            config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceKey,
      anonKey:        config.supabaseAnonKey,
    });
    this.authRepo = new AuthRepository({
      url:            config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceKey,
      anonKey:        config.supabaseAnonKey,
    });
  }

  async login(body: LoginRequest): Promise<CommandResult<LoginResponse>> {
    const { user, error } = await this.authRepo.signInWithPassword(body.email, body.password);
    if (error || !user) {
      throw new PlatformError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    }

    const userRepo = new UserRepository(this.serviceDb);
    const platformUser = await userRepo.ensureUser({
      authUserId:  user.id,
      email:       user.email ?? body.email,
      displayName: user.user_metadata?.full_name as string | undefined,
    });

    const membershipRepo = new MembershipRepository(this.serviceDb);
    const memberships = await membershipRepo.listActiveForUser(platformUser.internalId);
    if (!memberships.length) {
      throw new PlatformError(ErrorCodes.NOT_FOUND, 'No active membership', 404);
    }

    const selected = body.membershipId
      ? memberships.find(m => m.code === body.membershipId) ?? memberships[0]
      : memberships[0];

    const orgRepo = new OrganizationRepository(this.serviceDb);
    const buRepo = new BusinessUnitRepository(this.serviceDb);
    const orgCode = await orgRepo.findCodeByInternalId(selected.organization_id);
    if (!orgCode) throw new PlatformError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);

    const org = await orgRepo.findByCode(orgCode);
    if (!org) throw new PlatformError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);

    const role = await membershipRepo.getRoleCode(selected.role_id);
    const warehouseIds = await membershipRepo.getWarehouseCodesForMembership(selected.id);

    let businessUnitCode: string | undefined;
    if (selected.business_unit_id) {
      businessUnitCode = (await buRepo.findCodeByInternalId(selected.business_unit_id)) ?? undefined;
    }

    const claims = buildClaimsFromSession({
      authUserId:       user.id,
      tenantCode:       org.tenantCode,
      organizationCode: org.row.code,
      membershipCode:   selected.code,
      businessUnitCode,
      warehouseCodes:   warehouseIds,
      role,
    });

    const { token, expiresIn } = await signPlatformToken(claims, {
      secret:           this.config.jwtSecret,
      issuer:           this.config.jwtIssuer,
      audience:         this.config.jwtAudience,
    });

    const currentUser: CurrentUserDto = {
      id:             platformUser.code,
      email:          platformUser.email,
      name:           platformUser.displayName,
      role,
      schemaVersion:  'v1',
      tenantId:       org.tenantCode,
      organizationId: org.row.code,
      membershipId:   selected.code,
      businessUnitId: businessUnitCode,
      warehouseIds,
    };

    return {
      data: {
        accessToken: token,
        expiresIn,
        tokenType:   'Bearer',
        user:        currentUser,
      },
    };
  }

  async me(claims: import('@pulse/contracts').PlatformJwtClaims): Promise<CommandResult<CurrentUserDto>> {
    const membershipRepo = new MembershipRepository(this.serviceDb);
    const membership = await membershipRepo.findByCode(claims.membershipId);
    if (!membership || membership.status !== 'active') {
      throw new PlatformError(ErrorCodes.NOT_FOUND, 'Membership not found', 404);
    }

    const userRepo = new UserRepository(this.serviceDb);
    const user = await userRepo.findByAuthUserId(claims.sub);
    if (!user) throw new PlatformError(ErrorCodes.NOT_FOUND, 'User not found', 404);

    const orgRepo = new OrganizationRepository(this.serviceDb);
    const org = await orgRepo.findByCode(claims.organizationId);
    if (!org) throw new PlatformError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);

    const warehouseRepo = new WarehouseRepository(this.serviceDb);
    const warehouses = await warehouseRepo.listByOrganization(org.row.id);

    const buRepo = new BusinessUnitRepository(this.serviceDb);
    const role = await membershipRepo.getRoleCode(membership.role_id);
    const warehouseIds = await membershipRepo.getWarehouseCodesForMembership(membership.id);

    let businessUnitCode: string | undefined;
    if (membership.business_unit_id) {
      businessUnitCode = (await buRepo.findCodeByInternalId(membership.business_unit_id)) ?? undefined;
    }

    return {
      data: {
        id:             user.code,
        email:          user.email,
        name:           user.display_name ?? undefined,
        role,
        schemaVersion:  'v1',
        tenantId:       claims.tenantId,
        organizationId: claims.organizationId,
        membershipId:   claims.membershipId,
        businessUnitId: businessUnitCode,
        warehouseIds,
        organization: {
          id:        org.row.code,
          name:      org.row.name,
          legalName: org.row.legal_name ?? undefined,
          tenantId:  org.tenantCode,
          createdAt: org.row.created_at,
        },
        membership: {
          id:             membership.code,
          userId:         user.code,
          organizationId: org.row.code,
          businessUnitId: businessUnitCode,
          role,
          status:         'active',
          warehouseIds,
        },
        warehouses,
      },
    };
  }

  async resolveBearerToken(token: string): Promise<{ authUserId: string; email?: string; platformClaims?: import('@pulse/contracts').PlatformJwtClaims }> {
    try {
      const claims = await verifyPlatformToken(token, {
        secret:   this.config.jwtSecret,
        issuer:   this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      });
      return { authUserId: claims.sub, platformClaims: claims };
    } catch {
      const { user, error } = await this.authRepo.getUserFromAccessToken(token);
      if (error || !user) {
        throw new PlatformError(ErrorCodes.UNAUTHORIZED, 'Invalid token', 401);
      }
      return { authUserId: user.id, email: user.email ?? undefined };
    }
  }
}
