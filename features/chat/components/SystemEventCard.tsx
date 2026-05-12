/**
 * SystemEventCard — unified renderer for all non-text message_type variants.
 *
 * Acts as the single routing layer between a TripMessageRow and the correct
 * visual component.  The chat screen's render function calls this for every
 * message that is NOT a plain "text" bubble; it never inspects message_type
 * directly.
 *
 * Routing table:
 *   status_change    → StatusChangeCard  (metadata-driven, replaces content-inferred ChatSystemEventCard)
 *   image            → ImageMessageCard  (Supabase Image Transformations thumbnail + full-size modal)
 *   document_share   → DocumentShareCard (delegated)
 *   feedback_request → ChatFeedbackCard (delegated)
 *   ledger_event     → ChatLedgerEventCard (delegated)
 *   system / update  → ChatSystemEventCard (content-based fallback)
 *   text / other     → null (rendered as a normal chat bubble)
 */
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CheckCircle,
  Clock,
  Navigation,
  MapPin,
  Truck,
  XCircle,
  Package,
  Send,
} from 'lucide-react-native';
import type {
  ImageMessageMetadata,
  StatusChangeMetadata,
  TrackingMetadata,
  TripMessageRow,
} from '../types/chat.types';
import { OptimizedChatImage } from './OptimizedChatImage';
import { ChatSystemEventCard } from './ChatEventCard';

// ── StatusChangeCard ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { Icon: React.ComponentType<any>; color: string; bg: string; label: string }> = {
  pending:     { Icon: Clock,        color: '#94a3b8', bg: '#f1f5f9', label: 'Pending' },
  assigned:    { Icon: Truck,        color: '#5c6bc0', bg: '#e8eaf6', label: 'Assigned' },
  in_progress: { Icon: Send,         color: '#5c6bc0', bg: '#e8eaf6', label: 'In Progress' },
  picked_up:   { Icon: MapPin,       color: '#f59e0b', bg: '#fffbeb', label: 'Picked Up' },
  in_transit:  { Icon: Truck,        color: '#06b6d4', bg: '#ecfeff', label: 'In Transit' },
  at_drop:     { Icon: MapPin,       color: '#10b981', bg: '#ecfdf5', label: 'At Drop' },
  completed:   { Icon: CheckCircle,  color: '#22c55e', bg: '#f0fdf4', label: 'Completed' },
  cancelled:   { Icon: XCircle,      color: '#ef4444', bg: '#fef2f2', label: 'Cancelled' },
  started:     { Icon: Send,         color: '#5c6bc0', bg: '#e8eaf6', label: 'Started' },
  delivered:   { Icon: Package,      color: '#10b981', bg: '#ecfdf5', label: 'Delivered' },
};

function isGenericStatusActor(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return !n || n === 'system' || n === 'dispatcher';
}

/** Human line for trip lane (reference: one narrative + timestamp). */
function statusChangeNarrative(message: TripMessageRow, statusKey: string): string {
  const meta = message.metadata as StatusChangeMetadata | null;
  const content = (message.content ?? '').trim();

  if (content.length > 0 && /accepted the trip|heading to pickup/i.test(content)) {
    return content;
  }

  const rawName = meta?.changed_by_name?.trim();
  const actor = isGenericStatusActor(rawName) ? null : rawName;
  const who = actor ?? 'The driver';

  switch (statusKey) {
    case 'in_progress':
      return actor
        ? `${actor} has accepted the trip and is heading to pickup.`
        : 'The trip was accepted and the driver is heading to pickup.';
    case 'assigned':
      return actor
        ? `${actor} was assigned to this trip.`
        : 'A driver was assigned to this trip.';
    case 'picked_up':
      return `${who} picked up the load.`;
    case 'in_transit':
      return `${who} is in transit.`;
    case 'at_drop':
      return `${who} arrived at drop-off.`;
    case 'completed':
      return actor ? `Trip completed. Confirmed by ${actor}.` : 'Trip completed.';
    case 'cancelled':
      return actor ? `Trip cancelled by ${actor}.` : 'Trip was cancelled.';
    case 'started':
      return actor
        ? `${actor} started the trip.`
        : 'The trip was started.';
    case 'delivered':
      return actor ? `${actor} confirmed delivery.` : 'Delivery was confirmed.';
    case 'pending':
      return 'Trip is pending assignment.';
    default:
      return content || 'Trip status was updated.';
  }
}

function StatusChangeCard({ message }: { message: TripMessageRow }) {
  const meta = message.metadata as StatusChangeMetadata | null;

  const statusKey = meta?.new_status ?? 'default';
  const cfg = STATUS_CONFIG[statusKey] ?? { Icon: Clock, color: '#94a3b8', bg: '#f1f5f9', label: statusKey };
  const { Icon, color, bg } = cfg;
  const useSendTilt = statusKey === 'in_progress' || statusKey === 'started';

  const bodyText = statusChangeNarrative(message, statusKey);

  let displayTime = '';
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { /* keep empty */ }

  const iconInner = <Icon size={18} color={color} strokeWidth={2.1} />;

  return (
    <View style={sc.operationalCard}>
      <View style={[sc.operationalIcon, { backgroundColor: bg }]}>
        {useSendTilt ? (
          <View style={sc.operationalIconTilt}>{iconInner}</View>
        ) : (
          iconInner
        )}
      </View>
      <View style={sc.operationalBody}>
        <Text style={sc.operationalContent}>{bodyText}</Text>
        {displayTime ? <Text style={sc.operationalTime}>{displayTime}</Text> : null}
      </View>
    </View>
  );
}

// ── ImageMessageCard ──────────────────────────────────────────────────────────

function ImageMessageCard({ message, isOwn }: { message: TripMessageRow; isOwn: boolean }) {
  // Image storage path may be in metadata.storage_path or in message.content.
  const meta = message.metadata as ImageMessageMetadata | null;
  const storagePath = meta?.storage_path || message.content;
  if (!storagePath) return null;

  return (
    <View style={sc.imageWrap}>
      {/* OptimizedChatImage: CDN thumbnail (300×300 @ q70); lightbox prefers transform before raw URL. */}
      <OptimizedChatImage message={message} storagePath={storagePath} isOwn={isOwn} />
    </View>
  );
}

// ── TrackingCard ──────────────────────────────────────────────────────────────

function TrackingCard({ message }: { message: TripMessageRow }) {
  const meta = message.metadata as TrackingMetadata | null;
  if (!meta?.lat || !meta?.lng) return null;

  let displayTime = '';
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { /* keep empty */ }

  const eta = meta.eta_label ?? (meta.eta_minutes != null ? `${meta.eta_minutes} min` : null);
  const coords = `${meta.lat.toFixed(5)}, ${meta.lng.toFixed(5)}`;

  return (
    <View style={sc.card}>
      <View style={[sc.iconWrap, { backgroundColor: '#eff6ff' }]}>
        <Navigation size={16} color="#3b82f6" />
      </View>
      <View style={sc.body}>
        <View style={sc.statusRow}>
          <Text style={[sc.statusChip, { backgroundColor: '#eff6ff', color: '#3b82f6' }]}>
            Live Location
          </Text>
          {eta ? (
            <Text style={[sc.statusChip, { backgroundColor: '#ecfdf5', color: '#059669' }]}>
              ETA {eta}
            </Text>
          ) : null}
        </View>
        {meta.address_hint ? (
          <Text style={sc.byLine}>{meta.address_hint}</Text>
        ) : (
          <Text style={sc.byLine}>{coords}</Text>
        )}
        <Text style={sc.time}>{displayTime}</Text>
      </View>
    </View>
  );
}

// ── SystemEventCard (public) ──────────────────────────────────────────────────

interface SystemEventCardProps {
  message: TripMessageRow;
  /** Whether this message was sent by the current user (affects image styling). */
  isOwn?: boolean;
  /** For ledger and feedback cards that need the caller's org context. */
  currentOrgId?: string;
  conversationPartyName?: string | null;
  // Ledger card callbacks
  onAddToBook?: (msg: TripMessageRow) => void;
  onDispute?:   (msg: TripMessageRow) => void;
  readOnly?: boolean;
  /** When true, ledger/payment rows are hidden (e.g. driver financial shield). */
  financialViewerBlocked?: boolean;
  /** When true, ledger card renders without Add to book / Dispute (indent-lane-only actions). */
  hideLedgerActions?: boolean;
  // Feedback card callback
  onFeedbackSubmit?: (score: number, tags: string[]) => Promise<void>;
}

export function SystemEventCard({
  message,
  isOwn = false,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  readOnly,
  financialViewerBlocked,
  hideLedgerActions,
}: SystemEventCardProps) {
  switch (message.message_type) {
    case 'status_change':
      return <StatusChangeCard message={message} />;

    case 'tracking':
      return <TrackingCard message={message} />;

    case 'image':
      return <ImageMessageCard message={message} isOwn={isOwn} />;

    case 'document_share': {
      // DocumentShareCard is a heavier component with its own lazy imports.
      // Import it lazily only when needed to avoid bundling its deps upfront.
      // We render a placeholder if the component is not yet loaded — the card
      // handles its own async resolution internally.
      const DocumentShareCard = require('./DocumentShareCard').DocumentShareCard;
      return <DocumentShareCard message={message} />;
    }

    case 'ledger_event':
    case 'ledger': {
      if (financialViewerBlocked) return null;
      if (!currentOrgId || !onAddToBook || !onDispute) return null;
      const { ChatLedgerEventCard } = require('./ChatEventCard');
      return (
        <ChatLedgerEventCard
          message={message}
          currentOrgId={currentOrgId}
          conversationPartyName={conversationPartyName}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          readOnly={readOnly}
          hideLedgerActions={hideLedgerActions}
        />
      );
    }

    case 'system':
    case 'update':
      return <ChatSystemEventCard message={message} />;

    default:
      // text, question, challenge, feedback_request — rendered as chat bubbles elsewhere
      return null;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  // StatusChangeCard
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '88%',
    marginVertical: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusChip: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  prevChip: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  arrow: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  byLine: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  time: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },

  // ImageMessageCard
  imageWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: 260,
  },

  // StatusChangeCard (operational — mirrors ChatEventCard event* layout)
  operationalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: '92%',
    marginVertical: 6,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  operationalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  operationalIconTilt: {
    transform: [{ rotate: '-28deg' }],
    marginTop: 2,
  },
  operationalBody: { flex: 1, minWidth: 0, paddingTop: 1 },
  operationalContent: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  operationalTime: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
});
