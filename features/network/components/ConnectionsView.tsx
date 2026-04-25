/**
 * Connections tab — connected orgs (integrated clients + suppliers).
 * LinkedIn-style cards with avatar, role badge, mutual count, actions.
 */
import Theme from '@/constants/Theme';
import { useClientsQuery, useSuppliersQuery } from '@/lib/queries';
import { getInitials } from '@/lib/stringUtils';
import { MessageCircle, Star, Zap } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface ConnectionsViewProps {
  orgId: string;
  onRefresh?: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  CLIENT: '#6366f1',
  SUPPLIER: '#10b981',
};

const ORG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#3b82f6', '#0ea5e9',
];

function orgColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ORG_COLORS.length;
  return ORG_COLORS[h];
}

interface ConnectedOrg {
  id: string;
  name: string;
  role: 'CLIENT' | 'SUPPLIER';
  phone?: string | null;
  linked_organization_id?: string | null;
  is_integrated: boolean;
}

function ConnectionCard({ item }: { item: ConnectedOrg }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const color = orgColor(item.id);
  const roleColor = ROLE_COLORS[item.role] ?? '#6366f1';

  const onPressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View style={styles.cardLeft}>
          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: color + '20' }]}>
            <Text style={[styles.avatarText, { color }]}>{getInitials(item.name)}</Text>
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.orgName} numberOfLines={1}>{item.name.toUpperCase()}</Text>
              {item.is_integrated && (
                <View style={styles.onlineIndicator}>
                  <Zap size={8} color="#10b981" fill="#10b981" />
                </View>
              )}
            </View>
            <View style={styles.metaRow}>
              <View style={[styles.roleBadge, { backgroundColor: roleColor + '18' }]}>
                <Text style={[styles.roleText, { color: roleColor }]}>{item.role}</Text>
              </View>
              {item.is_integrated && (
                <Text style={styles.onApp}>On App</Text>
              )}
            </View>
          </View>
        </View>

        <Pressable style={styles.msgBtn} hitSlop={8}>
          <MessageCircle size={16} color={Theme.primary} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

export function ConnectionsView({ orgId, onRefresh }: ConnectionsViewProps) {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([clientsQ.refetch(), suppliersQ.refetch()]);
    setRefreshing(false);
    onRefresh?.();
  };

  const connections = useMemo<ConnectedOrg[]>(() => {
    const clients: ConnectedOrg[] = ((clientsQ.data ?? []) as {
      id: string;
      name: string;
      phone?: string | null;
      linked_organization_id?: string | null;
      is_integrated?: boolean;
    }[]).map((c) => ({
      id: c.id,
      name: c.name,
      role: 'CLIENT' as const,
      phone: c.phone,
      linked_organization_id: c.linked_organization_id,
      is_integrated: c.is_integrated ?? false,
    }));

    const suppliers: ConnectedOrg[] = ((suppliersQ.data ?? []) as {
      id: string;
      name: string;
      phone?: string | null;
      linked_organization_id?: string | null;
      is_integrated?: boolean;
    }[]).map((s) => ({
      id: s.id,
      name: s.name,
      role: 'SUPPLIER' as const,
      phone: s.phone,
      linked_organization_id: s.linked_organization_id,
      is_integrated: s.is_integrated ?? false,
    }));

    const all = [...clients, ...suppliers].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((c) => c.name.toLowerCase().includes(q));
  }, [clientsQ.data, suppliersQ.data, search]);

  const isLoading = clientsQ.isLoading || suppliersQ.isLoading;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search connections..."
          placeholderTextColor={Theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>{connections.length} connections</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={connections}
          keyExtractor={(item) => `${item.role}-${item.id}`}
          renderItem={({ item }) => <ConnectionCard item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Star size={40} color={Theme.textSecondary} strokeWidth={1} />
              <Text style={styles.emptyTitle}>No connections yet</Text>
              <Text style={styles.emptySubtitle}>Discover and connect with clients & suppliers</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.surface },
  searchBar: {
    margin: 16,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: '500',
  },
  countRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '900', letterSpacing: -0.5 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  orgName: {
    fontSize: 12,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: 0.3,
    flex: 1,
  },
  onlineIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b98118',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  roleText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  onApp: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10b981',
  },
  msgBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
