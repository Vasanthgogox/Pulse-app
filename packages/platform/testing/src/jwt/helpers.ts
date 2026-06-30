import { SignJWT } from 'jose';
import type { PlatformJwtClaims, PlatformRole } from '@pulse/contracts';
import { JWT_CLAIMS_SCHEMA_VERSION } from '@pulse/contracts';
import { buildMembershipClaims } from '../fixtures/membership';

export interface JwtTestConfig {
  secret:    string;
  issuer?:   string;
  audience?: string;
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function mintPlatformJwt(
  claims: Omit<PlatformJwtClaims, 'schemaVersion'>,
  config: JwtTestConfig,
  expiresInSeconds = 3600,
): Promise<string> {
  return new SignJWT({ ...claims, schemaVersion: JWT_CLAIMS_SCHEMA_VERSION })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setIssuer(config.issuer ?? 'pulse-identity')
    .setAudience(config.audience ?? 'pulse-platform')
    .sign(secretKey(config.secret));
}

export async function mintExpiredPlatformJwt(
  claims: Omit<PlatformJwtClaims, 'schemaVersion'>,
  config: JwtTestConfig,
): Promise<string> {
  return mintPlatformJwt(claims, config, -60);
}

export async function mintRoleJwt(
  role: PlatformRole,
  overrides: Partial<Omit<PlatformJwtClaims, 'schemaVersion' | 'role'>> & Pick<PlatformJwtClaims, 'sub' | 'tenantId' | 'organizationId' | 'membershipId'>,
  config: JwtTestConfig,
): Promise<string> {
  const claims = buildMembershipClaims({
    sub:            overrides.sub,
    tenantId:       overrides.tenantId,
    organizationId: overrides.organizationId,
    membershipId:   overrides.membershipId,
    role,
    businessUnitId: overrides.businessUnitId,
    warehouseIds:   overrides.warehouseIds,
  });
  return mintPlatformJwt(claims, config);
}

export async function mintWrongTenantJwt(
  base: Omit<PlatformJwtClaims, 'schemaVersion'>,
  config: JwtTestConfig,
): Promise<string> {
  return mintPlatformJwt({ ...base, tenantId: 'TENANT-999999' }, config);
}

export async function mintWrongMembershipJwt(
  base: Omit<PlatformJwtClaims, 'schemaVersion'>,
  config: JwtTestConfig,
): Promise<string> {
  return mintPlatformJwt({ ...base, membershipId: 'MEM-999999' }, config);
}

export async function mintInvalidSignatureJwt(
  claims: Omit<PlatformJwtClaims, 'schemaVersion'>,
  config: JwtTestConfig,
): Promise<string> {
  return mintPlatformJwt(claims, { ...config, secret: `${config.secret}-wrong` });
}
