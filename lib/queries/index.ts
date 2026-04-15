/**
 * Central export for TanStack Query hooks. Use these for cache + optional pagination.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
export { useRealtimeTripsInvalidation, useRealtimeTransactionsInvalidation } from '@/lib/supabase/realtime-invalidation';
export {
  useTripsQuery,
  useTripsInfiniteQuery,
  useTripDetailQuery,
  useShipperDisplayNamesQuery,
  useAssignmentAuditQuery,
  useInvalidateTrips,
} from './useTripsQuery';
export {
  useTransactionsQuery,
  useTransactionsInfiniteQuery,
  useInvalidateTransactions,
} from './useTransactionsQuery';
export { useClientsQuery, useClientsInfiniteQuery, useInvalidateClients } from './useClientsQuery';
export { useSuppliersQuery, useInvalidateSuppliers } from './useSuppliersQuery';
export { useDriversQuery, useInvalidateDrivers } from './useDriversQuery';
export { useVehiclesQuery, useInvalidateVehicles } from './useVehiclesQuery';
export {
  useIndentsQuery,
  useIndentsInfiniteQuery,
  useMarketIndentsQuery,
  useMyDirectQuotesQuery,
  useIndentDirectQuotesQuery,
  useDirectQuoteCountsQuery,
  useInvalidateIndents,
} from './useIndentsQuery';
export {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
  useDriverInvitesSentQuery,
  useInvalidateNetwork,
} from './useNetworkQueries';
export {
  useTripsWhereOrgIsClientQuery,
  useTripsWhereOrgIsSupplierQuery,
  useIndentsForFinanceQuery,
  useAcceptedDirectQuotesForFinanceQuery,
  useDriverOffersQuery,
  useSalaryRequestsQuery,
} from './useFinanceEntityQueries';
