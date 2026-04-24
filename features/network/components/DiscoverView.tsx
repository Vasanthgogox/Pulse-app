/**
 * Discover tab — search all organizations and send connection requests.
 * LinkedIn-style connect flow with pending/connected status indicators.
 */
import Theme from '@/constants/Theme';
import { discoverOrganizations, type DiscoverOrg } from '@/features/network/services/discover.service';
import { createConnectionRequest } from '@/services/connectionRequestsService';
import { getInitials } from '@/lib/stringUtils';
import { Check, Globe, Loader, Search, Send, UserCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface DiscoverViewProps {
  orgId: string;
}

const ORG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899',
  '#f43f5e', '#f59e0b', '#10b981', '#3b82f6',
];

function orgColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ORG_COLORS.length;
  return ORG_COLORS[h];
}

interface OrgCardProps {
  org: DiscoverOrg;
  onConnect: (org: DiscoverOrg) => void;
  connecting: boolean;
}

function OrgCard({ org, onConnect, connecting }: OrgCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const color = orgColor(org.id);

  const onPressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const status = org.connection_status;
  const isConnected = status === 'approved';
  const isPending = status === 'pending';

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <View style={[styles.cardAvatar, { backgroundColor: color + '18' }]}>
        <Text style={[styles.cardAvatarText, { color }]}>{getInitials(org.name)}</Text>
      </View>

      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{org.name.toUpperCase()}</Text>
        <View style={styles.statusRow}>
          {isConnected && (
            <View style={styles.connectedBadge}>
              <UserCheck size={10} color="#10b981" />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          )}
          {isPending && (
            <View style={styles.pendingBadge}>
              <Loader size={10} color="#f59e0b" />
              <Text style={styles.pendingText}>Pending</Text>
            </View>
          )}
        </View>
      </View>

      {!isConnected && !isPending ? (
        <Pressable
          style={[styles.connectBtn, connecting && styles.connectBtnDisabled]}
          onPress={() => onConnect(org)}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator size={12} color="#fff" />
          ) : (
            <>
              <Send size={12} color="#fff" />
              <Text style={styles.connectBtnText}>Connect</Text>
            </>
          )}
        </Pressable>
      ) : isConnected ? (
        <View style={styles.connectedIndicator}>
          <Check size={16} color="#10b981" strokeWidth={3} />
        </View>
      ) : (
        <View style={[styles.connectBtn, styles.pendingBtn]}>
          <Text style={[styles.connectBtnText, { color: '#f59e0b' }]}>Pending</Text>
        </View>
      )}
    </Animated.View>
  );
}

export function DiscoverView({ orgId }: DiscoverViewProps) {
  const [search, setSearch] = useState('');
  const [orgs, setOrgs] = useState<DiscoverOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      const { orgs: results } = await discoverOrganizations(orgId, q, 30, 0);
      setOrgs(results);
      setLoading(false);
    },
    [orgId],
  );

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => load(search), 350);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search, load]);

  const handleConnect = async (org: DiscoverOrg) => {
    setConnecting(org.id);
    await createConnectionRequest(orgId, org.id, {
      requestShipperClient: true,
      requestCarrierSupplier: false,
    });
    setOrgs((prev) =>
      prev.map((o) => (o.id === org.id ? { ...o, connection_status: 'pending' } : o)),
    );
    setConnecting(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Search size={16} color={Theme.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search organizations by name..."
          placeholderTextColor={Theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.sectionHeader}>
        <Globe size={12} color={Theme.textSecondary} />
        <Text style={styles.sectionLabel}>GLOBAL NETWORK</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrgCard
              org={item}
              onConnect={handleConnect}
              connecting={connecting === item.id}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Globe size={40} color={Theme.textSecondary} strokeWidth={1} />
              <Text style={styles.emptyTitle}>
                {search ? 'No results found' : 'Search to discover'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {search
                  ? 'Try a different name or location'
                  : 'Find clients, suppliers, and partners across the country'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.surface },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { opacity: 0.6 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 1,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: { fontSize: 14, fontWeight: '900', letterSpacing: -0.5 },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 12,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#10b98118',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  connectedText: { fontSize: 9, fontWeight: '800', color: '#10b981' },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f59e0b18',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pendingText: { fontSize: 9, fontWeight: '800', color: '#f59e0b' },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    justifyContent: 'center',
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  connectedIndicator: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#10b98112',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBtn: {
    backgroundColor: '#f59e0b18',
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
    lineHeight: 20,
  },
});
