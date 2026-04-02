import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { getCapabilitiesFromProfile, canAccessIndents } from '@/lib/capabilities';
import { getIndentDisplayNumber, type IndentRow } from '@/features/indents';
import { useIndentsQuery } from '@/lib/queries';
import { useRefreshWithFeedback } from '@/lib/useRefreshWithFeedback';
import { ListScreenLayout } from '@/components/ListScreenLayout';
import { SummaryCard } from '@/components/SummaryCard';
import { EntityRow } from '@/components/EntityRow';
import { FAB } from '@/components/FAB';
import { formatINR } from '@/lib/format';
import { Package } from 'lucide-react-native';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';

export default function IndentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');

  const capabilities = getCapabilitiesFromProfile(
    profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null
  );
  const canAccess = canAccessIndents(capabilities);
  const orgId = canAccess ? currentOrganization?.id ?? null : null;

  const { data: indents = [], isLoading: loading, refetch } = useIndentsQuery(orgId);
  const { refreshing, onRefresh } = useRefreshWithFeedback(refetch);

  const filtered = search.trim()
    ? indents.filter(
        (i) =>
          getIndentDisplayNumber(i).toLowerCase().includes(search.toLowerCase()) ||
          i.client_name?.toLowerCase().includes(search.toLowerCase()) ||
          i.pickup_area?.toLowerCase().includes(search.toLowerCase()) ||
          i.drop_location?.toLowerCase().includes(search.toLowerCase())
      )
    : indents;

  const totalValue = indents.reduce((s, i) => s + Number(i.client_price || 0), 0);
  const pending = indents.filter((i) => i.status !== 'completed' && i.status !== 'cancelled').length;

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>You don't have access to Indents.</Text>
      </View>
    );
  }

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Text style={styles.empty}>{loading ? 'Loading…' : 'No indents yet.'}</Text>
    </View>
  );

  return (
    <ListScreenLayout
      title="Indents"
      searchPlaceholder="Search indent or client"
      searchValue={search}
      onSearchChange={setSearch}
      onRefresh={onRefresh}
      refreshing={refreshing}
      summaryCard={
        <SummaryCard
          title="Indents summary"
          leftAmount={String(pending)}
          leftSubLabel="Pending"
          rightAmount={formatINR(totalValue)}
          rightSubLabel="Total value"
          amountColor="green"
        />
      }
      fab={
        <FAB
          label="Add Indent"
          onPress={() => router.push('/create-indent' as import('expo-router').Href)}
          LucideIconComponent={Package}
        />
      }
      listData={filtered}
      listKeyExtractor={(i) => i.id}
      renderListItem={({ item: i }) => (
        <EntityRow
          title={getIndentDisplayNumber(i)}
          subtitle={`${i.pickup_area} → ${i.drop_location} • ${i.client_name}`}
          amount={formatINR(i.client_price)}
          amountLabel={i.status}
          onPress={() => router.push(`/indent/${i.id}` as import('expo-router').Href)}
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
