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

        // Shipper names only change when client_id or client_name changes — not on status/location
        // updates. Firing this on every realtime event caused a spurious RPC call on every GPS ping.
        const newRow = payload.new as Record<string, unknown> | null;
        const oldRow = payload.old as Record<string, unknown> | null;
        const clientChanged =
          payload.eventType !== 'UPDATE' ||
          newRow?.client_id !== oldRow?.client_id ||
          newRow?.client_name !== oldRow?.client_name;
        if (clientChanged) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
        }

        // Assignment audit only matters when driver/vehicle/assigner fields change.
        const assignmentChanged =
          payload.eventType !== 'UPDATE' ||
          newRow?.driver_id !== oldRow?.driver_id ||
          newRow?.vehicle_id !== oldRow?.vehicle_id ||
          newRow?.assigned_by_user_id !== oldRow?.assigned_by_user_id ||
          newRow?.status !== oldRow?.status;
        if (assignmentChanged) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
        }
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
 * Subscribes to connection_requests (low-write) and invalidates clients/suppliers
 * when a request involving this org transitions to 'approved'. This is the only
 * cross-org cache bust path — the approving org invalidates itself manually, but
 * the requesting org has no other signal.
 */
export function useRealtimeNetworkInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.received(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.sent(organizationId) });
    };

    const isApproval = (payload: { eventType: string; new: unknown }) =>
      payload.eventType === 'UPDATE' &&
      (payload.new as { status?: string })?.status === 'approved';

    // Two subscriptions: one for requests this org sent, one for requests it received.
    const unsubFrom = subscribeSharedPostgresChanges(
      `conn_req:from:${organizationId}`,
      [{ event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `from_organization_id=eq.${organizationId}` }],
      (payload) => { if (isApproval(payload)) invalidate(); },
    );

    const unsubTo = subscribeSharedPostgresChanges(
      `conn_req:to:${organizationId}`,
      [{ event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `to_organization_id=eq.${organizationId}` }],
      (payload) => { if (isApproval(payload)) invalidate(); },
    );

    return () => { unsubFrom(); unsubTo(); };
  }, [organizationId, qc]);
}
