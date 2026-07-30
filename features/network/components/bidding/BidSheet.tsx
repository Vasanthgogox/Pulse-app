/**
 * BidSheet — bottom sheet (mobile) / centered dialog (desktop web) for bids on load stories.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from '@/constants/Theme';
import { useOrganization } from '@/contexts/OrganizationContext';
import { createDirectQuote } from '@/features/indents/services/direct-quotes.service';
import {
  getBroadcastIndentTarget,
  getVisibleIndentById,
  resolveSupplierTargetDisplayRate,
} from '@/features/indents/services/indents.service';
import {
  StoryFlowSheetPortal,
  useStoryPhonePopup,
} from "@/features/network/components/StoryMobilePopupShell";
import { type BidRow } from '@/features/network/services/bids.service';
import { type PostRow } from '@/features/network/services/posts.service';
import { formatINR } from '@/lib/format';
import { useSubmitBidMutation, useUpdateBidMutation } from '@/lib/queries/useBidsQuery';
import { queryKeys } from '@/lib/queryKeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Edit3,
  MapPin,
  MessageSquare,
  Package,
  ThumbsUp,
  Truck,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DESKTOP_MIN_WIDTH = 1024;

interface BidSheetProps {
  visible: boolean;
  post: PostRow | null;
  orgId: string;
  existingBid?: BidRow | null;
  /** Pre-fill for a fresh bid (e.g. a driver's suggested rate from an
   * approved Boost recommendation). Ignored in edit mode. */
  initialAmount?: number | null;
  /** Pre-fill note for a fresh bid (e.g. the recommending driver's note). */
  initialNote?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

function splitLocation(label: string | null | undefined): { primary: string; secondary: string } {
  const raw = (label ?? '').trim();
  if (!raw) return { primary: '—', secondary: '' };
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { primary: raw, secondary: '' };
  return { primary: parts[0], secondary: parts.slice(1).join(', ') };
}

export function BidSheet({ visible, post, orgId, existingBid, initialAmount, initialNote, onClose, onSuccess }: BidSheetProps) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const { width: viewportWidth } = useWindowDimensions();
  const phonePopup = useStoryPhonePopup();
  const isDesktop =
    !phonePopup && Platform.OS === 'web' && viewportWidth >= DESKTOP_MIN_WIDTH;
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);
  const sheetAnim = useRef(new Animated.Value(isDesktop ? 0 : 400)).current;
  const dialogOpacity = useRef(new Animated.Value(0)).current;
  const dialogScale = useRef(new Animated.Value(0.96)).current;

  const isEditMode = !!existingBid;
  const sourceIndentId = post?.source_indent_id ?? null;
  const linkedIndentQ = useQuery({
    queryKey: ['q', 'indents', 'bid-sheet-target', orgId, sourceIndentId],
    queryFn: async () => {
      const { indent, error } = await getVisibleIndentById(orgId, sourceIndentId!);
      if (error) throw error;
      // Broadcast may not be circulated to this org, so the market lookup can
      // miss. Fall back to the broadcast-scoped RPC for supplier_target.
      if (indent?.supplier_target && Number(indent.supplier_target) > 0) return indent;
      const target = await getBroadcastIndentTarget(sourceIndentId);
      if (!target) return indent;
      return {
        ...(indent ?? {}),
        supplier_target: target.supplier_target,
      };
    },
    enabled: visible && !!sourceIndentId && !!orgId,
    staleTime: 60_000,
  });
  const targetRate = resolveSupplierTargetDisplayRate(
    linkedIndentQ.data?.supplier_target,
    linkedIndentQ.data?.client_price,
    post?.rate_offer,
  );
  const submitMutation = useSubmitBidMutation(post?.id ?? null, orgId);
  const updateMutation = useUpdateBidMutation(post?.id ?? null, orgId);
  const isPending = isEditMode ? updateMutation.isPending : submitMutation.isPending;

  const parsedAmount = Number(amount.replace(/,/g, '').trim() || '0');
  const canSubmit = Number.isFinite(parsedAmount) && parsedAmount > 0 && !isPending;

  const origin = splitLocation(post?.origin);
  const destination = splitLocation(post?.destination);

  const handleAmountChange = (raw: string) => {
    setAmount(raw.replace(/[^\d]/g, ''));
  };

  useEffect(() => {
    if (visible) {
      setAmount(
        initialAmount && initialAmount > 0
          ? String(Math.round(initialAmount))
          : existingBid?.amount
            ? String(Math.round(existingBid.amount))
            : '',
      );
      setNote(existingBid?.note ?? initialNote ?? '');
      setSuccess(false);
      if (isDesktop) {
        dialogOpacity.setValue(0);
        dialogScale.setValue(0.96);
        Animated.parallel([
          Animated.timing(dialogOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.spring(dialogScale, { toValue: 1, tension: 80, friction: 11, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.spring(sheetAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      }
    } else if (isDesktop) {
      Animated.timing(dialogOpacity, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    } else {
      Animated.timing(sheetAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, isDesktop, existingBid?.amount, existingBid?.note, initialAmount, initialNote]);

  const invalidateQuoteCaches = async (matchedIndentId: string) => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) }),
      queryClient.invalidateQueries({ queryKey: [...queryKeys.indents.finite(orgId), 'my-direct-quotes'] }),
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
      const submitRes = await submitMutation.mutateAsync({
        amount: parsedAmount,
        note: note.trim() || undefined,
        orgName: currentOrganization?.name ?? "",
      });
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

  const loadContext = (
    <>
      {isDesktop ? (
        <View style={styles.desktopContextInner}>
          <Text style={styles.desktopContextKicker}>Load broadcast</Text>
          <View style={styles.desktopRouteBlock}>
            <View style={styles.desktopRouteCol}>
              <View style={[styles.routeDot, styles.routeDotPickup]} />
              <Text style={styles.desktopRoutePrimary}>{origin.primary}</Text>
              {origin.secondary ? (
                <Text style={styles.desktopRouteSecondary}>{origin.secondary}</Text>
              ) : null}
            </View>
            <View style={styles.desktopRouteMid}>
              <View style={styles.desktopRouteLine} />
              <ArrowRight size={16} color={Theme.textOnDarkMuted} />
            </View>
            <View style={[styles.desktopRouteCol, styles.desktopRouteColEnd]}>
              <View style={[styles.routeDot, styles.routeDotDrop]} />
              <Text style={[styles.desktopRoutePrimary, styles.desktopRoutePrimaryEnd]}>
                {destination.primary}
              </Text>
              {destination.secondary ? (
                <Text style={[styles.desktopRouteSecondary, styles.desktopRouteSecondaryEnd]}>
                  {destination.secondary}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.desktopSpecGrid}>
            {post.vehicle_type ? (
              <View style={styles.desktopSpecItem}>
                <Truck size={14} color={Theme.textOnDarkMuted} />
                <View style={styles.desktopSpecTextCol}>
                  <Text style={styles.desktopSpecLabel}>Vehicle</Text>
                  <Text style={styles.desktopSpecValue}>{post.vehicle_type}</Text>
                </View>
              </View>
            ) : null}
            {post.weight_tonnes != null ? (
              <View style={styles.desktopSpecItem}>
                <Package size={14} color={Theme.textOnDarkMuted} />
                <View style={styles.desktopSpecTextCol}>
                  <Text style={styles.desktopSpecLabel}>Weight</Text>
                  <Text style={styles.desktopSpecValue}>{post.weight_tonnes} tonnes</Text>
                </View>
              </View>
            ) : null}
            {post.material ? (
              <View style={styles.desktopSpecItem}>
                <MapPin size={14} color={Theme.textOnDarkMuted} />
                <View style={styles.desktopSpecTextCol}>
                  <Text style={styles.desktopSpecLabel}>Material</Text>
                  <Text style={styles.desktopSpecValue}>{post.material}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {targetRate != null ? (
            <View style={styles.desktopTargetCard}>
              <Text style={styles.desktopTargetLabel}>Supplier target</Text>
              <Text style={styles.desktopTargetValue}>{formatINR(targetRate)}</Text>
              <Text style={styles.desktopTargetHint}>Reference rate from load owner</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.loadSummary}>
          {post.vehicle_type ? (
            <View style={styles.summaryChip}>
              <Truck size={13} color={Theme.textPrimaryDark} strokeWidth={2.2} />
              <Text style={styles.summaryChipText}>{post.vehicle_type}</Text>
            </View>
          ) : null}
          {post.weight_tonnes != null ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{post.weight_tonnes}T</Text>
            </View>
          ) : null}
          {post.material ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{post.material}</Text>
            </View>
          ) : null}
          {targetRate != null ? (
            <View style={[styles.summaryChip, styles.rateChip]}>
              <Text style={styles.rateChipText}>Target: {formatINR(targetRate)}</Text>
            </View>
          ) : null}
        </View>
      )}
    </>
  );

  const bidForm = success ? (
    <View style={[styles.successView, isDesktop && styles.successViewDesktop]}>
      <View style={styles.successIcon}>
        <ThumbsUp size={32} color="#10b981" fill="#10b981" />
      </View>
      <Text style={styles.successText}>{isEditMode ? 'Bid Updated!' : 'Bid Submitted!'}</Text>
      <Text style={styles.successSub}>The load owner will review your offer</Text>
    </View>
  ) : (
    <>
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, isDesktop && styles.inputLabelDesktop]}>
          {isDesktop ? 'Your bid amount' : 'YOUR BID AMOUNT'}
        </Text>
        {isDesktop && targetRate != null ? (
          <Text style={styles.desktopAmountHint}>
            Target reference: {formatINR(targetRate)}
          </Text>
        ) : null}
        <View style={[styles.amountRow, isDesktop && styles.amountRowDesktop]}>
          <View style={[styles.currencyBadge, isDesktop && styles.currencyBadgeDesktop]}>
            <Text style={[styles.currencyText, isDesktop && styles.currencyTextDesktop]}>₹</Text>
          </View>
          <TextInput
            style={[styles.amountInput, isDesktop && styles.amountInputDesktop]}
            placeholder="0"
            placeholderTextColor={Theme.textMuted}
            keyboardType={Platform.OS === 'web' ? 'numeric' : 'number-pad'}
            value={amount}
            onChangeText={handleAmountChange}
            autoFocus={!isDesktop}
            returnKeyType="next"
            selectTextOnFocus
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, isDesktop && styles.inputLabelDesktop]}>
          {isDesktop ? 'Note (optional)' : 'NOTE (OPTIONAL)'}
        </Text>
        <View style={[styles.noteContainer, isDesktop && styles.noteContainerDesktop]}>
          <MessageSquare
            size={15}
            color={Theme.textPrimaryDark}
            strokeWidth={2.2}
            style={styles.noteIcon}
          />
          <TextInput
            style={[styles.noteInput, isDesktop && styles.noteInputDesktop]}
            placeholder="Add a message with your bid..."
            placeholderTextColor={Theme.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={isDesktop ? 4 : 2}
            returnKeyType="done"
            blurOnSubmit
          />
        </View>
      </View>

      <Pressable
        style={[
          styles.submitBtn,
          isDesktop && styles.submitBtnDesktop,
          (!canSubmit || isPending) && styles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {isPending ? (
          <LoadingIndicator color={Theme.buttonPrimaryText} />
        ) : (
          <>
            {isEditMode ? (
              <Edit3 size={16} color={Theme.buttonPrimaryText} strokeWidth={2.3} />
            ) : (
              <ThumbsUp size={16} color={Theme.buttonPrimaryText} strokeWidth={2.3} />
            )}
            <Text style={styles.submitBtnText}>
              {isEditMode ? 'Update bid' : 'Submit bid'}
              {canSubmit ? ` — ${formatINR(parsedAmount)}` : ''}
            </Text>
          </>
        )}
      </Pressable>

      {(submitMutation.error || updateMutation.error) && (
        <Text style={styles.errorText}>{String(submitMutation.error ?? updateMutation.error)}</Text>
      )}
    </>
  );

  const header = (
    <View style={[styles.header, isDesktop && styles.headerDesktop]}>
      <View style={styles.headerTextCol}>
        {isDesktop ? (
          <Text style={styles.desktopFormKicker}>
            {isEditMode ? 'Update quotation' : 'Submit quotation'}
          </Text>
        ) : null}
        <Text style={[styles.headerTitle, isDesktop && styles.headerTitleDesktop]}>
          {isEditMode ? 'Edit Bid' : 'Place Bid'}
        </Text>
        {!isDesktop ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {post.origin} → {post.destination}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        style={[styles.closeBtn, isDesktop && styles.closeBtnDesktop]}
        accessibilityRole="button"
        accessibilityLabel="Close bid dialog"
      >
        <X
          size={isDesktop ? 20 : 22}
          color={Theme.textPrimaryDark}
          strokeWidth={2.3}
        />
      </Pressable>
    </View>
  );

  const sheetBody = isDesktop ? (
    <Animated.View
      style={[
        styles.desktopDialog,
        {
          opacity: dialogOpacity,
          transform: [{ scale: dialogScale }],
          maxHeight: Math.min(640, viewportWidth * 0.9),
        },
      ]}
    >
      {header}
      <View style={styles.desktopBody}>
        <View style={styles.desktopContextPanel}>{loadContext}</View>
        <View style={styles.desktopFormPanel}>
          <View style={styles.desktopFormPanelInner}>{bidForm}</View>
        </View>
      </View>
    </Animated.View>
  ) : (
    <Animated.View
      style={[
        styles.sheet,
        { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetAnim }] },
      ]}
    >
      <View style={styles.handle} />
      {header}
      {loadContext}
      {bidForm}
    </Animated.View>
  );

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close bid sheet"
      animationType="fade"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        enabled={Platform.OS !== 'web'}
        style={[styles.kvContainer, isDesktop && styles.kvContainerDesktop]}
        pointerEvents="box-none"
      >
        {sheetBody}
      </KeyboardAvoidingView>
    </StoryFlowSheetPortal>
  );
}

const webDialogShadow = Platform.select({
  web: {
    boxShadow: '0 28px 64px rgba(15, 23, 42, 0.22), 0 8px 24px rgba(15, 23, 42, 0.12)',
  } as ViewStyle,
  default: {},
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 24,
    backgroundColor: Theme.overlayBackdrop,
  },
  kvContainer: { justifyContent: 'flex-end', width: '100%' },
  kvContainerDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 920,
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  desktopDialog: {
    width: '100%',
    maxWidth: 880,
    backgroundColor: Theme.screenBackground,
    overflow: 'hidden',
    ...webDialogShadow,
  },
  handle: {
    width: 36,
    height: 4,
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
  headerDesktop: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 0,
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderMedium,
    alignItems: 'center',
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  headerTitleDesktop: {
    fontSize: 22,
    marginBottom: 0,
    color: Theme.textPrimaryDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Theme.textPrimary,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 12,
  },
  desktopFormKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnDesktop: {
    width: 40,
    height: 40,
    backgroundColor: Theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopBody: {
    flexDirection: 'row',
    minHeight: 380,
  },
  desktopContextPanel: {
    flex: 1,
    backgroundColor: Theme.textPrimaryDark,
    minWidth: 0,
  },
  desktopContextInner: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
    gap: 20,
  },
  desktopContextKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  desktopRouteBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 4,
  },
  desktopRouteCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  desktopRouteColEnd: {
    alignItems: 'flex-end',
  },
  desktopRouteMid: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
  },
  desktopRouteLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: Theme.borderOnDark,
  },
  routeDot: {
    width: 10,
    height: 10,
    marginBottom: 6,
  },
  routeDotPickup: { backgroundColor: '#10b981' },
  routeDotDrop: { backgroundColor: Theme.brandBluePressed },
  desktopRoutePrimary: {
    fontSize: 16,
    fontWeight: '900',
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  desktopRoutePrimaryEnd: { textAlign: 'right' },
  desktopRouteSecondary: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textOnDarkMuted,
  },
  desktopRouteSecondaryEnd: { textAlign: 'right' },
  desktopSpecGrid: {
    gap: 12,
  },
  desktopSpecItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  desktopSpecTextCol: { flex: 1, minWidth: 0, gap: 2 },
  desktopSpecLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  desktopSpecValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textOnDark,
  },
  desktopTargetCard: {
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  desktopTargetLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  desktopTargetValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#a5b4fc',
    letterSpacing: -0.8,
  },
  desktopTargetHint: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textOnDarkMuted,
    marginTop: 2,
  },
  desktopFormPanel: {
    flex: 1.05,
    minWidth: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderMedium,
  },
  desktopFormPanelInner: {
    padding: 24,
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  loadSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.surface,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  rateChip: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlueInk,
  },
  rateChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputLabelDesktop: {
    fontSize: 12,
    letterSpacing: 0.4,
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  desktopAmountHint: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  amountRowDesktop: {
    backgroundColor: Theme.surface,
  },
  currencyBadge: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Theme.buttonPrimary,
    borderRightWidth: 1,
    borderRightColor: Theme.buttonPrimaryBorder,
  },
  currencyBadgeDesktop: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  currencyText: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  currencyTextDesktop: {
    fontSize: 22,
  },
  amountInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    paddingHorizontal: 16,
    letterSpacing: -0.8,
    ...Platform.select({
      web: { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as unknown as TextStyle,
    }),
  },
  amountInputDesktop: {
    fontSize: 32,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
  },
  noteContainerDesktop: {
    minHeight: 108,
    padding: 14,
  },
  noteIcon: { marginTop: 2 },
  noteInput: {
    flex: 1,
    fontSize: 15,
    color: Theme.textPrimaryDark,
    fontWeight: '500',
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  noteInputDesktop: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 80,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
  },
  submitBtnDesktop: {
    marginTop: 8,
    paddingVertical: 18,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
    letterSpacing: -0.2,
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
  successViewDesktop: {
    paddingVertical: 48,
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
