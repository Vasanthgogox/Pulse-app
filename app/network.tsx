/**
 * Network Registry / Handshake Center — reference layout.
 * Globe icon from Treasury/Trips/Ops opens this screen.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { TeslaHeader } from '@/components/TeslaHeader';
import { useSafeBack } from '@/lib/useSafeBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NetworkFilter = 'ALL' | 'REQUESTS' | 'CLIENT' | 'SUPPLIER' | 'DRIVER';

const NETWORK_TABS: NetworkFilter[] = ['ALL', 'REQUESTS', 'CLIENT', 'SUPPLIER', 'DRIVER'];

type NetworkNode = {
  id: string;
  name: string;
  type: 'CLIENT' | 'SUPPLIER' | 'DRIVER';
  status: 'INTEGRATED' | 'PENDING' | 'OFFLINE';
  direction?: 'SENT' | 'RECEIVED';
};

export default function NetworkScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const insets = useSafeAreaInsets();
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('ALL');
  const [nodes, setNodes] = useState<NetworkNode[]>([]);

  const filtered = nodes.filter((n) => {
    if (networkFilter === 'ALL') return true;
    if (networkFilter === 'REQUESTS') return n.status === 'PENDING';
    return n.type === networkFilter;
  });

  const handleAction = (id: string, action: 'ACCEPT' | 'INVITE' | 'REQUEST') => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        if (action === 'ACCEPT') return { ...n, status: 'INTEGRATED' as const };
        return { ...n, status: 'PENDING' as const, direction: 'SENT' as const };
      })
    );
  };

  const tabIndex = NETWORK_TABS.indexOf(networkFilter);
  const pillWidthPercent = 100 / NETWORK_TABS.length;

  return (
    <View style={styles.container}>
      <View style={styles.darkBlock}>
        <TeslaHeader
          title="Network"
          subtitle="Handshake Center"
          showBack
          onBack={safeBack}
        />
        <View style={styles.pillWrap}>
        <View
          style={[
            styles.pillSlider,
            {
              width: `${pillWidthPercent}%`,
              left: `${tabIndex * pillWidthPercent}%`,
            },
          ]}
        />
        {NETWORK_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={styles.pillTab}
            onPress={() => setNetworkFilter(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillTabText, networkFilter === tab && styles.pillTabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No nodes in this filter.</Text>
        ) : (
          filtered.map((node) => (
            <View key={node.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <View
                  style={[
                    styles.cardIcon,
                    node.status === 'INTEGRATED' && styles.cardIconActive,
                  ]}
                >
                  <FontAwesome
                    name={node.type === 'CLIENT' ? 'building' : node.type === 'SUPPLIER' ? 'cubes' : 'user'}
                    size={18}
                    color={node.status === 'INTEGRATED' ? Theme.buttonPrimaryText : Theme.textMutedDemo}
                  />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName} numberOfLines={1}>{node.name}</Text>
                  <Text style={styles.cardMeta}>{node.type} NODE // UID: {node.id}</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                {node.status === 'PENDING' && (node as { direction?: string }).direction === 'RECEIVED' ? (
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={() => handleAction(node.id, 'ACCEPT')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnPrimaryText}>ACCEPT</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.btnPrimary,
                      node.status === 'PENDING' && styles.btnDisabled,
                    ]}
                    onPress={() =>
                      handleAction(
                        node.id,
                        node.status === 'OFFLINE' ? 'INVITE' : 'REQUEST'
                      )
                    }
                    disabled={node.status === 'PENDING'}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.btnPrimaryText,
                        node.status === 'PENDING' && styles.btnDisabledText,
                      ]}
                    >
                      {node.status === 'OFFLINE'
                        ? 'INVITE'
                        : node.status === 'PENDING'
                          ? 'SENT'
                          : 'HANDSHAKE'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    backgroundColor: Theme.screenBackground,
  },
  darkBlock: {
    backgroundColor: Theme.darkBackground,
    width: '100%',
    minWidth: 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pillWrap: {
    flexDirection: 'row',
    backgroundColor: Theme.surfaceGray,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 8,
    padding: 4,
    borderRadius: 2,
    position: 'relative',
  },
  pillSlider: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  pillTab: { flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  pillTabText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
  },
  pillTabTextActive: { color: Theme.textOnDark },
  list: { flex: 1, width: '100%', minWidth: 0 },
  listContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.screenPaddingHorizontal,
    flexGrow: 1,
    width: '100%',
  },
  empty: {
    textAlign: 'center',
    fontSize: 14,
    color: Theme.textSecondary,
    marginTop: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 2,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardIconActive: { backgroundColor: Theme.buttonPrimary, borderColor: Theme.buttonPrimary },
  cardText: { flex: 1, minWidth: 0 },
  cardName: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  cardMeta: {
    fontSize: 7,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  cardRight: {},
  btnPrimary: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  btnDisabled: { backgroundColor: Theme.surfaceLight },
  btnPrimaryText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  btnDisabledText: { color: Theme.textMutedDemo },
});
