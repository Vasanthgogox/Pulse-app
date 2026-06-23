import {
  validateCreateSubcontractPayload,
  type CreateSubcontractPayload,
} from '@/types/subcontracts';

describe('validateCreateSubcontractPayload', () => {
  const base: CreateSubcontractPayload = {
    parent_trip_id: 'trip-1',
    sourcing_org_id: 'org-1',
    sub_supplier_on_platform: true,
    sub_supplier_org_id: 'org-2',
  };

  it('requires sub_supplier_org_id when on-platform', () => {
    const err = validateCreateSubcontractPayload({
      ...base,
      sub_supplier_org_id: undefined,
    });
    expect(err).toMatch(/sub_supplier_org_id/);
  });

  it('requires sub_supplier_name when off-platform', () => {
    const err = validateCreateSubcontractPayload({
      parent_trip_id: 'trip-1',
      sourcing_org_id: 'org-1',
      sub_supplier_on_platform: false,
    });
    expect(err).toMatch(/sub_supplier_name/);
  });

  it('accepts valid on-platform payload', () => {
    expect(validateCreateSubcontractPayload(base)).toBeNull();
  });

  it('accepts valid off-platform payload', () => {
    expect(
      validateCreateSubcontractPayload({
        parent_trip_id: 'trip-1',
        sourcing_org_id: 'org-1',
        sub_supplier_on_platform: false,
        sub_supplier_name: 'Ravi Transport',
        sub_supplier_phone: '+919876543210',
      }),
    ).toBeNull();
  });
});
