/**
 * GlobalSyncContext — mounts once in _layout.tsx, owns two responsibilities:
 *
 * 1. BOOTSTRAP: calls get_global_app_bootstrap on org change to hydrate
 *    useGlobalSyncStore (notifications, alerts, network_status, active_trips).
 *
 * 2. REALTIME MULTIPLEXER: single Supabase channel per org that routes all
 *    non-chat Postgres CDC events to useGlobalSyncStore.routeRealtimeEvent().
 *    Adding a new feature slice = add one case to the router. Zero other changes.
 *
 * Read receipts for **trip chat** are debounced in `enqueueReadReceiptsDebounced`
 * (`READ_RECEIPT_DEBOUNCE_MS`). Global notification rows here are optimistic-only
 * until a future batched RPC is wired.
 *
 * Chat state (trip_messages, trip_conversations) is NOT handled here.
 * That remains in TripChatContext / useChatStore.
 */

import React, { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateFleetDriverConnectionCaches } from '@/lib/invalidateFleetDriverConnectionCaches';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { useGlobalSyncStore } from './useGlobalSyncStore';

// ── Context (thin — only expose manual refresh) ───────────────────────────────

interface GlobalSyncContextValue {
  /** Force a fresh bootstrap (e.g. after pull-to-refresh). */
  refresh: () => void;
}

const GlobalSyncContext = createContext<GlobalSyncContextValue>({
  refresh: () => {},
});

export function useGlobalSync(): GlobalSyncContextValue {
  return useContext(GlobalSyncContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function GlobalSyncProvider({ children }: { children: ReactNode }) {
  const orgCtx = useOptionalOrganization();
  const orgId = orgCtx?.currentOrganization?.id ?? null;
  const queryClient = useQueryClient();

  // ── Bootstrap on org change ───────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    void useGlobalSyncStore.getState().bootstrap(orgId);
    return () => {
      useGlobalSyncStore.getState().reset();
    };
  }, [orgId]);

  const refresh = useCallback(() => {
    if (!orgId) return;
    void useGlobalSyncStore.getState().bootstrap(orgId, { force: true });
  }, [orgId]);

  // ── Unified Realtime Multiplexer ──────────────────────────────────────────
  // Single channel, three table listeners, zero SELECT queries after bootstrap.
  useEffect(() => {
    if (!orgId) return;

    return subscribeSharedPostgresChanges(
      `global_sync:${orgId}`,
      [
        // Salary requests this org owns
        {
          event:  '*',
          schema: 'public',
          table:  'driver_salary_requests',
          filter: `organization_id=eq.${orgId}`,
        },
        // Disputes (no filter — RLS gates delivery; client checks orgId)
        {
          event:  '*',
          schema: 'public',
          table:  'dispute',
        },
        // Org links this org owns
        {
          event:  '*',
          schema: 'public',
          table:  'organization_links',
          filter: `owner_org_id=eq.${orgId}`,
        },
        // Fleet trip health for Operations Island (patches `activeTrips` in-memory).
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'trips',
          filter: `organization_id=eq.${orgId}`,
        },
        // Cross-device ops cockpit dismiss (island + sidebar + idle toast).
        {
          event:  '*',
          schema: 'public',
          table:  'b2b_operations_dismissals',
          filter: `organization_id=eq.${orgId}`,
        },
        // Shared-ledger bell rows (registry finance section).
        {
          event:  '*',
          schema: 'public',
          table:  'shared_ledger_notifications',
          filter: `organization_id=eq.${orgId}`,
        },
        // Inbound Protocol — connection invites (from / to this org).
        {
          event:  '*',
          schema: 'public',
          table:  'connection_requests',
          filter: `from_organization_id=eq.${orgId}`,
        },
        {
          event:  '*',
          schema: 'public',
          table:  'connection_requests',
          filter: `to_organization_id=eq.${orgId}`,
        },
        // Fleet driver invites — refresh roster when driver accepts/declines.
        {
          event:  '*',
          schema: 'public',
          table:  'driver_invites',
          filter: `from_organization_id=eq.${orgId}`,
        },
        // New/updated driver rows after invite accept (or manual roster edits).
        {
          event:  'INSERT',
          schema: 'public',
          table:  'drivers',
          filter: `organization_id=eq.${orgId}`,
        },
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'drivers',
          filter: `organization_id=eq.${orgId}`,
        },
      ],
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const table     = payload.table;
        const eventType = payload.eventType;
        const row       = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;

        // Dispute events arrive for ALL orgs (no channel filter) — gate client-side.
        if (table === 'dispute') {
          const raised  = row.raised_by_org_id as string | undefined;
          const partner = row.partner_org_id   as string | undefined;
          if (raised !== orgId && partner !== orgId) return;
        }

        if (table === 'connection_requests') {
          void useGlobalSyncStore
            .getState()
            .refreshInboundProtocol(orgId)
            .catch(() => {});
          // When an invite is approved the DB trigger creates/updates supplier + client
          // rows for both orgs. Invalidate those caches so both sides see the change
          // without waiting for the next full bootstrap.
          if (eventType === 'UPDATE' && row.status === 'approved') {
            queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.finite(orgId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.finite(orgId) });
          }
          return;
        }

        if (table === 'driver_invites' || table === 'drivers') {
          void invalidateFleetDriverConnectionCaches(queryClient, orgId);
          if (table === 'driver_invites') {
            void useGlobalSyncStore
              .getState()
              .refreshInboundProtocol(orgId)
              .catch(() => {});
          }
          return;
        }

        useGlobalSyncStore.getState().routeRealtimeEvent(table, eventType, row, orgId);
      },
    );
  }, [orgId, queryClient]);

  return (
    <GlobalSyncContext.Provider value={{ refresh }}>
      {children}
    </GlobalSyncContext.Provider>
  );
}
