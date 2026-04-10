import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import * as driversService from '@/services/driversService';
import { createSalaryRequest, type SalaryRequestType } from '@/services/salaryRequestsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FleetOption = { driverId: string; orgId: string; orgName: string };
type SalaryTypeOption = { label: string; value: SalaryRequestType };

const SALARY_TYPE_OPTIONS: SalaryTypeOption[] = [
  { label: 'Trip Commission', value: 'trip_based' },
  { label: 'Salary', value: 'monthly' },
  { label: 'Advance', value: 'advance' },
];

function formatAmountDisplay(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '0';
  return Number(digits).toLocaleString('en-IN');
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/[^\d]/g, '') || '0');
}

function toDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function SalaryRequestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useDriverThemeColors();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [fleetOptions, setFleetOptions] = useState<FleetOption[]>([]);
  const [selectedFleet, setSelectedFleet] = useState<FleetOption | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);

  const [amountRaw, setAmountRaw] = useState('');
  const [reason, setReason] = useState<SalaryRequestType>('monthly');
  const [dateNeeded, setDateNeeded] = useState<Date>(new Date());

  const [showSalaryTypeModal, setShowSalaryTypeModal] = useState(false);
  const [showFleetModal, setShowFleetModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    amount: number;
    salaryType: string;
    fleetName: string;
    requestId: string;
  } | null>(null);
  const tabBarOverlayOffset = Layout.tabBarHeight + 24 + insets.bottom;
  const footerSafeBottom = tabBarOverlayOffset + 12;

  const load = useCallback(async () => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [driversRes, invitesRes] = await Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ]);

    const activeDrivers = (driversRes.drivers ?? []).filter((driver) => !driver.left_at);
    const driverIds = activeDrivers.map((item) => item.id);
    const ledgerRes =
      driverIds.length > 0
        ? await driversService.getDriverLedgerByDriverIds(driverIds)
        : { entries: [] as driversService.DriverLedgerRow[] };

    const acceptedInvites = (invitesRes.invites ?? []).filter(
      (invite) => (invite.status || '').toLowerCase() === 'accepted',
    );

    const options = activeDrivers
      .filter((driver) =>
        acceptedInvites.some(
          (invite) =>
            String(invite.from_organization_id || '') === String(driver.organization_id || ''),
        ),
      )
      .map((driver) => {
        const invite = acceptedInvites.find(
          (entry) =>
            String(entry.from_organization_id || '') === String(driver.organization_id || ''),
        );
        return {
          driverId: driver.id,
          orgId: driver.organization_id,
          orgName: invite?.from_org_name?.trim() || 'Fleet',
        };
      });

    setFleetOptions(options);
    setSelectedFleet((prev) => {
      if (options.length === 1) return options[0];
      if (!prev) return options[0] ?? null;
      return options.find((item) => item.orgId === prev.orgId) ?? options[0] ?? null;
    });
    setLedgerEntries(ledgerRes.entries ?? []);
    setLoading(false);
  }, [profile?.uid]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const amountDisplay = useMemo(() => formatAmountDisplay(amountRaw), [amountRaw]);
  const amountValue = useMemo(() => parseAmount(amountRaw), [amountRaw]);
  const canSubmit = !!selectedFleet && amountValue > 0 && !submitting;
  const salaryTypeLabel = useMemo(
    () => SALARY_TYPE_OPTIONS.find((item) => item.value === reason)?.label ?? 'Salary',
    [reason],
  );

  const selectedDriverBalance = useMemo(() => {
    if (!selectedFleet) return 0;
    return Math.round(
      ledgerEntries
        .filter((entry) => entry.driver_id === selectedFleet.driverId)
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    );
  }, [ledgerEntries, selectedFleet]);

  const quickAdd = useCallback((delta: number) => {
    const next = Math.max(0, parseAmount(amountRaw) + delta);
    setAmountRaw(String(next));
  }, [amountRaw]);

  const onChangeAmount = useCallback((text: string) => {
    const digits = text.replace(/[^\d]/g, '');
    setAmountRaw(digits);
  }, []);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (!selectedFleet) {
      Alert.alert('Select fleet', 'Please select a fleet first.');
      return;
    }
    if (amountValue <= 0) {
      Alert.alert('Enter amount', 'Please enter a valid amount.');
      return;
    }

    setSubmitting(true);
    const { error, request } = await createSalaryRequest(
      selectedFleet.driverId,
      selectedFleet.orgId,
      reason,
      amountValue,
      { createdBy: profile?.uid ?? null },
    );
    setSubmitting(false);

    if (error) {
      Alert.alert('Request failed', error.message);
      return;
    }
    setSuccessPayload({
      amount: amountValue,
      salaryType: salaryTypeLabel,
      fleetName: selectedFleet.orgName,
      requestId: request?.id ?? 'N/A',
    });
  }, [amountValue, profile?.uid, reason, salaryTypeLabel, selectedFleet]);

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.emerald} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading...</Text>
      </View>
    );
  }

  if (successPayload) {
    const shortId = successPayload.requestId === 'N/A'
      ? 'N/A'
      : `SR-${successPayload.requestId.slice(0, 8).toUpperCase()}`;
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background }]}>
      <View
          style={[
            styles.successHeader,
            { paddingTop: insets.top + 10, borderBottomColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Text style={[styles.successHeaderTitle, { color: colors.text }]}>SalaryFlow</Text>
          <View style={styles.successHeaderActions}>
            <FontAwesome name="bell" size={15} color={colors.textMuted} />
            <FontAwesome name="question-circle-o" size={15} color={colors.textMuted} />
          </View>
        </View>

        <View style={styles.successMain}>
          <View style={[styles.successIconCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.successIconInner, { backgroundColor: colors.emeraldMuted }]}>
              <FontAwesome name="check-circle" size={50} color={colors.emerald} />
            </View>
          </View>

          <Text style={[styles.successTitle, { color: colors.text }]}>Money Sent</Text>
          <Text style={[styles.successSubtitle, { color: colors.textMuted }]}>
            Your request for ₹{successPayload.amount.toLocaleString('en-IN')} has been sent for approval.
          </Text>

          <View style={[styles.successReceipt, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.successReceiptTop}>
              <Text style={[styles.successReceiptLabel, { color: colors.textMuted }]}>Receipt Details</Text>
              <Text style={[styles.successReceiptStatus, { color: colors.emerald }]}>Processing</Text>
            </View>
            <View style={styles.successReceiptBody}>
              <View style={[styles.successAvatar, { backgroundColor: colors.whiteMuted }]}>
                <FontAwesome name="building" size={18} color={colors.textMuted} />
              </View>
              <View style={styles.successReceiptText}>
                <Text style={[styles.successReceiptName, { color: colors.text }]} numberOfLines={1}>
                  {successPayload.fleetName}
                </Text>
                <Text style={[styles.successReceiptMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {successPayload.salaryType}
                </Text>
              </View>
              <Text style={[styles.successReceiptAmount, { color: colors.text }]}>
                ₹{successPayload.amount.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.successFooter, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity
            style={[styles.successPrimaryBtn, { backgroundColor: '#2d3336' }]}
            onPress={() => router.replace('/(driver)/wallet')}
            activeOpacity={0.9}
          >
            <Text style={styles.successPrimaryBtnText}>Got it</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.successSecondaryBtn}
            onPress={() => setShowReceiptModal(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.successSecondaryBtnText, { color: colors.textMuted }]}>View Receipt</Text>
          </TouchableOpacity>
          <View style={[styles.successTxnPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.successTxnText, { color: colors.textMuted }]}>Transaction ID: {shortId}</Text>
          </View>
        </View>

        <Modal
          visible={showReceiptModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowReceiptModal(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowReceiptModal(false)}>
            <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Receipt</Text>
              <View style={styles.receiptModalBody}>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptKey, { color: colors.textMuted }]}>Transaction ID</Text>
                  <Text style={[styles.receiptVal, { color: colors.text }]}>{shortId}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptKey, { color: colors.textMuted }]}>Status</Text>
                  <Text style={[styles.receiptVal, { color: colors.emerald }]}>Processing</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptKey, { color: colors.textMuted }]}>Salary Type</Text>
                  <Text style={[styles.receiptVal, { color: colors.text }]}>{successPayload.salaryType}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptKey, { color: colors.textMuted }]}>Fleet</Text>
                  <Text style={[styles.receiptVal, { color: colors.text }]}>{successPayload.fleetName}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptKey, { color: colors.textMuted }]}>Amount</Text>
                  <Text style={[styles.receiptVal, { color: colors.text }]}>
                    ₹{successPayload.amount.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.headerIconBtn, { backgroundColor: colors.whiteMuted }]}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <FontAwesome name="arrow-left" size={14} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Withdraw Salary</Text>
        <View style={styles.headerRight}>
          <FontAwesome name="bell" size={16} color={colors.textMuted} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: footerSafeBottom + 110,
          paddingHorizontal: 20,
          paddingTop: 18,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentWrap}>
          {fleetOptions.length === 0 ? (
            <View style={[styles.emptyStateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.emptyStateTitle, { color: colors.text }]}>No connected fleet</Text>
              <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                Accept a fleet invite first, then submit salary requests.
              </Text>
              <TouchableOpacity
                style={[styles.emptyStateBtn, { backgroundColor: '#2d3336' }]}
                onPress={() => router.push('/(driver)/requests')}
                activeOpacity={0.9}
              >
                <Text style={styles.emptyStateBtnText}>Go to Requests</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={[styles.balanceCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>YOUR BALANCE</Text>
            <Text style={[styles.balanceAmount, { color: colors.text }]}>
              ₹ {selectedDriverBalance.toLocaleString('en-IN')}.00
            </Text>
          </View>

          <Text style={[styles.enterLabel, { color: colors.textMuted }]}>ENTER AMOUNT</Text>
          <View style={styles.amountCenter}>
            <Text style={[styles.amountCurrency, { color: colors.textMuted }]}>₹</Text>
            <TextInput
              value={amountDisplay}
              onChangeText={onChangeAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.placeholder}
              style={[styles.amountInput, { color: colors.text }]}
            />
          </View>
          <View style={[styles.amountUnderlineTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.amountUnderlineFill, { backgroundColor: colors.emerald }]} />
          </View>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surface }]} onPress={() => quickAdd(1000)}>
              <Text style={[styles.chipText, { color: colors.text }]}>+₹1k</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surface }]} onPress={() => quickAdd(2000)}>
              <Text style={[styles.chipText, { color: colors.text }]}>+₹2k</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surface }]} onPress={() => quickAdd(5000)}>
              <Text style={[styles.chipText, { color: colors.text }]}>+₹5k</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.detailsRow}>
            <TouchableOpacity
              style={[styles.detailCard, { backgroundColor: colors.surface }]}
              onPress={() => setShowSalaryTypeModal(true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>SALARY TYPE</Text>
              <View style={styles.detailValueRow}>
                <FontAwesome name="money" size={12} color={colors.emerald} />
                <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1}>
                  {salaryTypeLabel}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.detailCard, { backgroundColor: colors.surface }]}
              onPress={() => setShowDateModal(true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>DATE NEEDED</Text>
              <View style={styles.detailValueRow}>
                <FontAwesome name="calendar" size={12} color={colors.emerald} />
                <Text style={[styles.detailValue, { color: colors.text }]}>{toDateLabel(dateNeeded)}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {fleetOptions.length > 1 ? (
            <TouchableOpacity
              style={[styles.fleetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowFleetModal(true)}
            >
              <Text style={[styles.fleetBtnText, { color: colors.text }]}>
                Fleet: {selectedFleet?.orgName ?? 'Select fleet'}
              </Text>
              <FontAwesome name="chevron-down" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            bottom: footerSafeBottom,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.withdrawBtn,
            { backgroundColor: canSubmit ? '#5e5e5e' : '#9ca3af' },
            submitting && styles.disabled,
          ]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Theme.textOnPrimary} />
          ) : (
            <Text style={styles.withdrawBtnText}>Withdraw Now</Text>
          )}
        </TouchableOpacity>
        <Text style={[styles.footerHint, { color: colors.textMuted }]}>
          Funds will be credited to your linked bank account instantly.
        </Text>
      </View>

      <Modal visible={showSalaryTypeModal} transparent animationType="fade" onRequestClose={() => setShowSalaryTypeModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSalaryTypeModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select salary type</Text>
            {SALARY_TYPE_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[styles.modalRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setReason(item.value);
                  setShowSalaryTypeModal(false);
                }}
              >
                <Text style={[styles.modalRowText, { color: colors.text }]}>{item.label}</Text>
                {item.value === reason ? <FontAwesome name="check" size={14} color={colors.emerald} /> : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDateModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Date needed</Text>
            {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
              const date = new Date();
              date.setDate(date.getDate() + offset);
              return (
                <TouchableOpacity
                  key={String(offset)}
                  style={[styles.modalRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setDateNeeded(date);
                    setShowDateModal(false);
                  }}
                >
                  <Text style={[styles.modalRowText, { color: colors.text }]}>
                    {offset === 0 ? 'Today' : toDateLabel(date)}
                  </Text>
                  {toDateLabel(date) === toDateLabel(dateNeeded) ? (
                    <FontAwesome name="check" size={14} color={colors.emerald} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showFleetModal} transparent animationType="fade" onRequestClose={() => setShowFleetModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowFleetModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select fleet</Text>
            {fleetOptions.map((item) => (
              <TouchableOpacity
                key={`${item.orgId}-${item.driverId}`}
                style={[styles.modalRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setSelectedFleet(item);
                  setShowFleetModal(false);
                }}
              >
                <Text style={[styles.modalRowText, { color: colors.text }]}>{item.orgName}</Text>
                {selectedFleet?.orgId === item.orgId ? (
                  <FontAwesome name="check" size={14} color={colors.emerald} />
                ) : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  successContainer: { flex: 1 },
  successHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successHeaderTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.4 },
  successHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  successMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  successIconCard: {
    width: 128,
    height: 128,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  successIconInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  successSubtitle: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 26,
    maxWidth: 360,
    marginBottom: 28,
    fontWeight: '400',
  },
  successReceipt: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  successReceiptTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  successReceiptLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  successReceiptStatus: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  successReceiptBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  successAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successReceiptText: { flex: 1, minWidth: 0 },
  successReceiptName: { fontSize: 16, fontWeight: '700' },
  successReceiptMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  successReceiptAmount: { fontSize: 22, fontWeight: '700' },
  successFooter: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  successPrimaryBtn: {
    minHeight: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successPrimaryBtnText: {
    color: Theme.textOnPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  successSecondaryBtn: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  successTxnPill: {
    marginTop: 12,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  successTxnText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '500' },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 30, fontWeight: '700', flex: 1, marginLeft: 12, letterSpacing: -0.4 },
  headerRight: { width: 34, alignItems: 'center' },
  scroll: { flex: 1 },
  contentWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  emptyStateCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  emptyStateTitle: { fontSize: 17, fontWeight: '700' },
  emptyStateText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyStateBtn: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateBtnText: { color: Theme.textOnPrimary, fontSize: 14, fontWeight: '700' },
  balanceCard: {
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 26,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  balanceAmount: { fontSize: 46, fontWeight: '700', letterSpacing: -1 },
  enterLabel: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  amountCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCurrency: { fontSize: 40, fontWeight: '600', marginRight: 10 },
  amountInput: { fontSize: 64, fontWeight: '700', minWidth: 220, textAlign: 'center' },
  amountUnderlineTrack: {
    height: 3,
    width: 120,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  amountUnderlineFill: { width: 54, height: '100%', borderRadius: 2 },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22 },
  chip: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  chipText: { fontSize: 12, fontWeight: '600' },
  detailsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  detailCard: { flex: 1, borderRadius: 16, padding: 14 },
  detailLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  detailValueRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailValue: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  fleetBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fleetBtnText: { fontSize: 13, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  withdrawBtn: {
    minHeight: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.85 },
  withdrawBtnText: { color: Theme.textOnPrimary, fontSize: 20, fontWeight: '700' },
  footerHint: { textAlign: 'center', fontSize: 12, marginTop: 10, fontWeight: '400' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 12 },
  modalRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalRowText: { fontSize: 14, fontWeight: '500' },
  receiptModalBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  receiptKey: { fontSize: 13, fontWeight: '500' },
  receiptVal: { fontSize: 13, fontWeight: '600' },
});
