/**
 * Centralized query key factory for TanStack Query.
 * Single source of truth for cache keys; supports invalidation by scope.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
export const queryKeys = {
  all: ['q'] as const,

  trips: {
    all: (orgId: string) => ['q', 'trips', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'trips', orgId, opts] as const) : (['q', 'trips', orgId] as const),
    detail: (tripId: string) => ['q', 'trips', 'detail', tripId] as const,
    byDriver: (driverId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'trips', 'driver', driverId, opts] as const) : (['q', 'trips', 'driver', driverId] as const),
    byDriverIds: (driverIds: string[], opts?: { limit?: number; offset?: number }) =>
      (['q', 'trips', 'driverIds', driverIds.join(','), opts ?? {}] as const),
    whereOrgIsClient: (orgId: string) => ['q', 'trips', 'orgIsClient', orgId] as const,
    whereOrgIsSupplier: (orgId: string) => ['q', 'trips', 'orgIsSupplier', orgId] as const,
    shipperNamesForSupplier: (orgId: string) => ['q', 'trips', 'shipperNames', orgId] as const,
  },

  transactions: {
    all: (orgId: string) => ['q', 'transactions', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number; partyName?: string }) =>
      opts ? (['q', 'transactions', orgId, opts] as const) : (['q', 'transactions', orgId] as const),
    byContact: (orgId: string, contactId: string) => ['q', 'transactions', orgId, 'contact', contactId] as const,
    byDriver: (orgId: string, driverId: string) => ['q', 'transactions', orgId, 'driver', driverId] as const,
  },

  clients: {
    all: (orgId: string) => ['q', 'clients', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'clients', orgId, opts] as const) : (['q', 'clients', orgId] as const),
    detail: (orgId: string, clientId: string) => ['q', 'clients', orgId, clientId] as const,
  },

  suppliers: {
    all: (orgId: string) => ['q', 'suppliers', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'suppliers', orgId, opts] as const) : (['q', 'suppliers', orgId] as const),
    detail: (orgId: string, supplierId: string) => ['q', 'suppliers', orgId, supplierId] as const,
  },

  drivers: {
    all: (orgId: string) => ['q', 'drivers', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'drivers', orgId, opts] as const) : (['q', 'drivers', orgId] as const),
    detail: (orgId: string, driverId: string) => ['q', 'drivers', orgId, driverId] as const,
  },

  vehicles: {
    all: (orgId: string) => ['q', 'vehicles', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'vehicles', orgId, opts] as const) : (['q', 'vehicles', orgId] as const),
    detail: (orgId: string, vehicleId: string) => ['q', 'vehicles', orgId, vehicleId] as const,
  },

  indents: {
    all: (orgId: string) => ['q', 'indents', orgId] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts ? (['q', 'indents', orgId, opts] as const) : (['q', 'indents', orgId] as const),
    market: (orgId: string) => ['q', 'indents', orgId, 'market'] as const,
    /** Finance aggregation: pending/quoted/awarded indents (pre-trip amount visibility). */
    forFinance: (orgId: string) => ['q', 'indents', orgId, 'finance'] as const,
    /** Finance aggregation: accepted direct quotes for indents owned by this org. */
    acceptedQuotes: (orgId: string) => ['q', 'indents', orgId, 'acceptedQuotes'] as const,
  },

  connectionRequests: {
    received: (orgId: string) => ['q', 'connection-requests', 'received', orgId] as const,
    sent: (orgId: string) => ['q', 'connection-requests', 'sent', orgId] as const,
  },

  driverInvites: {
    sent: (orgId: string) => ['q', 'driver-invites', 'sent', orgId] as const,
  },

  salaryRequests: (orgId: string, status?: string) =>
    status ? (['q', 'salary-requests', orgId, status] as const) : (['q', 'salary-requests', orgId] as const),

  driverOffers: (orgId: string) => ['q', 'driver-offers', orgId] as const,
} as const;
