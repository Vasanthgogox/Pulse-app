/**
 * Dispute audit sheet — O(n) symmetric difference of internal vs shared ledger entries.
 * Shows list of disputed items; user can select one and raise dispute.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { SmartInput } from "@/components/mobile-input";
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { formatINR } from '@/lib/format';
import { VALIDATION, maxLength, numberInRange } from '@/lib/validation';
import { getTransactionsByOrganizationAndContactId } from '../services/finance.service';
import {
  getSharedLedgerEntriesForPartner,
  createDispute,
} from '@/features/finance/services/sharedLedger.service';
import type { LedgerRow } from '../services/finance.service';
import type { SharedLedgerEntry } from '@/features/finance/services/sharedLedger.service';

export type DisputedItemKind = 'MISSING_IN_PARTNER' | 'AMOUNT_MISMATCH' | 'UNRECOGNIZED_IN_OURS';

export interface DisputedItem {
  id: string;
  kind: DisputedItemKind;
  internalAmount?: number;
  sharedAmount?: number;
  date: string;
  /** For our txs: our transaction_id. For partner-only: shared entry id. */
  transactionId: string;
}

export interface DisputeAuditSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  organizationId: string | null;
  partnerKey: string;
  partnerName: string;
  partnerType: 'CLIENT' | 'SUPPLIER';
  internalDue: number;
  verifiedDue: number | null;
  partnerOrgId: string | null;
}

/** O(n+m): build disputed items from internal and shared lists. */
function buildDisputedItems(
  internalTxs: LedgerRow[],
  sharedEntries: SharedLedgerEntry[],
  isSupplier: boolean
): DisputedItem[] {
  const internalMap = new Map<string, { amount: number; date: string }>();
  for (const tx of internalTxs) {
    const net =
      tx.contact_type === 'supplier'
        ? (tx.amount_out ?? 0) - (tx.amount_in ?? 0)
        : (tx.amount_in ?? 0) - (tx.amount_out ?? 0);
    internalMap.set(tx.id, {
      amount: net,
      date: tx.transaction_date ?? '',
    });
  }
  const sharedMap = new Map<string, { amount: number; date: string; entryId: string }>();
  for (const e of sharedEntries) {
    const key = e.reference_id ?? e.id;
    sharedMap.set(key, { amount: e.amount, date: e.transaction_date, entryId: e.id });
  }

  const items: DisputedItem[] = [];

  for (const [txId, internal] of internalMap) {
    const shared = sharedMap.get(txId);
    if (!shared) {
      items.push({
        id: txId,
        kind: 'MISSING_IN_PARTNER',
        internalAmount: internal.amount,
        date: internal.date,
        transactionId: txId,
      });
    } else if (internal.amount !== shared.amount) {
      items.push({
        id: txId,
        kind: 'AMOUNT_MISMATCH',
        internalAmount: internal.amount,
        sharedAmount: shared.amount,
        date: internal.date,
        transactionId: txId,
      });
    }
  }
  for (const [key, shared] of sharedMap) {
    if (!internalMap.has(key)) {
      items.push({
        id: `shared-${shared.entryId}`,
        kind: 'UNRECOGNIZED_IN_OURS',
        sharedAmount: shared.amount,
        date: shared.date,
        transactionId: shared.entryId,
      });
    }
  }

  return items;
}

export function DisputeAuditSheet({
  visible,
  onClose,
  onSuccess,
  organizationId,
  partnerKey,
  partnerName,
  partnerType,
  internalDue,
  verifiedDue,
  partnerOrgId,
}: DisputeAuditSheetProps) {
  const [loading, setLoading] = useState(true);
  const [internalTxs, setInternalTxs] = useState<LedgerRow[]>([]);
  const [sharedEntries, setSharedEntries] = useState<SharedLedgerEntry[]>([]);
  const [disputedItems, setDisputedItems] = useState<DisputedItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<DisputedItem | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [proposedAmount, setProposedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!visible || !organizationId || !partnerKey) return;
    setLoading(true);
    const [internalRes, sharedRes] = await Promise.all([
      getTransactionsByOrganizationAndContactId(organizationId, partnerKey),
      getSharedLedgerEntriesForPartner(organizationId, partnerKey),
    ]);
    setLoading(false);
    if (!internalRes.error) setInternalTxs(internalRes.transactions);
    if (!sharedRes.error) setSharedEntries(sharedRes.entries);
  }, [visible, organizationId, partnerKey]);

  useEffect(() => {
    if (visible && organizationId && partnerKey) fetchData();
  }, [visible, organizationId, partnerKey, fetchData]);

  const items = useMemo(() => {
    if (internalTxs.length === 0 && sharedEntries.length === 0) return [];
    return buildDisputedItems(internalTxs, sharedEntries, partnerType === 'SUPPLIER');
  }, [internalTxs, sharedEntries, partnerType]);

  useEffect(() => {
    setDisputedItems(items);
  }, [items]);

  const reasonCodeError = reasonCode.trim()
    ? maxLength(VALIDATION.DESCRIPTION_MAX_LENGTH)(reasonCode)
    : null;
  const proposedAmountError = proposedAmount.trim()
    ? numberInRange(0, VALIDATION.AMOUNT_MAX, { allowEmpty: true })(proposedAmount)
    : null;
  const canRaiseDispute = !reasonCodeError && !proposedAmountError;

  const handleRaiseDispute = useCallback(async () => {
    if (submitting) return;
    if (!selectedItem || !organizationId || !partnerOrgId) {
      Alert.alert('Cannot raise dispute', 'Partner connection is missing.');
      return;
    }
    if (selectedItem.kind === 'UNRECOGNIZED_IN_OURS') {
      Alert.alert(
        'Unrecognized entry',
        'Disputes for entries only on the partner ledger can be raised from the partner side or via a separate flow.'
      );
      return;
    }
    if (reasonCodeError || proposedAmountError) {
      Alert.alert('Invalid input', reasonCodeError ?? proposedAmountError ?? 'Please fix the fields above.');
      return;
    }
    const trimmedReason = reasonCode.trim().slice(0, VALIDATION.DESCRIPTION_MAX_LENGTH) || undefined;
    const parsedProposed =
      proposedAmount.trim() && Number.isFinite(Number(proposedAmount.replace(/,/g, '')))
        ? Number(proposedAmount.replace(/,/g, ''))
        : undefined;
    if (parsedProposed != null && (parsedProposed < 0 || parsedProposed > VALIDATION.AMOUNT_MAX)) {
      Alert.alert('Invalid amount', `Proposed amount must be between 0 and ${VALIDATION.AMOUNT_MAX.toLocaleString()}.`);
      return;
    }
    setSubmitting(true);
    const internalSnap = selectedItem.internalAmount ?? 0;
    const partnerSnap = selectedItem.sharedAmount ?? 0;
    const { error, disputeId, alreadyInDispute } = await createDispute({
      orgId: organizationId,
      transaction_id: selectedItem.transactionId,
      partner_org_id: partnerOrgId,
      internal_snapshot: internalSnap,
      partner_snapshot: partnerSnap,
      reason_code: trimmedReason,
      proposed_amount: parsedProposed,
    });
    setSubmitting(false);
    if (error) {
      if (alreadyInDispute) {
        onSuccess?.();
        onClose();
        Alert.alert('Already in dispute', 'An open dispute already exists for this item.');
        return;
      }
      Alert.alert(
        'Error',
        error.message
      );
      return;
    }
    if (disputeId || alreadyInDispute) {
      onSuccess?.();
      onClose();
    }
  }, [
    selectedItem,
    submitting,
    organizationId,
    partnerOrgId,
    reasonCode,
    proposedAmount,
    reasonCodeError,
    proposedAmountError,
    onSuccess,
    onClose,
  ]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.container}>
          <View style={styles.header}>
          <Text style={styles.headerTitle}>Dispute audit</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {partnerName}
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <FontAwesome name="times" size={20} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <LoadingIndicator size="large" color={Theme.primary} />
            <Text style={styles.loadingText}>Loading transactions…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>Internal</Text>
              <Text style={styles.summaryValue}>{formatINR(internalDue)}</Text>
              <Text style={styles.summaryLabel}>Verified</Text>
              <Text style={styles.summaryValue}>
                {verifiedDue != null ? formatINR(verifiedDue) : '—'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Disputed items</Text>
            {disputedItems.length === 0 ? (
              <Text style={styles.emptyText}>No disputed items found.</Text>
            ) : (
              disputedItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const label =
                  item.kind === 'MISSING_IN_PARTNER'
                    ? 'Missing in partner\'s ledger'
                    : item.kind === 'AMOUNT_MISMATCH'
                      ? 'Amount mismatch'
                      : 'Unrecognized in your ledger';
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemRow, isSelected && styles.itemRowSelected]}
                    onPress={() => setSelectedItem(item)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome
                      name={item.kind === 'AMOUNT_MISMATCH' ? 'exchange' : item.kind === 'MISSING_IN_PARTNER' ? 'arrow-right' : 'question-circle'}
                      size={14}
                      color={Theme.teslaRed}
                      style={styles.itemIcon}
                    />
                    <View style={styles.itemBody}>
                      <Text style={styles.itemLabel}>{label}</Text>
                      <Text style={styles.itemMeta}>
                        {item.date}
                        {item.internalAmount != null && ` · Internal ${formatINR(item.internalAmount)}`}
                        {item.sharedAmount != null && ` · Shared ${formatINR(item.sharedAmount)}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {selectedItem && selectedItem.kind !== 'UNRECOGNIZED_IN_OURS' && (
              <View style={styles.form}>
                <Text style={styles.formTitle}>Raise dispute</Text>
                <TextInput
                  style={[styles.input, reasonCodeError && styles.inputError]}
                  placeholder="Reason (optional)"
                  placeholderTextColor={Theme.textMuted}
                  value={reasonCode}
                  onChangeText={setReasonCode}
                />
                {reasonCodeError ? (
                  <Text style={styles.formErrorText}>{reasonCodeError}</Text>
                ) : null}
                <SmartInput
                  type="currency"
                  label="Proposed amount"
                  value={proposedAmount}
                  onChange={(raw) => setProposedAmount(raw === '0' ? '' : raw)}
                  variant="field"
                  placeholder="Optional"
                  errorMessage={proposedAmountError ?? undefined}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, (submitting || !canRaiseDispute) && styles.submitBtnDisabled]}
                  onPress={handleRaiseDispute}
                  disabled={submitting || !canRaiseDispute}
                >
                  {submitting ? (
                    <LoadingIndicator size="small" color={Theme.textOnDark} />
                  ) : (
                    <Text style={styles.submitBtnText}>Raise dispute</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
    marginTop: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    padding: 8,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
    padding: 12,
    backgroundColor: Theme.surfaceLight,
  },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: Theme.textMuted },
  summaryValue: { fontSize: 14, fontWeight: '800', color: Theme.textPrimaryDark },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: Theme.surfaceLight,
  },
  itemRowSelected: {
  },
  itemIcon: { marginRight: 12 },
  itemBody: { flex: 1, minWidth: 0 },
  itemLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  itemMeta: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 4,
  },
  form: {
    marginTop: 24,
    padding: 16,
    backgroundColor: Theme.surfaceLight,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  input: {
    padding: 12,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    marginBottom: 12,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  inputError: { borderColor: Theme.negative },
  formErrorText: {
    fontSize: 12,
    color: Theme.negative,
    marginTop: -8,
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textOnDark,
  },
});
