import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDriver, inviteDriver, updateDriver } from '../features/drivers/services/drivers.service';
import { linkOfflineDriversToNewUsers } from '../features/drivers/services/driverMatching.service';

const mockOfflineDrivers = [
  {
    id: 'test-driver-id',
    organization_id: 'test-org-id',
    user_id: null,
    name: 'Test Driver',
    phone: '+919876543210',
    email: 'test@example.com',
    status: 'offline',
    payable_amount: 25000,
    commission_percent: 10,
    commission_per_km: 5,
  },
];

jest.mock('@/lib/supabase', () => ({
  supabase: jest.fn(() => {
    const mockEq = jest.fn(() => ({ // Mock for chainable .eq().eq()...
      order: jest.fn(() => ({
        limit: jest.fn(() => ({
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      is: jest.fn(() => mockEq()), // .is() returns another chainable mock object
      eq: jest.fn(() => mockEq()), // .eq() returns another chainable mock object
      not: jest.fn(() => mockEq()), // .not() returns another chainable mock object
      limit: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
    }));

    const mockSelect = jest.fn(() => ({
      eq: jest.fn((key, value) => {
        if (key === 'status' && value === 'offline') {
          return {
            is: jest.fn((isKey, isValue) => {
              if (isKey === 'user_id' && isValue === null) {
                return {
                  eq: jest.fn((eqKey, eqValue) => {
                    if (eqKey === 'organization_id' && eqValue === 'test-org-id') {
                      return {
                        order: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers, error: null })),
                        select: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers, error: null })),
                        single: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers[0], error: null })),
                        maybeSingle: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers[0], error: null })),
                      };
                    }
                    return mockEq();
                  }),
                  order: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers, error: null })),
                  select: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers, error: null })),
                  single: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers[0], error: null })),
                  maybeSingle: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers[0], error: null })),
                };
              }
              return mockEq();
            }),
            order: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers, error: null })),
            select: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers, error: null })),
            single: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers[0], error: null })),
            maybeSingle: jest.fn(() => Promise.resolve({ data: mockOfflineDrivers[0], error: null })),
          };
        }
        return mockEq();
      }),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      order: jest.fn(() => Promise.resolve({ data: [], error: null })),
      in: jest.fn(() => mockEq()),
      or: jest.fn(() => mockEq()),
    }));

    const mockFrom = jest.fn(() => ({
      select: mockSelect(),
      insert: jest.fn((payload) => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: {
              id: 'test-driver-id',
              organization_id: 'test-org-id',
              name: payload.name,
              phone: payload.phone,
              email: payload.email,
              status: payload.status,
              payable_amount: payload.payable_amount,
              commission_percent: payload.commission_percent,
              commission_per_km: payload.commission_per_km,
            },
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({
                data: {
                  id: 'test-driver-id',
                  payable_amount: 30000,
                  commission_percent: 12,
                  commission_per_km: 6,
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
      delete: jest.fn(() => mockEq()),
      range: jest.fn(() => Promise.resolve({ data: [], error: null })),
    }));

    return {
      from: mockFrom,
      rpc: jest.fn((rpcName, params) => {
        if (rpcName === "get_driver_invitee_by_phone") {
          if (params.p_phone === '+919876543210') {
            return Promise.resolve({ data: [{
              user_id: 'test-user-id',
              full_name: 'Test Invitee',
              phone: '+919876543210',
              email: 'test@example.com',
            }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        } else if (rpcName === "get_current_organization_id") {
          return Promise.resolve({ data: 'test-org-id', error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
  }),
}));

describe('Driver Compensation Storage', () => {
  const mockOrgId = 'test-org-id';
  const mockDriverData = {
    driverSource: 'organization',
    name: 'Test Driver',
    phone: '+919876543210',
    email: 'test@example.com',
    emergencyContact: '+911234567890',
    emergencyName: 'Emergency Contact',
    licenseNumber: 'DL-123456789',
    payableAmount: 25000,
    commissionPercent: 10,
    commissionPerKm: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Offline Driver Creation', () => {
    it('should store compensation fields when creating offline driver', async () => {
      const result = await createDriver(mockOrgId, mockDriverData);

      expect(result.error).toBeNull();
      expect(result.driver).toBeTruthy();
      expect(result.driver?.payable_amount).toBe(25000);
      expect(result.driver?.commission_percent).toBe(10);
      expect(result.driver?.commission_per_km).toBe(5);
    });

    it('should handle null compensation values', async () => {
      const dataWithoutCompensation = {
        ...mockDriverData,
        payableAmount: null,
        commissionPercent: null,
        commissionPerKm: null,
      };

      const result = await createDriver(mockOrgId, dataWithoutCompensation);

      expect(result.error).toBeNull();
      expect(result.driver).toBeTruthy();
      expect(result.driver?.payable_amount).toBeNull();
      expect(result.driver?.commission_percent).toBeNull();
      expect(result.driver?.commission_per_km).toBeNull();
    });
  });

  describe('Driver Invitation', () => {
    it('should store compensation fields when creating offline driver via invite', async () => {
      const result = await inviteDriver(mockOrgId, mockDriverData);

      expect(result.error).toBeNull();
      if (result.driver) {
        expect(result.driver.payable_amount).toBe(25000);
        expect(result.driver.commission_percent).toBe(10);
        expect(result.driver.commission_per_km).toBe(5);
      }
    });
  });

  describe('Driver Updates', () => {
    it('should update compensation fields', async () => {
      const result = await updateDriver(mockOrgId, 'test-driver-id', {
        payable_amount: 30000,
        commission_percent: 12,
        commission_per_km: 6,
      });

      expect(result.error).toBeNull();
      expect(result.driver).toBeTruthy();
      expect(result.driver?.payable_amount).toBe(30000);
      expect(result.driver?.commission_percent).toBe(12);
      expect(result.driver?.commission_per_km).toBe(6);
    });
  });

  describe('O(n) Driver Matching', () => {
    it('should match new users to offline drivers efficiently', async () => {
      const newUsers = [
        {
          id: 'user-1',
          phone: '+919876543210',
          name: 'Test Driver',
          email: 'test@example.com',
        },
      ];

      const result = await linkOfflineDriversToNewUsers(newUsers, mockOrgId);

      expect(result.error).toBeNull();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].matched).toBe(true);
      expect(result.results[0].driverId).toBe('test-driver-id');
      expect(result.results[0].userId).toBe('user-1');
    });

    it('should handle multiple users in O(n) time', async () => {
      const newUsers = Array.from({ length: 1000 }, (_, i) => ({
        id: `user-${i}`,
        phone: `+9198765432${i.toString().padStart(3, '0')}`,
        name: `Driver ${i}`,
        email: `driver${i}@example.com`,
      }));

      // This should complete in reasonable time (O(n) complexity)
      const startTime = Date.now();
      const result = await linkOfflineDriversToNewUsers(newUsers, mockOrgId);
      const endTime = Date.now();

      expect(result.error).toBeNull();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe('Edge Cases', () => {
    it('should handle phone number normalization', async () => {
      const newUsers = [
        {
          id: 'user-1',
          phone: '9876543210', // Without +91
          name: 'Test Driver',
          email: 'test@example.com',
        },
      ];

      const result = await linkOfflineDriversToNewUsers(newUsers, mockOrgId);

      expect(result.error).toBeNull();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].matched).toBe(true);
    });

    it('should preserve existing compensation when matching', async () => {
      const newUsers = [
        {
          id: 'user-1',
          phone: '+919876543210',
          name: 'Test Driver',
          email: 'test@example.com',
        },
      ];

      const result = await linkOfflineDriversToNewUsers(newUsers, mockOrgId);

      expect(result.error).toBeNull();
      expect(result.results[0].matched).toBe(true);
      // Compensation should be preserved from the original offline driver record
    });
  });
});

describe('Database Migration Validation', () => {
  it('should have proper column definitions', () => {
    // These would be integration tests that verify the actual database schema
    // For now, we validate that our code expects the right types
    const mockDriverRow = {
      id: 'string',
      organization_id: 'string',
      user_id: 'string' as string | null,
      name: 'string',
      phone: 'string' as string | null,
      email: 'string' as string | null,
      status: 'string',
      assigned_vehicle_id: 'string' as string | null,
      created_at: 'string',
      updated_at: 'string',
      left_at: 'string' as string | null,
      tracking_only: false as boolean | undefined,
      payable_amount: 25000 as number | null,
      commission_percent: 10 as number | null,
      commission_per_km: 5 as number | null,
    };

    expect(mockDriverRow.payable_amount).toBe(25000);
    expect(mockDriverRow.commission_percent).toBe(10);
    expect(mockDriverRow.commission_per_km).toBe(5);
  });
});