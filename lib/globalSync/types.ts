// ── Global Sync Store Types ───────────────────────────────────────────────────
// Covers notifications, operational alerts, and network status.
// Chat state is handled separately by useChatStore.

export type GlobalSyncBootstrapStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── Notifications ─────────────────────────────────────────────────────────────

export interface GlobalNotificationRow {
  /** Prefixed ID: 'salary_<uuid>' or 'dispute_<uuid>' */
  id: string;
  source: 'salary_request' | 'dispute';
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
