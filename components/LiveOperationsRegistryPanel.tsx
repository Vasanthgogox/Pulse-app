import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { AlertTriangle, CheckCircle2, Radio, Truck } from 'lucide-react-native';
import Theme from '@/constants/Theme';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import type { GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { useOperationsShelfItems } from '@/lib/globalSync/useOperationsDerived';
import { useChatStore, type TripEntry } from '@/features/chat/store/useChatStore';

function formatMoneyInr(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n >= 0 ? '' : '−';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

function countPendingFeedbackTripsForOrg(
  trips: Record<string, TripEntry>,
  orgId: string,
): number {
  const seen = new Set<string>();
  for (const entry of Object.values(trips)) {
    if (!entry?.tripId) continue;
    const ownerOrg = entry.tripOrganizationId?.trim() ?? '';
    const isTripOwnerViewer = ownerOrg !== '' && ownerOrg === orgId;
    for (const p of Object.values(entry.parties)) {
      if (!p) continue;
      if (p.feedbackStatus !== 'pending') continue;
      if (!isTripOwnerViewer && p.organizationId !== orgId) continue;
      if (seen.has(entry.tripId)) continue;
      seen.add(entry.tripId);
    }
  }
  return seen.size;
}

export type LiveOperationsRegistryPanelProps = {
  /** Merged into the root wrapper (e.g. margin / border for placement inside a popover). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Live operations / critical monitor cards for the desktop **Alert Registry** bell dropdown.
 * (Formerly rendered as a fixed right shelf.)
 */
export function LiveOperationsRegistryPanel({ style }: LiveOperationsRegistryPanelProps) {
  const org = useOptionalOrganization();
  const auth = useOptionalAuth();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const ledgerPulseTripId = useGlobalSyncStore((s) => s.ledgerPulseTripId);
  const ledgerPulseAtMs = useGlobalSyncStore((s) => s.ledgerPulseAtMs);

  const items = useOperationsShelfItems();
  const criticalItems = useMemo(
    () => items.filter((i) => i.kind === 'critical'),
    [items],
  );
  const routineItems = useMemo(
    () => items.filter((i) => i.kind !== 'critical'),
    [items],
  );
  const pendingFeedbackTrips = useChatStore((s) =>
    orgId ? countPendingFeedbackTripsForOrg(s.trips, orgId) : 0,
  );

  const [glowTick, setGlowTick] = useState(0);
  useEffect(() => {
    if (!ledgerPulseAtMs) return;
    setGlowTick((t) => t + 1);
    const id = setTimeout(() => setGlowTick((t) => t + 1), 4200);
    return () => clearTimeout(id);
  }, [ledgerPulseAtMs, ledgerPulseTripId]);

  const glowActive = useMemo(() => {
    const age = Date.now() - ledgerPulseAtMs;
    return Boolean(ledgerPulseTripId && age >= 0 && age < 4000);
  }, [glowTick, ledgerPulseAtMs, ledgerPulseTripId]);

  if (auth?.profile?.role === 'driver' || !orgId || bootstrapStatus !== 'ready') {
    return null;
  }

  return (
    <View style={[styles.wrap, style]} accessibilityLabel="Live operations in alert registry">
      <View style={styles.headerRow}>
        <Text style={styles.header}>Operations</Text>
        {pendingFeedbackTrips > 0 ? (
          <View style={styles.feedbackBadge} accessibilityLabel="Pending trip feedback">
            <Text style={styles.feedbackBadgeText}>Feedback {pendingFeedbackTrips}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        {items.length === 0 ? (
          <Text style={styles.empty}>All clear — waiting for Realtime signals.</Text>
        ) : (
          <>
            {criticalItems.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Critical monitor</Text>
                {criticalItems.map((item) => (
                  <OpsAlertRow
                    key={item.id}
                    item={item}
                    glow={Boolean(
                      glowActive &&
                        item.trip_id === ledgerPulseTripId &&
                        item.category === 'payment_received',
                    )}
                  />
                ))}
              </View>
            ) : null}
            {routineItems.length > 0 ? (
              <View style={styles.section}>
                {criticalItems.length > 0 ? (
                  <Text style={styles.sectionTitle}>Live operations</Text>
                ) : null}
                {routineItems.map((item) => (
                  <OpsAlertRow
                    key={item.id}
                    item={item}
                    glow={Boolean(
                      glowActive &&
                        item.trip_id === ledgerPulseTripId &&
                        item.category === 'payment_received',
                    )}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function OpsAlertRow({ item, glow }: { item: GlobalOperationAlert; glow: boolean }) {
  const icon =
    item.kind === 'critical' ? (
      <AlertTriangle size={16} color="#dc2626" />
    ) : item.kind === 'warning' ? (
      <Radio size={16} color="#ea580c" />
    ) : item.kind === 'success' ? (
      <CheckCircle2 size={16} color="#16a34a" />
    ) : (
      <Truck size={16} color="#1a237e" />
    );
  const money = formatMoneyInr(item.amount);

  return (
    <MotiView
      animate={{
        shadowOpacity: glow ? 0.55 : 0.08,
        shadowRadius: glow ? 22 : 8,
        borderColor: glow ? 'rgba(34,197,94,0.65)' : 'rgba(226,232,240,1)',
      }}
      transition={{ type: 'timing', duration: 220 }}
      style={[styles.rowCard, glow && styles.rowCardGlow]}
    >
      <View style={styles.rowTop}>
        <View style={styles.iconWrap}>{icon}</View>
        <View style={styles.rowBody}>
          <Text style={styles.cat}>{item.category.replace(/_/g, ' ')}</Text>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.rowSub} numberOfLines={2}>
              {item.subtitle}
            </Text>
          ) : null}
          {money ? <Text style={styles.money}>{money}</Text> : null}
          {item.trip_number ? (
            <Text style={styles.trip}>{item.trip_number}</Text>
          ) : null}
        </View>
      </View>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  header: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Theme.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  feedbackBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(26,35,126,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(26,35,126,0.25)',
  },
  feedbackBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: 0.4,
  },
  body: { gap: 8, paddingHorizontal: 6, paddingBottom: 8 },
  section: { gap: 8, marginBottom: 2 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Theme.textSecondary,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  empty: { fontSize: 12, color: Theme.textSecondary, paddingHorizontal: 6, lineHeight: 18 },
  rowCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    backgroundColor: Theme.cardWhite,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
  },
  rowCardGlow: {
    backgroundColor: 'rgba(240,253,244,0.95)',
  },
  rowTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  cat: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rowTitle: { marginTop: 2, fontSize: 13, fontWeight: '800', color: Theme.textPrimary },
  rowSub: { marginTop: 3, fontSize: 11, color: Theme.textRouteCard, lineHeight: 15 },
  money: { marginTop: 5, fontSize: 14, fontWeight: '900', color: '#15803d' },
  trip: { marginTop: 3, fontSize: 10, fontWeight: '700', color: Theme.textSecondary },
});
