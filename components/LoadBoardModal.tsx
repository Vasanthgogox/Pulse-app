import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Package } from 'lucide-react-native';
import Theme from '@/constants/Theme';
import { SemanticAddIcon } from '@/components/SemanticAddIcon';
import { TeslaHeader } from '@/components/TeslaHeader';
import { formatINR } from '@/lib/format';
import { type IndentRow } from '@/features/indents';
import { useIndentsQuery } from '@/lib/queries';

export interface LoadBoardModalProps {
  visible: boolean;
  onClose: () => void;
  organizationId: string | null;
  /** When true, render as screen content only (no Modal). Use for modal route. */
  asScreen?: boolean;
  /** When provided, SYNCHRONIZE NODES uses this instead of onClose (e.g. go to network tab). */
  onSyncNodesPress?: () => void;
  /** When provided, CREATE INDENT button calls this (e.g. router.push('/create-indent')). */
  onCreateIndentPress?: () => void;
  /** When provided, tapping an indent card calls this (e.g. router.push(`/indent/${indent.id}`)). */
  onIndentPress?: (indent: IndentRow) => void;
  /** When true, render without header/back (e.g. embedded as Load sub-tab in Network). */
  embedInTab?: boolean;
}

type MarketMode = 'GIVE' | 'GET';

export function LoadBoardModal({
  visible,
  onClose,
  organizationId,
  asScreen,
  onSyncNodesPress,
  onCreateIndentPress,
  onIndentPress,
  embedInTab = false,
}: LoadBoardModalProps) {
  const insets = useSafeAreaInsets();
  const [marketMode, setMarketMode] = useState<MarketMode>('GIVE');
  const orgId = (visible || asScreen) ? organizationId : null;
  const { data: indents = [], isLoading: loading, refetch } = useIndentsQuery(orgId);

  const displayIndents = indents;
  const showNetworkExpansionEmpty = marketMode === 'GIVE' && !loading && displayIndents.length === 0;

  const content = (
    <View style={styles.container}>
      {!embedInTab && (
        <TeslaHeader
          title="Load Board"
          subtitle="Mission Exchange"
          showBack
          onBack={onClose}
        />
      )}
      <View style={[styles.toggleWrap, embedInTab && { marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, marketMode === 'GIVE' && styles.toggleBtnActive]}
            onPress={() => setMarketMode('GIVE')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, marketMode === 'GIVE' && styles.toggleTextActive]}>
              GIVE LOAD
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, marketMode === 'GET' && styles.toggleBtnActive]}
            onPress={() => setMarketMode('GET')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, marketMode === 'GET' && styles.toggleTextActive]}>
              GET LOAD
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
            showNetworkExpansionEmpty && styles.scrollContentCentered,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Theme.teslaRed} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : showNetworkExpansionEmpty ? (
            <View style={styles.emptyNetworkWrap}>
              <View style={styles.emptyIconWrap}>
                <FontAwesome name="plus-circle" size={32} color={Theme.textMutedDemo} />
              </View>
              <Text style={styles.emptyNetworkTitle}>Create your first indent</Text>
              <Text style={styles.emptyNetworkSub}>
                Create an indent to distribute loads to marketplace or integrated suppliers.
              </Text>
              <TouchableOpacity
                style={styles.syncNodesBtn}
                onPress={() => onCreateIndentPress?.()}
                activeOpacity={0.8}
              >
                <Text style={styles.syncNodesBtnText}>CREATE INDENT</Text>
              </TouchableOpacity>
              {onSyncNodesPress != null && (
                <TouchableOpacity
                  style={styles.syncNodesLink}
                  onPress={onSyncNodesPress}
                  activeOpacity={0.8}
                >
                  <Text style={styles.syncNodesLinkText}>Integrate suppliers via Network</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : displayIndents.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <FontAwesome name="handshake-o" size={32} color={Theme.textMutedDemo} />
              </View>
              <Text style={styles.emptyTitle}>No loads yet</Text>
              <Text style={styles.emptySub}>
                Loads from your network will appear here.
              </Text>
            </View>
          ) : (
            <>
              {displayIndents.map((indent) => (
                <TouchableOpacity
                  key={indent.id}
                  style={styles.card}
                  activeOpacity={0.7}
                  onPress={() => onIndentPress?.(indent)}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.cardRoute}>
                      <Text style={styles.cardOrigin} numberOfLines={1}>
                        {(indent.pickup_area || '—').toUpperCase()}
                      </Text>
                      <Text style={styles.cardArrow}> → </Text>
                      <Text style={styles.cardDest} numberOfLines={1}>
                        {(indent.drop_location || '—').toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>
                        {(indent.status || 'OPEN').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {[indent.load_type, indent.vehicle_type, indent.client_name]
                      .filter(Boolean)
                      .join(' // ') || '—'}
                  </Text>
                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={styles.cardLabel}>EST. FREIGHT</Text>
                      <Text style={styles.cardAmount}>{formatINR(Number(indent.client_price || 0))}</Text>
                    </View>
                    <View style={styles.cardBidsWrap}>
                      <Text style={styles.cardLabel}>BIDS</Text>
                      <View style={styles.cardBidsRow}>
                        <Text style={styles.cardBidsValue}>—</Text>
                        <FontAwesome name="arrow-up" size={10} color={Theme.darkGreen} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
              {marketMode === 'GIVE' && (
                <TouchableOpacity
                  style={styles.createBtn}
                  activeOpacity={0.8}
                  onPress={() => onCreateIndentPress?.()}
                >
                <SemanticAddIcon
                  IconComponent={Package}
                  iconSize={14}
                  iconColor={Theme.buttonPrimaryText}
                  badgeSize={14}
                  badgeIconSize={10}
                  badgeBackgroundColor={Theme.buttonPrimaryText}
                  badgeIconColor={Theme.fabBackground}
                  badgeOffsetX={-6}
                  badgeOffsetY={-4}
                />
                  <Text style={styles.createBtnText}>CREATE INDENT</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
  );

  if (asScreen) return content;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  darkBlock: {
    backgroundColor: Theme.darkBackground,
    width: '100%',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20,
    marginTop: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    borderRadius: 1,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 1,
  },
  toggleText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: Theme.textSecondary,
  },
  toggleTextActive: {
    color: Theme.textOnDark,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  scrollContentCentered: { flexGrow: 1, justifyContent: 'center' },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
  emptyNetworkWrap: {
    flex: 1,
    paddingVertical: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 2,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 2,
    borderColor: Theme.borderInput,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyNetworkTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyNetworkSub: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  syncNodesBtn: {
    maxWidth: 240,
    width: '100%',
    paddingVertical: 16,
    backgroundColor: Theme.buttonPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  syncNodesBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  syncNodesLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  syncNodesLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.primary,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 16,
  },

  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  cardOrigin: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  cardArrow: {
    fontSize: 10,
    color: Theme.teslaRed,
  },
  cardDest: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    flex: 1,
  },
  statusPill: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
  },
  cardMeta: {
    fontSize: 6,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 0,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceGray,
    paddingTop: 12,
  },
  cardLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cardAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  cardBidsWrap: { alignItems: 'flex-end' },
  cardBidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardBidsValue: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 16,
    marginTop: 8,
    gap: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  createBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
});
