import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIdentityApp } from '../../src/index';
import { hasIntegrationEnv, loadIntegrationConfig } from '../helpers/env';
import { bindIdentityApp } from '../helpers/client';
import { createSupabaseAuthUser, deleteSupabaseAuthUser } from '../helpers/auth-user';
import {
  buildOrganizationFixture,
  buildWarehouseFixture,
  mintRoleJwt,
} from '@pulse/platform-testing';

const describeIntegration = hasIntegrationEnv ? describe : describe.skip;

describeIntegration('Permission enforcement (HTTP)', () => {
  const config = hasIntegrationEnv ? loadIntegrationConfig() : null!;
  const app = hasIntegrationEnv ? createIdentityApp(config) : null!;
  const client = hasIntegrationEnv ? bindIdentityApp(app!) : null!;

  let bootstrapUser: Awaited<ReturnType<typeof createSupabaseAuthUser>>;
  let orgId = '';
  let tenantId = '';
  let membershipId = '';
  let authUserId = '';

  beforeAll(async () => {
    bootstrapUser = await createSupabaseAuthUser(config, 'perm-http');
    const orgRes = await client!.createOrganization(buildOrganizationFixture(), bootstrapUser.accessToken);
    orgId = (orgRes.body as { data: { id: string; tenantId: string } }).data.id;
    tenantId = (orgRes.body as { data: { tenantId: string } }).data.tenantId;

    const login = await client!.login({ email: bootstrapUser.email, password: bootstrapUser.password });
    membershipId = (login.body as { data: { user: { membershipId: string } } }).data.user.membershipId;
    authUserId = bootstrapUser.authUserId;
  }, 60_000);

  afterAll(async () => {
    if (bootstrapUser?.authUserId) {
      await deleteSupabaseAuthUser(config, bootstrapUser.authUserId);
    }
  });

  const jwtFor = (role: 'admin' | 'planner' | 'operator') =>
    mintRoleJwt(role, {
      sub:            authUserId,
      tenantId,
      organizationId: orgId,
      membershipId,
    }, { secret: config.jwtSecret });

  it('operator cannot create warehouse with platform JWT', async () => {
    const token = await jwtFor('operator');
    const res = await client!.createWarehouse(
      buildWarehouseFixture(orgId),
      token,
    );
    expect(res.status).toBe(403);
  });

  it('planner can create warehouse with platform JWT', async () => {
    const token = await jwtFor('planner');
    const body = buildWarehouseFixture(orgId, { code: `PLN-${Date.now()}` });
    const res = await client!.createWarehouse(body, token);
    expect(res.status).toBe(201);
  });

  it('operator cannot invite users with platform JWT', async () => {
    const token = await jwtFor('operator');
    const res = await client!.inviteUser(
      { organizationId: orgId, email: `op-${Date.now()}@example.com`, role: 'operator' },
      token,
    );
    expect(res.status).toBe(403);
  });
});
