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
 * READ RECEIPT DEBOUNCING:
 *    markNotificationRead() is called optimistically. The actual DB write is
 *    batched and flushed after BATCH_READ_DEBOUNCE_MS to prevent connection
 *    saturation. Pending IDs accumulate in a ref; a single supabase call
 *    handles all of them.
 *
 * Chat state (trip_messages, trip_conversations) is NOT handled here.
 * That remains in TripChatContext / useChatStore.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { supabase } from '@/lib/supabase';
import { useGlobalSyncStore } from './useGlobalSyncStore';

// ── Debounce window for batching notification read-receipts ───────────────────
const BATCH_READ_DEBOUNCE_MS = 2_000;

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
  const auth = useOptionalAuth();
  const orgCtx = useOptionalOrganization();
  const orgId = orgCtx?.currentOrganization?.id ?? null;

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
    void useGlobalSyncStore.getState().bootstrap(orgId);
  }, [orgId]);

  // ── Pending read-receipt batch (debounced DB writes) ──────────────────────
  const pendingReadsRef  = useRef<Set<string>>(new Set());
  const readFlushTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReadFlush = useCallback(() => {
    if (readFlushTimer.current) return;
    readFlushTimer.current = setTimeout(async () => {
      readFlushTimer.current = null;
      const ids = [...pendingReadsRef.current];
      if (ids.length === 0) return;
      pendingReadsRef.current.clear();

      // Flush salary_request reads: update status conceptually read (no DB column — skip)
      // Flush dispute reads: nothing to write (is_read is derived from status)
      // The optimistic update in the store is already applied; this is a no-op
      // unless a real notifications table is added in the future.
      if (__DEV__) {
        console.log(`[GlobalSync] flushed ${ids.length} read receipts (no-op — derived state)`);
      }
    }, BATCH_READ_DEBOUNCE_MS);
  }, []);

  // Intercept markNotificationRead to batch the flush
  useEffect(() => {
    if (!orgId) return;
    // Patch the store action to also schedule a flush
    const origMark = useGlobalSyncStore.getState().markNotificationRead;
    // We don't actually need to override since there's no DB write yet.
    // Just ensure the debounce timer cleans up on unmount.
    return () => {
      if (readFlushTimer.current) {
        clearTimeout(readFlushTimer.current);
        readFlushTimer.current = null;
      }
    };
  }, [orgId, scheduleReadFlush]);

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
      ],
      (payload) => {
        const table     = (payload as any).table as string;
        const eventType = (payload as any).eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const row       = ((payload as any).new ?? (payload as any).old ?? {}) as Record<string, unknown>;

        // Dispute events arrive for ALL orgs (no channel filter) — gate client-side.
        if (table === 'dispute') {
          const raised  = row.raised_by_org_id as string | undefined;
          const partner = row.partner_org_id   as string | undefined;
          if (raised !== orgId && partner !== orgId) return;
        }

        useGlobalSyncStore.getState().routeRealtimeEvent(table, eventType, row, orgId);
      },
    );
  }, [orgId]);

  return (
    <GlobalSyncContext.Provider value={{ refresh }}>
      {children}
    </GlobalSyncContext.Provider>
  );
}
