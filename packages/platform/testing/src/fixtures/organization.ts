import { randomUUID } from 'crypto';

export interface OrganizationFixtureInput {
  name?:      string;
  legalName?: string;
}

export function buildOrganizationFixture(input: OrganizationFixtureInput = {}) {
  const suffix = randomUUID().slice(0, 8);
  return {
    name:      input.name ?? `Test Org ${suffix}`,
    legalName: input.legalName,
  };
}

export function buildBusinessUnitFixture(organizationId: string, input: { name?: string; code?: string } = {}) {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  return {
    organizationId,
    name: input.name ?? `Business Unit ${suffix}`,
    code: input.code ?? `BU-${suffix}`,
  };
}

export function buildWarehouseFixture(
  organizationId: string,
  input: { name?: string; code?: string; businessUnitId?: string } = {},
) {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  return {
    organizationId,
    businessUnitId: input.businessUnitId,
    name:           input.name ?? `Warehouse ${suffix}`,
    code:           input.code ?? `WH-${suffix}`,
    address: {
      line1:      '100 Test Lane',
      city:       'Mumbai',
      state:      'MH',
      postalCode: '400001',
      country:    'IN',
    },
  };
}
