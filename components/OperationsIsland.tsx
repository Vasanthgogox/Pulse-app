import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, Radio, Truck } from 'lucide-react-native';
import Theme from '@/constants/Theme';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { selectCurrentActiveAlert, type GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';

function formatMoneyInr(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n >= 0 ? '' : '−';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

/**
 * Global “Dynamic Island” for fleet ops: glass card, Moti morph, priority from bootstrap + patches only.
 */
export function OperationsIsland() {
  const insets = useSafeAreaInsets();
  const org = useOptionalOrganization();
  const auth = useOptionalAuth();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);

  const alert = useGlobalSyncStore((s) =>
    selectCurrentActiveAlert({
      activeTrips: s.activeTrips,
      alertRows: s.alertRows,
      notificationRows: s.notificationRows,
      clientOperationsRibbon: s.clientOperationsRibbon,
    }),
  );

  const prevKind = useRef<GlobalOperationAlert['kind'] | null>(null);
  useEffect(() => {
    const k = alert?.kind ?? null;
    if (Platform.OS === 'web') {
      prevKind.current = k;
      return;
    }
    if (k === 'critical' && prevKind.current !== 'critical') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    prevKind.current = k;
  }, [alert?.kind]);

  const expanded = useMemo(
    () => Boolean(alert?.kind === 'success' && alert.amount != null),
    [alert?.amount, alert?.kind],
  );

  if (auth?.profile?.role === 'driver' || !orgId || bootstrapStatus !== 'ready' || !alert) return null;

  const money = formatMoneyInr(alert.amount);
  const tripLine = alert.trip_number ? `${alert.trip_number}` : 'Fleet';

  return (
    <View
      style={[styles.shell, { top: insets.top + 6 }]}
      pointerEvents="box-none"
    >
      <MotiView
        from={{ opacity: 0, translateY: -16, scale: 0.96 }}
        animate={{
          opacity: 1,
          translateY: 0,
          scale: 1,
        }}
        transition={{ type: 'timing', duration: 380 }}
        style={styles.cardOuter}
      >
        <MotiView
          animate={{
            minHeight: expanded ? 118 : 78,
            paddingBottom: expanded ? 14 : 12,
          }}
          transition={{ type: 'spring', damping: 18, stiffness: 210 }}
          style={styles.cardInner}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.92)', 'rgba(241,245,249,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.borderHair} />

          <View style={styles.row}>
            <MotiView
              animate={{
                scale: alert.kind === 'critical' ? 1.1 : alert.kind === 'warning' ? 1.06 : 1,
              }}
              transition={{
                type: 'timing',
                duration: alert.kind === 'critical' ? 720 : alert.kind === 'warning' ? 900 : 240,
                loop: alert.kind === 'critical' || alert.kind === 'warning',
                repeatReverse: true,
              }}
              style={[
                styles.iconBlob,
                alert.kind === 'critical' && { backgroundColor: 'rgba(239,68,68,0.18)' },
                alert.kind === 'warning' && { backgroundColor: 'rgba(249,115,22,0.2)' },
                alert.kind === 'success' && { backgroundColor: 'rgba(34,197,94,0.2)' },
                alert.kind === 'neutral' && { backgroundColor: 'rgba(26,35,126,0.1)' },
              ]}
            >
              {alert.kind === 'critical' ? (
                <AlertTriangle size={18} color="#dc2626" />
              ) : alert.kind === 'warning' ? (
                <Radio size={18} color="#ea580c" />
              ) : alert.kind === 'success' ? (
                <CheckCircle2 size={18} color="#16a34a" />
              ) : (
                <Truck size={18} color="#1a237e" />
              )}
            </MotiView>

            <View style={styles.textCol}>
              <Text style={styles.kicker}>Operations</Text>
              <Text style={styles.title} numberOfLines={2}>
                {alert.title}
              </Text>
              {alert.subtitle ? (
                <Text style={styles.sub} numberOfLines={expanded ? 4 : 2}>
                  {alert.subtitle}
                </Text>
              ) : null}
              <Text style={styles.tripMeta} numberOfLines={1}>
                {tripLine}
              </Text>
            </View>
          </View>

          {expanded && money ? (
            <MotiView
              from={{ opacity: 0, translateY: 6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 280 }}
              style={styles.amountPill}
            >
              <Text style={styles.amountText}>{money}</Text>
            </MotiView>
          ) : null}

        </MotiView>
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 200,
    alignItems: 'center',
  },
  cardOuter: {
    width: '100%',
    maxWidth: 420,
  },
  cardInner: {
    borderRadius: 22,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 12,
    minHeight: 78,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  borderHair: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBlob: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textSecondary,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textRouteCard,
    lineHeight: 18,
  },
  tripMeta: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  amountPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22,163,74,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.35)',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#15803d',
    letterSpacing: -0.4,
  },
});
