/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Granular invalidation: UPDATE → only the changed row's detail key.
 *                        INSERT/DELETE → the list key too.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

export function useRealtimeTripsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `trips:org:${organizationId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        const tripId = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;

        // Silent merge on UPDATE — avoids refetch storm when status is mirrored in chat payloads.
        if (tripId && payload.eventType === 'UPDATE' && payload.new && typeof payload.new === 'object') {
          qc.setQueryData(queryKeys.trips.detail(tripId), (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            return { ...(old as Record<string, unknown>), ...(payload.new as object) };
          });
        } else if (tripId) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
        }

        // Invalidate list only on INSERT or DELETE (UPDATE just changes the row in-place)
        if (payload.eventType !== 'UPDATE') {
          qc.invalidateQueries({ queryKey: queryKeys.trips.all(organizationId) });
          qc.invalidateQueries({ queryKey: queryKeys.trips.finite(organizationId) });
          qc.invalidateQueries({ queryKey: queryKeys.trips.whereOrgIsClient(organizationId) });
          qc.invalidateQueries({ queryKey: queryKeys.trips.whereOrgIsSupplier(organizationId) });
        } else {
          // UPDATE: update the list cache in-place to avoid a full refetch
          qc.setQueriesData(
            { queryKey: queryKeys.trips.finite(organizationId) },
            (old: unknown) => {
              if (!Array.isArray(old) || !tripId) return old;
              const updated = payload.new as Record<string, unknown>;
              return old.map((t: { id: string }) => (t.id === tripId ? { ...t, ...updated } : t));
            },
          );
        }

        qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
        qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
      },
    );
  }, [organizationId, qc]);
}

export function useRealtimeTransactionsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `transactions:org:${organizationId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        const txId =
          (payload.new as { id?: string } | undefined)?.id ??
          (payload.old as { id?: string } | undefined)?.id ??
          null;
        if (txId) {
          qc.setQueriesData(
            { queryKey: queryKeys.transactions.finite(organizationId) },
            (old: unknown) => {
              if (!Array.isArray(old)) return old;
              const row = (payload.new as Record<string, unknown> | undefined) ?? {};
              let found = false;
              const next = old.map((item: { id: string }) => {
                if (item.id !== txId) return item;
                found = true;
                return { ...item, ...row };
              });
              if (!found && Object.keys(row).length > 0) next.unshift({ id: txId, ...row });
              return next;
            },
          );
        }
        // Still invalidate aggregates keyed under transactions root.
        qc.invalidateQueries({ queryKey: queryKeys.transactions.all(organizationId) });
      },
    );
  }, [organizationId, qc]);
}

/**
 * No-op: clients/suppliers/drivers are slow-changing; mutations invalidate manually.
 * Realtime on these tables added ~50% WAL decoder overhead with negligible benefit.
 */
export function useRealtimeNetworkInvalidation(_organizationId: string | null) {}
