export const GLOBAL_SNAPSHOT_SQL = `SELECT
  (SELECT COUNT(*) FROM trips)                      AS trips,
  (SELECT COUNT(*) FROM trip_assignment_audit)      AS assignment_audit,
  (SELECT COUNT(*) FROM trip_workflow_events)       AS workflow_events,
  (SELECT COUNT(*) FROM trip_status_audit)          AS status_audit,
  (SELECT COUNT(*) FROM trip_location_checkpoints)  AS loc_pings,
  (SELECT COUNT(*) FROM trip_documents)             AS documents,
  (SELECT COUNT(*) FROM transactions)               AS transactions,
  (SELECT COUNT(*) FROM workspace_audit_log)        AS workspace_audit,
  (SELECT COUNT(*) FROM indents)                    AS indents,
  (SELECT COUNT(*) FROM network_bids)               AS bids;`;

export const RECON_SQL = `-- Finance reconciliation: completed trips without matching events
SELECT t.trip_number, t.status, t.client_price,
  MAX(CASE WHEN w.event_type = 'invoice.generated' THEN 1 ELSE 0 END) AS has_invoice,
  MAX(CASE WHEN w.event_type = 'supplier.paid'     THEN 1 ELSE 0 END) AS supplier_paid,
  MAX(CASE WHEN w.event_type = 'pod.uploaded'      THEN 1 ELSE 0 END) AS has_pod
FROM trips t
LEFT JOIN trip_workflow_events w ON w.trip_id = t.id
WHERE t.status = 'completed'
GROUP BY t.id, t.trip_number, t.status, t.client_price
ORDER BY t.completed_at DESC
LIMIT 20;`;

export const RLS_SQL = `-- Verify RLS enforcement (run as anon role)
SET ROLE anon;
SELECT COUNT(*) AS exposed_trips    FROM trips;
SELECT COUNT(*) AS exposed_txns     FROM transactions;
SELECT COUNT(*) AS exposed_drivers  FROM drivers;
RESET ROLE;`;

export const ORPHAN_SQL = `-- Find orphan audit records (referencing deleted trips)
SELECT 'trip_assignment_audit' AS src, a.trip_id, a.changed_at
FROM trip_assignment_audit a
LEFT JOIN trips t ON t.id = a.trip_id
WHERE t.id IS NULL
UNION ALL
SELECT 'trip_workflow_events', w.trip_id, w.created_at
FROM trip_workflow_events w
LEFT JOIN trips t ON t.id = w.trip_id
WHERE t.id IS NULL
UNION ALL
SELECT 'trip_status_audit', s.trip_id, s.changed_at
FROM trip_status_audit s
LEFT JOIN trips t ON t.id = s.trip_id
WHERE t.id IS NULL;`;

export const STATE_TRANSITIONS = [
  { from: '—', to: 'pending', action: 'Trip created by dispatcher', actor: 'dispatcher' },
  { from: 'pending', to: 'assigned', action: 'Driver + vehicle assigned', actor: 'dispatcher' },
  { from: 'assigned', to: 'started', action: 'OTP verified at pickup', actor: 'driver' },
  { from: 'started', to: 'completed', action: 'Delivery done + POD upload', actor: 'driver/dispatcher' },
  { from: 'pending', to: 'cancelled', action: 'Manual cancellation', actor: 'dispatcher' },
  { from: 'assigned', to: 'cancelled', action: 'Manual cancellation', actor: 'dispatcher' },
  { from: 'started', to: 'cancelled', action: 'Emergency cancellation', actor: 'dispatcher' },
] as const;
