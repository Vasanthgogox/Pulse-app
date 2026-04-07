/**
 * POD Reconciliation Screen — adapted from cashflow PodReconciliation.tsx.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getCapabilitiesFromProfile } from '@/lib/capabilities';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { 
  usePodReconciliationTripsQuery, 
  usePodReconciliationSummaryQuery 
} from './lib/usePodReconciliationQueries';
import type { PodTab, PodReconciliationTripView } from './services/podReconciliationService';
import { PodValidationView } from './components/PodValidationView';

function canAccessPodManagement(profile: ReturnType<typeof useAuth>['profile']): boolean {
  if (!profile || profile.role === 'driver') return false;
  const caps = getCapabilitiesFromProfile(profile);
  return (
    caps.includes('finance_view') ||
    caps.includes('finance_manage') ||
    caps.includes('dispatch') ||
    caps.includes('dispatch_for_own_fleet')
  );
}

export function PodReconciliationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [activeTab, setActiveTab] = useState<PodTab>('pod_pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('All');
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<PodReconciliationTripView | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);

  const { 
    data: trips = [], 
    isLoading, 
    isError, 
    error, 
    refetch, 
    isRefetching 
  } = usePodReconciliationTripsQuery(orgId, activeTab, searchTerm, regionFilter);

  const { data: summaryData } = usePodReconciliationSummaryQuery(orgId);

  const { width } = useWindowDimensions();
  const isMediumScreen = width >= 768;
  const allowed = canAccessPodManagement(profile);

  const regions = ["All", "HYDERABAD", "CHENNAI", "BANGALORE", "PONDICHERRY", "Gummidipondi", "MUMBAI", "KOLKATA", "DELHI", "AHMEDABAD"];

  const formatCurrencySimple = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return '₹' + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  if (!allowed) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>Your account does not have access to manage PODs.</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgLoading || !orgId) return <CenteredLoadingView message={orgLoading ? 'Loading...' : 'No organization'} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top, flexDirection: isMediumScreen ? 'row' : 'column' }]}>
      <View style={[styles.mainColumn, isMediumScreen && { flex: 0.4, borderRightWidth: 1, borderColor: Theme.borderLight }]}>
        <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={12}>
            <FontAwesome name="arrow-left" size={20} color={Theme.textMuted} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBox}>
              <FontAwesome name="tasks" size={20} color={Theme.primary} />
            </View>
            <View>
              <Text style={styles.topTitle}>POD Management</Text>
              <Text style={styles.topSub}>Streamline your AR cycle and PODs</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.topBarRight}>
          <Pressable 
            style={styles.logPodsBtn} 
            onPress={() => router.push('/log-incoming-pods')}
          >
            <FontAwesome name="plus" size={14} color="#fff" />
            <Text style={styles.logPodsBtnText}>Log PODs</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metricsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsScroll}>
          <MetricCard 
            label="POD Pending" 
            value={formatCurrencySimple(summaryData?.pod_pending_sum || 0)} 
            count={summaryData?.pod_pending_count || 0}
            color="#b00020" 
            icon="warning"
          />
          <MetricCard 
            label="Needs Action" 
            value={formatCurrencySimple(summaryData?.received_sum || 0)} 
            count={summaryData?.received_count || 0}
            color="#b45309" 
            icon="inbox"
          />
          <MetricCard 
            label="Ready for Invoice" 
            value={formatCurrencySimple(summaryData?.approved_sum || 0)} 
            count={summaryData?.approved_count || 0}
            color="#059669" 
            icon="check-circle"
          />
          <MetricCard 
            label="Invoiced" 
            value={formatCurrencySimple(summaryData?.invoiced_sum || 0)} 
            count={summaryData?.invoiced_count || 0}
            color={Theme.primary} 
            icon="file-text-o"
          />
        </ScrollView>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TabButton 
            active={activeTab === 'pod_pending'} 
            label={`Pending (${summaryData?.pod_pending_count || 0})`} 
            onPress={() => setActiveTab('pod_pending')} 
          />
          <TabButton 
            active={activeTab === 'received'} 
            label={`Received (${summaryData?.received_count || 0})`} 
            onPress={() => setActiveTab('received')} 
          />
          <TabButton 
            active={activeTab === 'approved'} 
            label={`Ready (${summaryData?.approved_count || 0})`} 
            onPress={() => setActiveTab('approved')} 
          />
          <TabButton 
            active={activeTab === 'invoiced'} 
            label={`Invoiced (${summaryData?.invoiced_count || 0})`} 
            onPress={() => setActiveTab('invoiced')} 
          />
        </ScrollView>
      </View>

      <View style={styles.filtersArea}>
        <View style={styles.searchBox}>
          <FontAwesome name="search" size={14} color={Theme.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Trip ID, Client, LR..."
            placeholderTextColor={Theme.textMuted}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm !== '' && (
            <Pressable onPress={() => setSearchTerm('')}>
              <FontAwesome name="times-circle" size={16} color={Theme.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.regionFilter} onPress={() => setRegionModalOpen(true)}>
          <FontAwesome name="map-marker" size={14} color={Theme.primary} style={{ marginRight: 6 }} />
          <Text style={styles.regionFilterText}>{regionFilter === 'All' ? 'Region: All' : regionFilter}</Text>
          <FontAwesome name="chevron-down" size={10} color={Theme.textMuted} style={{ marginLeft: 6 }} />
        </Pressable>
      </View>

      <View style={styles.contentArea}>
        {isLoading && !isRefetching ? (
          <ActivityIndicator size="large" color={Theme.primary} style={{ marginTop: 40 }} />
        ) : isError ? (
          <View style={styles.errorArea}>
            <Text style={styles.errorText}>Could not load data</Text>
            {error && <Text style={styles.errorDetail}>{(error as any).message || String(error)}</Text>}
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.internal_id}
            renderItem={({ item }) => (
              <TripRowItem 
                trip={item} 
                onPress={() => {
                  setSelectedTrip(item);
                  setValidationModalOpen(true);
                }} 
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshing={isRefetching}
            onRefresh={refetch}
            ListEmptyComponent={
              <View style={styles.empty}>
                <FontAwesome name="folder-open-o" size={48} color={Theme.borderMedium} />
                <Text style={styles.emptyTitle}>No trips in this queue</Text>
                <Text style={styles.emptySub}>Try adjusting your filters or tab selection.</Text>
              </View>
            }
          />
        )}
      </View>
      {isMediumScreen && (
        <View style={styles.tabletRightPanel}>
          {selectedTrip ? (
            <PodValidationView
              isTablet={true}
              trip={selectedTrip}
              onClose={() => setSelectedTrip(null)}
            />
          ) : (
            <View style={styles.empty}>
              <FontAwesome name="file-text-o" size={48} color={Theme.borderMedium} />
              <Text style={styles.emptyTitle}>No trip selected</Text>
              <Text style={styles.emptySub}>Select a trip from the list to validate.</Text>
            </View>
          )}
        </View>
      )}
      </View>

      {!isMediumScreen && validationModalOpen && (
        <PodValidationView
          trip={selectedTrip}
          onClose={() => {
            setValidationModalOpen(false);
            setSelectedTrip(null);
          }}
        />
      )}

      <Modal visible={regionModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Region</Text>
            <FlatList
              data={regions}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setRegionFilter(item);
                    setRegionModalOpen(false);
                  }}
                >
                  <Text style={[styles.modalRowText, regionFilter === item && { color: Theme.primary, fontWeight: '700' }]}>
                    {item}
                  </Text>
                  {regionFilter === item && <FontAwesome name="check" size={16} color={Theme.primary} />}
                </Pressable>
              )}
            />
            <Pressable style={styles.modalClose} onPress={() => setRegionModalOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetricCard({ label, value, count, color, icon }: any) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <FontAwesome name={icon} size={14} color={color} />
      </View>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricCount}>{count} Trips</Text>
    </View>
  );
}

function TabButton({ active, label, onPress }: any) {
  return (
    <Pressable 
      style={[styles.tabBtn, active && styles.tabBtnActive]} 
      onPress={onPress}
    >
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TripRowItem({ trip, onPress }: { trip: PodReconciliationTripView; onPress: () => void }) {
  return (
    <Pressable style={styles.tripRow} onPress={onPress}>
      <View style={styles.tripRowTop}>
        <Text style={styles.tripId}>{trip.id}</Text>
        <Text style={styles.tripDate}>{new Date(trip.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
      </View>
      <View style={styles.tripRowMiddle}>
        <Text style={styles.clientName} numberOfLines={1}>{trip.client_name}</Text>
        <Text style={styles.tripAmount}>₹{trip.amount.toLocaleString()}</Text>
      </View>
      <View style={styles.tripRowBottom}>
        <View style={styles.routeContainer}>
          <FontAwesome name="map-marker" size={12} color={Theme.textMuted} />
          <Text style={styles.routeText} numberOfLines={1}>{trip.pp_location} ➔ {trip.drop_point}</Text>
        </View>
        <View style={[
          styles.statusBadge, 
          { 
            backgroundColor: trip.invoice_status_display === 'Invoiced' ? 'rgba(26,35,126,0.1)' :
                            trip.invoice_status_display === 'Ready for Invoice' ? 'rgba(5,150,105,0.1)' :
                            trip.invoice_status_display === 'Received' ? 'rgba(180,83,9,0.1)' : 'rgba(176,0,32,0.1)'
          }
        ]}>
          <Text style={[
            styles.statusBadgeText,
            {
              color: trip.invoice_status_display === 'Invoiced' ? Theme.primary :
                     trip.invoice_status_display === 'Ready for Invoice' ? '#059669' :
                     trip.invoice_status_display === 'Received' ? '#b45309' : '#b00020'
            }
          ]}>{trip.invoice_status_display}</Text>
        </View>
      </View>
      {trip.lr_numbers.length > 0 && (
        <View style={styles.lrContainer}>
          <Text style={styles.lrLabel}>LRs: </Text>
          <Text style={styles.lrText} numberOfLines={1}>
            {trip.trip_pods.length}/{trip.lr_numbers.length} received
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  mainColumn: { flex: 1, flexDirection: 'column' },
  tabletRightPanel: { flex: 0.6, backgroundColor: Theme.screenBackground },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 8, marginLeft: -8 },
  topTitleWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(26,35,126,0.1)', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: Theme.textPrimaryDark },
  topSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  topBarRight: { flexDirection: 'row', alignItems: 'center' },
  logPodsBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: Theme.primary, 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 8,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  logPodsBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  metricsContainer: { paddingVertical: 16 },
  metricsScroll: { paddingHorizontal: 16, gap: 12 },
  metricCard: {
    width: 150,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  metricLabel: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  metricCount: { fontSize: 10, color: Theme.textSecondary, fontWeight: '600' },

  tabsContainer: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.borderLight },
  tabsScroll: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.surfaceGray },
  tabBtnActive: { backgroundColor: Theme.primary },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: Theme.textSecondary },
  tabBtnTextActive: { color: '#fff' },

  filtersArea: { flexDirection: 'row', padding: 16, gap: 12 },
  searchBox: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Theme.cardWhite, 
    borderWidth: 1, 
    borderColor: Theme.borderInput, 
    borderRadius: 10, 
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 13, color: Theme.textPrimaryDark, padding: 0, fontWeight: '600' },
  regionFilter: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Theme.cardWhite, 
    borderWidth: 1, 
    borderColor: Theme.borderInput, 
    borderRadius: 10, 
    paddingHorizontal: 12,
    height: 40,
  },
  regionFilterText: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },

  contentArea: { flex: 1, backgroundColor: '#f8f9fa' },
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  tripRow: {
    backgroundColor: Theme.cardWhite,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tripRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tripId: { fontSize: 12, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.primary },
  tripDate: { fontSize: 10, fontWeight: '600', color: Theme.textMuted },
  tripRowMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  clientName: { fontSize: 14, fontWeight: '800', color: Theme.textPrimaryDark, flex: 1, marginRight: 12 },
  tripAmount: { fontSize: 14, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textPrimaryDark },
  tripRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  routeText: { fontSize: 11, fontWeight: '600', color: Theme.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  lrContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight, flexDirection: 'row', alignItems: 'center' },
  lrLabel: { fontSize: 10, fontWeight: '700', color: Theme.textMuted },
  lrText: { fontSize: 10, fontWeight: '700', color: Theme.textPrimaryDark },

  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark, marginTop: 16 },
  emptySub: { fontSize: 14, color: Theme.textMuted, marginTop: 8, textAlign: 'center' },

  errorArea: { alignItems: 'center', marginTop: 40 },
  errorText: { fontSize: 14, color: Theme.textMuted, marginBottom: 4 },
  errorDetail: { fontSize: 12, color: '#b00020', marginBottom: 12, textAlign: 'center', paddingHorizontal: 20 },
  retryBtn: { backgroundColor: Theme.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: Theme.overlayBackdrop, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Theme.screenBackground, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '800', margin: 16, color: Theme.textPrimaryDark },
  modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.borderLight },
  modalRowText: { fontSize: 15, color: Theme.textPrimaryDark },
  modalClose: { marginTop: 16, alignItems: 'center', padding: 16 },
  modalCloseText: { fontSize: 16, fontWeight: '700', color: Theme.primary },

  blocked: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', backgroundColor: Theme.screenBackground },
  blockedTitle: { fontSize: 18, fontWeight: '800', color: Theme.textPrimaryDark, marginBottom: 8 },
  blockedBody: { fontSize: 14, color: Theme.textSecondary, marginBottom: 20 },
  blockedBtn: { alignSelf: 'flex-start', backgroundColor: Theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  blockedBtnText: { color: '#fff', fontWeight: '700' },
});
