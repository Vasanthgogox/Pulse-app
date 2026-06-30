import { describe, it, expect } from 'vitest';
import {
  IDENTITY_PERMISSION_MATRIX,
  endpointAllowsRole,
} from '@pulse/platform-testing';

describe('Identity permission matrix (contracts)', () => {
  it('admin can invite users; planner and operator cannot', () => {
    expect(endpointAllowsRole('POST /users/invite', 'admin')).toBe(true);
    expect(endpointAllowsRole('POST /users/invite', 'planner')).toBe(false);
    expect(endpointAllowsRole('POST /users/invite', 'operator')).toBe(false);
  });

  it('admin and planner can create warehouses; operator cannot', () => {
    expect(endpointAllowsRole('POST /warehouses', 'admin')).toBe(true);
    expect(endpointAllowsRole('POST /warehouses', 'planner')).toBe(true);
    expect(endpointAllowsRole('POST /warehouses', 'operator')).toBe(false);
  });

  it('documents full matrix for Identity v1', () => {
    expect(IDENTITY_PERMISSION_MATRIX['POST /business-units'].admin).toBe(true);
    expect(IDENTITY_PERMISSION_MATRIX['POST /business-units'].planner).toBe(false);
    expect(IDENTITY_PERMISSION_MATRIX['GET /auth/me'].operator).toBe(true);
  });
});
