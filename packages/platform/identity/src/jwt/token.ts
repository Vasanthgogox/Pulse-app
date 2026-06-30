import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { PlatformJwtClaims } from '@pulse/contracts';
import { JWT_CLAIMS_SCHEMA_VERSION } from '@pulse/contracts';

export interface TokenConfig {
  secret:   string;
  issuer?:  string;
  audience?: string;
  expiresInSeconds?: number;
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signPlatformToken(
  claims: Omit<PlatformJwtClaims, 'schemaVersion'>,
  config: TokenConfig,
): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = config.expiresInSeconds ?? 3600;
  const token = await new SignJWT({
    ...claims,
    schemaVersion: JWT_CLAIMS_SCHEMA_VERSION,
  } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .setIssuer(config.issuer ?? 'pulse-identity')
    .setAudience(config.audience ?? 'pulse-platform')
    .sign(secretKey(config.secret));

  return { token, expiresIn };
}

export async function verifyPlatformToken(
  token: string,
  config: Pick<TokenConfig, 'secret' | 'issuer' | 'audience'>,
): Promise<PlatformJwtClaims> {
  const { payload } = await jwtVerify(token, secretKey(config.secret), {
    issuer:   config.issuer ?? 'pulse-identity',
    audience: config.audience ?? 'pulse-platform',
  });

  return {
    sub:            payload.sub as string,
    tenantId:       payload.tenantId as string,
    organizationId: payload.organizationId as string,
    membershipId:   payload.membershipId as string,
    businessUnitId: payload.businessUnitId as string | undefined,
    warehouseIds:   (payload.warehouseIds as string[]) ?? [],
    role:           payload.role as PlatformJwtClaims['role'],
    schemaVersion:  (payload.schemaVersion as PlatformJwtClaims['schemaVersion']) ?? JWT_CLAIMS_SCHEMA_VERSION,
  };
}
