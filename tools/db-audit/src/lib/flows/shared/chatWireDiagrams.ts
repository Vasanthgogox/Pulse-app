import type { FlowWireDiagram } from '@/lib/flowStep.types';

/** Asset trip chat — client + driver only (no supplier). */
export const CHAT_WIRE_ASSET: FlowWireDiagram = {
  title: 'Chat · assignment & status fan-out',
  hint: 'Dispatcher hub sees every lane. No supplier lane on asset trips.',
  nodes: [
    {
      id: 'evt',
      kind: 'event',
      label: 'Trip event',
      detail: 'driver_id / vehicle_id set · or trips.status UPDATE',
    },
    {
      id: 'ensure',
      kind: 'service',
      label: 'fn_ensure_trip_party_conversations',
      detail: 'Upsert trip_conversations for present parties',
      lanes: ['client', 'driver'],
    },
    {
      id: 'fan',
      kind: 'fanout',
      label: 'Fan-out wires',
      detail: 'Each event writes trip_messages into every open lane',
      branches: [
        {
          label: 'assignment_update',
          detail: 'postAssignmentUpdateToTripChats → ALL lanes',
          lanes: ['client', 'driver'],
        },
        {
          label: 'Status fan-out',
          detail: 'trg_trip_status_to_chat → system / status_change → ALL lanes',
          lanes: ['client', 'driver'],
        },
      ],
    },
  ],
  edges: [
    { from: 'evt', to: 'ensure', label: 'ensure lanes' },
    { from: 'ensure', to: 'fan', label: 'then fan-out' },
  ],
};

/** Aggregate trip chat — client + supplier + driver when ids set. */
export const CHAT_WIRE_AGGREGATE: FlowWireDiagram = {
  title: 'Chat · assignment & status fan-out',
  hint: 'Linked supplier org posts on supplier (+ driver) threads. Ledger only hits client/supplier.',
  nodes: [
    {
      id: 'evt',
      kind: 'event',
      label: 'Trip event',
      detail: 'supplier_id · driver_id · advance ledger · or trips.status',
    },
    {
      id: 'ensure',
      kind: 'service',
      label: 'fn_ensure_trip_party_conversations',
      detail: 'Upsert trip_conversations when party ids present',
      lanes: ['client', 'supplier', 'driver'],
    },
    {
      id: 'fan',
      kind: 'fanout',
      label: 'Fan-out wires',
      detail: 'Assignment & status hit ALL lanes · ledger is party-scoped',
      branches: [
        {
          label: 'assignment_update',
          detail: 'postAssignmentUpdateToTripChats / postAggregateAssignmentMessage',
          lanes: ['client', 'supplier', 'driver'],
        },
        {
          label: 'Status fan-out',
          detail: 'trg_trip_status_to_chat → ALL lanes',
          lanes: ['client', 'supplier', 'driver'],
        },
        {
          label: 'ledger_event',
          detail: 'postLedgerEventToChat → client OR supplier only (not driver)',
          lanes: ['client', 'supplier'],
        },
      ],
    },
  ],
  edges: [
    { from: 'evt', to: 'ensure', label: 'ensure lanes' },
    { from: 'ensure', to: 'fan', label: 'then fan-out' },
  ],
};
