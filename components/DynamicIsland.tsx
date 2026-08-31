import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { CheckCircle2, MapPin } from 'lucide-react-native';
import Theme from '@/constants/Theme';
import { ROUTES } from '@/lib/routes';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { useChatStore } from '@/features/chat/store/useChatStore';
import type { ConversationPartyType } from '@/features/chat/types/chat.types';
import type { GlobalOperationAlert, OperationCategory } from '@/lib/globalSync/priorityEngine.util';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { useCurrentOperationAlert } from '@/lib/globalSync/useOperationsDerived';

function firstTripConversationId(tripId: string | null): string | null {
  if (!tripId) return null;
  const s = useChatStore.getState();
  const order: ConversationPartyType[] = ['driver', 'supplier', 'client'];
  for (const pt of order) {
    const id = s.getConversationId(tripId, pt);
    if (id) return id;
  }
  return null;
}

const QUICK_CHAT_CATEGORIES: ReadonlySet<OperationCategory> = new Set([
  'late_log',
  'vehicle_idle',
  'unassigned_trip',
]);

function formatMoneyInr(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n >= 0 ? '' : '−';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

/**
 * Apple-style expanding fleet-ops pill (React Native). Data: bootstrap + Realtime patches only.
 */
export function DynamicIsland() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const org = useOptionalOrganization();
  const auth = useOptionalAuth();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const ledgerPulseAtMs = useGlobalSyncStore((s) => s.ledgerPulseAtMs);
  const ledgerPulseTripId = useGlobalSyncStore((s) => s.ledgerPulseTripId);
  const ledgerBookSuccessAtMs = useGlobalSyncStore((s) => s.ledgerBookSuccessAtMs);
  const [pillExpanded, setPillExpanded] = useState(false);
  const [paymentFlashVisible, setPaymentFlashVisible] = useState(false);
  const [ledgerBookFlash, setLedgerBookFlash] = useState(false);
  const [flashMoney, setFlashMoney] = useState<string | null>(null);
  const [flashTripLine, setFlashTripLine] = useState('');
  const lastPaymentFlashKeyRef = useRef('');

  const alert = useCurrentOperationAlert();

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

  const paymentExpanded = useMemo(
    () => Boolean(alert?.kind === 'success' && alert.amount != null),
    [alert?.amount, alert?.kind],
  );

  useEffect(() => {
    if (!alert) setPaymentFlashVisible(false);
  }, [alert]);

  /** Full-screen payment moment (~3s) when Realtime ledger pulse lands while payment is top alert. */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!ledgerPulseAtMs || !ledgerPulseTripId) return;
    if (!alert || alert.category !== 'payment_received') return;
    const key = `${ledgerPulseAtMs}:${ledgerPulseTripId}`;
    if (key === lastPaymentFlashKeyRef.current) return;
    lastPaymentFlashKeyRef.current = key;
    setFlashMoney(formatMoneyInr(alert.amount));
    setFlashTripLine(alert.trip_number ? String(alert.trip_number) : 'Fleet');
    setPaymentFlashVisible(true);
    const id = setTimeout(() => setPaymentFlashVisible(false), 3000);
    return () => clearTimeout(id);
  }, [ledgerPulseAtMs, ledgerPulseTripId, alert]);

  useEffect(() => {
    if (Platform.OS === 'web' || !ledgerBookSuccessAtMs) return;
    setLedgerBookFlash(true);
    const id = setTimeout(() => setLedgerBookFlash(false), 2000);
    return () => clearTimeout(id);
  }, [ledgerBookSuccessAtMs]);

  const dismissViaSwipe = useCallback(() => {
    if (!orgId || !alert) return;
    void useGlobalSyncStore.getState().acknowledgeGlobalAlert(alert.id, orgId);
    setPillExpanded(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [orgId, alert]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(pillExpanded)
        .onEnd((e) => {
          if (e.translationY > 64) {
            runOnJS(dismissViaSwipe)();
          }
        }),
    [pillExpanded, dismissViaSwipe],
  );

  const openTripChat = useCallback((tripId: string | null) => {
    const cid = firstTripConversationId(tripId);
    if (!cid) return;
    router.push({
      pathname: ROUTES.CHAT,
      params: {
        tab:              'trips',
        conversationId:   cid,
        openDetail:       '1',
        ts:               String(Date.now()),
      },
    });
  }, [router]);

  if (Platform.OS === 'web') return null;

  const hideIsland =
    auth?.profile?.role === 'driver' || !orgId || bootstrapStatus !== 'ready' || !alert;

  const money = alert ? formatMoneyInr(alert.amount) : null;
  const tripLine = alert?.trip_number ? `${alert.trip_number}` : 'Fleet';
  const catLabel = alert ? alert.category.replace(/_/g, ' ') : '';
  const showQuickChat =
    Boolean(alert?.trip_id) && alert != null && QUICK_CHAT_CATEGORIES.has(alert.category);

  return (
    <>
      {ledgerBookFlash ? (
        <View style={[styles.ledgerBookShell, { top: insets.top + 6 }]} pointerEvents="none">
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 220 }}
            style={styles.ledgerBookPill}
          >
            <MotiView
              animate={{ scale: [1, 1.1, 1] }}
              transition={{
                type: 'timing',
                duration: 700,
                loop: true,
                repeatReverse: true,
              }}
            >
              <CheckCircle2 size={20} color="#16a34a" />
            </MotiView>
            <Text style={styles.ledgerBookText}>Added to ledger</Text>
          </MotiView>
        </View>
      ) : null}
      <Modal
        visible={paymentFlashVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentFlashVisible(false)}
      >
        <Pressable
          style={styles.paymentModalBackdrop}
          onPress={() => setPaymentFlashVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss payment confirmation"
        >
          <MotiView
            from={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 220 }}
            style={styles.paymentFlashCard}
          >
            <CheckCircle2 size={40} color="#16a34a" />
            <Text style={styles.paymentFlashTitle}>Payment received</Text>
            {flashMoney ? <Text style={styles.paymentFlashAmount}>{flashMoney}</Text> : null}
            <Text style={styles.paymentFlashHint}>{flashTripLine}</Text>
            <Text style={styles.paymentFlashSub}>Tap anywhere to dismiss</Text>
          </MotiView>
        </Pressable>
      </Modal>

      {hideIsland ? null : (
    <View style={[styles.shell, { top: insets.top + 6 }]} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Pressable onPress={() => setPillExpanded((e) => !e)} accessibilityRole="button">
        <MotiView
          from={{ opacity: 0, translateY: -16, scale: 0.96 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={{ type: 'timing', duration: 380 }}
          style={styles.cardOuter}
        >
          <MotiView
            animate={{
              borderRadius: pillExpanded ? 22 : 26,
              minHeight: pillExpanded ? (paymentExpanded ? 124 : 96) : 56,
              paddingTop: pillExpanded ? 12 : 10,
              paddingBottom: pillExpanded ? (paymentExpanded ? 14 : 12) : 10,
              paddingHorizontal: pillExpanded ? 16 : 18,
            }}
            transition={{ type: 'spring', damping: 19, stiffness: 220 }}
            style={styles.cardInner}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.92)', 'rgba(241,245,249,0.85)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.borderHair} />

            {!pillExpanded ? (
              <View style={styles.collapsedRow}>
                <Text style={styles.collapsedTitle} numberOfLines={1}>
                  {alert.title}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.textCol}>
                  <Text style={styles.kicker}>{catLabel}</Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {alert.title}
                  </Text>
                  {alert.subtitle ? (
                    <Text style={styles.sub} numberOfLines={paymentExpanded ? 4 : 2}>
                      {alert.subtitle}
                    </Text>
                  ) : null}
                  <Text style={styles.tripMeta} numberOfLines={1}>
                    {tripLine}
                  </Text>
                </View>

                {paymentExpanded && money ? (
                  <MotiView
                    from={{ opacity: 0, translateY: 6 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 280 }}
                    style={styles.amountPill}
                  >
                    <Text style={styles.amountText}>{money}</Text>
                  </MotiView>
                ) : null}

                {pillExpanded && showQuickChat ? (
                  <Pressable
                    onPress={() => openTripChat(alert.trip_id)}
                    style={styles.quickChatRow}
                    accessibilityRole="button"
                    accessibilityLabel="Open trip chat"
                  >
                    <MapPin size={16} color={Theme.primary} />
                    <Text style={styles.quickChatText}>Open trip chat</Text>
                  </Pressable>
                ) : null}

                {pillExpanded ? (
                  <Text style={styles.swipeHint}>Swipe down to dismiss alert</Text>
                ) : null}
              </>
            )}
          </MotiView>
        </MotiView>
        </Pressable>
      </GestureDetector>
    </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  paymentModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  paymentFlashCard: {
    marginHorizontal: 24,
    maxWidth: 400,
    width: '100%',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.98)',
    alignItems: 'center',
    gap: 8,
  },
  paymentFlashTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    color: Theme.textPrimary,
  },
  paymentFlashAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#15803d',
    letterSpacing: -0.5,
  },
  paymentFlashHint: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  paymentFlashSub: {
    marginTop: 12,
    fontSize: 12,
    color: Theme.textSecondary,
    fontWeight: '600',
  },
  quickChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(79,70,229,0.08)',
  },
  quickChatText: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.primary,
  },
  swipeHint: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
    alignSelf: 'center',
  },
  ledgerBookShell: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 210,
    alignItems: 'center',
  },
  ledgerBookPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22,163,74,0.35)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ledgerBookText: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimary,
  },
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
    overflow: 'hidden',
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
  collapsedRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 4,
  },
  collapsedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.2,
    textAlign: 'center',
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
