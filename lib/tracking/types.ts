/**
 * Shared types for the driver live-tracking subsystem.
 *
 * Column naming follows the actual DB schema (heading, not bearing; accuracy not accuracy_m).
 * Broadcast event payloads use the same field names so no translation layer is needed.
 */

// ── GPS primitives ────────────────────────────────────────────────────────────

/** A single GPS reading as produced by expo-location or the Web Geolocation API. */
export interface GpsReading {
  lat: number;
  lon: number;
  accuracy: number | null;
  heading: number | null; // degrees 0–360; null when unavailable or stationary
  speed_kmh: number | null;
  ts: number; // Unix ms
}

// ── Broadcast event payloads ──────────────────────────────────────────────────

/** High-frequency live GPS ping sent via Supabase Broadcast (not DB writes). */
export interface BroadcastGpsEvent {
  type: 'gps_ping';
  session_id: string;
  driver_id: string;
  trip_id: string | null;
  lat: number;
  lon: number;
  accuracy: number | null;
  heading: number | null;
  speed_kmh: number | null;
  ts: number; // Unix ms — used for interpolation timing on the dispatcher side
}

/** Keepalive sent every 30s while tracking is active. */
export interface BroadcastHeartbeatEvent {
  type: 'heartbeat';
  session_id: string;
  driver_id: string;
  ts: number;
}

/** Session lifecycle: sent on start, end, or resume after reconnect. */
export interface BroadcastSessionEvent {
  type: 'session_started' | 'session_ended' | 'session_resumed';
  session_id: string;
  driver_id: string;
  trip_id: string | null;
  ts: number;
}

/** Geofence proximity event — pickup/dropoff arrival or departure. */
export interface BroadcastGeofenceEvent {
  type: 'geofence_enter' | 'geofence_exit';
  session_id: string;
  driver_id: string;
  trip_id: string;
  geofence_id: 'pickup' | 'dropoff' | string;
  geofence_label: string;
  lat: number;
  lon: number;
  ts: number;
}

export type TrackingBroadcastEvent =
  | BroadcastGpsEvent
  | BroadcastHeartbeatEvent
  | BroadcastSessionEvent
  | BroadcastGeofenceEvent;

// ── State ─────────────────────────────────────────────────────────────────────

export type TrackingPhase = 'idle' | 'starting' | 'tracking' | 'paused' | 'stopping';

export interface TrackingState {
  phase: TrackingPhase;
  sessionId: string | null;
  tripId: string | null;
  driverId: string | null;
  orgId: string | null;
  lastPingSentAt: number | null;
  queuedPings: GpsReading[];
  isChannelConnected: boolean;
}

// ── DB row shapes (read-side, camelCase mapping) ──────────────────────────────

/** Row from driver_presence — used to seed the dispatcher map on load. */
export interface DriverPresenceSeed {
  driverId: string;
  tripId: string | null;
  lat: number;
  lon: number;
  heading: number | null;
  speed_kmh: number | null;
  sessionId: string;
  recordedAt: string; // ISO
}

/** Row from trip_tracking_sessions. */
export interface TrackingSessionRow {
  id: string;
  tripId: string;
  driverId: string;
  orgId: string;
  deviceId: string | null;
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
}
