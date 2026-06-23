-- Shift trip execution steps at seq >= 14 up by 2 to make room for Upload LR and In Transit
UPDATE public.pulse_audit_actions SET seq = seq + 2 WHERE seq >= 14;

-- Upload LR: dispatcher/driver uploads Lorry Receipt; sets trip.status → in_transit
INSERT INTO public.pulse_audit_actions (
  id, seq, sub_seq, action, route, service,
  ins_tables, upd_tables, flow_group, is_subflow, priority,
  data_detail
) VALUES (
  'LR', 14, NULL,
  'Upload LR',
  'app/trip/[id] → LRDocumentsSection → onUpdateLR',
  'features/trips/services/tripDocuments.service.ts → uploadTripDocument(tripId, userId, file, ''lr'')',
  ARRAY['trip_documents'],
  ARRAY['trips'],
  'Trip Execution',
  false,
  'HIGH',
  '{
    "summary": "Dispatcher or driver uploads Lorry Receipt (LR) document. On success, trip.status advances to in_transit.",
    "trigger": "User taps UPDATE LR button in LRDocumentsSection or presses pending LR card in vault gallery.",
    "writes": {
      "trip_documents": {
        "document_type": "lr",
        "trip_id": "<trip UUID>",
        "storage_path": "<tripId>/lr/<uuid>.<ext>",
        "file_name": "<original filename>",
        "mime_type": "application/pdf | image/*",
        "size_bytes": "<integer>",
        "uploaded_by": "<auth.uid>"
      },
      "trips": {
        "status": "in_transit",
        "note": "Only updated when prior status was started/assigned/picked_up"
      }
    },
    "storage_bucket": "trip-documents (private). Path: {tripId}/lr/{uuid}.{ext}",
    "verify_sql": "SELECT id, document_type, uploaded_at FROM trip_documents WHERE trip_id = ''<id>'' AND document_type = ''lr'' LIMIT 1;"
  }'
);

-- In Transit: auto-set when LR upload succeeds
INSERT INTO public.pulse_audit_actions (
  id, seq, sub_seq, action, route, service,
  ins_tables, upd_tables, flow_group, is_subflow, priority,
  data_detail
) VALUES (
  'IT', 15, NULL,
  'In Transit',
  'Auto-triggered inside handleLRUpload after successful LR upload',
  'features/trips/services/trips.service.ts → updateTripStatus(tripId, ''in_transit'', userId)',
  ARRAY[]::text[],
  ARRAY['trips'],
  'Trip Execution',
  false,
  'HIGH',
  '{
    "summary": "Trip status advances to in_transit after LR upload confirms goods are loaded and vehicle has departed.",
    "trigger": "Auto-called by handleLRUpload when prior status was started/assigned/picked_up.",
    "writes": {
      "trips": {
        "status": "in_transit",
        "updated_at": "<now>"
      }
    },
    "status_flow": "started → in_transit",
    "ui_effect": "TripStatusTimeline advances to intransit segment (stage 3). OTP panel shows verified for aggregate trips.",
    "verify_sql": "SELECT id, status, updated_at FROM trips WHERE id = ''<id>'' AND status = ''in_transit'';"
  }'
);
