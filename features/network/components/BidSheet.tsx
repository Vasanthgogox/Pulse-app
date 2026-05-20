/**
 * BidSheet — bottom sheet for submitting or editing a bid on a load post.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from '@/constants/Theme';
import { createDirectQuote } from '@/features/indents/services/direct-quotes.service';
import { type BidRow } from '@/features/network/services/bids.service';
import { type PostRow } from '@/features/network/services/posts.service';
import { formatINR } from '@/lib/format';
import { useSubmitBidMutation, useUpdateBidMutation } from '@/lib/queries';
import { queryKeys } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import {
    Edit3,
    MessageSquare,
    ThumbsUp,
    Truck,
    X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BidSheetProps {
  visible: boolean;
  post: PostRow | null;
  orgId: string;
  existingBid?: BidRow | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BidSheet({ visible, post, orgId, existingBid, onClose, onSuccess }: BidSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);
  const translateY = useRef(new Animated.Value(400)).current;

  const isEditMode = !!existingBid;
  const submitMutation = useSubmitBidMutation(post?.id ?? null, orgId);
  const updateMutation = useUpdateBidMutation(post?.id ?? null, orgId);
  const isPending = isEditMode ? updateMutation.isPending : submitMutation.isPending;

  const parsedAmount = Number(amount.replace(/,/g, '').trim() || '0');
  const canSubmit = Number.isFinite(parsedAmount) && parsedAmount > 0 && !isPending;

  const handleAmountChange = (raw: string) => {
    const digitsOnly = raw.replace(/[^\d]/g, '');
    setAmount(digitsOnly);
  };

  useEffect(() => {
    if (visible) {
      setAmount(existingBid?.amount ? String(Math.round(existingBid.amount)) : '');
      setNote(existingBid?.note ?? '');
      setSuccess(false);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const invalidateQuoteCaches = async (matchedIndentId: string) => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) }),
      queryClient.invalidateQueries({ queryKey: [...queryKeys.indents.all(orgId), 'my-direct-quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['indents', matchedIndentId, 'direct-quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['indents', 'quote-counts'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.indents.all(orgId) }),
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'indents' &&
          q.queryKey[1] === 'offer-counts',
      }),
    ]);
  };

  const handleSubmit = async () => {
    if (!post || !canSubmit) return;

    if (!post.source_indent_id) {
      Alert.alert(
        'Cannot place bid',
        'This story is not linked to a load indent. Use Get Load to quote, or ask the publisher to broadcast from an indent.',
      );
      return;
    }

    let submitError: Error | null = null;

    if (isEditMode && existingBid) {
      const updateRes = await updateMutation.mutateAsync({
        bidId: existingBid.id,
        amount: parsedAmount,
        note: note.trim() || undefined,
      });
      submitError = updateRes.error ?? null;
      if (!submitError) {
        const quoteRes = await createDirectQuote(
          post.source_indent_id,
          orgId,
          parsedAmount,
          note.trim() || null,
        );
        submitError = quoteRes.error ?? null;
        if (!submitError) await invalidateQuoteCaches(post.source_indent_id);
      }
    } else {
      const submitRes = await submitMutation.mutateAsync({ amount: parsedAmount, note: note.trim() || undefined });
      submitError = submitRes.error;
      if (!submitError) await invalidateQuoteCaches(post.source_indent_id);
    }

    if (submitError) {
      Alert.alert(isEditMode ? 'Update failed' : 'Bid failed', submitError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSuccess?.();
      onClose();
    }, 1200);
  };

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} enabled={Platform.OS !== 'web'} style={styles.kvContainer}>
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>{isEditMode ? 'Edit Bid' : 'Place Bid'}</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {post.origin} → {post.destination}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={22} color={Theme.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.loadSummary}>
              {post.vehicle_type && (
                <View style={styles.summaryChip}>
                  <Truck size={11} color={Theme.primary} />
                  <Text style={styles.summaryChipText}>{post.vehicle_type}</Text>
                </View>
              )}
              {post.weight_tonnes != null && (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{post.weight_tonnes}T</Text>
                </View>
              )}
              {post.material && (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{post.material}</Text>
                </View>
              )}
              {post.rate_offer != null && (
                <View style={[styles.summaryChip, styles.rateChip]}>
                  <Text style={styles.rateChipText}>Expected: {formatINR(post.rate_offer)}</Text>
                </View>
              )}
            </View>

            {success ? (
              <View style={styles.successView}>
                <View style={styles.successIcon}>
                  <ThumbsUp size={32} color="#10b981" fill="#10b981" />
                </View>
                <Text style={styles.successText}>{isEditMode ? 'Bid Updated!' : 'Bid Submitted!'}</Text>
                <Text style={styles.successSub}>The load owner will review your offer</Text>
              </View>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>YOUR BID AMOUNT</Text>
                  <View style={styles.amountRow}>
                    <View style={styles.currencyBadge}>
                      <Text style={styles.currencyText}>₹</Text>
                    </View>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0"
                      placeholderTextColor={Theme.textSecondary}
                      keyboardType={Platform.OS === 'web' ? 'numeric' : 'number-pad'}
                      value={amount}
                      onChangeText={handleAmountChange}
                      autoFocus
                      returnKeyType="next"
                      selectTextOnFocus
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>NOTE (OPTIONAL)</Text>
                  <View style={styles.noteContainer}>
                    <MessageSquare size={14} color={Theme.textSecondary} style={styles.noteIcon} />
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Add a message with your bid..."
                      placeholderTextColor={Theme.textSecondary}
                      value={note}
                      onChangeText={setNote}
                      multiline
                      numberOfLines={2}
                      returnKeyType="done"
                      blurOnSubmit
                    />
                  </View>
                </View>

                <Pressable
                  style={[styles.submitBtn, (!canSubmit || isPending) && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  {isPending ? (
                    <LoadingIndicator color="#fff" />
                  ) : (
                    <>
                      {isEditMode ? <Edit3 size={16} color="#fff" /> : <ThumbsUp size={16} color="#fff" />}
                      <Text style={styles.submitBtnText}>
                        {isEditMode ? 'Update Bid' : 'Submit Bid'}{canSubmit ? ` — ₹${parsedAmount.toLocaleString('en-IN')}` : ''}
                      </Text>
                    </>
                  )}
                </Pressable>

                {(submitMutation.error || updateMutation.error) && (
                  <Text style={styles.errorText}>{String(submitMutation.error ?? updateMutation.error)}</Text>
                )}
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  kvContainer: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    fontWeight: '600',
  },
  loadSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
    padding: 12,
    backgroundColor: Theme.surface,
    borderRadius: 12,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  summaryChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  rateChip: {
    backgroundColor: '#6366f118',
    borderColor: '#6366f130',
  },
  rateChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
  },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.primary + '40',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Theme.primary + '08',
  },
  currencyBadge: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Theme.primary,
  },
  currencyText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '900',
    color: Theme.textPrimary,
    paddingHorizontal: 16,
    letterSpacing: -1,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as TextStyle,
    }),
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    minHeight: 72,
  },
  noteIcon: { marginTop: 2 },
  noteInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: '500',
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 8,
  },
  successView: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#10b98118',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: -0.5,
  },
  successSub: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
});
