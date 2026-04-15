import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { getCapabilitiesFromProfile, canAccessClients } from '@/lib/capabilities';
import { useClientsQuery } from '@/lib/queries';
import { useRefreshWithFeedback } from '@/lib/useRefreshWithFeedback';
import { ListScreenLayout } from '@/components/layout/ListScreenLayout';
import { SummaryCard } from '@/components/display/SummaryCard';
import { EntityRow } from '@/components/display/EntityRow';
import { FAB } from '@/components/navigation/FAB';
import { formatRelative } from '@/lib/format';
import { Building2 } from 'lucide-react-native';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';

export default function ClientsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');

  const capabilities = getCapabilitiesFromProfile(
    profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null
  );
  const canAccess = canAccessClients(capabilities);
  const orgId = canAccess ? currentOrganization?.id ?? null : null;

  const { data: clients = [], isLoading: loading, refetch } = useClientsQuery(orgId);
  const { refreshing, onRefresh } = useRefreshWithFeedback(refetch);

  const filtered = search.trim()
    ? clients.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.contact_person || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.phone || '').includes(search)
      )
    : clients;

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>You don't have access to Customers.</Text>
      </View>
    );
  }

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Text style={styles.empty}>
        {loading ? 'Loading…' : 'No customers yet.'}
      </Text>
    </View>
  );

  return (
    <ListScreenLayout
      title="Customers"
      searchPlaceholder="Search Customer"
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={() => {}}
      onExportPress={() => {}}
      onRefresh={onRefresh}
      refreshing={refreshing}
      summaryCard={
        <SummaryCard
          title="You will get"
          leftAmount="₹0"
          leftSubLabel="You will give"
          rightAmount="₹0"
          rightSubLabel="You will get"
          amountColor="red"
        />
      }
      fab={
        <FAB
          label="Add Customer"
          onPress={() => router.push('/(modals)/add-client')}
          LucideIconComponent={Building2}
        />
      }
      listData={filtered}
      listKeyExtractor={(c) => c.id}
      renderListItem={({ item: c }) => (
        <EntityRow
          title={c.name || c.contact_person || 'Unnamed'}
          subtitle={formatRelative(c.updated_at || c.created_at)}
          amount="₹0"
          amountLabel="You'll Get"
          amountColor="red"
          integrationStatus={c.is_integrated ? 'integrated' : 'offline'}
          onPress={() => router.push(`/client/${c.id}`)}
        />
      )}
      ListEmptyComponent={emptyComponent}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: Theme.textSecondary },
  loading: { padding: 24, textAlign: 'center', color: Theme.textSecondary },
  empty: { padding: 24, textAlign: 'center', color: Theme.textSecondary },
  emptyWrap: { padding: 24 },
});
