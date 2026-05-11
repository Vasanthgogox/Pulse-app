// ── Global Sync Store Types ───────────────────────────────────────────────────
// Covers notifications, operational alerts, and network status.
// Chat state is handled separately by useChatStore.

export type GlobalSyncBootstrapStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── Notifications ─────────────────────────────────────────────────────────────

export interface GlobalNotificationRow {
  /** Prefixed ID: 'salary_<uuid>' | 'dispute_<uuid>' | 'b2b_<trip_message_uuid>' */
  id: string;
  source: 'salary_request' | 'dispute' | 'b2b_feed';
  source_id: string;
  title: string;
  subtitle: string | null;
  amount_meta: number | null;
  is_read: boolean;
  created_at: string;
}

// ── Operational Alerts ────────────────────────────────────────────────────────

export interface GlobalAlertRow {
  /** Prefixed ID: 'salary_<uuid>' or 'dispute_<uuid>' */
  id: string;
  source: 'salary_request' | 'dispute';
  source_id: string;
  alert_type: 'salary_request_pending' | 'dispute_received';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  amount: number | null;
  driver_id: string | null;
  created_at: string;
  /** Client-side only — optimistic dismiss, never persisted. */
  dismissed?: boolean;
}

// ── Network Status ────────────────────────────────────────────────────────────

export interface GlobalNetworkStatus {
  total_links: number;
  client_links: number;
  supplier_links: number;
  partner_orgs: Array<{
    org_id: string;
    org_name: string;
    link_type: 'client' | 'supplier';
  }>;
}

// ── Active Trip Summary ───────────────────────────────────────────────────────

export interface ActiveTripRecentEvent {
  id: string;
  content: string;
  message_type: string;
  sender_role: string;
  sender_name: string;
  created_at: string;
  metadata: unknown;
  /** Present on bootstrap `recent_events` rows — used for island unread signal. */
  is_read?: boolean;
  /** When present (DB column on `trip_messages`), used by the operations priority engine. */
  priority_weight?: number | null;
}

/** Latest driver location from B2B `system_log` with `metadata.event_payload.location_data`. */
export interface ActiveTripLastKnownLocation {
  lat: number;
  lng: number;
  address_name: string | null;
  recorded_at: string;
}

export interface ActiveTripSummary {
  trip_id: string;
  trip_number: string;
  display_trip_id: string | null;
  status: string;
  pickup_area: string;
  drop_location: string;
  driver_display_name: string | null;
  vehicle_display_number: string | null;
  driver_id: string | null;
  supplier_id: string | null;
  client_id: string | null;
  created_at: string;
  total_unread: number;
  recent_events: ActiveTripRecentEvent[];
  /** Patched client-side from chat Realtime (`system_log` + location_data); optional on bootstrap. */
  last_known_location?: ActiveTripLastKnownLocation | null;
  /** Client-only: bumped on B2B chat Realtime for this trip so the trip island ranks without re-bootstrap. */
  client_activity_at?: string | null;
  /** Fleet-side last vehicle ping when synced from `trips` or bootstrap (optional). */
  last_location_at?: string | null;
}

// ── Bootstrap Payload ─────────────────────────────────────────────────────────

export interface GlobalAppBootstrapPayload {
  active_trips: ActiveTripSummary[];
  global_alerts: GlobalAlertRow[];
  notifications: {
    unread_count: number;
    rows: GlobalNotificationRow[];
  };
  network_status: GlobalNetworkStatus;
}
