/**
 * Query hooks for Finance screen entity data. Used by useFinanceEntities to read from cache.
 */
import { useQuery } from '@tanstack/react-query';
import { getTripsWhereOrgIsClient, getTripsWhereOrgIsSupplier } from '@/features/trips/services/trips.service';
import { getDriverOffersByOrganization } from '@/features/drivers/services/drivers.service';
import { getSalaryRequestsByOrganization } from '@/services/salaryRequestsService';
import { getIndentsByOrganization } from '@/features/indents/services/indents.service';
import { getAcceptedDirectQuotesByOrg } from '@/features/indents/services/direct-quotes.service';
import { getTripSubcontracts } from '@/features/finance/services/tripSubcontracts.service';
import { queryKeys } from '@/lib/queryKeys';

export function useTripsWhereOrgIsClientQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.whereOrgIsClient(orgId ?? ''),
    queryFn: async () => {
      const res = await getTripsWhereOrgIsClient(orgId!);
      if (res.error) throw res.error;
      return res.trips;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

/** Trips owned by other orgs where this org is the supplier (carrier view). Used in Customers tab aggregation. */
export function useTripsWhereOrgIsSupplierQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.whereOrgIsSupplier(orgId ?? ''),
    queryFn: async () => {
      const res = await getTripsWhereOrgIsSupplier(orgId!);
      if (res.error) throw res.error;
      return res.trips;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

/**
 * Indents for finance aggregation: pending/quoted/awarded status only.
 * Completed and cancelled indents are excluded — they're covered by trips or irrelevant.
 */
export function useIndentsForFinanceQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.indents.forFinance(orgId ?? ''),
    queryFn: async () => {
      const res = await getIndentsByOrganization(orgId!);
      if (res.error) throw res.error;
      // Filter to only pre-trip statuses. 'completed' indents already have a trip row.
      return (res.indents ?? []).filter(
        (i) => i.status !== 'completed' && i.status !== 'cancelled'
      );
    },
    enabled: !!orgId,
  });
}

/**
 * Accepted direct quotes for indents owned by this org.
 * Available for screens that need awarded-quote data; supplier Finance tab payables use trips only.
 */
export function useAcceptedDirectQuotesForFinanceQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.indents.acceptedQuotes(orgId ?? ''),
    queryFn: async () => {
      const res = await getAcceptedDirectQuotesByOrg(orgId!);
      if (res.error) throw res.error;
      return res.quotes ?? [];
    },
    enabled: !!orgId,
  });
}

export function useDriverOffersQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.driverOffers(orgId ?? ''),
    queryFn: async () => {
      const res = await getDriverOffersByOrganization(orgId!);
      if (res.error) throw res.error;
      return res.offersByDriverId ?? {};
    },
    enabled: !!orgId,
  });
}

export function useSalaryRequestsQuery(orgId: string | null, status?: 'pending' | 'approved' | 'rejected' | 'paid') {
  return useQuery({
    queryKey: queryKeys.salaryRequests(orgId ?? '', status),
    queryFn: async () => {
      const res = await getSalaryRequestsByOrganization(orgId!, status);
      if (res.error) throw res.error;
      return res.requests ?? [];
    },
    enabled: !!orgId,
  });
}

export function useTripSubcontractsQuery(orgId: string | null, tripIds: string[]) {
  const normalizedTripIds = [...tripIds].sort();
  return useQuery({
    queryKey: ['q', 'trips', 'subcontracts', orgId ?? '', normalizedTripIds],
    queryFn: async () => {
      const res = await getTripSubcontracts({ viewerOrgId: orgId!, tripIds: normalizedTripIds });
      if (res.error) throw res.error;
      return res.rows ?? [];
    },
    enabled: !!orgId && normalizedTripIds.length > 0,
  });
}
