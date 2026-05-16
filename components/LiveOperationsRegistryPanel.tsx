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

  const iconWrapStyle =
    item.kind === 'critical'
      ? styles.iconWrapCritical
      : item.kind === 'warning'
        ? styles.iconWrapWarning
        : item.kind === 'success'
          ? styles.iconWrapSuccess
          : styles.iconWrapDefault;

  return (
    <MotiView
      animate={{
        shadowOpacity: glow ? 0.55 : 0.08,
        shadowRadius: glow ? 22 : 8,
        borderColor: glow ? 'rgba(34,197,94,0.65)' : Theme.borderLight,
      }}
      transition={{ type: 'timing', duration: 220 }}
      style={[styles.rowCard, glow && styles.rowCardGlow]}
    >
      <View style={styles.rowTouchable}>
        <View style={[styles.iconWrap, iconWrapStyle]}>{icon}</View>
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

/** Typography aligned with LedgerTransactionListView (transaction stream rows). */
const TXN_ROW_TITLE = {
  fontSize: 12,
  fontWeight: '500' as const,
  color: Theme.textPrimaryDark,
};
const TXN_ROW_LABEL = {
  fontSize: 8,
  fontWeight: '400' as const,
  color: Theme.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};
const TXN_ROW_META = {
  fontSize: 9,
  fontWeight: '400' as const,
  color: Theme.textMuted,
  fontStyle: 'italic' as const,
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  header: {
    ...TXN_ROW_LABEL,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: Theme.networkSectionLabel,
    flex: 1,
    minWidth: 0,
  },
  feedbackBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(26,35,126,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(26,35,126,0.18)',
  },
  feedbackBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textPrimary,
    letterSpacing: 0.3,
  },
  body: { gap: 10, paddingHorizontal: 0, paddingBottom: 4 },
  section: { gap: 10, marginBottom: 4 },
  sectionTitle: {
    ...TXN_ROW_LABEL,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: Theme.networkSectionLabel,
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  empty: {
    fontSize: 12,
    fontWeight: '400',
    color: Theme.textSecondary,
    paddingHorizontal: 2,
    lineHeight: 18,
  },
  rowCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  rowCardGlow: {
    backgroundColor: 'rgba(240,253,244,0.95)',
  },
  rowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapCritical: {
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
  },
  iconWrapWarning: {
    backgroundColor: Theme.warningMuted,
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.15)',
  },
  iconWrapSuccess: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: 'rgba(21,128,61,0.15)',
  },
  iconWrapDefault: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  cat: {
    ...TXN_ROW_LABEL,
    marginBottom: 1,
  },
  rowTitle: {
    ...TXN_ROW_TITLE,
    lineHeight: 16,
  },
  rowSub: {
    ...TXN_ROW_META,
    lineHeight: 14,
    marginTop: 1,
  },
  money: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: Theme.darkGreen,
    letterSpacing: -0.2,
  },
  trip: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '400',
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
});
