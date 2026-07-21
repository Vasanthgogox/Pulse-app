import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { canAccessClients } from '@/lib/capabilities';
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useClientsQuery } from '@/lib/queries/useClientsQuery';
import { useRefreshWithFeedback } from '@/lib/useRefreshWithFeedback';
import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { ListScreenLayout } from '@/components/ListScreenLayout';
import { SummaryCard } from '@/components/SummaryCard';
import { EntityRow } from '@/components/EntityRow';
import { FAB } from '@/components/FAB';
import { formatRelative } from '@/lib/format';
import { Building2 } from 'lucide-react-native';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';

export default function ClientsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const [search, setSearch] = useState('');

  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAccess =
    canAccessClients(capabilities) && canSurface("sales.clients.view");
  const canCreateClient = canSurface("sales.clients.create");
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

  if (loading && clients.length === 0) {
    return <AppLoadingSplash variant="preparing" />;
  }

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Text style={styles.empty}>No customers yet.</Text>
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
        canCreateClient ? (
          <FAB
            label="Add Customer"
            onPress={() => router.push('/(modals)/add-client')}
            LucideIconComponent={Building2}
          />
        ) : undefined
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
