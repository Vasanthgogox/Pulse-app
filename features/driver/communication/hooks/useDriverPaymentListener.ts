/**
 * Event-driven driver payment status — no polling while waiting for clearance.
 * Listens for ledger INSERT (postgres_changes) and optional PAYMENT_COMPLETED broadcast.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { useInvalidateDriverHomeDashboard } from '@/lib/queries/useInvalidateDriverHomeDashboard';
import {
  DRIVER_PAYMENT_BROADCAST_EVENT,
  DRIVER_PAYMENT_INVALIDATE_DEBOUNCE_MS,
  driverLedgerRealtimeKey,
  driverPaymentBroadcastChannelName,
  type DriverPaymentBroadcastEventName,
} from '@/features/driver/communication/constants';

export type DriverPaymentCompletedPayload = {
  driverId: string;
  organizationId: string;
  tripId: string | null;
  ledgerId: string;
  type: string;
  source: 'ledger_insert' | 'broadcast';
};

export type UseDriverPaymentListenerArgs = {
  userId: string | null;
  /** Sorted stable key from primitive driver ids — e.g. useDriverHomeDriversQuery().driverIdsKey */
  driverIds: string[];
  enabled?: boolean;
};

function parseLedgerInsert(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): DriverPaymentCompletedPayload | null {
  if (payload.eventType !== 'INSERT') return null;
  const row = payload.new;
  if (!row || typeof row !== 'object') return null;
  const driverId = typeof row.driver_id === 'string' ? row.driver_id : '';
  const organizationId =
    typeof row.organization_id === 'string' ? row.organization_id : '';
  const ledgerId = typeof row.id === 'string' ? row.id : '';
  const type = typeof row.type === 'string' ? row.type : '';
  const tripId =
    typeof row.trip_id === 'string' ? row.trip_id : row.trip_id == null ? null : null;
  if (!driverId || !organizationId || !ledgerId) return null;
  return {
    driverId,
    organizationId,
    tripId,
    ledgerId,
    type,
    source: 'ledger_insert',
  };
}

function parseBroadcastPayload(
  payload: unknown,
): DriverPaymentCompletedPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const driverId = typeof p.driverId === 'string' ? p.driverId : '';
  const organizationId =
    typeof p.organizationId === 'string' ? p.organizationId : '';
  const ledgerId = typeof p.ledgerId === 'string' ? p.ledgerId : '';
  const type = typeof p.type === 'string' ? p.type : 'payment_completed';
  const tripId =
    typeof p.tripId === 'string' ? p.tripId : p.tripId == null ? null : null;
  if (!driverId || !organizationId) return null;
  return {
    driverId,
    organizationId,
    tripId,
    ledgerId: ledgerId || `broadcast-${Date.now()}`,
    type,
    source: 'broadcast',
  };
}

export function useDriverPaymentListener({
  userId,
  driverIds,
  enabled = true,
}: UseDriverPaymentListenerArgs) {
  const uid = userId ?? '';
  const driverIdsKey = driverIds.length > 0 ? [...driverIds].sort().join(',') : '';
  const invalidateDashboard = useInvalidateDriverHomeDashboard();

  const [lastPaymentEvent, setLastPaymentEvent] =
    useState<DriverPaymentCompletedPayload | null>(null);

  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledLedgerIdsRef = useRef<Set<string>>(new Set());

  const scheduleDashboardInvalidate = useCallback(() => {
    if (!uid) return;
    if (invalidateTimerRef.current) return;
    invalidateTimerRef.current = setTimeout(() => {
      invalidateTimerRef.current = null;
      void invalidateDashboard(uid);
    }, DRIVER_PAYMENT_INVALIDATE_DEBOUNCE_MS);
  }, [uid, invalidateDashboard]);

  const emitPaymentCompleted = useCallback(
    (event: DriverPaymentCompletedPayload) => {
      if (event.ledgerId && handledLedgerIdsRef.current.has(event.ledgerId)) return;
      if (event.ledgerId) {
        handledLedgerIdsRef.current.add(event.ledgerId);
        if (handledLedgerIdsRef.current.size > 200) {
          handledLedgerIdsRef.current.clear();
        }
      }
      setLastPaymentEvent(event);
      scheduleDashboardInvalidate();
    },
    [scheduleDashboardInvalidate],
  );

  useEffect(() => {
    if (!enabled || !uid || !driverIdsKey) return;

    const unsubs: (() => void)[] = [];

    for (const driverId of driverIds) {
      const filter = `driver_id=eq.${driverId}`;
      const unsub = subscribeSharedPostgresChanges(
        driverLedgerRealtimeKey(driverId),
        [
          {
            event: 'INSERT',
            schema: 'public',
            table: 'driver_ledger',
            filter,
          },
        ],
        (payload) => {
          const parsed = parseLedgerInsert(payload);
          if (!parsed) return;
          emitPaymentCompleted(parsed);
        },
      );
      unsubs.push(unsub);
    }

    const channelName = driverPaymentBroadcastChannelName(uid);
    const broadcastChannel = supabase().channel(channelName, {
      config: { broadcast: { self: true, ack: false } },
    });

    const eventName: DriverPaymentBroadcastEventName =
      DRIVER_PAYMENT_BROADCAST_EVENT.PAYMENT_COMPLETED;

    broadcastChannel.on(
      'broadcast',
      { event: eventName },
      ({ payload }) => {
        const parsed = parseBroadcastPayload(payload);
        if (!parsed) return;
        emitPaymentCompleted(parsed);
      },
    );

    void broadcastChannel.subscribe();
    unsubs.push(() => {
      void supabase().removeChannel(broadcastChannel);
    });

    return () => {
      for (const u of unsubs) u();
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
    };
  }, [enabled, uid, driverIdsKey, driverIds, emitPaymentCompleted]);

  return { lastPaymentEvent };
}
