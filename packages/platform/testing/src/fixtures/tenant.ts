import { randomUUID } from 'crypto';

export interface TenantFixtureInput {
  name?: string;
}

export function buildTenantFixture(input: TenantFixtureInput = {}) {
  const suffix = randomUUID().slice(0, 8);
  return {
    name: input.name ?? `Test Tenant ${suffix}`,
  };
}
