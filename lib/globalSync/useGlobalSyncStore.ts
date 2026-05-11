/**
 * useGlobalSyncStore — Zustand store for the Global Sync framework.
 *
 * SLICE ARCHITECTURE:
 * ───────────────────
 * The store is organized into four logical slices that are independent
 * and future-proof. Adding a new feature (e.g. Live Map Tracking) only
 * requires:
 *   1. Adding a new slice of state fields here.
 *   2. Adding a new `case` in `routeRealtimeEvent` for the new table.
 *   3. Populating the slice from the `get_global_app_bootstrap` RPC result.
 *
 * Slices:
 *   activeTrips    — Lightweight metadata + last 5 events per active trip.
 *                    Full message history lives in useChatStore (separate).
 *   notifications  — Salary requests + disputes as unified notification rows.
 *   alerts         — Actionable operational alerts requiring user attention.
 *   network        — Organization link counts and partner org list.
 *
 * BOOTSTRAP MODEL (one DB call):
 *   bootstrap(orgId) → get_global_app_bootstrap RPC → populates all slices.
 *   After that: only Realtime CDC events via routeRealtimeEvent() update state.
 *
 * REALTIME:
 *   The GlobalSyncContext mounts a single Supabase Realtime channel and routes
 *   all Postgres changes through routeRealtimeEvent(table, event, row, orgId).
 *   Zero extra DB calls on any event.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import type {
  ActiveTripLastKnownLocation,
  ActiveTripSummary,
  GlobalAlertRow,
  GlobalAppBootstrapPayload,
  GlobalNetworkStatus,
  GlobalNotificationRow,
  GlobalSyncBootstrapStatus,
} from './types';
import type { ClientOperationsRibbon } from './priorityEngine.util';
import {
  buildClientRibbonFromTripMessage,
  mergeClientRibbon,
  selectCurrentActiveAlert,
} from './priorityEngine.util';

// ── Default values ────────────────────────────────────────────────────────────

const DEFAULT_NETWORK_STATUS: GlobalNetworkStatus = {
  total_links:    0,
  client_links:   0,
  supplier_links: 0,
  partner_orgs:   [],
};

// ── Store interface ───────────────────────────────────────────────────────────

interface GlobalSyncStore {
  // ── Bootstrap metadata ──────────────────────────────────────────────────
  bootstrapStatus:    GlobalSyncBootstrapStatus;
  bootstrappedOrgId:  string | null;
  bootstrapDuration:  number | null;  // ms — exposed to health check
  bootstrapError:     string | null;

  // ── Active trips slice ──────────────────────────────────────────────────
  activeTrips: ActiveTripSummary[];

  /** Latest high-priority B2B chat signal (fed from useChatStore Realtime — no SELECT). */
  clientOperationsRibbon: ClientOperationsRibbon | null;

  // ── Notifications slice ─────────────────────────────────────────────────
  notificationRows:         GlobalNotificationRow[];
  notificationUnreadCount:  number;

  // ── Alerts slice ────────────────────────────────────────────────────────
  alertRows: GlobalAlertRow[];

  // ── Network slice ───────────────────────────────────────────────────────
  networkStatus: GlobalNetworkStatus;

  // ── Root actions ─────────────────────────────────────────────────────────
  bootstrap: (orgId: string) => Promise<void>;
  reset:     () => void;

  // ── Unified Realtime router ──────────────────────────────────────────────
  // Single entry point for all Postgres CDC events. New features add a new
  // case here — zero changes needed in the context or subscription layer.
  routeRealtimeEvent: (
    table:  string,
    event:  'INSERT' | 'UPDATE' | 'DELETE',
    row:    Record<string, unknown>,
    orgId:  string,
  ) => void;

  // ── Notifications actions ─────────────────────────────────────────────────
  markNotificationRead:    (id: string) => void;
  markAllNotificationsRead: () => void;
  /**
   * When a B2B `trip_messages` row carries `metadata.global_bell` or
   * `metadata.event_payload.global_bell`, upsert a lightweight bell row and bump
   * unread by 1 (no DB `count(*)` — derived from local rows + delta).
   */
  ingestB2BMessageForBell: (row: {
    id: string;
    content?: string | null;
    created_at?: string | null;
    metadata?: unknown;
  }) => void;

  /** Merge latest location from a chat row into `activeTrips` (no DB / no trigger). */
  applyActiveTripLocationFromChat: (
    tripId: string,
    payload: ActiveTripLastKnownLocation,
  ) => void;

  /** Bump ranking signal when any B2B chat row arrives for this trip (in-memory only). */
  touchActiveTripClientActivity: (tripId: string, atIso?: string) => void;

  /** Priority engine: merge chat row into the operations ribbon when it outranks prior. */
  ingestTripMessageForOperationsIsland: (tripId: string, row: Record<string, unknown>) => void;

  /** Selector helper (reads only in-memory slices). */
  getCurrentActiveOperationAlert: () => ReturnType<typeof selectCurrentActiveAlert>;

  // ── Alerts actions ────────────────────────────────────────────────────────
  dismissAlert: (id: string) => void;
}

// ── Synthesis helpers (pure functions) ───────────────────────────────────────

function salaryRowToNotification(row: Record<string, unknown>): GlobalNotificationRow {
  return {
    id:          `salary_${String(row.id)}`,
    source:      'salary_request',
    source_id:   String(row.id),
    title:       'Salary Request',
    subtitle:    typeof row.request_type === 'string' ? row.request_type : null,
    amount_meta: row.amount != null ? Number(row.amount) : null,
    is_read:     String(row.status ?? 'pending') !== 'pending',
    created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function salaryRowToAlert(row: Record<string, unknown>): GlobalAlertRow {
  const amount = row.amount != null ? Number(row.amount) : null;
  return {
    id:          `salary_${String(row.id)}`,
    source:      'salary_request',
    source_id:   String(row.id),
    alert_type:  'salary_request_pending',
    severity:    'warning',
    title:       'Pending Salary Request',
    body:        amount != null ? `Amount: ₹${amount.toLocaleString('en-IN')}` : 'Awaiting approval',
    amount,
    driver_id:   typeof row.driver_id === 'string' ? row.driver_id : null,
    created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function disputeRowToNotification(
  row:    Record<string, unknown>,
  orgId:  string,
): GlobalNotificationRow {
  const isReceiver = String(row.partner_org_id) === orgId;
  return {
    id:          `dispute_${String(row.id)}`,
    source:      'dispute',
    source_id:   String(row.id),
    title:       isReceiver ? 'Dispute Received' : 'Dispute Raised',
    subtitle:    `Status: ${String(row.status ?? 'OPEN')}`,
    amount_meta: row.partner_snapshot != null ? Number(row.partner_snapshot) : null,
    is_read:     String(row.status ?? 'OPEN') !== 'OPEN',
    created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function disputeRowToAlert(row: Record<string, unknown>): GlobalAlertRow {
  const amount = row.partner_snapshot != null ? Number(row.partner_snapshot) : null;
  return {
    id:          `dispute_${String(row.id)}`,
    source:      'dispute',
    source_id:   String(row.id),
    alert_type:  'dispute_received',
    severity:    'critical',
    title:       'Dispute Received',
    body:        amount != null
      ? `Partner raised a dispute. Amount: ₹${amount.toLocaleString('en-IN')}`
      : 'A partner has raised a dispute against your organisation.',
    amount,
    driver_id:   null,
    created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function countUnread(rows: GlobalNotificationRow[]): number {
  return rows.reduce((n, r) => n + (r.is_read ? 0 : 1), 0);
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex(x => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGlobalSyncStore = create<GlobalSyncStore>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ───────────────────────────────────────────────────────
    bootstrapStatus:          'idle',
    bootstrappedOrgId:        null,
    bootstrapDuration:        null,
    bootstrapError:           null,
    activeTrips:              [],
    clientOperationsRibbon:   null,
    notificationRows:         [],
    notificationUnreadCount:  0,
    alertRows:                [],
    networkStatus:            { ...DEFAULT_NETWORK_STATUS },

    // ── bootstrap ────────────────────────────────────────────────────────────
    bootstrap: async (orgId) => {
      if (get().bootstrappedOrgId === orgId && get().bootstrapStatus === 'ready') return;

      set({ bootstrapStatus: 'loading', bootstrapError: null });
      const t0 = Date.now();

      try {
        const { data, error } = await supabase().rpc('get_global_app_bootstrap', {
          p_org_id: orgId,
        });

        if (error) throw error;

        const payload = data as GlobalAppBootstrapPayload;
        const duration = Date.now() - t0;

        const notifRows: GlobalNotificationRow[] = Array.isArray(payload?.notifications?.rows)
          ? payload.notifications.rows
          : [];

        set({
          bootstrapStatus:         'ready',
          bootstrappedOrgId:       orgId,
          bootstrapDuration:       duration,
          bootstrapError:          null,
          activeTrips:             Array.isArray(payload?.active_trips)   ? payload.active_trips   : [],
          clientOperationsRibbon:  null,
          notificationRows:        notifRows,
          notificationUnreadCount: payload?.notifications?.unread_count ?? countUnread(notifRows),
          alertRows:               Array.isArray(payload?.global_alerts)  ? payload.global_alerts  : [],
          networkStatus:           payload?.network_status ?? { ...DEFAULT_NETWORK_STATUS },
        });
      } catch (err) {
        set({
          bootstrapStatus:   'error',
          bootstrapDuration: Date.now() - t0,
          bootstrapError:    err instanceof Error ? err.message : String(err),
        });
      }
    },

    // ── reset ─────────────────────────────────────────────────────────────────
    reset: () =>
      set({
        bootstrapStatus:         'idle',
        bootstrappedOrgId:       null,
        bootstrapDuration:       null,
        bootstrapError:          null,
        activeTrips:             [],
        clientOperationsRibbon:  null,
        notificationRows:        [],
        notificationUnreadCount: 0,
        alertRows:               [],
        networkStatus:           { ...DEFAULT_NETWORK_STATUS },
      }),

    // ── routeRealtimeEvent ────────────────────────────────────────────────────
    routeRealtimeEvent: (table, event, row, orgId) => {
      const state = get();

      // ── driver_salary_requests ────────────────────────────────────────────
      if (table === 'driver_salary_requests') {
        const notif   = salaryRowToNotification(row);
        const isPending = String(row.status ?? 'pending') === 'pending';

        if (event === 'INSERT') {
          const nextNotifs = upsertById(state.notificationRows, notif);
          const nextAlerts = isPending
            ? upsertById(state.alertRows, salaryRowToAlert(row))
            : state.alertRows;
          set({
            notificationRows:        nextNotifs,
            notificationUnreadCount: countUnread(nextNotifs),
            alertRows:               nextAlerts,
          });
        } else if (event === 'UPDATE') {
          const nextNotifs = upsertById(state.notificationRows, notif);
          const alertId    = `salary_${String(row.id)}`;
          const nextAlerts = isPending
            ? upsertById(state.alertRows, salaryRowToAlert(row))
            : state.alertRows.filter(a => a.id !== alertId);
          set({
            notificationRows:        nextNotifs,
            notificationUnreadCount: countUnread(nextNotifs),
            alertRows:               nextAlerts,
          });
        }
        return;
      }

      // ── dispute ───────────────────────────────────────────────────────────
      if (table === 'dispute') {
        const notif        = disputeRowToNotification(row, orgId);
        const isReceiver   = String(row.partner_org_id) === orgId;
        const isOpen       = String(row.status ?? 'OPEN') === 'OPEN';
        const alertId      = `dispute_${String(row.id)}`;

        if (event === 'INSERT') {
          const nextNotifs = upsertById(state.notificationRows, notif);
          const nextAlerts = isReceiver && isOpen
            ? upsertById(state.alertRows, disputeRowToAlert(row))
            : state.alertRows;
          set({
            notificationRows:        nextNotifs,
            notificationUnreadCount: countUnread(nextNotifs),
            alertRows:               nextAlerts,
          });
        } else if (event === 'UPDATE') {
          const nextNotifs = upsertById(state.notificationRows, notif);
          const nextAlerts = isReceiver && isOpen
            ? upsertById(state.alertRows, disputeRowToAlert(row))
            : state.alertRows.filter(a => a.id !== alertId);
          set({
            notificationRows:        nextNotifs,
            notificationUnreadCount: countUnread(nextNotifs),
            alertRows:               nextAlerts,
          });
        }
        return;
      }

      // ── trips (fleet health: driver / last_location_at) — no chat coupling ─
      if (table === 'trips' && event === 'UPDATE') {
        const tid = typeof row.id === 'string' ? row.id : '';
        if (!tid) return;
        set((s) => ({
          activeTrips: s.activeTrips.map((t) => {
            if (t.trip_id !== tid) return t;
            const next: ActiveTripSummary = { ...t };
            if (typeof row.status === 'string' && row.status.trim()) next.status = row.status;
            if ('driver_id' in row) {
              next.driver_id =
                row.driver_id === null || typeof row.driver_id === 'string' ? (row.driver_id as string | null) : t.driver_id;
            }
            if ('last_location_at' in row) {
              next.last_location_at =
                typeof row.last_location_at === 'string' && row.last_location_at.trim()
                  ? row.last_location_at
                  : row.last_location_at === null
                    ? null
                    : t.last_location_at;
            }
            return next;
          }),
        }));
        return;
      }

      // ── organization_links ────────────────────────────────────────────────
      if (table === 'organization_links') {
        const linkType  = String(row.link_type ?? '') as 'client' | 'supplier';
        const orgId_    = typeof row.linked_org_id === 'string' ? row.linked_org_id : '';
        const orgName   = typeof row.org_name === 'string' ? row.org_name : '';
        const ns        = state.networkStatus;

        if (event === 'INSERT') {
          const partnerAlreadyExists = ns.partner_orgs.some(p => p.org_id === orgId_);
          const nextPartners = partnerAlreadyExists
            ? ns.partner_orgs
            : [...ns.partner_orgs, { org_id: orgId_, org_name: orgName, link_type: linkType }];
          set({
            networkStatus: {
              total_links:    ns.total_links + (partnerAlreadyExists ? 0 : 1),
              client_links:   linkType === 'client'   ? ns.client_links   + 1 : ns.client_links,
              supplier_links: linkType === 'supplier' ? ns.supplier_links + 1 : ns.supplier_links,
              partner_orgs:   nextPartners,
            },
          });
        } else if (event === 'DELETE') {
          const nextPartners = ns.partner_orgs.filter(p => p.org_id !== orgId_);
          const removed      = ns.partner_orgs.length - nextPartners.length;
          set({
            networkStatus: {
              total_links:    Math.max(0, ns.total_links    - removed),
              client_links:   Math.max(0, ns.client_links   - (linkType === 'client'   ? 1 : 0)),
              supplier_links: Math.max(0, ns.supplier_links - (linkType === 'supplier' ? 1 : 0)),
              partner_orgs:   nextPartners,
            },
          });
        }
        return;
      }

      // ── future slices ─────────────────────────────────────────────────────
      // Add new cases here. Example: Live Map Tracking.
      // case 'driver_locations': routeTrackingEvent(row); return;
    },

    // ── markNotificationRead ──────────────────────────────────────────────────
    markNotificationRead: (id) => {
      const rows = get().notificationRows.map(n =>
        n.id === id ? { ...n, is_read: true } : n,
      );
      set({ notificationRows: rows, notificationUnreadCount: countUnread(rows) });
    },

    // ── markAllNotificationsRead ──────────────────────────────────────────────
    markAllNotificationsRead: () => {
      const rows = get().notificationRows.map(n => ({ ...n, is_read: true }));
      set({ notificationRows: rows, notificationUnreadCount: 0 });
    },

    applyActiveTripLocationFromChat: (tripId, payload) => {
      set((s) => ({
        activeTrips: s.activeTrips.map((t) =>
          t.trip_id === tripId ? { ...t, last_known_location: { ...payload } } : t,
        ),
      }));
    },

    touchActiveTripClientActivity: (tripId, atIso) => {
      const at = atIso?.trim() || new Date().toISOString();
      set((s) => ({
        activeTrips: s.activeTrips.map((t) =>
          t.trip_id === tripId ? { ...t, client_activity_at: at } : t,
        ),
      }));
    },

    ingestTripMessageForOperationsIsland: (tripId, row) => {
      const mt = String(row.message_type ?? '');
      if (
        mt !== 'ledger_event' &&
        mt !== 'ledger' &&
        mt !== 'payment' &&
        mt !== 'ledger_update' &&
        mt !== 'system_log' &&
        mt !== 'document_upload' &&
        mt !== 'assignment_update'
      ) {
        return;
      }
      const trip = get().activeTrips.find((t) => t.trip_id === tripId);
      const label = trip?.display_trip_id?.trim() || trip?.trip_number || null;
      const ribbon = buildClientRibbonFromTripMessage(tripId, label, row);
      if (!ribbon) return;
      set((s) => ({
        clientOperationsRibbon: mergeClientRibbon(s.clientOperationsRibbon, ribbon),
      }));
    },

    getCurrentActiveOperationAlert: () =>
      selectCurrentActiveAlert({
        activeTrips:        get().activeTrips,
        alertRows:          get().alertRows,
        notificationRows:   get().notificationRows,
        clientOperationsRibbon: get().clientOperationsRibbon,
      }),

    ingestB2BMessageForBell: (row) => {
      const meta = row.metadata as Record<string, unknown> | null | undefined;
      const ep =
        meta?.event_payload && typeof meta.event_payload === 'object' && !Array.isArray(meta.event_payload)
          ? (meta.event_payload as Record<string, unknown>)
          : null;
      const ring = meta?.global_bell === true || ep?.global_bell === true;
      if (!ring) return;

      const id = `b2b_${row.id}`;
      const titleRaw = ep?.notification_title ?? meta?.notification_title;
      const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : 'Trip update';
      const subtitle =
        typeof row.content === 'string' && row.content.trim() ? row.content.trim().slice(0, 160) : null;
      const amountRaw = ep?.amount ?? meta?.amount;
      const amount_meta =
        typeof amountRaw === 'number'
          ? amountRaw
          : amountRaw != null && !Number.isNaN(Number(amountRaw))
            ? Number(amountRaw)
            : null;

      const item: GlobalNotificationRow = {
        id,
        source:      'b2b_feed',
        source_id:   row.id,
        title,
        subtitle,
        amount_meta,
        is_read:     false,
        created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      };

      set((s) => {
        const existed = s.notificationRows.some((r) => r.id === id);
        const nextNotifs = upsertById(s.notificationRows, item);
        return {
          notificationRows:        nextNotifs,
          notificationUnreadCount: existed ? s.notificationUnreadCount : s.notificationUnreadCount + 1,
        };
      });
    },

    // ── dismissAlert (client-side only — optimistic) ──────────────────────────
    dismissAlert: (id) =>
      set({
        alertRows: get().alertRows.map(a =>
          a.id === id ? { ...a, dismissed: true } : a,
        ),
      }),
  })),
);
