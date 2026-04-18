/**
 * Indent detail — single indent view. Hero card aligns with Load Center cards
 * (pills, route row, indent id, specs slab); freight card, Live Bids, footer follow.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { LoadCardRouteRow } from '@/components/LoadCardRouteRow';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  cancelIndent,
  getVisibleIndentById,
  getIndentDisplayNumber,
  shareDraftIndent,
  updateIndent,
  type IndentRow,
} from '@/features/indents/services/indents.service';
import {
  updateDirectQuoteStatus,
  type DirectQuoteRow,
} from '@/features/indents/services/direct-quotes.service';
import { formatINR } from '@/lib/format';
import { useIndentDirectQuotesQuery, useInvalidateIndents } from '@/lib/queries/useIndentsQuery';
import { BidReceivedHammer } from '@/features/indents/components/BidReceivedHammer';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface IndentDetailScreenProps {
  indentId: string;
  onBack: () => void;
  /** Optional: called when Edit or Edit All is pressed. */
  onEditPress?: (indent: IndentRow) => void;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function getShareValidationErrors(indent: IndentRow): string[] {
  const issues: string[] = [];
  if (!(indent.pickup_area ?? '').trim()) issues.push('Origin is required');
  if (!(indent.drop_location ?? '').trim()) issues.push('Destination is required');
  if (!(indent.client_name ?? '').trim()) issues.push('Client is required');
  if (!Number(indent.client_price ?? 0) || Number(indent.client_price ?? 0) <= 0) issues.push('Budget must be greater than 0');
  if (Number(indent.supplier_target ?? 0) < 0) issues.push('Supplier target cannot be negative');
  if (!(indent.vehicle_type ?? '').trim()) issues.push('Vehicle is required');
  if (!(indent.load_type ?? '').trim()) issues.push('Load type is required');
  if (!Number(indent.weight ?? 0) || Number(indent.weight ?? 0) <= 0) issues.push('Weight must be greater than 0');
  return issues;
}

const LOCKED_INDENT_STATUSES = new Set([
  'awarded',
  'assigned',
  'deployed',
  'completed',
  'cancelled',
  'closed',
  'expired',
  'broadcast',
]);

function formatIndentDate(pickupDate: string | null, createdAt: string): string {
  const source = pickupDate?.trim() || createdAt;
  try {
    const d = new Date(source);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return source.slice(0, 10) || '—';
  }
}

/** Abbreviate client name for display (e.g. "KABIL ORGANIZATION" → "Kabil Org.") */
function abbreviateClientName(name: string, maxLen = 14): string {
  const t = (name || '').trim();
  if (!t) return '—';
  if (t.length <= maxLen) return t;
  const words = t.split(/\s+/);
  if (words.length >= 2) {
    const first = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    const last = words[words.length - 1];
    const abbr = last.length > 3 ? last.slice(0, 3) + '.' : last;
    return `${first} ${abbr}`;
  }
  return t.slice(0, maxLen - 2) + '…';
}

export function IndentDetailScreen({ indentId, onBack, onEditPress }: IndentDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const queryClient = useQueryClient();
  const invalidateIndents = useInvalidateIndents();
  const [indent, setIndent] = useState<IndentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [confirmShareVisible, setConfirmShareVisible] = useState(false);
  const [sharingDraft, setSharingDraft] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const { data: quotes = [], refetch: refetchQuotes } = useIndentDirectQuotesQuery(indentId);

  const load = useCallback(async () => {
    if (!indentId) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    setError(null);
    const { error: err, indent: row } = await getVisibleIndentById(orgId, indentId);
    setLoading(false);
    initialLoadDoneRef.current = true;
    isRefreshingRef.current = false;
    setRefreshing(false);
    if (err) {
      setError(err.message);
      setIndent(null);
      return;
    }
    setIndent(row);
  }, [indentId, orgId]);

  const handleRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
    refetchQuotes();
  }, [load, refetchQuotes]);

  const handleEditAll = useCallback(() => {
    if (indent && normalizeStatus(indent.status) === 'broadcast') {
      Alert.alert('Read-only indent', 'This indent has been shared and cannot be edited');
      return;
    }
    if (indent && onEditPress) onEditPress(indent);
    else Alert.alert('Edit', 'Edit indent flow coming soon.');
  }, [indent, onEditPress]);

  const executeBroadcast = useCallback(async () => {
    if (!indent) return;
    setSharingDraft(true);
    setBroadcastError(null);
    const { error } = await shareDraftIndent(indent.id);
    setSharingDraft(false);
    if (error) {
      setBroadcastError(error.message);
      Alert.alert('Could not share', error.message);
      return;
    }
    setConfirmShareVisible(false);
    if (orgId) invalidateIndents(orgId);
    await load();
    setIsBroadcasting(true);
    setTimeout(() => setIsBroadcasting(false), 1800);
  }, [indent, orgId, invalidateIndents, load]);

  const handleBroadcast = useCallback(() => {
    if (!indent) return;
    if (normalizeStatus(indent.status) !== 'draft') {
      Alert.alert('Already shared', 'This indent has already been shared with the network.');
      return;
    }
    const validationIssues = getShareValidationErrors(indent);
    if (validationIssues.length > 0) {
      Alert.alert(
        'Complete draft before sharing',
        `Please fix the following before sharing:\n\n• ${validationIssues.join('\n• ')}`,
        [
          { text: 'Close', style: 'cancel' },
          { text: 'Edit Draft', onPress: handleEditAll },
        ],
      );
      return;
    }
    setBroadcastError(null);
    setConfirmShareVisible(true);
  }, [indent, handleEditAll]);

  const handleAwardQuote = useCallback(async () => {
    if (!indentId || !indent || !selectedQuoteId) return;
    const pendingQuotes = quotes.filter((q) => (q.status || '').toLowerCase() === 'pending');
    const winner = pendingQuotes.find((q) => q.id === selectedQuoteId);
    if (!winner) {
      Alert.alert('Invalid selection', 'Please select a pending offer to award.');
      return;
    }
    const indentStatus = normalizeStatus(indent.status);
    if (indentStatus === 'awarded' || indentStatus === 'completed') {
      Alert.alert('Already awarded', 'This load has already been awarded.');
      return;
    }
    try {
      setAwarding(true);
      const { error: acceptErr } = await updateDirectQuoteStatus(winner.id, 'accepted');
      if (acceptErr) {
        Alert.alert('Could not award', acceptErr.message);
        return;
      }
      await Promise.allSettled(
        pendingQuotes
          .filter((q) => q.id !== winner.id)
          .map((q) => updateDirectQuoteStatus(q.id, 'rejected')),
      );
      const { error: indentErr } = await updateIndent(indentId, {
        status: 'awarded',
      });
      if (indentErr) {
        Alert.alert(
          'Quote accepted but status update failed',
          indentErr.message +
            '\n\nThe quote was accepted. The supplier can assign and deploy from Claimed.',
        );
      }
      setSelectedQuoteId(null);
      if (orgId) invalidateIndents(orgId);
      queryClient.invalidateQueries({
        queryKey: ['indents', indentId, 'direct-quotes'],
      });
      await load();
      refetchQuotes();
      Alert.alert(
        'Load awarded',
        `${winner.bidder_organization_name ?? 'Supplier'} can assign driver and vehicle from Claimed, then deploy.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error.';
      Alert.alert('Could not award', msg);
    } finally {
      setAwarding(false);
    }
  }, [indentId, indent, selectedQuoteId, quotes, orgId, invalidateIndents, queryClient, load, refetchQuotes]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !indent) {
    return <CenteredLoadingView message="Loading indent…" />;
  }

  if (error || !indent) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + Layout.headerPaddingBelowInset },
          ]}
        >
          <TouchableOpacity onPress={onBack} style={styles.headerIconBtn} activeOpacity={0.8} accessibilityLabel="Back">
            <FontAwesome name="chevron-left" size={20} color={Theme.textOnDark} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerId} numberOfLines={1}>INDENT</Text>
            <Text style={styles.headerSubtitle}>Review Hub • Indent</Text>
          </View>
          <View style={styles.headerIconBtnPlaceholder} />
        </View>
        <View style={styles.errorStateBody}>
          <Text style={styles.errorText}>{error ?? 'Indent not found.'}</Text>
        </View>
      </View>
    );
  }

  const displayNumber = getIndentDisplayNumber(indent);
  const origin = indent.pickup_area || '—';
  const destination = indent.drop_location || '—';
  const status = (indent.status || 'OPEN').toUpperCase();
  const statusLower = normalizeStatus(indent.status);
  const isDirect = (indent.circulation_target || '').toLowerCase() !== 'marketplace';
  const clientName = abbreviateClientName(indent.client_name || '—');
  const freight = formatINR(Number(indent.client_price ?? 0));
  const supplierRate = formatINR(Number(indent.supplier_target ?? 0));
  const vehicleType = indent.vehicle_type || '—';
  const material = indent.load_type || '—';
  const weightKg =
    indent.weight != null && Number(indent.weight) > 0
      ? `${Number(indent.weight)} KG`
      : '—';
  const dateLabel = formatIndentDate(indent.pickup_date ?? null, indent.created_at);

  // Margin % for supplier rate vs client price (simplified)
  const clientPriceNum = Number(indent.client_price ?? 0);
  const supplierNum = Number(indent.supplier_target ?? 0);
  const marginPct =
    clientPriceNum > 0 && supplierNum > 0
      ? Math.round(((clientPriceNum - supplierNum) / clientPriceNum) * 100)
      : null;
  const isOwner = !!orgId && indent.organization_id === orgId;
  const isLockedStatus = LOCKED_INDENT_STATUSES.has(statusLower);
  const canCancelLoad = isOwner && !isLockedStatus;
  const canEditLoad = isOwner && !isLockedStatus;
  const canBroadcast = isOwner && statusLower === 'draft';
  const canAward = statusLower !== 'awarded' && statusLower !== 'completed' && statusLower !== 'deployed';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + Layout.headerPaddingBelowInset },
        ]}
      >
        <TouchableOpacity
          onPress={onBack}
          style={styles.headerIconBtn}
          activeOpacity={0.8}
          accessibilityLabel="Back"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <FontAwesome name="chevron-left" size={20} color={Theme.textOnDark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerId} numberOfLines={1}>
            {displayNumber}
          </Text>
          <View style={styles.headerSubtitleRow}>
            <View style={styles.headerStatusDot} />
            <Text style={styles.headerSubtitle}>
              Review Hub • {status === 'OPEN' ? 'Active' : status} Indent
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerIconBtn}
          activeOpacity={0.8}
          accessibilityLabel="More actions"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <FontAwesome name="ellipsis-h" size={20} color={Theme.textOnDark} />
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={[styles.scroll, { backgroundColor: Theme.surface }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 16 + 72 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Theme.darkBackground}
          />
        }
      >
        {statusLower === 'draft' ? (
          <View style={styles.draftBanner}>
            <FontAwesome name="pencil-square-o" size={12} color={Theme.textPrimaryDark} />
            <Text style={styles.draftBannerText}>
              Draft saved. You can edit this indent and share it with network when ready.
            </Text>
          </View>
        ) : null}

        {/* Summary card — same structure as Load Center list cards */}
        <View style={styles.indentSummaryCard}>
          <View style={styles.indentSummaryOrb} pointerEvents="none" />
          <View style={styles.indentSummaryHeroRow}>
            <View style={styles.indentSummaryPillRow}>
              <View style={styles.indentSummaryTypePill}>
                <Text style={styles.indentSummaryTypePillText}>
                  {isOwner ? 'GIVE LOAD' : 'LOAD'}
                </Text>
              </View>
              <View style={styles.indentSummaryStatePill}>
                <Text style={styles.indentSummaryStatePillText}>{status}</Text>
              </View>
              {isDirect ? (
                <View style={styles.indentSummaryDirectPill}>
                  <Text style={styles.indentSummaryDirectPillText}>DIRECT</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.indentSummaryDate}>{dateLabel}</Text>
          </View>
          <LoadCardRouteRow origin={origin} destination={destination} />
          <Text style={styles.indentSummaryId} numberOfLines={1}>
            {displayNumber}
          </Text>
          <View style={styles.indentSummarySpecsHeader}>
            <Text style={styles.indentSummarySpecsTitle}>SHIPMENT PROFILE</Text>
            {canEditLoad ? (
              <TouchableOpacity onPress={handleEditAll} hitSlop={Layout.touchTargetHitSlop}>
                <Text style={styles.editAllText}>Edit All</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.editAllTextDisabled}>Locked</Text>
            )}
          </View>
          <View style={styles.indentSummarySpecsPanel}>
            <View style={styles.indentSummarySpecsRow}>
              <View style={styles.indentSummarySpecItem}>
                <Text style={styles.indentSummarySpecLabel}>Vehicle</Text>
                <Text style={styles.indentSummarySpecValue} numberOfLines={2}>
                  {vehicleType}
                </Text>
              </View>
              <View style={[styles.indentSummarySpecItem, styles.indentSummarySpecDivider]}>
                <Text style={styles.indentSummarySpecLabel}>Weight</Text>
                <Text style={styles.indentSummarySpecValue} numberOfLines={2}>
                  {weightKg}
                </Text>
              </View>
              <View style={[styles.indentSummarySpecItem, styles.indentSummarySpecDivider]}>
                <Text style={styles.indentSummarySpecLabel}>Load</Text>
                <Text style={styles.indentSummarySpecValue} numberOfLines={2}>
                  {material}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Freight Card with gradient */}
        <LinearGradient
          colors={[Theme.darkSurface, Theme.darkBackground]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.freightCard}
        >
          <View style={styles.freightGlow} />
          <View style={styles.freightContent}>
            <View style={styles.freightHeaderRow}>
              <View>
                <Text style={styles.freightLabel}>EST. MARKET FREIGHT</Text>
                <View style={styles.freightValueRow}>
                  <Text style={styles.freightCurrency}>₹</Text>
                  <Text style={styles.freightValue}>{freight.replace(/^[^\d,.-]+/, '').trim() || freight}</Text>
                </View>
              </View>
              <View style={styles.freightChartIcon}>
                <FontAwesome name="line-chart" size={18} color={Theme.positive} />
              </View>
            </View>

            <View style={styles.freightDivider} />

            <View style={styles.freightGrid}>
              <View style={styles.freightGridItem}>
                <Text style={styles.freightGridLabel}>SUPPLIER RATE</Text>
                <View style={styles.freightGridValueRow}>
                  <Text style={styles.freightGridValue}>{supplierRate}</Text>
                  {marginPct != null && (
                    <Text style={styles.freightMarginPct}> ({marginPct}%)</Text>
                  )}
                </View>
              </View>
              <View style={[styles.freightGridItem, styles.freightGridItemRight]}>
                <Text style={styles.freightGridLabel}>CLIENT ENTITY</Text>
                <Text style={styles.freightGridValue} numberOfLines={1}>
                  {clientName}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Live Bids */}
        <View style={styles.sectionHeader}>
          <View style={styles.liveBidsTitleRow}>
            <Text style={styles.sectionTitle}>LIVE BIDS</Text>
            {statusLower === 'awarded' || statusLower === 'completed' || statusLower === 'deployed' ? (
              <FontAwesome name="trophy" size={14} color={Theme.driverGold} />
            ) : (
              <BidReceivedHammer visible={quotes.length > 0} />
            )}
            <View style={styles.bidsCountBadge}>
              <Text style={styles.bidsCountText}>{quotes.length}</Text>
            </View>
          </View>
        </View>

        {quotes.length === 0 ? (
          <View style={styles.bidsEmptyCard}>
            <View style={styles.bidsEmptyIconWrap}>
              <FontAwesome name="inbox" size={22} color={Theme.textMuted} />
            </View>
            <Text style={styles.bidsEmptyTitle}>No Bids Received</Text>
            <Text style={styles.bidsEmptyBody}>
              Ready to find the best rate? Broadcast this indent to your logistics network.
            </Text>
            {canBroadcast ? (
              <TouchableOpacity
                style={styles.broadcastBtn}
                onPress={handleBroadcast}
                activeOpacity={0.9}
                disabled={isBroadcasting || sharingDraft}
              >
                {isBroadcasting || sharingDraft ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <>
                    <FontAwesome name="share" size={14} color={Theme.textOnPrimary} style={styles.broadcastBtnIcon} />
                    <Text style={styles.broadcastBtnText}>BROADCAST NOW</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.broadcastLockedPill}>
                <FontAwesome name="lock" size={12} color={Theme.textMuted} />
                <Text style={styles.broadcastLockedText}>
                  {statusLower === 'broadcast'
                    ? 'This indent has been shared and cannot be edited'
                    : 'Broadcast unavailable for current status'}
                </Text>
              </View>
            )}
            {broadcastError ? (
              <Text style={styles.broadcastErrorText}>{broadcastError}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.offersListWrap}>
            {quotes.map((q: DirectQuoteRow) => {
              const isPending = (q.status || '').toLowerCase() === 'pending';
              const isSelected = selectedQuoteId === q.id;
              return (
                <TouchableOpacity
                  key={q.id}
                  style={[
                    styles.quoteRow,
                    isSelected && styles.quoteRowSelected,
                    !isPending && styles.quoteRowDisabled,
                  ]}
                  onPress={() =>
                    canAward && isPending && setSelectedQuoteId(isSelected ? null : q.id)
                  }
                  activeOpacity={0.8}
                  disabled={!canAward || !isPending}
                >
                  <Text style={styles.quoteRowName} numberOfLines={1}>
                    {q.bidder_organization_name ?? '—'}
                  </Text>
                  <Text style={styles.quoteRowAmount}>{formatINR(Number(q.amount ?? 0))}</Text>
                  <Text style={styles.quoteRowStatus}>{q.status === 'accepted' ? 'AWARDED' : (q.status || '').toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
            {canAward &&
              quotes.some((q) => normalizeStatus(q.status) === 'pending') && (
                <TouchableOpacity
                  style={[
                    styles.awardSelectedBtn,
                    (awarding || !selectedQuoteId ||
                      !quotes.some(
                        (q) =>
                          q.id === selectedQuoteId && (q.status || '').toLowerCase() === 'pending'
                      )) && styles.awardSelectedBtnDisabled,
                  ]}
                  onPress={handleAwardQuote}
                  disabled={
                    awarding ||
                    !selectedQuoteId ||
                    !quotes.some(
                      (q) =>
                        q.id === selectedQuoteId && (q.status || '').toLowerCase() === 'pending'
                    )
                  }
                  activeOpacity={0.9}
                >
                  {awarding ? (
                    <ActivityIndicator size="small" color={Theme.textOnDark} />
                  ) : (
                    <Text style={styles.awardSelectedBtnText}>Award selected</Text>
                  )}
                </TouchableOpacity>
              )}
          </View>
        )}
      </ScrollView>

      {/* Fixed footer (light style) */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: 16 + insets.bottom,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.footerEditBtn}
          onPress={canEditLoad ? handleEditAll : undefined}
          activeOpacity={0.85}
          accessibilityLabel="Edit indent"
          hitSlop={Layout.touchTargetHitSlop}
          disabled={!canEditLoad}
        >
          <FontAwesome name="pencil" size={18} color={canEditLoad ? Theme.textSecondary : Theme.textMuted} />
        </TouchableOpacity>
        {canCancelLoad ? (
          <TouchableOpacity
            style={styles.footerCancelBtn}
            onPress={() => {
              if (cancelling) return;
              Alert.alert(
                'Cancel load',
                'Are you sure you want to cancel this load? Connected suppliers will no longer see it under Find Work.',
                [
                  { text: 'Keep load', style: 'cancel' },
                  {
                    text: 'Cancel load',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        setCancelling(true);
                        const { error: cancelError } = await cancelIndent(indent.id);
                        setCancelling(false);
                        if (cancelError) {
                          Alert.alert('Could not cancel', cancelError.message);
                          return;
                        }
                        await load();
                      } catch (e) {
                        setCancelling(false);
                        const msg = e instanceof Error ? e.message : 'Unknown error';
                        Alert.alert('Could not cancel', msg);
                      }
                    },
                  },
                ],
              );
            }}
            activeOpacity={0.9}
            accessibilityLabel="Cancel load"
            hitSlop={Layout.touchTargetHitSlop}
          >
            <FontAwesome name="ban" size={16} color={Theme.buttonDestructiveText} />
            <Text style={styles.footerCancelText}>
              {cancelling ? 'CANCELLING…' : 'CANCEL LOAD'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerLockedPill}>
            <FontAwesome name="lock" size={14} color={Theme.textMuted} />
            <Text style={styles.footerLockedText}>LOAD LOCKED</Text>
          </View>
        )}
      </View>

      {/* Broadcast modal */}
      <Modal
        visible={confirmShareVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmShareVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmShareVisible(false)}>
          <Pressable style={styles.shareConfirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.shareConfirmTitle}>Share with Network?</Text>
            <Text style={styles.shareConfirmSubtitle}>
              Once shared, this indent becomes read-only and cannot be edited.
            </Text>
            <View style={styles.shareConfirmActions}>
              <TouchableOpacity
                style={styles.shareConfirmCancelBtn}
                onPress={() => setConfirmShareVisible(false)}
                activeOpacity={0.9}
                disabled={sharingDraft}
              >
                <Text style={styles.shareConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareConfirmShareBtn}
                onPress={executeBroadcast}
                activeOpacity={0.9}
                disabled={sharingDraft}
              >
                {sharingDraft ? (
                  <ActivityIndicator size="small" color={Theme.textOnDark} />
                ) : (
                  <Text style={styles.shareConfirmShareText}>Share now</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isBroadcasting}
        transparent
        animationType="slide"
        onRequestClose={() => setIsBroadcasting(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsBroadcasting(false)}
        >
          <Pressable
            style={[styles.modalContent, { paddingBottom: 24 + insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalBody}>
              <View style={styles.modalIconWrap}>
                <FontAwesome name="bullhorn" size={28} color={Theme.darkBackground} />
              </View>
              <Text style={styles.modalTitle}>Broadcasting Live</Text>
              <Text style={styles.modalSubtitle}>
                Your indent {displayNumber} is now visible to verified transporters in your network.
              </Text>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setIsBroadcasting(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
    backgroundColor: Theme.darkBackground,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderOnDark,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerId: {
    fontSize: 14,
    fontWeight: '800',
    fontStyle: 'italic',
    color: Theme.textOnDark,
    letterSpacing: 1,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  headerStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.darkBackground,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
  },
  errorStateBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.darkBackground,
  },
  errorText: {
    fontSize: 15,
    color: Theme.textOnDarkMuted,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    backgroundColor: Theme.surface,
  },
  draftBanner: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  draftBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },

  // Summary card (aligned with Load Center `loadCard`)
  indentSummaryCard: {
    position: 'relative' as const,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 18,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    overflow: 'hidden',
  },
  indentSummaryOrb: {
    position: 'absolute',
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  indentSummaryHeroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    zIndex: 1,
  },
  indentSummaryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  indentSummaryTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surfaceGray,
  },
  indentSummaryTypePillText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.35,
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  indentSummaryStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  indentSummaryStatePillText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    color: Theme.positive,
  },
  indentSummaryDirectPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  indentSummaryDirectPillText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    color: Theme.textPrimaryDark,
  },
  indentSummaryDate: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 2,
    zIndex: 1,
  },
  indentSummaryId: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    zIndex: 1,
  },
  indentSummarySpecsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    zIndex: 1,
  },
  indentSummarySpecsTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  indentSummarySpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    zIndex: 1,
  },
  indentSummarySpecsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  indentSummarySpecItem: {
    flex: 1,
    minWidth: 0,
  },
  indentSummarySpecDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 10,
    marginLeft: 4,
  },
  indentSummarySpecLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  indentSummarySpecValue: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },

  // Freight card (compact dark card)
  freightCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  freightGlow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.driverWhiteMuted,
  },
  freightContent: {
    zIndex: 1,
  },
  freightHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  freightLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
  },
  freightValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  freightCurrency: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textOnDark,
    opacity: 0.8,
  },
  freightValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  freightChartIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.positiveMutedDark,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freightDivider: {
    height: 1,
    backgroundColor: Theme.separatorDark,
    marginVertical: 12,
  },
  freightGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  freightGridItem: {
    flex: 1,
  },
  freightGridItemRight: {
    alignItems: 'flex-end',
  },
  freightGridLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  freightGridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textOnDark,
  },
  freightGridValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freightMarginPct: {
    fontSize: 10,
    fontWeight: '400',
    color: Theme.positive,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
  editAllText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.darkBackground,
  },
  editAllTextDisabled: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  // Live Bids
  liveBidsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bidsCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidsCountText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  bidsEmptyCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  bidsEmptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bidsEmptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  bidsEmptyBody: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 16,
  },
  broadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minHeight: 40,
  },
  broadcastBtnIcon: {
    marginRight: 8,
  },
  broadcastBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    letterSpacing: 1,
  },
  broadcastLockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  broadcastLockedText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  broadcastErrorText: {
    marginTop: 10,
    fontSize: 11,
    color: Theme.negative,
    textAlign: 'center',
  },

  // Quote rows
  offersListWrap: {
    marginBottom: 16,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    marginBottom: 6,
  },
  quoteRowSelected: {
    borderLeftWidth: 4,
    borderLeftColor: Theme.darkGreen,
  },
  quoteRowDisabled: { opacity: 0.6 },
  quoteRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textBody,
    marginRight: 8,
  },
  quoteRowAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textBody,
    marginRight: 8,
  },
  quoteRowStatus: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
  awardSelectedBtn: {
    marginTop: 10,
    paddingVertical: 12,
    backgroundColor: Theme.darkBackground,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardSelectedBtnDisabled: { opacity: 0.5 },
  awardSelectedBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textOnDark,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Footer (light)
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 3,
  },
  footerEditBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  footerCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.buttonDestructive,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  footerCancelText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.buttonDestructiveText,
    textTransform: 'uppercase',
  },
  footerLockedPill: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerLockedText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },

  // Broadcast modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  shareConfirmCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
  },
  shareConfirmTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  shareConfirmSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  shareConfirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  shareConfirmCancelBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareConfirmCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  shareConfirmShareBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: Theme.darkBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareConfirmShareText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
  },
  modalContent: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 48,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalBody: {
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: 1,
    borderColor: Theme.aggregatePillBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalDoneBtn: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: Theme.darkBackground,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
});
