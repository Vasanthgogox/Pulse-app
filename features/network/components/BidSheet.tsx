/**
 * BidSheet — bottom sheet modal for submitting a bid on a load post.
 */
import Theme from '@/constants/Theme';
import { type PostRow } from '@/features/network/services/posts.service';
import { useSubmitBidMutation } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import {
  MessageSquare,
  ThumbsUp,
  Truck,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BidSheetProps {
  visible: boolean;
  post: PostRow | null;
  orgId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BidSheet({ visible, post, orgId, onClose, onSuccess }: BidSheetProps) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);
  const translateY = useRef(new Animated.Value(400)).current;

  const mutation = useSubmitBidMutation(post?.id ?? null, orgId);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setNote('');
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

  const handleSubmit = async () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!post || isNaN(parsed) || parsed <= 0) return;

    const res = await mutation.mutateAsync({ amount: parsed, note: note.trim() || undefined });
    if (res.alreadyBid) {
      onClose();
      return;
    }
    if (!res.error) {
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    }
  };

  if (!post) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.kvContainer}
          >
            <Animated.View
              style={[
                styles.sheet,
                { paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
              ]}
            >
              {/* Handle */}
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.headerTitle}>Place Bid</Text>
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {post.origin} → {post.destination}
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8}>
                  <X size={22} color={Theme.textSecondary} />
                </Pressable>
              </View>

              {/* Load summary */}
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
                  <Text style={styles.successText}>Bid Submitted!</Text>
                  <Text style={styles.successSub}>The load owner will review your offer</Text>
                </View>
              ) : (
                <>
                  {/* Amount input */}
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
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                        returnKeyType="next"
                        selectTextOnFocus
                      />
                    </View>
                  </View>

                  {/* Note input */}
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

                  {/* Submit */}
                  <Pressable
                    style={[
                      styles.submitBtn,
                      (!amount || mutation.isPending) && styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!amount || mutation.isPending}
                  >
                    {mutation.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <ThumbsUp size={16} color="#fff" />
                        <Text style={styles.submitBtnText}>
                          Submit Bid {amount ? `— ₹${parseFloat(amount.replace(/,/g, '') || '0').toLocaleString('en-IN')}` : ''}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {mutation.error && (
                    <Text style={styles.errorText}>{String(mutation.error)}</Text>
                  )}
                </>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
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
