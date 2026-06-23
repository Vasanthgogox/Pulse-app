/**
 * Post-trip continuation card — server-authoritative workflow state.
 *
 * State source:  trip_workflow_events (Postgres, append-only)
 * Realtime:      Supabase Postgres changes → TanStack Query invalidation
 * Optimistic:    Local state patched instantly; rolled back if DB write fails
 * Offline cache: AsyncStorage stores last-known state for instant display;
 *                server state reconciles on reconnect
 *
 * Two PARALLEL tracks — complete in any order:
 *   Finance:       client invoice → supplier payment → client receipt
 *   Documentation: POD upload (independent; does NOT block invoicing)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import Theme from '@/constants/Theme';
import {
  recordTripWorkflowEvent,
  type TripWorkflowEventType,
  type TripWorkflowState,
} from '@/features/trips/services/tripWorkflow.service';
import { useTripWorkflowQuery } from '@/lib/queries/useTripWorkflowQuery';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  Check,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

const PURPLE = '#4D3636';
const PURPLE_TINT = 'rgba(79,70,229,0.08)';
const TEAL = '#0f766e';
const TEAL_TINT = 'rgba(15,118,110,0.08)';
const AMBER = '#d97706';
const AMBER_TINT = 'rgba(217,119,6,0.08)';
const GREEN = '#16a34a';
const GREEN_TINT = 'rgba(22,163,74,0.08)';

const CACHE_KEY = (tripId: string) => `@pulse/wf-cache/${tripId}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

// AsyncStorage cache — display only, never authoritative
async function readCache(tripId: string): Promise<Partial<TripWorkflowState>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY(tripId));
    return raw ? (JSON.parse(raw) as Partial<TripWorkflowState>) : {};
  } catch {
    return {};
  }
}

async function writeCache(tripId: string, state: TripWorkflowState): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY(tripId), JSON.stringify(state));
  } catch { /* best-effort */ }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrackHeader({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <View style={[th.wrap, { borderLeftColor: color }]}>
      <Text style={[th.label, { color }]}>{label}</Text>
      <Text style={th.sub}>{sub}</Text>
    </View>
  );
}
const th = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 3, marginLeft: 14, marginTop: 2, marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  sub: { fontSize: 10, color: Theme.textMuted, marginTop: 1 },
});

function TrackStep({
  icon,
  iconBg,
  label,
  sub,
  done,
  pending,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub: string;
  done: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        step.row,
        done && step.rowDone,
        pressed && !done && !pending && { backgroundColor: Theme.surfaceGray },
        (done || pending) && { opacity: done ? 1 : 0.75 },
      ]}
      onPress={onPress}
      disabled={done || pending}
      accessibilityRole="button"
    >
      <View style={[step.icon, { backgroundColor: done ? GREEN_TINT : iconBg }]}>
        {pending ? (
          <LoadingIndicator size="small" color={Theme.textMuted} />
        ) : done ? (
          <Check size={14} color={GREEN} strokeWidth={2.8} />
        ) : (
          icon
        )}
      </View>
      <View style={step.text}>
        <Text style={[step.label, done && { color: GREEN }]}>{label}</Text>
        <Text style={step.sub}>{sub}</Text>
      </View>
      {done ? (
        <Check size={13} color={GREEN} strokeWidth={2.8} />
      ) : (
        <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
      )}
    </Pressable>
  );
}
const step = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  rowDone: { backgroundColor: GREEN_TINT + '55' },
  icon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark },
  sub: { fontSize: 11, color: Theme.textMuted, marginTop: 1 },
});

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface TripContinuationCardProps {
  tripId: string;
  tripNumber: string;
  clientName: string;
  supplierName: string;
  clientPrice: number;
  supplierRate: number;
  orgId: string;
  /** Called after a workflow action — use to navigate (e.g. to invoice screen). */
  onAction?: (action: TripWorkflowEventType) => void;
}

export function TripContinuationCard({
  tripId,
  tripNumber,
  clientName,
  supplierName,
  clientPrice,
  supplierRate,
  orgId,
  onAction,
}: TripContinuationCardProps) {
  const qc = useQueryClient();
  const { state, isLoading, error, refetch } = useTripWorkflowQuery(tripId);

  // Pending flags: optimistic in-flight state per action
  const [pending, setPending] = useState<Partial<Record<TripWorkflowEventType, boolean>>>({});
  const mounted = useRef(true);

  // Seed AsyncStorage cache on first server state arrival
  useEffect(() => {
    if (state) writeCache(tripId, state);
  }, [state, tripId]);

  // Show cached data instantly on mount while server fetches
  const [cachedState, setCachedState] = useState<Partial<TripWorkflowState>>({});
  useEffect(() => {
    readCache(tripId).then((c) => { if (mounted.current) setCachedState(c); });
    return () => { mounted.current = false; };
  }, [tripId]);

  // Merge: server state is authoritative when available; cache fills gaps
  const effective: Partial<TripWorkflowState> = state ?? cachedState;

  const setPendingFor = useCallback((et: TripWorkflowEventType, val: boolean) => {
    setPending((p) => ({ ...p, [et]: val }));
  }, []);

  const handleAction = useCallback(
    async (eventType: TripWorkflowEventType) => {
      if (pending[eventType]) return;

      // Optimistic: immediately mark done in query cache
      const wfKey = queryKeys.trips.workflow(tripId);
      const previous = qc.getQueryData(wfKey);
      qc.setQueryData(wfKey, (old: Parameters<typeof recordTripWorkflowEvent>[0][] | undefined) => {
        if (!Array.isArray(old)) return old;
        // Append a synthetic event row to the raw events list
        return [
          ...old,
          {
            id: `optimistic-${eventType}`,
            trip_id: tripId,
            org_id: orgId,
            actor_id: null,
            event_type: eventType,
            payload: {},
            idempotency_key: `${tripId}:${eventType}`,
            created_at: new Date().toISOString(),
          },
        ];
      });

      setPendingFor(eventType, true);
      try {
        const { error: writeErr, alreadyExists } = await recordTripWorkflowEvent({
          tripId,
          orgId,
          eventType,
          payload: eventType === 'invoice.generated'
            ? { client_price: clientPrice, client_name: clientName }
            : eventType === 'supplier.payment_recorded'
            ? { supplier_rate: supplierRate, supplier_name: supplierName }
            : {},
        });

        if (writeErr && !alreadyExists) {
          // Roll back optimistic update
          qc.setQueryData(wfKey, previous);
          Alert.alert('Could not save', writeErr.message + '\n\nYour progress will sync when reconnected.');
        } else {
          // Invalidate to get canonical server state (also triggered by realtime subscription)
          qc.invalidateQueries({ queryKey: wfKey });
          onAction?.(eventType);
        }
      } finally {
        if (mounted.current) setPendingFor(eventType, false);
      }
    },
    [tripId, orgId, clientPrice, clientName, supplierRate, supplierName, pending, qc, onAction, setPendingFor],
  );

  // ── Render ──

  if (isLoading && !cachedState.events) {
    return (
      <View style={[styles.wrap, styles.loading]}>
        <LoadingIndicator size="small" color={Theme.primary} />
        <Text style={styles.loadingText}>Loading workflow…</Text>
      </View>
    );
  }

  const inv = effective.invoiceGenerated ?? false;
  const sup = effective.supplierPaymentRecorded ?? false;
  const cli = effective.clientPaymentReceived ?? false;
  const pod = effective.podUploaded ?? false;
  const allDone = effective.allDone ?? (inv && sup && cli && pod);

  return (
    <View style={styles.wrap}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Continue: {tripNumber}</Text>
          <Text style={styles.sub}>Two independent tracks — complete in any order</Text>
        </View>
        <View style={styles.headerRight}>
          {error ? (
            <Pressable onPress={() => refetch()} style={styles.retryBtn} hitSlop={8}>
              <RefreshCw size={13} color={Theme.textMuted} strokeWidth={2.2} />
            </Pressable>
          ) : null}
          {allDone ? (
            <View style={styles.donePill}>
              <Check size={11} color={GREEN} strokeWidth={3} />
              <Text style={styles.donePillText}>Done</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Finance track */}
      <View style={styles.track}>
        <TrackHeader
          color={PURPLE}
          label="Finance"
          sub={`Client: ${formatINR(clientPrice)} · Supplier: ${formatINR(supplierRate)}`}
        />
        <TrackStep
          icon={<FileText size={14} color={PURPLE} strokeWidth={2.2} />}
          iconBg={PURPLE_TINT}
          label="Generate client invoice"
          sub={`${clientName} · ${formatINR(clientPrice)}`}
          done={inv}
          pending={!!pending['invoice.generated']}
          onPress={() => void handleAction('invoice.generated')}
        />
        <TrackStep
          icon={<Wallet size={14} color={TEAL} strokeWidth={2.2} />}
          iconBg={TEAL_TINT}
          label="Record supplier payment"
          sub={`${supplierName} · ${formatINR(supplierRate)}`}
          done={sup}
          pending={!!pending['supplier.payment_recorded']}
          onPress={() => void handleAction('supplier.payment_recorded')}
        />
        <TrackStep
          icon={<Receipt size={14} color={AMBER} strokeWidth={2.2} />}
          iconBg={AMBER_TINT}
          label="Confirm client payment"
          sub="Mark payment received from client"
          done={cli}
          pending={!!pending['client.payment_received']}
          onPress={() => void handleAction('client.payment_received')}
        />
      </View>

      {/* Documentation track */}
      <View style={[styles.track, styles.trackBorder]}>
        <TrackHeader
          color={TEAL}
          label="Documentation"
          sub="Independent of invoicing — upload anytime"
        />
        <TrackStep
          icon={<ImageIcon size={14} color={TEAL} strokeWidth={2.2} />}
          iconBg={TEAL_TINT}
          label="Upload proof of delivery"
          sub="Compliance document · does not block invoicing"
          done={pod}
          pending={!!pending['pod.uploaded']}
          onPress={() => void handleAction('pod.uploaded')}
        />
      </View>

      {/* Stale indicator when showing cached data */}
      {!state && cachedState.lastUpdatedAt ? (
        <View style={styles.staleBar}>
          <RefreshCw size={10} color={Theme.textMuted} strokeWidth={2} />
          <Text style={styles.staleText}>Showing cached state · tap retry to refresh</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Theme.cardWhite, borderRadius: 18, borderWidth: 1, borderColor: Theme.borderInput, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  loading: { padding: 24, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: Theme.textMuted },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', color: Theme.textPrimaryDark },
  sub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  retryBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Theme.surfaceGray, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.borderLight },
  donePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN_TINT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)' },
  donePillText: { fontSize: 11, fontWeight: '700', color: GREEN },
  track: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight, paddingBottom: 8 },
  trackBorder: { borderTopWidth: 1, borderTopColor: Theme.borderLight },
  staleBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Theme.surfaceGray, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  staleText: { fontSize: 10, color: Theme.textMuted },
});
