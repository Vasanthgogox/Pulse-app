import type { FlowStep } from '@/lib/flowStep.types';
import {
  DRIVER_ASSIGNED_TRIPS,
  TRIP_DETAIL_READ,
  TRIP_STATUS_UPDATE,
} from '@/lib/flows/shared/sqlSnippets';

/** Driver · app step 4 — active trip execution from control screen. */
export const driverTripLifecycleSteps: FlowStep[] = [
  {
    id: 'dr-trip-control',
    order: 1,
    label: 'Control',
    title: 'Active trip control',
    subtitle: 'Start → Pickup → Transit → Complete',
    route: '/(driver)/control',
    screen: 'DriverControlScreen · useTripControl',
    service: 'trips.service getDriverTripById',
    serviceCalls: [
      'useDriverLocation',
      'useTripOperationsSync',
      'useTripVerificationSync',
      'useLrDocuments · usePodDocuments',
    ],
    phase: 'ui',
    reads: ['trips', 'drivers', 'driver_offers', 'trip_documents'],
    queries: [
      {
        label: 'Ongoing trip load',
        when: 'useTripControl(tripId)',
        sql: `${DRIVER_ASSIGNED_TRIPS}
-- getDriverTripById(:trip_id)`,
      },
      {
        label: 'Advance status',
        when: 'Step buttons: accepted → pickup → transit → completed',
        sql: TRIP_STATUS_UPDATE,
      },
    ],
    routing: [
      { context: 'Trip chat', track: 'hidden', nextScreen: '/(driver)/chat' },
      { context: 'Complete', track: 'done', nextScreen: '/(driver)/trip-history' },
    ],
    notes: [
      'STEPS: accepted · pickup · transit · completed (+ reached · lr substeps)',
      'Hold-to-confirm on sensitive transitions',
    ],
  },
  {
    id: 'dr-trip-history-detail',
    order: 2,
    label: 'Detail',
    title: 'Trip history detail',
    subtitle: 'Completed leg summary · earnings',
    route: '/(driver)/trip-history/[tripId]',
    screen: '(driver)/trip-history/[tripId]',
    service: 'trips.service getDriverTripById',
    phase: 'ui',
    reads: ['trips', 'trip settlements', 'driver commission'],
    queries: [
      {
        label: 'History trip row',
        when: 'Tap card on trip-history tab',
        sql: TRIP_DETAIL_READ,
      },
    ],
    notes: ['Read-only for completed trips; links back to wallet/passbook'],
  },
  {
    id: 'dr-trip-docs',
    order: 3,
    label: 'Docs',
    title: 'LR & POD uploads',
    subtitle: 'Document capture during trip',
    route: '/(driver)/control · /(driver)/documents',
    screen: 'tripDocuments.service · useLrDocuments · usePodDocuments',
    service: 'tripDocuments.service',
    phase: 'post-auth',
    tables: ['trip_documents', 'storage:trip-documents'],
    queries: [
      {
        label: 'Upload LR/POD',
        when: 'Document step in control flow',
        sql: `INSERT INTO public.trip_documents (trip_id, doc_type, storage_path, ...)
VALUES (...);

-- storage upload: trip-documents bucket`,
      },
    ],
    notes: ['Skipped at signup → compliance blocks trip access until profile/docs'],
  },
  {
    id: 'dr-trip-chat',
    order: 4,
    label: 'Chat',
    title: 'Trip chat',
    subtitle: 'Dispatcher ↔ driver messaging',
    route: '/(driver)/chat',
    screen: '(driver)/chat · preloadDriverChatTrip',
    service: 'DriverCommunicationProvider',
    phase: 'ui',
    reads: ['chat messages (trip-scoped realtime)'],
    queries: [
      {
        label: 'Trip chat thread',
        when: 'Open from control screen',
        sql: `-- Realtime channel scoped to trip_id
SELECT * FROM public.chat_messages WHERE trip_id = :trip_id ORDER BY created_at;`,
      },
    ],
    notes: ['Hidden tab route — not in DriverTabBar TAB_CONFIG'],
  },
];
