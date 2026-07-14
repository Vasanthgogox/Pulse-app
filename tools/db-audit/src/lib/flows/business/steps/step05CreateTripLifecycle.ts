import type { FlowStep } from '@/lib/flowStep.types';
import {
  BROADCAST_TRIP_STATUS_TO_CHAT,
  CHAT_ASSIGNMENT_BRIDGE,
  CHAT_LEDGER_BRIDGE,
  CLAIM_TRIP_BY_OTP,
  ENSURE_TRIP_PARTY_CHATS,
  GENERATE_TRIP_OTP,
} from '@/lib/flows/shared/sqlSnippets';
import { CHAT_WIRE_AGGREGATE, CHAT_WIRE_ASSET } from '@/lib/flows/shared/chatWireDiagrams';

type CreateTrackId =
  | 'track-asset-now'
  | 'track-asset-later'
  | 'track-aggregate-now'
  | 'track-aggregate-later';

type ManageTrackId =
  | 'manage-manage-assign-asset-fleet'
  | 'manage-manage-assign-aggregate-phone'
  | 'manage-manage-assign-phone-fallback'
  | 'manage-manage-assign-otp';

function step(
  id: string,
  order: number,
  partial: Omit<FlowStep, 'id' | 'order'>,
): FlowStep {
  return { id, order, ...partial };
}

/** Asset tracks — no supplier; fleet driver/vehicle. */
function assetParties(prefix: string, deferred: boolean): FlowStep {
  return step(`${prefix}-parties`, 1, {
    label: 'Parties',
    title: deferred ? 'Parties after fleet assign' : 'Parties on this trip',
    subtitle: deferred
      ? 'No supplier · client from Load · driver/vehicle when assignment completes'
      : 'No supplier · billing client · fleet driver + vehicle',
    phase: 'post-auth',
    route: '/trip/[id]',
    screen: 'TripDetailScreen · party chips',
    reads: ['clients', 'drivers', 'vehicles'],
    notes: [
      'trip_payout_mode=asset — no suppliers row on trip',
      'Driver/vehicle from org fleet roster (not phone tracking_only)',
      deferred
        ? 'Until assigned: client lane only; driver lane appears when driver_id set'
        : 'Driver usually already has user_id if they use the app — no OTP path',
    ],
    queries: [
      {
        label: 'Party ids on trip',
        when: 'After create / assign',
        sql: `SELECT id, client_id, driver_id, vehicle_id, supplier_id, trip_payout_mode
FROM public.trips WHERE id = :trip_id;
-- supplier_id IS NULL on asset trips`,
      },
    ],
  });
}

function assetDriverVisibility(prefix: string, deferred: boolean): FlowStep {
  return step(`${prefix}-driver`, 2, {
    label: 'Driver',
    title: 'Fleet driver visibility',
    subtitle: deferred
      ? 'After updateTripAssignment — no OTP'
      : 'Roster pick — OTP not used on asset path',
    phase: 'post-auth',
    service: deferred ? 'updateTripAssignment' : 'createTrip (driver_id on INSERT)',
    reads: ['drivers.user_id'],
    routing: [
      {
        context: 'drivers.user_id set',
        track: 'app',
        nextScreen: 'Driver app list (Drivers can read own trips)',
      },
      {
        context: 'drivers.user_id null',
        track: 'offline roster',
        nextScreen: 'Dispatcher-only until driver links account',
      },
    ],
    notes: [
      'Asset path never calls assignTripDriverByPhone / generateTripOtp',
      'App-less fleet drivers still get a drivers row but no OTP claim UI on create',
    ],
    queries: [
      {
        label: 'Driver link',
        when: 'Check if driver sees trip in app',
        sql: `SELECT d.id, d.user_id, d.phone, d.name
FROM public.drivers d
JOIN public.trips t ON t.driver_id = d.id
WHERE t.id = :trip_id;`,
      },
    ],
  });
}

function assetChat(prefix: string): FlowStep {
  return step(`${prefix}-chat`, 3, {
    label: 'Chat',
    title: 'Chat lanes · assignment & status',
    subtitle: 'Client + driver lanes · dispatcher hub sees all',
    phase: 'post-auth',
    service: 'fn_ensure_trip_party_conversations · chatAssignmentBridge',
    tables: ['trip_conversations', 'trip_messages'],
    serviceCalls: [
      'fn_ensure_trip_party_conversations',
      'postAssignmentUpdateToTripChats',
      'trg_trip_status_to_chat',
    ],
    wire: CHAT_WIRE_ASSET,
    notes: [
      'No supplier lane (no supplier_id)',
      'assignment_update → every existing conversation',
      'trips.status change → system/status_change on all lanes',
      'Roles: dispatcher | client | driver | system',
    ],
    queries: [
      { label: 'Ensure lanes', when: 'Trip created / driver set', sql: ENSURE_TRIP_PARTY_CHATS },
      { label: 'Assignment posts', when: 'Driver/vehicle change', sql: CHAT_ASSIGNMENT_BRIDGE },
      { label: 'Status fan-out', when: 'trips.status UPDATE', sql: BROADCAST_TRIP_STATUS_TO_CHAT },
    ],
  });
}

function assetFinance(prefix: string): FlowStep {
  return step(`${prefix}-finance`, 4, {
    label: 'Finance',
    title: 'Asset payout model',
    subtitle: 'AR from client_price · no supplier advance',
    phase: 'post-auth',
    route: '/trip/[id] · Finance tab',
    screen: 'TripDetail · ledger chooser',
    tables: ['trips', 'transactions?'],
    notes: [
      'trip_payout_mode=asset',
      'client_price → customer receivable (aggregation, not auto INSERT)',
      'No createLedgerEntry advance on asset create path',
      'Ledger UI: client + vehicle + driver only (no supplier payout)',
    ],
    queries: [
      {
        label: 'Stored rates',
        when: 'After INSERT',
        sql: `SELECT client_price, supplier_rate, advance_paid, trip_payout_mode
FROM public.trips WHERE id = :trip_id;
-- supplier_rate / advance_paid unused for supplier AP on asset`,
      },
    ],
  });
}

function assetWhoUpdates(prefix: string): FlowStep {
  return step(`${prefix}-live`, 5, {
    label: 'Live',
    title: 'Who sees status & assignment',
    subtitle: 'Owning org · linked client org · assigned driver app',
    phase: 'post-auth',
    service: 'useRealtimeTrips · useTripStatusRealtimeSync',
    reads: ['trips RLS', 'trip_messages realtime'],
    routing: [
      { context: 'Owning org members', track: 'hub', nextScreen: 'Trips list + chat hub' },
      {
        context: 'Linked client org',
        track: 'network',
        nextScreen: 'Read trip if clients.linked_organization_id matches',
      },
      {
        context: 'Assigned driver (user_id)',
        track: 'driver',
        nextScreen: '/(driver) control · driver chat lane',
      },
    ],
    notes: [
      'No linked supplier on asset path',
      'Hub cards patch on trips UPDATE via useTripStatusRealtimeSync',
      'Driver thread gets same system/status posts when conversation exists',
    ],
    queries: [
      {
        label: 'Realtime recipients',
        when: 'Status / assignment change',
        sql: `-- Owning org: RLS Org members can manage/read trips
-- Linked client: Orgs can read trips where they are the client
-- Driver: Drivers can read own trips (driver_id ↔ drivers.user_id)
-- Chat UI: useActiveTripLaneRealtime / useDriverChatSubscription`,
      },
    ],
  });
}

function assetLifecycle(prefix: string, deferred: boolean): FlowStep[] {
  return [
    assetParties(prefix, deferred),
    assetDriverVisibility(prefix, deferred),
    assetChat(prefix),
    assetFinance(prefix),
    assetWhoUpdates(prefix),
  ];
}

/** Aggregate tracks — supplier offline vs integrated; phone driver OTP. */
function aggParties(prefix: string, deferredDriver: boolean): FlowStep {
  return step(`${prefix}-parties`, 1, {
    label: 'Parties',
    title: 'Supplier · client · driver matrix',
    subtitle: deferredDriver
      ? 'Supplier set now · driver deferred to trip assignment'
      : 'Supplier + rates + phone driver on create',
    phase: 'post-auth',
    reads: ['suppliers', 'clients', 'drivers'],
    notes: [
      'supplier_type=offline → no platform account; trip create/OTP unchanged',
      'supplier_type=integrated + linked_organization_id → linked org reads trip + supplier chat lane',
      'Create path only needs supplier_id + rates — offline vs app does not fork INSERT',
      deferredDriver
        ? 'driver_id null until TripPhoneAssignmentWizard'
        : 'Driver via ensureDriverRowByPhone(trackingOnly)',
    ],
    queries: [
      {
        label: 'Supplier type',
        when: 'Interpret counterparty access',
        sql: `SELECT s.id, s.name, s.supplier_type, s.linked_organization_id, s.phone
FROM public.suppliers s
JOIN public.trips t ON t.supplier_id = s.id
WHERE t.id = :trip_id;
-- offline: dispatcher-only supplier party
-- integrated: linked org RLS + supplier lane posting`,
      },
    ],
  });
}

function aggDriver(prefix: string, deferred: boolean): FlowStep {
  return step(`${prefix}-driver`, 2, {
    label: 'Driver',
    title: deferred ? 'Driver deferred · OTP later' : 'Phone driver · app vs OTP',
    subtitle: deferred
      ? 'assign_aggregate_trip_driver / assignTripDriverByPhone on detail'
      : 'trackingOnly assign · OTP if user_id null',
    phase: 'post-auth',
    service: deferred
      ? 'TripPhoneAssignmentWizard → assignAggregateTripDriverByPhone'
      : 'assignTripDriverByPhone · ensureDriverRowByPhone',
    tables: ['drivers', 'trip_otp_codes?', 'trips'],
    routing: [
      {
        context: 'Linked driver (user_id)',
        track: 'app',
        nextScreen: 'Trip appears in driver app — no OTP',
      },
      {
        context: 'App-less / tracking_only',
        track: 'otp',
        nextScreen: 'AddTripOtpSuccessBody · claimTripByOtp',
      },
    ],
    notes: [
      'tracking_only rows excluded from Drivers tab roster',
      'forceOtpClaim on reassign can force unlinked row so OTP required again',
      deferred ? 'No OTP at create (hasAssignment=false)' : 'skipOtpGeneration then phone assign may still generate OTP',
    ],
    queries: [
      {
        label: 'OTP when unlinked',
        when: 'Assigned driver.user_id IS NULL',
        sql: GENERATE_TRIP_OTP,
      },
      {
        label: 'Driver claims OTP',
        when: 'Driver app / claim UI',
        sql: CLAIM_TRIP_BY_OTP,
      },
    ],
  });
}

function aggChat(prefix: string): FlowStep {
  return step(`${prefix}-chat`, 3, {
    label: 'Chat',
    title: 'Chat lanes · parties · fan-out',
    subtitle: 'client + supplier + driver when ids set',
    phase: 'post-auth',
    service: 'chatAssignmentBridge · chatLedgerBridge · status trigger',
    tables: ['trip_conversations', 'trip_messages'],
    serviceCalls: [
      'fn_ensure_trip_party_conversations',
      'postAssignmentUpdateToTripChats / postAggregateAssignmentMessage',
      'postLedgerEventToChat',
      'trg_trip_status_to_chat',
    ],
    wire: CHAT_WIRE_AGGREGATE,
    notes: [
      'Linked supplier org posts on supplier (and driver) threads',
      'assignment_update → all lanes',
      'status_change / system → all lanes',
      'ledger_event → client or supplier lane only (not driver)',
      'Lane appears when party id is set (driver lane after phone assign)',
    ],
    queries: [
      { label: 'Ensure lanes', when: 'Ids present', sql: ENSURE_TRIP_PARTY_CHATS },
      { label: 'Assignment', when: 'Phone assign / reassign', sql: CHAT_ASSIGNMENT_BRIDGE },
      { label: 'Ledger → chat', when: 'advance / trip payment', sql: CHAT_LEDGER_BRIDGE },
      { label: 'Status fan-out', when: 'trips.status change', sql: BROADCAST_TRIP_STATUS_TO_CHAT },
    ],
  });
}

function aggFinance(prefix: string, advanceAtCreate: boolean): FlowStep {
  return step(`${prefix}-finance`, 4, {
    label: 'Finance',
    title: 'Market payout model',
    subtitle: advanceAtCreate
      ? 'client_price AR · supplier_rate AP · optional advance OUT on create'
      : 'client_price AR · supplier_rate AP · advance if set at create',
    phase: 'post-auth',
    route: '/trip/[id] · Finance',
    service: 'createLedgerEntry (advance) · trip aggregation',
    tables: ['trips', 'transactions'],
    notes: [
      'trip_payout_mode=market',
      'Rates live on trips row — not auto AR/AP transaction rows',
      advanceAtCreate
        ? 'If advance_paid > 0 && supplier_id → createLedgerEntry amount_out contact_type=supplier'
        : 'Same advance rule applies at create even when driver deferred',
      'Later ledger entries still post chat ledger_event to supplier/client lane',
    ],
    queries: [
      {
        label: 'Rates + advance column',
        when: 'After INSERT',
        sql: `SELECT client_price, supplier_rate, advance_paid, supplier_id, trip_payout_mode
FROM public.trips WHERE id = :trip_id;`,
      },
      {
        label: 'Advance ledger (if > 0)',
        when: 'handleComplete after createTripWithOtp',
        sql: `-- finance.service createLedgerEntry
-- amount_out, contact_type='supplier', party Advance / Trip Payment
INSERT INTO public.transactions (...); -- then postLedgerEventToChat`,
      },
    ],
  });
}

function aggWhoUpdates(prefix: string): FlowStep {
  return step(`${prefix}-live`, 5, {
    label: 'Live',
    title: 'Who sees status & assignment',
    subtitle: 'Owning org · linked supplier · linked client · driver (if claimed)',
    phase: 'post-auth',
    service: 'useRealtimeTrips · useTripStatusRealtimeSync',
    routing: [
      { context: 'Owning org', track: 'hub', nextScreen: 'Trips list + all chat lanes' },
      {
        context: 'Linked supplier org',
        track: 'network',
        nextScreen: 'Read/update indent trip · supplier + driver lanes',
      },
      {
        context: 'Linked client org',
        track: 'network',
        nextScreen: 'Read trip · client lane',
      },
      {
        context: 'Driver after claim / user_id',
        track: 'driver',
        nextScreen: '/(driver) · driver lane realtime',
      },
      {
        context: 'OTP not yet claimed',
        track: 'otp',
        nextScreen: 'Dispatcher holds OTP; driver offline until claimTripByOtp',
      },
    ],
    notes: [
      'Offline supplier: no second org realtime — dispatcher hub only for supplier party',
      'Integrated supplier: RLS Orgs can read/update trips where they are the supplier',
      'Chat + row sync both matter: status messages fan out; hub also patches from trips UPDATE',
    ],
    queries: [
      {
        label: 'Recipient matrix',
        when: 'Status / driver change',
        sql: `-- Own org members: trips organization_id filter
-- Linked supplier: linked_organization_id / accepted quotes
-- Linked client: clients.linked_organization_id
-- Driver app: driver_id ↔ drivers.user_id after claim
-- OTP pending: no driver app until claimTripByOtp`,
      },
    ],
  });
}

function aggregateLifecycle(prefix: string, deferredDriver: boolean): FlowStep[] {
  return [
    aggParties(prefix, deferredDriver),
    aggDriver(prefix, deferredDriver),
    aggChat(prefix),
    aggFinance(prefix, true),
    aggWhoUpdates(prefix),
  ];
}

export function lifecycleForCreateTrack(trackId: string): FlowStep[] {
  switch (trackId as CreateTrackId) {
    case 'track-asset-now':
      return assetLifecycle('bu-life-asset-now', false);
    case 'track-asset-later':
      return assetLifecycle('bu-life-asset-later', true);
    case 'track-aggregate-now':
      return aggregateLifecycle('bu-life-agg-now', false);
    case 'track-aggregate-later':
      return aggregateLifecycle('bu-life-agg-later', true);
    default:
      return [];
  }
}

/** Shorter post–re-assign lifecycle for Manage module tracks. */
export function lifecycleForManageTrack(trackId: string): FlowStep[] {
  const id = trackId as ManageTrackId;
  const isAsset = id === 'manage-manage-assign-asset-fleet';
  const isOtp = id === 'manage-manage-assign-otp';
  const prefix = `bu-mlife-${trackId.replace(/^manage-manage-assign-/, '')}`;

  const parties = step(`${prefix}-parties`, 1, {
    label: 'Parties',
    title: isAsset ? 'Asset re-assign parties' : 'Aggregate re-assign parties',
    subtitle: isAsset
      ? 'Fleet driver/vehicle update — no supplier'
      : 'Phone/OTP path — supplier already on trip',
    phase: 'post-auth',
    notes: isAsset
      ? ['Still no supplier_id', 'Driver/vehicle via updateTripAssignment']
      : [
          'Supplier offline vs integrated unchanged by re-assign',
          isOtp
            ? 'forceUnlinkedForOtp / generateTripOtp when claiming unlinked'
            : 'May link existing user_id or create tracking_only',
        ],
    queries: [
      {
        label: 'Trip parties after assign',
        when: 'onUpdated → trip detail',
        sql: `SELECT driver_id, vehicle_id, supplier_id, vehicle_display_number
FROM public.trips WHERE id = :trip_id;`,
      },
    ],
  });

  const chat = step(`${prefix}-chat`, 2, {
    label: 'Chat',
    title: 'Assignment → all trip lanes',
    subtitle: 'postAssignmentUpdateToTripChats after driver/vehicle change',
    phase: 'post-auth',
    service: 'chatAssignmentBridge.service',
    tables: ['trip_messages', 'trip_conversations'],
    wire: isAsset ? CHAT_WIRE_ASSET : CHAT_WIRE_AGGREGATE,
    notes: [
      'Driver lane created/ensured when driver_id newly set',
      'Status fan-out still via trg_trip_status_to_chat on later status changes',
      !isAsset ? 'Linked supplier org sees assignment on supplier lane' : 'Client + driver lanes',
    ],
    queries: [
      { label: 'Ensure + post', when: 'After re-assign', sql: `${ENSURE_TRIP_PARTY_CHATS}\n\n${CHAT_ASSIGNMENT_BRIDGE}` },
    ],
  });

  const driver = step(`${prefix}-driver`, 3, {
    label: isOtp ? 'OTP' : 'Driver',
    title: isOtp ? 'OTP claim path' : isAsset ? 'Fleet driver app visibility' : 'Phone driver app vs OTP',
    subtitle: isOtp
      ? 'generateTripOtp → claimTripByOtp'
      : isAsset
        ? 'No OTP on fleet picker path'
        : 'Linked user_id skips OTP; else tracking_only + OTP',
    phase: 'post-auth',
    tables: isOtp || !isAsset ? ['trip_otp_codes?', 'drivers'] : ['drivers'],
    queries: isOtp
      ? [
          { label: 'Generate OTP', when: 'Unlinked after re-assign', sql: GENERATE_TRIP_OTP },
          { label: 'Claim', when: 'Driver app', sql: CLAIM_TRIP_BY_OTP },
        ]
      : [
          {
            label: 'Visibility',
            when: 'Check user_id',
            sql: `SELECT user_id FROM public.drivers WHERE id = :driver_id;`,
          },
        ],
  });

  const live = step(`${prefix}-live`, 4, {
    label: 'Live',
    title: 'Who updates now',
    subtitle: 'Org hub · counterparty · driver after link',
    phase: 'post-auth',
    notes: [
      'Owning org: list + chat hub realtime',
      !isAsset
        ? 'Linked supplier org: trip UPDATE + supplier/driver lanes'
        : 'No supplier counterparty',
      'Driver app after user_id / OTP claim',
    ],
    queries: [
      {
        label: 'Fan-out',
        when: 'Assignment complete',
        sql: BROADCAST_TRIP_STATUS_TO_CHAT,
      },
    ],
  });

  return [parties, chat, driver, live];
}
