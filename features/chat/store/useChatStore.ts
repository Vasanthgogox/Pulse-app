/**
 * useChatStore — Zustand store for the B2B Chat engine.
 *
 * DATA MODEL  (WhatsApp "Bootstrap & Patch"):
 *   trips[tripId] = {
 *     metadata: { status, driverName, vehicle, route, … },
 *     parties:  { client: PartyConv, supplier: PartyConv, driver: PartyConv },
 *     event_stream: TripEvent[]   ← ALL parties merged, sorted ASC
 *   }
 *
 * BOOTSTRAP (one DB call):
 *   bootstrap(orgId)  calls get_unified_b2b_bootstrap and populates trips.
 *   After that the app is silent — only Realtime pushes data in.
 *
 * REALTIME PATCH (zero DB calls):
 *   onRealtimeInsert(row, mode)  appends a new event to trips[tripId].event_stream.
 *   onRealtimeAck(convId, msgId, patch)  patches is_read / is_delivered ticks.
 *   applySystemUpdate(tripId, patch)  merges external metadata changes.
 *
 * MULTI-PARTY TABS (0 ms, zero DB):
 *   Tab switches change selectedPartyType in the UI.  The detail panel
 *   filters event_stream by partyType or visibility_tags in memory — no store
 *   mutation needed.
 *
 * BACKWARD COMPAT:
 *   chatStore.ts re-exports shim hooks (useConversation, useTripMeta, …)
 *   that reconstruct TripConversation / TripMeta from TripEntry on the fly.
 *   Existing call sites keep compiling without changes.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getUnifiedB2BChatBootstrap } from '../services/chat.service';
import type {
  B2BEventMetadata,
  B2BTripState,
  ConversationPartyType,
  LedgerEventMetadata,
  TripConversation,
  TripMessageRow,
  TripMeta,
} from '../types/chat.types';

// ── Event: a message enriched with its conversation's party type ──────────────

export interface TripEvent extends TripMessageRow {
  /** Denormalized from the containing conversation — used for tab filtering. */
  partyType: ConversationPartyType;
}

// ── Per-party lane (one conversation per party per trip) ──────────────────────

export interface PartyConv {
  conversationId: string;
  organizationId: string;
  partyName:      string;
  clientId:       string | null;
  supplierId:     string | null;
  driverId:       string | null;
  unreadCount:    number;
}

// ── Single trip entry — the core data unit in the store ──────────────────────

export interface TripEntry {
  tripId:               string;
  tripNumber:           string;
  displayTripId:        string | null;
  // Mutable trip metadata — patched by B2BEventMetadata / status_change / system
  status:               string | null;
  driverDisplayName:    string | null;
  vehicleDisplayNumber: string | null;
  driverId:             string | null;
  supplierId:           string | null;
  pickupArea:           string;
  dropLocation:         string;
  createdAt:            string | null;
  // Live location — injected from 'tracking' events, never fetched
  lastLat?:             number | null;
  lastLng?:             number | null;
  lastLocationAt?:      string | null;
  lastEtaMinutes?:      number | null;
  lastEtaLabel?:        string | null;
  // Running payment balance — accumulated from 'ledger_event' messages
  paymentBalance:       number | null;
  // Party lanes (at most one per ConversationPartyType)
  parties:              Partial<Record<ConversationPartyType, PartyConv>>;
  // Unified event stream for ALL parties, sorted ASC by created_at.
  // Messages are filtered per-tab using visibility_tags (when present) or partyType.
  event_stream:         TripEvent[];
  // Sidebar
  lastEventAt:          string | null;
  lastEventPreview:     string | null;
  totalUnread:          number;
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface ChatState {
  // ── Data
  trips:           Record<string, TripEntry>;
  convToTrip:      Record<string, string>;                 // convId → tripId
  convToParty:     Record<string, ConversationPartyType>;  // convId → partyType
  activeParties:   Record<string, ConversationPartyType>;  // tripId → last selected
  bootstrappedOrg: string | null;
  isLoading:       boolean;

  // ── Actions
  bootstrap:          (orgId: string) => Promise<void>;
  onRealtimeInsert:   (row: Partial<TripMessageRow>, mode: 'active' | 'background') => void;
  onRealtimeAck:      (convId: string, msgId: string, patch: Partial<TripMessageRow>) => void;
  switchParty:        (tripId: string, partyType: ConversationPartyType) => void;
  markRead:           (convId: string) => void;
  patchMessage:       (convId: string, msgId: string, patch: Partial<TripMessageRow>) => void;
  optimisticInsert:   (convId: string, msg: TripMessageRow) => void;
  replaceOptimistic:  (convId: string, tempId: string, persisted: TripMessageRow) => void;
  removeMessage:      (convId: string, msgId: string) => void;
  upsertConversation: (conv: TripConversation) => void;
  applySystemUpdate:  (tripId: string, patch: Partial<TripEntry>) => void;
  /** Optimistic feedback submission — patches message metadata locally. The caller
   *  also fires the RPC; this ensures the UI flips immediately. */
  submitFeedback:     (convId: string, msgId: string, patch: Partial<TripMessageRow>) => void;
  /** Merge on-demand history load into event_stream (used by lazy-load button in detail). */
  mergeConversationHistory: (convId: string, messages: TripMessageRow[]) => void;
  clear:              () => void;

  // ── Derived helpers
  getActiveParty:         (tripId: string) => ConversationPartyType | undefined;
  getConversationId:      (tripId: string, partyType: ConversationPartyType) => string | null;
  getConversationByConvId:(convId: string) => TripConversation | null;
  getSortedTripEntries:   () => TripEntry[];
}

// ── Module-level helpers (pure functions) ─────────────────────────────────────

/** WhatsApp-style emoji-prefixed sidebar preview. */
export function previewText(row: Partial<TripMessageRow>): string | null {
  const body = typeof row.content === 'string' ? row.content.trim() : '';
  switch (row.message_type) {
    case 'ledger_event': case 'ledger': case 'payment':
      return `💰 ${body || 'Payment update'}`;
    case 'status_change': {
      const meta = row.metadata as { new_status?: string } | null;
      const label = meta?.new_status?.replace(/_/g, ' ').toUpperCase() ?? '';
      return `🚚 ${label || body || 'Status update'}`;
    }
    case 'system': case 'update': case 'system_log':
      return `📋 ${body || 'System update'}`;
    case 'tracking':
      return '📍 Location update';
    case 'document_share':
      return `📄 ${body || 'Document shared'}`;
    case 'feedback_request': case 'feedback':
      return `⭐ ${body || 'Feedback request'}`;
    case 'image':
      return '🖼 Photo';
    default:
      return body ? body.slice(0, 120) : null;
  }
}

/** Merge two TripEvent arrays by ID, server row wins, sorted ASC by created_at. */
function mergeEvents(local: TripEvent[], server: TripEvent[]): TripEvent[] {
  if (local.length  === 0) return server;
  if (server.length === 0) return local;
  const byId = new Map<string, TripEvent>();
  for (const e of local)  byId.set(e.id, e);
  for (const e of server) byId.set(e.id, e);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/** Construct a blank TripEntry skeleton from the first conversation seen. */
function entryFromConv(conv: TripConversation): TripEntry {
  return {
    tripId:               conv.trip_id,
    tripNumber:           conv.trip_number,
    displayTripId:        conv.display_trip_id ?? null,
    status:               conv.trip_status ?? null,
    driverDisplayName:    null,
    vehicleDisplayNumber: null,
    driverId:             conv.trip_driver_id ?? null,
    supplierId:           conv.trip_supplier_id ?? null,
    pickupArea:           conv.pickup_area,
    dropLocation:         conv.drop_location,
    createdAt:            conv.trip_created_at ?? null,
    paymentBalance:       null,
    parties:              {},
    event_stream:         [],
    lastEventAt:          conv.last_message_at,
    lastEventPreview:     conv.last_message_preview,
    totalUnread:          0,
  };
}

function partyFromConv(conv: TripConversation): PartyConv {
  return {
    conversationId: conv.id,
    organizationId: conv.organization_id,
    partyName:      conv.party_name,
    clientId:       conv.client_id,
    supplierId:     conv.supplier_id,
    driverId:       conv.driver_id,
    unreadCount:    conv.unread_dispatcher_count ?? 0,
  };
}

/**
 * Returns true when an event should be visible in the given party tab.
 * Priority:
 *   1. visibility_tags present → check if convId or partyType is listed
 *   2. Fallback → partyType match (legacy: events tagged at insert time)
 */
function isEventVisibleForParty(
  event:     TripEvent,
  partyType: ConversationPartyType,
  convId:    string | undefined,
): boolean {
  const tags = event.visibility_tags;
  if (tags && tags.length > 0) {
    return (convId ? tags.includes(convId) : false) || tags.includes(partyType);
  }
  return event.partyType === partyType;
}

/** Reconstruct a TripConversation from a TripEntry + one party lane. */
function convFromEntry(
  entry:     TripEntry,
  partyType: ConversationPartyType,
  party:     PartyConv,
): TripConversation {
  const convId = party.conversationId;
  return {
    id:                      convId,
    organization_id:         party.organizationId,
    trip_id:                 entry.tripId,
    party_type:              partyType,
    party_name:              party.partyName,
    client_id:               party.clientId,
    supplier_id:             party.supplierId,
    driver_id:               party.driverId,
    last_message_at:         entry.lastEventAt,
    last_message_preview:    entry.lastEventPreview,
    unread_dispatcher_count: party.unreadCount,
    created_at:              entry.createdAt ?? '',
    updated_at:              '',
    trip_number:             entry.tripNumber,
    display_trip_id:         entry.displayTripId,
    trip_status:             entry.status,
    trip_driver_id:          entry.driverId,
    trip_supplier_id:        entry.supplierId,
    trip_created_at:         entry.createdAt,
    pickup_area:             entry.pickupArea,
    drop_location:           entry.dropLocation,
    // messages for this party lane only — visibility_tags aware, zero DB calls
    messages: entry.event_stream.filter(e =>
      isEventVisibleForParty(e, partyType, convId),
    ),
  };
}

/** Compute totalUnread from parties map. */
function sumUnread(parties: Partial<Record<ConversationPartyType, PartyConv>>): number {
  return Object.values(parties).reduce((s, p) => s + (p?.unreadCount ?? 0), 0);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({

    // ── Initial state ─────────────────────────────────────────────────────────

    trips:           {},
    convToTrip:      {},
    convToParty:     {},
    activeParties:   {},
    bootstrappedOrg: null,
    isLoading:       false,

    // ── bootstrap ─────────────────────────────────────────────────────────────
    // Called ONCE per org-session from TripChatContext on mount.
    // Uses get_unified_b2b_bootstrap (falls back to get_b2b_chat_bootstrap if
    // the migration hasn't been applied yet).
    // All subsequent state arrives via Realtime → onRealtimeInsert.

    bootstrap: async (orgId) => {
      if (get().bootstrappedOrg === orgId) return;
      set({ isLoading: true });

      try {
        const conversations = await getUnifiedB2BChatBootstrap(orgId);

        const trips:       Record<string, TripEntry>             = {};
        const convToTrip:  Record<string, string>                = {};
        const convToParty: Record<string, ConversationPartyType> = {};

        for (const conv of conversations) {
          const { trip_id: tripId, party_type: partyType } = conv;
          if (!tripId || !partyType) continue;

          if (!trips[tripId]) trips[tripId] = entryFromConv(conv);
          const entry = trips[tripId];

          // Hydrate history: defensive array check + explicit ASC sort so the
          // detail panel renders oldest-first regardless of RPC ordering.
          const history: TripMessageRow[] = Array.isArray(conv.messages)
            ? (conv.messages as TripMessageRow[])
            : [];
          const sortedHistory = history.length > 1
            ? [...history].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              )
            : history;
          const newEvts: TripEvent[] = sortedHistory.map(m => ({ ...m, partyType }));

          entry.parties[partyType] = partyFromConv(conv);
          entry.event_stream       = mergeEvents(entry.event_stream, newEvts);

          // Sync trip metadata — prefer most-complete values across parties
          if (conv.trip_status)      entry.status     = conv.trip_status;
          if (conv.trip_driver_id)   entry.driverId   = conv.trip_driver_id;
          if (conv.trip_supplier_id) entry.supplierId = conv.trip_supplier_id;

          convToTrip[conv.id]  = tripId;
          convToParty[conv.id] = partyType;
        }

        // Compute sidebar fields and payment balance from actual event history.
        // The last event timestamp/preview is the ground truth for sort order
        // and the preview line shown in the sidebar card.
        for (const entry of Object.values(trips)) {
          entry.totalUnread = sumUnread(entry.parties);

          // Accumulate payment balance from bootstrap events
          let balance = 0;
          for (const evt of entry.event_stream) {
            if (
              evt.message_type === 'ledger_event' ||
              evt.message_type === 'ledger' ||
              evt.message_type === 'payment'
            ) {
              const meta = evt.metadata as LedgerEventMetadata | null;
              if (meta?.amount != null) {
                balance += meta.flow === 'out' ? -Number(meta.amount) : Number(meta.amount);
              }
            }
          }
          entry.paymentBalance = balance !== 0 ? balance : null;

          if (entry.event_stream.length > 0) {
            const last              = entry.event_stream[entry.event_stream.length - 1];
            entry.lastEventAt       = last.created_at;
            entry.lastEventPreview  = previewText(last) ?? entry.lastEventPreview;
          }
          // If no events, fallback values from entryFromConv (DB columns) remain.
        }

        set(s => ({
          trips,
          convToTrip,
          convToParty,
          activeParties:   s.activeParties,
          bootstrappedOrg: orgId,
          isLoading:       false,
        }));
      } catch (err) {
        if (__DEV__) console.error('[useChatStore] bootstrap failed:', err);
        set({ isLoading: false });
      }
    },

    // ── onRealtimeInsert ──────────────────────────────────────────────────────
    // Receives every trip_messages INSERT from the Realtime channel.
    //   active     → append event + extract state from metadata
    //   background → bump unread badge only

    onRealtimeInsert: (row, mode) => {
      if (!row.conversation_id) return;
      const { trips, convToTrip, convToParty } = get();

      const tripId    = convToTrip[row.conversation_id];
      const partyType = convToParty[row.conversation_id];
      if (!tripId || !partyType) return;  // unknown conv — context handles

      const entry = trips[tripId];
      if (!entry) return;

      const event: TripEvent = { ...(row as TripMessageRow), partyType };
      let updated: TripEntry = { ...entry };

      if (mode === 'active') {
        // Dedup: Realtime can overlap with bootstrap window
        const alreadyIn = entry.event_stream.some(e => e.id === event.id);
        updated.event_stream = alreadyIn
          ? entry.event_stream
          : [...entry.event_stream, event];

        // ── Memory-first state sync (WhatsApp "Data in Payload") ──────────────
        const b2bMeta = row.metadata as Partial<B2BEventMetadata> | null;
        if (b2bMeta?.trip_state) {
          const ts = b2bMeta.trip_state as B2BTripState;
          updated = {
            ...updated,
            status:               ts.status                 ?? entry.status,
            driverId:             ts.driver_id              ?? entry.driverId,
            supplierId:           ts.supplier_id            ?? entry.supplierId,
            driverDisplayName:    ts.driver_display_name    ?? entry.driverDisplayName,
            vehicleDisplayNumber: ts.vehicle_display_number ?? entry.vehicleDisplayNumber,
            pickupArea:           ts.pickup_area            ?? entry.pickupArea,
            dropLocation:         ts.drop_location          ?? entry.dropLocation,
          };
        } else if (row.message_type === 'status_change') {
          const meta = row.metadata as { new_status?: string } | null;
          if (meta?.new_status) updated.status = meta.new_status;
        } else if (row.message_type === 'system' || row.message_type === 'system_log' || row.message_type === 'update') {
          // system messages carry status transitions in event_payload
          const meta = row.metadata as { event_payload?: { new_status?: string }; new_status?: string } | null;
          const newStatus = meta?.event_payload?.new_status ?? meta?.new_status;
          if (newStatus) updated.status = newStatus;
        } else if (row.message_type === 'tracking') {
          const meta = row.metadata as {
            lat?: number; lng?: number;
            eta_minutes?: number; eta_label?: string
          } | null;
          if (meta?.lat != null && meta?.lng != null) {
            updated = {
              ...updated,
              lastLat:        meta.lat,
              lastLng:        meta.lng,
              lastLocationAt: event.created_at ?? new Date().toISOString(),
              lastEtaMinutes: meta.eta_minutes ?? null,
              lastEtaLabel:   meta.eta_label   ?? null,
            };
          }
        } else if (
          row.message_type === 'ledger_event' ||
          row.message_type === 'ledger' ||
          row.message_type === 'payment'
        ) {
          // Accumulate payment balance from each financial event
          const meta = row.metadata as LedgerEventMetadata | null;
          if (meta?.amount != null) {
            const delta = meta.flow === 'out' ? -Number(meta.amount) : Number(meta.amount);
            updated.paymentBalance = (entry.paymentBalance ?? 0) + delta;
          }
        }
      } else {
        // Background: bump the unread count for this party
        const party = entry.parties[partyType];
        if (party) {
          updated.parties = {
            ...entry.parties,
            [partyType]: { ...party, unreadCount: party.unreadCount + 1 },
          };
          updated.totalUnread = entry.totalUnread + 1;
        }
      }

      updated.lastEventAt      = event.created_at ?? entry.lastEventAt;
      updated.lastEventPreview = previewText(row)  ?? entry.lastEventPreview;

      set({ trips: { ...trips, [tripId]: updated } });
    },

    // ── onRealtimeAck ─────────────────────────────────────────────────────────
    // Patches is_delivered / is_read ticks on an existing event.

    onRealtimeAck: (convId, msgId, patch) => {
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry) return;

      const idx = entry.event_stream.findIndex(e => e.id === msgId);
      if (idx === -1) return;

      const event_stream  = [...entry.event_stream];
      event_stream[idx]   = { ...event_stream[idx], ...patch };
      set({ trips: { ...trips, [tripId]: { ...entry, event_stream } } });
    },

    // ── applySystemUpdate ─────────────────────────────────────────────────────
    // External metadata patch (SYSTEM_UPDATE Realtime events, changeTripStatus).

    applySystemUpdate: (tripId, patch) => {
      const { trips } = get();
      const entry = trips[tripId];
      if (!entry) return;
      set({ trips: { ...trips, [tripId]: { ...entry, ...patch } } });
    },

    // ── switchParty ───────────────────────────────────────────────────────────

    switchParty: (tripId, partyType) => {
      const { activeParties } = get();
      if (activeParties[tripId] === partyType) return;
      set({ activeParties: { ...activeParties, [tripId]: partyType } });
    },

    // ── markRead ──────────────────────────────────────────────────────────────
    // Zeros the unread badge for a party lane. No DB call.

    markRead: (convId) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      const party = entry?.parties[partyType];
      if (!party || party.unreadCount === 0) return;

      const updatedParty = { ...party, unreadCount: 0 };
      const updatedParties = { ...entry.parties, [partyType]: updatedParty };
      set({
        trips: {
          ...trips,
          [tripId]: {
            ...entry,
            parties:     updatedParties,
            totalUnread: sumUnread(updatedParties),
          },
        },
      });
    },

    // ── patchMessage (seen ticks from useMarkSeen) ────────────────────────────

    patchMessage: (convId, msgId, patch) => {
      get().onRealtimeAck(convId, msgId, patch);
    },

    // ── submitFeedback (optimistic — caller also fires the RPC) ──────────────

    submitFeedback: (convId, msgId, patch) => {
      get().patchMessage(convId, msgId, patch);
    },

    // ── mergeConversationHistory ──────────────────────────────────────────────

    mergeConversationHistory: (convId, messages) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;
      const entry = trips[tripId];
      if (!entry) return;
      const newEvts: TripEvent[] = messages.map(m => ({ ...m, partyType }));
      set({
        trips: {
          ...trips,
          [tripId]: {
            ...entry,
            event_stream: mergeEvents(entry.event_stream, newEvts),
          },
        },
      });
    },

    // ── Optimistic send ───────────────────────────────────────────────────────

    optimisticInsert: (convId, msg) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      if (!entry) return;

      const event: TripEvent = { ...msg, partyType };
      set({
        trips: {
          ...trips,
          [tripId]: {
            ...entry,
            event_stream:     [...entry.event_stream, event],
            lastEventAt:      msg.created_at,
            lastEventPreview: previewText(msg) ?? entry.lastEventPreview,
          },
        },
      });
    },

    replaceOptimistic: (convId, tempId, persisted) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      if (!entry) return;

      set({
        trips: {
          ...trips,
          [tripId]: {
            ...entry,
            event_stream: entry.event_stream.map(e =>
              e.id === tempId ? { ...persisted, partyType } : e,
            ),
          },
        },
      });
    },

    removeMessage: (convId, msgId) => {
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry) return;
      set({
        trips: {
          ...trips,
          [tripId]: {
            ...entry,
            event_stream: entry.event_stream.filter(e => e.id !== msgId),
          },
        },
      });
    },

    // ── upsertConversation ────────────────────────────────────────────────────
    // Used by queue-and-fetch recovery and initiateConversation.

    upsertConversation: (conv) => {
      const { trips, convToTrip, convToParty } = get();
      const { trip_id: tripId, party_type: partyType } = conv;

      const newEvts: TripEvent[] = conv.messages.map(m => ({ ...m, partyType }));
      const existing = trips[tripId];
      let entry: TripEntry = existing
        ? { ...existing }
        : entryFromConv(conv);

      entry.parties      = { ...entry.parties, [partyType]: partyFromConv(conv) };
      entry.event_stream = mergeEvents(entry.event_stream, newEvts);

      if (conv.trip_status)      entry.status     = conv.trip_status;
      if (conv.trip_driver_id)   entry.driverId   = conv.trip_driver_id;
      if (conv.trip_supplier_id) entry.supplierId = conv.trip_supplier_id;

      entry.totalUnread = sumUnread(entry.parties);

      const last = entry.event_stream[entry.event_stream.length - 1];
      if (last) {
        entry.lastEventAt      = last.created_at;
        entry.lastEventPreview = previewText(last) ?? entry.lastEventPreview;
      }

      set({
        trips:       { ...trips,       [tripId]:  entry      },
        convToTrip:  { ...convToTrip,  [conv.id]: tripId     },
        convToParty: { ...convToParty, [conv.id]: partyType  },
      });
    },

    // ── clear (logout / org switch) ───────────────────────────────────────────

    clear: () =>
      set({
        trips:           {},
        convToTrip:      {},
        convToParty:     {},
        activeParties:   {},
        bootstrappedOrg: null,
        isLoading:       false,
      }),

    // ── Derived helpers ───────────────────────────────────────────────────────

    getActiveParty: (tripId) => get().activeParties[tripId],

    getConversationId: (tripId, partyType) =>
      get().trips[tripId]?.parties[partyType]?.conversationId ?? null,

    /** Reconstruct a TripConversation from the store (backward compat shim). */
    getConversationByConvId: (convId) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return null;
      const entry = trips[tripId];
      if (!entry) return null;
      const party = entry.parties[partyType];
      if (!party) return null;
      return convFromEntry(entry, partyType, party);
    },

    /** Sorted for sidebar display: unread-first, then most-recent-event first. */
    getSortedTripEntries: () =>
      Object.values(get().trips).sort((a, b) => {
        const au = a.totalUnread > 0 ? 0 : 1;
        const bu = b.totalUnread > 0 ? 0 : 1;
        if (au !== bu) return au - bu;
        const ta = a.lastEventAt ? new Date(a.lastEventAt).getTime() : 0;
        const tb = b.lastEventAt ? new Date(b.lastEventAt).getTime() : 0;
        return tb - ta;
      }),
  })),
);

// ── Selector: TripMeta from TripEntry (backward compat) ──────────────────────

export function tripEntryToMeta(entry: TripEntry): TripMeta {
  return {
    trip_id:          entry.tripId,
    trip_number:      entry.tripNumber,
    display_trip_id:  entry.displayTripId,
    trip_status:      entry.status,
    pickup_area:      entry.pickupArea,
    drop_location:    entry.dropLocation,
    trip_driver_id:   entry.driverId,
    trip_supplier_id: entry.supplierId,
    trip_created_at:  entry.createdAt,
    last_lat:         entry.lastLat,
    last_lng:         entry.lastLng,
    last_location_at: entry.lastLocationAt,
    last_eta_minutes: entry.lastEtaMinutes,
    last_eta_label:   entry.lastEtaLabel,
    payment_balance:  entry.paymentBalance,
  };
}
