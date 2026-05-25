/**
 * Dispatcher-side hook for sending an on-demand ping to the driver.
 *
 * Flow:
 *  1. Call requestPing() — publishes 'ping_request' on the trip broadcast channel.
 *  2. Driver app receives it, calls getCurrentPositionAsync(), broadcasts 'position'.
 *  3. TripTrackingMapStore receives the position via useTrackingTripBroadcast (normal path).
 *  4. isPinging resets when the next 'position' arrives OR after TRACKING_PING_TIMEOUT_MS.
 *  5. If driver never responds, pingTimedOut is set true for 3s then auto-clears.
 *
 * The hook does NOT manage its own Supabase subscription — it relies on the channel
 * already open via TrackingBroadcastSubscriptionManager (ref-counted, shared).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { publishPingRequest } from '@/features/tracking/broadcast/publishTrackingBroadcast';
import { subscribeTrackingTripBroadcast } from '@/features/tracking/broadcast/TrackingBroadcastSubscriptionManager';
import { TRACKING_PING_TIMEOUT_MS } from '@/features/tracking/constants';

export type UseRequestDriverPingResult = {
  /** Send a ping_request to the driver. No-op when trackingEnabled is false. */
  requestPing: () => void;
  /** True from the moment ping is sent until a position response arrives or timeout. */
  isPinging: boolean;
  /** ISO timestamp of the last successful ping response, null if never. */
  lastPingRespondedAt: string | null;
  /** True for 3 seconds after a ping times out with no driver response. UI-only — do not pass through useTrackingState overrides. */
  pingTimedOut: boolean;
};

export function useRequestDriverPing({
  tripId,
  trackingEnabled,
}: {
  tripId: string | null;
  trackingEnabled: boolean;
}): UseRequestDriverPingResult {
  const [isPinging, setIsPinging] = useState(false);
  const [lastPingRespondedAt, setLastPingRespondedAt] = useState<string | null>(null);
  const [pingTimedOut, setPingTimedOut] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timedOutResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPingingRef = useRef(false);

  const clearPingTimeout = () => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const clearTimedOutReset = () => {
    if (timedOutResetRef.current !== null) {
      globalThis.clearTimeout(timedOutResetRef.current);
      timedOutResetRef.current = null;
    }
  };

  const resolvePing = useCallback((respondedAt: string) => {
    if (!isPingingRef.current) return;
    isPingingRef.current = false;
    clearPingTimeout();
    setIsPinging(false);
    setPingTimedOut(false);
    setLastPingRespondedAt(respondedAt);
  }, []);

  // Subscribe to the broadcast channel to detect when position arrives after ping.
  useEffect(() => {
    if (!tripId || !trackingEnabled) return;
    return subscribeTrackingTripBroadcast(tripId, {
      onPosition: (payload) => {
        resolvePing(payload.recordedAt);
      },
    });
  }, [tripId, trackingEnabled, resolvePing]);

  // Clean up both timers on unmount.
  useEffect(() => () => {
    clearPingTimeout();
    clearTimedOutReset();
  }, []);

  const requestPing = useCallback(() => {
    if (!tripId || !trackingEnabled || isPingingRef.current) return;

    // Clear any lingering timed-out feedback before the new ping starts.
    clearTimedOutReset();
    setPingTimedOut(false);

    isPingingRef.current = true;
    setIsPinging(true);

    void publishPingRequest(tripId);

    // Auto-reset after timeout if driver never responds.
    clearPingTimeout();
    timeoutRef.current = globalThis.setTimeout(() => {
      isPingingRef.current = false;
      setIsPinging(false);
      setPingTimedOut(true);
      // Auto-clear the timed-out state after 3 seconds so button returns to normal.
      timedOutResetRef.current = globalThis.setTimeout(() => {
        setPingTimedOut(false);
      }, 3_000);
    }, TRACKING_PING_TIMEOUT_MS);
  }, [tripId, trackingEnabled]);

  return { requestPing, isPinging, lastPingRespondedAt, pingTimedOut };
}
