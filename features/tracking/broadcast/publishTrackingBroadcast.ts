import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { trackingFleetChannelName, trackingTripChannelName } from '@/features/tracking/broadcast/trackingBroadcastChannels';
import { TRACKING_BROADCAST_EVENT } from '@/features/tracking/constants';
import type {
  FleetPositionPayload,
  TrackingBroadcastEventName,
  TrackingBroadcastPayload,
} from '@/features/tracking/types/broadcast.types';

const tripChannels = new Map<string, RealtimeChannel>();
const fleetChannels = new Map<string, RealtimeChannel>();

function getOrCreateTripChannel(tripId: string): RealtimeChannel {
  const key = tripId;
  let ch = tripChannels.get(key);
  if (ch) return ch;
  ch = supabase().channel(trackingTripChannelName(tripId), {
    config: { broadcast: { self: false, ack: false } },
  });
  void ch.subscribe();
  tripChannels.set(key, ch);
  return ch;
}

function getOrCreateFleetChannel(orgId: string): RealtimeChannel {
  let ch = fleetChannels.get(orgId);
  if (ch) return ch;
  ch = supabase().channel(trackingFleetChannelName(orgId), {
    config: { broadcast: { self: false, ack: false } },
  });
  void ch.subscribe();
  fleetChannels.set(orgId, ch);
  return ch;
}

export async function publishTrackingBroadcast(
  tripId: string,
  orgId: string,
  event: TrackingBroadcastEventName,
  payload: TrackingBroadcastPayload,
): Promise<void> {
  const tripCh = getOrCreateTripChannel(tripId);
  await tripCh.send({ type: 'broadcast', event, payload });

  if ('driverId' in payload && payload.v === 1) {
    const fleetPayload = toFleetPayload(payload, orgId);
    if (fleetPayload) {
      const fleetCh = getOrCreateFleetChannel(orgId);
      await fleetCh.send({ type: 'broadcast', event, payload: fleetPayload });
    }
  }
}

function toFleetPayload(
  payload: TrackingBroadcastPayload,
  orgId: string,
): FleetPositionPayload | null {
  if (!('latitude' in payload) || !('driverId' in payload)) return null;
  if ('checkpointId' in payload) return null;
  return {
    v: 1,
    orgId,
    driverId: payload.driverId,
    tripId: 'tripId' in payload ? payload.tripId : null,
    sessionId: 'sessionId' in payload ? payload.sessionId : null,
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: 'accuracy' in payload ? payload.accuracy : null,
    recordedAt: payload.recordedAt,
  };
}

/**
 * Dispatcher → Driver: request an immediate GPS fix.
 * Driver app listens for 'ping_request' and responds with a 'position' event.
 */
export async function publishPingRequest(tripId: string): Promise<void> {
  const ch = getOrCreateTripChannel(tripId);
  await ch.send({
    type: 'broadcast',
    event: TRACKING_BROADCAST_EVENT.PING_REQUEST,
    payload: { v: 1, tripId, requestedAt: new Date().toISOString() },
  });
}

export function teardownTrackingPublishChannels(tripId?: string, orgId?: string): void {
  if (tripId) {
    const ch = tripChannels.get(tripId);
    if (ch) void supabase().removeChannel(ch);
    tripChannels.delete(tripId);
  }
  if (orgId) {
    const ch = fleetChannels.get(orgId);
    if (ch) void supabase().removeChannel(ch);
    fleetChannels.delete(orgId);
  }
}
