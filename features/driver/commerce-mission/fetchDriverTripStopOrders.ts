import { supabase } from '@/lib/supabase';
import {
  GET_DRIVER_TRIP_STOP_ORDERS_RPC,
  type DriverTripStopOrderRpcRow,
  type FetchDriverTripStopOrdersResult,
} from '@/features/driver/commerce-mission/driverTripStopOrders.types';
import {
  emptyDriverTripStopOrderMission,
  normalizeDriverTripStopOrders,
} from '@/features/driver/commerce-mission/normalizeDriverTripStopOrders';

/**
 * Driver-side Primitive A consumer.
 * Authorization is entirely inside the RPC (assigned driver → trip).
 * Does not query sales_orders, allocations, or clients.
 */
export async function fetchDriverTripStopOrders(
  tripId: string,
): Promise<FetchDriverTripStopOrdersResult> {
  const empty = emptyDriverTripStopOrderMission(tripId);
  if (!tripId.trim()) return { ok: true, mission: empty };

  // RPC is live; generated Database types do not include it until history is reconciled.
  const { data, error } = await supabase().rpc(
    GET_DRIVER_TRIP_STOP_ORDERS_RPC as never,
    { p_trip_id: tripId } as never,
  );

  if (error) {
    return {
      ok: false,
      mission: empty,
      error: new Error(error.message),
    };
  }

  return {
    ok: true,
    mission: normalizeDriverTripStopOrders(
      tripId,
      (data ?? []) as DriverTripStopOrderRpcRow[],
    ),
  };
}
