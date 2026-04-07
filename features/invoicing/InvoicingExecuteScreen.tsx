/**
 * Invoicing Execute Screen — adapted from cashflow InvoicingCenter / ClientSidebar / TripList.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
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
  useInvoicingExecuteTripsQuery,
  usePodReconciliationSummaryQuery,
  useExecuteInvoiceMutation,
} from '@/lib/queries/useInvoicingExecuteQueries';
import { InvoicePreviewModal } from '@/features/invoicing/components/InvoicePreviewModal';
import { InvoicePreviewPanel } from '@/features/invoicing/components/InvoicePreviewPanel';

function canAccessInvoicing(profile: ReturnType<typeof useAuth>['profile']): boolean {
  if (!profile || profile.role === 'driver') return false;
  const caps = getCapabilitiesFromProfile(profile);
  return (
    caps.includes('finance_view') ||
    caps.includes('finance_manage') ||
    caps.includes('dispatch') ||
    caps.includes('dispatch_for_own_fleet')
  );
}

export function InvoicingExecuteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const { data: allTrips = [], isLoading, isError, error, refetch, isRefetching } = useInvoicingExecuteTripsQuery(orgId);
  const { data: summaryData } = usePodReconciliationSummaryQuery(orgId);
  const executeMutation = useExecuteInvoiceMutation(orgId);

  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);

  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  const isMediumScreen = width >= 768;
  const allowed = canAccessInvoicing(profile);

  const formatCurrencySimple = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return '₹' + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const clientStats = useMemo(() => {
    const map = new Map<string, { name: string; approved: number; received: number; pending: number }>();
    allTrips.forEach((t) => {
      if (!map.has(t.client)) {
        map.set(t.client, { name: t.client, approved: 0, received: 0, pending: 0 });
      }
      const c = map.get(t.client)!;
      if (t.status === 'approved') c.approved++;
      else if (t.status === 'received') c.received++;
      else if (t.status === 'pending') c.pending++;
    });

    let clients = Array.from(map.values());
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      clients = clients.filter((c) => c.name.toLowerCase().includes(q));
    }
    return clients.sort((a, b) => b.approved - a.approved || b.received - a.received);
  }, [allTrips, clientSearch]);

  const clientTrips = useMemo(() => {
    if (!activeClient) return [];
    
    const parseDate = (dateStr: string) => {
      // Very basic date parser assuming YYYY-MM-DD or DD/MM/YYYY for simplicity here
      const [p1, p2, p3] = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
      if (dateStr.includes('/')) {
        // DD/MM/YYYY -> YYYY-MM-DD
        return new Date(`${p3}-${p2}-${p1}`);
      }
      return new Date(dateStr);
    };

    const sDate = startDate ? parseDate(startDate) : null;
    const eDate = endDate ? parseDate(endDate) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);
    
    const q = searchQuery.toLowerCase().trim();
    
    return allTrips.filter((t) => {
      if (t.client !== activeClient) return false;
      
      if (q && !t.id.toLowerCase().includes(q) && !t.route.toLowerCase().includes(q)) return false;
      
      const tripDate = new Date(t.date);
      if (sDate && tripDate < sDate) return false;
      if (eDate && tripDate > eDate) return false;

      return true;
    }).sort((a, b) => {
      // Sort: Approved first, then Received, then Pending
      const statusOrder = { approved: 0, received: 1, pending: 2, warning: 3, blocked: 4 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }, [allTrips, activeClient, searchQuery, startDate, endDate]);

  const tripsById = useMemo(() => {
    const map = new Map();
    for (const t of allTrips) map.set(t.id, t);
    return map;
  }, [allTrips]);

  const selectedTrips = useMemo(() => {
    return selectedTripIds.map((id) => tripsById.get(id)).filter(Boolean);
  }, [tripsById, selectedTripIds]);

  const invoiceableTrips = useMemo(() => clientTrips, [clientTrips]);
  const allClientTripsSelected = invoiceableTrips.length > 0 && invoiceableTrips.every((t) => selectedTripIds.includes(t.id));

  const handleToggleTrip = useCallback((id: string) => {
    setSelectedTripIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  const handleSelectAll = useCallback(() => {
    const invoiceableTrips = clientTrips;
    
    if (invoiceableTrips.length === 0) {
      return;
    }

    const allInvoiceableSelected = invoiceableTrips.every((t) => selectedTripIds.includes(t.id));

    if (allInvoiceableSelected) {
      const ids = invoiceableTrips.map((t) => t.id);
      setSelectedTripIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      const ids = invoiceableTrips.map((t) => t.id);
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }, [clientTrips, selectedTripIds]);

  const selectClient = (clientName: string) => {
    setActiveClient(clientName);
    setSelectedTripIds([]);
    setClientModalOpen(false);
  };

  const handleFinalize = async (internalIds: string[], payload?: any) => {
    try {
      await executeMutation.mutateAsync({ internalIds, payload });
      setPreviewModalOpen(false);
      setSelectedTripIds([]);
      Alert.alert('Success', 'Invoice finalized and dispatched!');
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to finalize invoice.');
    }
  };

  if (!allowed) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>Your account does not have access to execute invoices.</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgLoading || !orgId) return <CenteredLoadingView message={orgLoading ? 'Loading...' : 'No organization'} />;
  if (isLoading) return <CenteredLoadingView message="Syncing with Supabase..." />;
  if (isError) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.blockedTitle}>Could not load data</Text>
        <Text style={styles.blockedBody}>{error instanceof Error ? error.message : 'Unknown error'}</Text>
        <Pressable style={styles.blockedBtn} onPress={() => refetch()}>
          <Text style={styles.blockedBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const renderSidebar = () => (
    <>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>Strategic Partners</Text>
        <Text style={styles.sidebarBadge}>{clientStats.length} Online</Text>
      </View>
      <View style={styles.sidebarSearch}>
        <FontAwesome name="search" size={14} color={Theme.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.sidebarInput}
          placeholder="Search partners..."
          placeholderTextColor={Theme.textMuted}
          value={clientSearch}
          onChangeText={setClientSearch}
        />
      </View>
      <FlatList
        data={clientStats}
        keyExtractor={(item) => item.name}
        renderItem={({ item: client }) => (
          <Pressable
            style={[styles.clientRow, activeClient === client.name && styles.clientRowActive]}
            onPress={() => selectClient(client.name)}
          >
            {activeClient === client.name && <View style={styles.clientRowIndicator} />}
            <View style={{ flex: 1 }}>
              <View style={styles.clientRowTop}>
                <Text style={[styles.clientName, activeClient === client.name && { color: Theme.primary }]}>
                  {client.name}
                </Text>
                {client.approved > 0 ? (
                  <Text style={styles.tagApproved}>Invoice Pending</Text>
                ) : client.received > 0 ? (
                  <Text style={styles.tagReceived}>Audit Required</Text>
                ) : client.pending > 0 ? (
                  <Text style={styles.tagPending}>POD Pending</Text>
                ) : (
                  <Text style={styles.tagSettled}>Settled</Text>
                )}
              </View>
              <View style={styles.clientRowBottom}>
                <View style={styles.clientBilled}>
                  <View style={styles.dot} />
                  <Text style={styles.clientBilledText}>Last Billed: Today</Text>
                </View>
                <FontAwesome name="chevron-right" size={12} color={activeClient === client.name ? Theme.primary : Theme.textMuted} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={12}>
            <FontAwesome name="arrow-left" size={20} color={Theme.textMuted} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBox}>
              <FontAwesome name="file-text" size={20} color={Theme.primary} />
            </View>
            <View>
              <Text style={styles.topTitle}>Revenue & Invoicing</Text>
              <Text style={styles.topSub}>Execute invoices for confirmed trips</Text>
            </View>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>POD Pending</Text>
            <Text style={styles.statValError}>{formatCurrencySimple(summaryData?.pod_pending_sum || 0)}</Text>
          </View>
          {isMediumScreen && (
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Needs Action</Text>
              <Text style={styles.statValWarn}>{formatCurrencySimple(summaryData?.received_sum || 0)}</Text>
            </View>
          )}
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Ready</Text>
            <Text style={styles.statValOk}>{formatCurrencySimple(summaryData?.approved_sum || 0)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.contentArea}>
        {isMediumScreen ? (
          <View style={styles.splitLayout}>
            <View style={styles.sidebar}>{renderSidebar()}</View>
            <View style={[styles.mainArea, isLargeScreen && { borderRightWidth: 1, borderRightColor: Theme.borderLight }]}>
              <TripListContent 
                clientTrips={clientTrips}
                activeClient={activeClient}
                selectedTripIds={selectedTripIds}
                allSelected={allClientTripsSelected}
                onSelectAll={handleSelectAll}
                onToggleTrip={handleToggleTrip}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                isRefetching={isRefetching}
                refetch={refetch}
              />
            </View>
            {isLargeScreen && (
              <View style={styles.rightPanel}>
                <InvoicePreviewPanel
                  onFinalize={handleFinalize}
                  isFinalizing={executeMutation.isPending}
                  activeClient={activeClient}
                  selectedTrips={selectedTrips}
                  isStandalone={true}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.mobileConfig}>
              <Text style={styles.sectionLabel}>Strategic Partner</Text>
              <Pressable style={styles.selectRow} onPress={() => setClientModalOpen(true)}>
                <Text style={styles.selectRowText} numberOfLines={1}>
                  {activeClient || 'Select a client...'}
                </Text>
                <FontAwesome name="chevron-down" size={14} color={Theme.textMuted} />
              </Pressable>
            </View>
            <View style={styles.mobileGridArea}>
              <TripListContent 
                clientTrips={clientTrips}
                activeClient={activeClient}
                selectedTripIds={selectedTripIds}
                allSelected={allClientTripsSelected}
                onSelectAll={handleSelectAll}
                onToggleTrip={handleToggleTrip}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                isRefetching={isRefetching}
                refetch={refetch}
              />
            </View>
          </View>
        )}
      </View>

      {!isMediumScreen && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={[styles.footerBtn, selectedTripIds.length === 0 && styles.footerBtnDisabled]}
            onPress={() => setPreviewModalOpen(true)}
            disabled={selectedTripIds.length === 0}
          >
            <Text style={styles.footerBtnText}>Configure Invoice ({selectedTripIds.length})</Text>
          </Pressable>
        </View>
      )}

      {isMediumScreen && !isLargeScreen && (
        <View style={styles.desktopFooter}>
          <Pressable
            style={[styles.footerBtn, { alignSelf: 'flex-end', minWidth: 240 }, selectedTripIds.length === 0 && styles.footerBtnDisabled]}
            onPress={() => setPreviewModalOpen(true)}
            disabled={selectedTripIds.length === 0}
          >
            <Text style={styles.footerBtnText}>Preview Invoice ({selectedTripIds.length})</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={clientModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Select Partner</Text>
            {renderSidebar()}
            <Pressable style={styles.modalClose} onPress={() => setClientModalOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <InvoicePreviewModal
        visible={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        activeClient={activeClient}
        selectedTrips={selectedTrips}
        onFinalize={handleFinalize}
        isFinalizing={executeMutation.isPending}
      />
    </View>
  );
}

function TripListContent({
  clientTrips,
  activeClient,
  selectedTripIds,
  allSelected,
  onSelectAll,
  onToggleTrip,
  searchQuery,
  setSearchQuery,
  isRefetching,
  refetch,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: any) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.listHeader}>
        <View>
          <Text style={styles.listHeaderTitle}>Ready-to-Invoice Trips</Text>
          <Text style={styles.listHeaderSub}>Partner: <Text style={{ color: Theme.primary }}>{activeClient || 'None Selected'}</Text></Text>
        </View>
        <Pressable style={styles.bulkActionBtn}>
          <Text style={styles.bulkActionText}>Bulk Action</Text>
        </Pressable>
      </View>
      <View style={styles.listFilters}>
        <View style={styles.searchRow}>
          <FontAwesome name="search" size={14} color={Theme.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor={Theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        
        <View style={styles.dateFilterContainer}>
          <View style={styles.dateRow}>
            <FontAwesome name="calendar" size={12} color={Theme.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.dateInput}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={Theme.textMuted}
              value={startDate}
              onChangeText={setStartDate}
            />
            <Text style={styles.dateToText}>TO</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={Theme.textMuted}
              value={endDate}
              onChangeText={setEndDate}
            />
            {(startDate || endDate) ? (
              <Pressable onPress={() => { setStartDate(''); setEndDate(''); }} style={{ marginLeft: 4 }}>
                <FontAwesome name="times" size={12} color={Theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      
      <View style={styles.tableHeader}>
        <Pressable style={styles.selectAllGroup} onPress={onSelectAll}>
          <View style={styles.selectAllCheckbox}>
            {allSelected && <FontAwesome name="check" size={10} color={Theme.primary} />}
          </View>
        </Pressable>
        <Text style={[styles.tableHeaderText, { width: 100 }]}>Date / ID</Text>
        <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Supplier</Text>
        <Text style={[styles.tableHeaderText, { flex: 2 }]}>Route</Text>
        <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Freight</Text>
        <Text style={[styles.tableHeaderText, { width: 60, textAlign: 'right' }]}>Extras</Text>
        <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'center' }]}>Status</Text>
      </View>

      <FlatList
        data={clientTrips}
        keyExtractor={(item) => item.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FontAwesome name="folder-open-o" size={40} color={Theme.borderMedium} />
            <Text style={styles.emptyTitle}>No Active Transactions</Text>
          </View>
        }
        renderItem={({ item: trip }) => {
          const isPending = trip.status === 'pending';
          return (
            <Pressable 
              style={[
                styles.tripTableRow, 
                selectedTripIds.includes(trip.id) && styles.tripTableRowSelected
              ]}
              onPress={() => onToggleTrip(trip.id)}
            >
              <View style={styles.selectAllGroup}>
                <View style={[
                  styles.checkBox, 
                  selectedTripIds.includes(trip.id) && styles.checkBoxOn
                ]}>
                  {selectedTripIds.includes(trip.id) && <FontAwesome name="check" size={10} color="#fff" />}
                </View>
              </View>
              
              <View style={{ width: 100 }}>
                <Text style={styles.tripDate}>{new Date(trip.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                <Text style={styles.tripId}>{trip.id}</Text>
              </View>
              
              <View style={{ flex: 1.5 }}>
                <Text style={styles.tripSupplier} numberOfLines={1}>{trip.supplier_name}</Text>
              </View>
              
              <View style={{ flex: 2 }}>
                <Text style={styles.tripRoute} numberOfLines={1}>{trip.route}</Text>
                <Text style={styles.tripDetails} numberOfLines={1}>{trip.details || 'Vehicle N/A'}</Text>
              </View>
              
              <View style={{ width: 80, alignItems: 'flex-end' }}>
                <Text style={styles.tripAmount}>₹{trip.amount.toLocaleString()}</Text>
              </View>
              
              <View style={{ width: 60, alignItems: 'flex-end' }}>
                <Text style={styles.tripExtras}>₹0</Text>
              </View>

              <View style={{ width: 80, alignItems: 'center' }}>
                {trip.status === 'approved' ? (
                  <Text style={styles.listTagApproved}>Approved</Text>
                ) : trip.status === 'received' ? (
                  <Text style={styles.listTagReceived}>Received</Text>
                ) : (
                  <Text style={styles.listTagPending}>Pending</Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surface },
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
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statBox: { alignItems: 'flex-end' },
  statLabel: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  statValError: { fontSize: 13, fontWeight: '800', color: '#b00020' },
  statValWarn: { fontSize: 13, fontWeight: '800', color: '#b45309' },
  statValOk: { fontSize: 13, fontWeight: '800', color: '#059669' },

  contentArea: { flex: 1 },
  splitLayout: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 280, borderRightWidth: 1, borderRightColor: Theme.borderLight, backgroundColor: Theme.screenBackground },
  mainArea: { flex: 1, backgroundColor: '#f8f9fa' },
  rightPanel: { width: 360, backgroundColor: Theme.screenBackground },
  
  sidebarHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: Theme.borderLight, backgroundColor: 'rgba(248,250,252,0.5)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sidebarTitle: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: Theme.textMuted },
  sidebarBadge: { fontSize: 9, fontWeight: '800', color: Theme.primary, backgroundColor: 'rgba(26,35,126,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, textTransform: 'uppercase' },
  sidebarSearch: { flexDirection: 'row', alignItems: 'center', margin: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 8 },
  sidebarInput: { flex: 1, fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },
  
  clientRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: Theme.surfaceBorder, backgroundColor: Theme.screenBackground },
  clientRowActive: { backgroundColor: 'rgba(26,35,126,0.03)' },
  clientRowIndicator: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: Theme.primary },
  clientRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  clientName: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: Theme.textPrimaryDark },
  tagApproved: { fontSize: 9, fontWeight: '800', color: '#059669', backgroundColor: 'rgba(5,150,105,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase' },
  tagReceived: { fontSize: 9, fontWeight: '800', color: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase' },
  tagPending: { fontSize: 9, fontWeight: '800', color: '#b45309', backgroundColor: 'rgba(180,83,9,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase' },
  tagSettled: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, backgroundColor: Theme.surfaceBorder, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase' },
  clientRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientBilled: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Theme.borderMedium },
  clientBilledText: { fontSize: 9, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 },

  mobileConfig: { padding: Layout.screenPaddingHorizontal, paddingTop: 16, backgroundColor: Theme.screenBackground, borderBottomWidth: 1, borderBottomColor: Theme.borderLight },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Theme.borderInput, backgroundColor: Theme.cardWhite, marginBottom: 16 },
  selectRowText: { flex: 1, fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  mobileGridArea: { flex: 1, backgroundColor: '#f8f9fa' },

  listHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: Theme.borderLight, backgroundColor: 'rgba(248,250,252,0.3)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listHeaderTitle: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: Theme.textMuted },
  listHeaderSub: { fontSize: 11, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', marginTop: 2 },
  bulkActionBtn: { backgroundColor: Theme.textPrimaryDark, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  bulkActionText: { color: Theme.buttonPrimaryText, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  listFilters: { padding: 16, backgroundColor: Theme.screenBackground, borderBottomWidth: 1, borderBottomColor: Theme.borderLight, flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  searchRow: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  searchInput: { flex: 1, fontSize: 11, fontWeight: '700', color: Theme.textPrimaryDark, padding: 0, margin: 0 },
  
  dateFilterContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateInput: { fontSize: 10, fontWeight: '800', color: Theme.textPrimaryDark, padding: 0, margin: 0, minWidth: 80, textTransform: 'uppercase' },
  dateToText: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, marginHorizontal: 8, textTransform: 'uppercase' },
  
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Theme.borderLight, backgroundColor: 'rgba(248,250,252,0.5)', gap: 12 },
  tableHeaderText: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  
  selectAllGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 24 },
  selectAllCheckbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: Theme.borderMedium, alignItems: 'center', justifyContent: 'center' },

  tripTableRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardWhite, borderBottomWidth: 1, borderBottomColor: Theme.surfaceBorder, paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  tripTableRowSelected: { backgroundColor: 'rgba(26,35,126,0.03)' },
  
  checkBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: Theme.borderMedium, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  
  tripDate: { fontSize: 11, fontWeight: '800', color: Theme.textPrimaryDark },
  tripId: { fontSize: 9, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textMuted, marginTop: 2, textTransform: 'uppercase' },
  tripSupplier: { fontSize: 10, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase' },
  tripRoute: { fontSize: 10, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase', marginBottom: 2 },
  tripDetails: { fontSize: 9, fontWeight: '800', color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tripAmount: { fontSize: 11, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textPrimaryDark },
  tripExtras: { fontSize: 9, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Theme.textMuted },

  listTagPending: { fontSize: 8, fontWeight: '800', color: '#b45309', backgroundColor: 'rgba(180,83,9,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase', borderWidth: 1, borderColor: 'rgba(180,83,9,0.2)' },
  listTagApproved: { fontSize: 8, fontWeight: '800', color: '#059669', backgroundColor: 'rgba(5,150,105,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase', borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)' },
  listTagReceived: { fontSize: 8, fontWeight: '800', color: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)' },
  listTagSettled: { fontSize: 8, fontWeight: '800', color: Theme.textMuted, backgroundColor: Theme.surfaceBorder, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase', borderWidth: 1, borderColor: Theme.borderMedium },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: Theme.textPrimaryDark, marginTop: 12, textTransform: 'uppercase', letterSpacing: 1 },
  
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Layout.screenPaddingHorizontal, paddingTop: 10, backgroundColor: Theme.screenBackground, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  desktopFooter: { position: 'absolute', left: 280, right: 0, bottom: 0, paddingHorizontal: 32, paddingVertical: 16, backgroundColor: Theme.screenBackground, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  footerBtn: { backgroundColor: Theme.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  footerBtnDisabled: { opacity: 0.5 },
  footerBtnText: { color: Theme.buttonPrimaryText, fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: Theme.overlayBackdrop, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Theme.screenBackground, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', margin: 16, color: Theme.textPrimaryDark },
  modalClose: { marginTop: 16, alignItems: 'center', padding: 16 },
  modalCloseText: { fontSize: 16, fontWeight: '700', color: Theme.primary },

  blocked: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', backgroundColor: Theme.screenBackground },
  blockedTitle: { fontSize: 18, fontWeight: '800', color: Theme.textPrimaryDark, marginBottom: 8 },
  blockedBody: { fontSize: 14, color: Theme.textSecondary, marginBottom: 20 },
  blockedBtn: { alignSelf: 'flex-start', backgroundColor: Theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  blockedBtnText: { color: Theme.buttonPrimaryText, fontWeight: '700' },
});
