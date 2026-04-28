/**
 * BidSheet — bottom sheet for submitting or editing a bid on a load post.
 */
import Theme from '@/constants/Theme';
import { createDirectQuote } from '@/features/indents/services/direct-quotes.service';
import { getMarketIndentsForOrganization } from '@/features/indents/services/indents.service';
import { type BidRow } from '@/features/network/services/bids.service';
import { type PostRow } from '@/features/network/services/posts.service';
import { useSubmitBidMutation, useUpdateBidMutation } from '@/lib/queries';
import { queryKeys } from '@/lib/queryKeys';
import { formatINR } from '@/lib/format';
import {
  Edit3,
  MessageSquare,
  ThumbsUp,
  Truck,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
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

  const matchAndUpsertDirectQuote = async (): Promise<{ linked: boolean; error?: string }> => {
    if (!post || !orgId) return { linked: false, error: 'Missing context' };
    const marketRes = await getMarketIndentsForOrganization(orgId);
    if (marketRes.error) return { linked: false, error: marketRes.error.message };

    const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const short = (v: string | null | undefined) => norm(v).split(',')[0]?.trim() ?? '';
    const hasTokenOverlap = (a: string | null | undefined, b: string | null | undefined) => {
      const tokensA = norm(a).split(/[\s,/-]+/).filter((t) => t.length >= 3);
      const tokensB = new Set(norm(b).split(/[\s,/-]+/).filter((t) => t.length >= 3));
      if (tokensA.length === 0 || tokensB.size === 0) return false;
      return tokensA.some((t) => tokensB.has(t));
    };

    const postOrigin = norm(post.origin);
    const postDestination = norm(post.destination);
    const postOriginShort = short(post.origin);
    const postDestinationShort = short(post.destination);
    const postVehicleType = norm(post.vehicle_type);
    const postMaterial = norm(post.material);
    const postOwnerOrgId = norm(post.organization_id);
    const postLoadDate = post.load_date ? String(post.load_date).slice(0, 10) : null;
    const targetAmount = Number(post.rate_offer ?? parsedAmount ?? 0);

    const ranked = (marketRes.indents ?? [])
      .filter((indent) => norm(indent.organization_id) === postOwnerOrgId)
      .map((indent) => {
        const indentOrigin = norm(indent.pickup_area);
        const indentDest = norm(indent.drop_location);
        const indentOriginShort = short(indent.pickup_area);
        const indentDestShort = short(indent.drop_location);
        const indentVehicle = norm(indent.vehicle_type);
        const indentMaterial = norm(indent.load_type);
        const indentDate = indent.pickup_date ? String(indent.pickup_date).slice(0, 10) : null;
        const indentTarget = Number(indent.supplier_target ?? indent.client_price ?? 0);
        const routeStrongMatch =
          (indentOrigin && (indentOrigin === postOrigin || indentOrigin.includes(postOrigin) || postOrigin.includes(indentOrigin))) ||
          (indentDest && (indentDest === postDestination || indentDest.includes(postDestination) || postDestination.includes(indentDest)));

        let score = 0;
        if (indentOrigin && indentOrigin === postOrigin) score += 4;
        else if (indentOriginShort && indentOriginShort === postOriginShort) score += 2;
        else if (hasTokenOverlap(indent.pickup_area, post.origin)) score += 1;
        if (indentDest && indentDest === postDestination) score += 4;
        else if (indentDestShort && indentDestShort === postDestinationShort) score += 2;
        else if (hasTokenOverlap(indent.drop_location, post.destination)) score += 1;
        if (postVehicleType && indentVehicle && indentVehicle === postVehicleType) score += 2;
        if (postMaterial && indentMaterial && indentMaterial === postMaterial) score += 2;
        if (postLoadDate && indentDate && indentDate === postLoadDate) score += 2;
        if (targetAmount > 0 && indentTarget > 0) {
          const pctDelta = Math.abs(indentTarget - targetAmount) / targetAmount;
          if (pctDelta <= 0.1) score += 2;
          else if (pctDelta <= 0.25) score += 1;
        }
        return { indent, score, routeStrongMatch };
      })
      .filter((row) => row.score >= 4 || row.routeStrongMatch)
      .sort((a, b) => b.score - a.score);

    const matchedIndent = ranked[0]?.indent;
    if (!matchedIndent?.id) {
      return { linked: false, error: 'No matching indent found. Place/update quote from Load Center.' };
    }

    const quoteRes = await createDirectQuote(matchedIndent.id, orgId, parsedAmount, note.trim() || null);
    if (quoteRes.error) return { linked: false, error: quoteRes.error.message };

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) }),
      queryClient.invalidateQueries({ queryKey: [...queryKeys.indents.all(orgId), 'my-direct-quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['indents', matchedIndent.id, 'direct-quotes'] }),
      queryClient.invalidateQueries({ queryKey: ['indents', 'quote-counts'] }),
    ]);
    return { linked: true };
  };

  const handleSubmit = async () => {
    if (!post || !canSubmit) return;

    let submitError: Error | null = null;
    let alreadyBid = false;

    if (isEditMode && existingBid) {
      const updateRes = await updateMutation.mutateAsync({ bidId: existingBid.id, amount: parsedAmount, note: note.trim() || undefined });
      submitError = updateRes.error ?? null;
    } else {
      const submitRes = await submitMutation.mutateAsync({ amount: parsedAmount, note: note.trim() || undefined });
      submitError = submitRes.error;
      alreadyBid = submitRes.alreadyBid ?? false;
    }

    if (submitError) return;

    const linkRes = await matchAndUpsertDirectQuote();
    if (!linkRes.linked) {
      Alert.alert(
        isEditMode ? 'Bid updated' : (alreadyBid ? 'Bid already exists' : 'Bid saved'),
        `Submitted to post feed, but indent quote sync failed: ${linkRes.error ?? 'No matching indent found.'}`,
      );
      if (!isEditMode && alreadyBid) onClose();
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kvContainer}>
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
                    <ActivityIndicator color="#fff" />
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
      web: { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as any,
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
