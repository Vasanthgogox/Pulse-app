import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIdentityApp } from '../../src/index';
import { hasIntegrationEnv, loadIntegrationConfig } from '../helpers/env';
import { bindIdentityApp } from '../helpers/client';
import { createSupabaseAuthUser, deleteSupabaseAuthUser } from '../helpers/auth-user';
import {
  assertCanonicalId,
  assertContractData,
  buildBusinessUnitFixture,
  buildOrganizationFixture,
  buildWarehouseFixture,
  buildTestAuthUser,
  identityV1Schemas,
} from '@pulse/platform-testing';
import { createClient } from '@supabase/supabase-js';
import { OrganizationRepository } from '../../src/repositories/organization.repository';
import { createServiceDb } from '../../src/db/client';

const describeIntegration = hasIntegrationEnv ? describe : describe.skip;

describeIntegration('Sprint 1 exit checklist — integration', () => {
  const config = hasIntegrationEnv ? loadIntegrationConfig() : null!;
  const app = hasIntegrationEnv ? createIdentityApp(config) : null!;
  const client = hasIntegrationEnv ? bindIdentityApp(app!) : null!;

  let bootstrapUser: Awaited<ReturnType<typeof createSupabaseAuthUser>>;
  let platformToken = '';
  let orgId = '';
  let tenantId = '';
  let buUnitCode = '';
  let whCode = '';
  let membershipId = '';

  beforeAll(async () => {
    bootstrapUser = await createSupabaseAuthUser(config, 'sprint1-bootstrap');
  }, 60_000);

  afterAll(async () => {
    if (bootstrapUser?.authUserId) {
      await deleteSupabaseAuthUser(config, bootstrapUser.authUserId);
    }
  });

  it('1. POST /organizations — canonical IDs and contract', async () => {
    const body = buildOrganizationFixture();
    const res = await client!.createOrganization(body, bootstrapUser.accessToken);
    expect(res.status).toBe(201);

    const org = assertContractData(res.body, identityV1Schemas.organization);
    assertCanonicalId(org.tenantId, 'TENANT');
    assertCanonicalId(org.id, 'ORG');

    orgId = org.id;
    tenantId = org.tenantId;
  });

  it('2. POST /business-units', async () => {
    const body = buildBusinessUnitFixture(orgId);
    const res = await client!.createBusinessUnit(body, bootstrapUser.accessToken);
    expect(res.status).toBe(201);

    const bu = assertContractData(res.body, identityV1Schemas.businessUnit);
    assertCanonicalId(bu.id, 'BU');
    expect(bu.organizationId).toBe(orgId);
    buUnitCode = bu.code;
  });

  it('3. POST /warehouses', async () => {
    const body = buildWarehouseFixture(orgId, { businessUnitId: buUnitCode });
    const res = await client!.createWarehouse(body, bootstrapUser.accessToken);
    expect(res.status).toBe(201);

    const wh = assertContractData(res.body, identityV1Schemas.warehouse);
    assertCanonicalId(wh.id, 'WH');
    whCode = wh.code;
  });

  it('4. POST /users/invite — stores invitation', async () => {
    const invitee = buildTestAuthUser('invitee');
    const res = await client!.inviteUser(
      { organizationId: orgId, email: invitee.email, role: 'planner' },
      bootstrapUser.accessToken,
    );
    expect(res.status).toBe(201);

    const invitation = assertContractData(res.body, identityV1Schemas.invitation);
    assertCanonicalId(invitation.id, 'INV');
    expect(invitation.status).toBe('pending');
    expect(invitation.email).toBe(invitee.email.toLowerCase());
  });

  it('5. duplicate invite returns 409', async () => {
    const invitee = buildTestAuthUser('dup');
    const first = await client!.inviteUser(
      { organizationId: orgId, email: invitee.email, role: 'operator' },
      bootstrapUser.accessToken,
    );
    expect(first.status).toBe(201);

    const dup = await client!.inviteUser(
      { organizationId: orgId, email: invitee.email, role: 'operator' },
      bootstrapUser.accessToken,
    );
    expect(dup.status).toBe(409);
    expect((dup.body as { error: { code: string } }).error.code).toBe('INVITE_ALREADY_PENDING');
  });

  it('6. POST /auth/login — issues platform JWT', async () => {
    const res = await client!.login({
      email:    bootstrapUser.email,
      password: bootstrapUser.password,
    });
    expect(res.status).toBe(200);

    const login = assertContractData(res.body, identityV1Schemas.loginResponse);
    expect(login.tokenType).toBe('Bearer');
    expect(login.accessToken.split('.').length).toBe(3);
    expect(login.user.schemaVersion).toBe('v1');
    expect(login.user.tenantId).toBe(tenantId);
    expect(login.user.organizationId).toBe(orgId);

    platformToken = login.accessToken;
    membershipId = login.user.membershipId;
    assertCanonicalId(membershipId, 'MEM');
  });

  it('7. GET /auth/me — org, membership, warehouse context', async () => {
    const res = await client!.me(platformToken);
    expect(res.status).toBe(200);

    const me = assertContractData(res.body, identityV1Schemas.currentUser);
    expect(me.organization?.id).toBe(orgId);
    expect(me.membership?.id).toBe(membershipId);
    expect(me.membership?.status).toBe('active');
    expect(me.warehouses?.some(w => w.code === whCode)).toBe(true);
  });

  it('8. soft-deleted organization is not returned', async () => {
    const db = createServiceDb({
      url:            config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceKey,
      anonKey:        config.supabaseAnonKey,
    });
    const orgRepo = new OrganizationRepository(db);
    await orgRepo.softDeleteByCode(orgId);
    const found = await orgRepo.findByCode(orgId);
    expect(found).toBeNull();
  });

  it('9. RLS blocks cross-tenant read for authenticated user', async () => {
    const outsider = await createSupabaseAuthUser(config, 'outsider');
    try {
      const authed = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${outsider.accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await authed.schema('platform')
        .from('organizations')
        .select('code')
        .eq('code', orgId);

      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    } finally {
      await deleteSupabaseAuthUser(config, outsider.authUserId);
    }
  });
});
