/**
 * Network user detail view — matches reference milestone.tsx publicProfile 100%.
 * Pilot Node: avatar, tier badge, stats (Safety, Trips), Neural Status, Establish Link.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { TeslaHeader } from '@/components/TeslaHeader';
import { useSafeBack } from '@/lib/useSafeBack';

function getTierData(level: number): { label: string; color: string; bg: string; border: string } {
  if (level <= 10) return { label: 'SILVER', color: '#94A3B8', bg: '#94A3B8', border: '#cbd5e1' };
  if (level <= 20) return { label: 'GOLD', color: '#F59E0B', bg: '#F59E0B', border: '#fbbf24' };
  if (level <= 30) return { label: 'PLATINUM', color: '#38BDF8', bg: '#38BDF8', border: '#7dd3fc' };
  return { label: 'TITANIUM', color: '#E11D48', bg: '#E11D48', border: '#fb7185' };
}

const EMERALD = '#10B981';

export default function NetworkUserScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeBack = useSafeBack();
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    type: string;
    region?: string;
    level?: string;
    safetyScore?: string;
    totalTrips?: string;
  }>();

  const id = params.id ?? 'N/A';
  const name = (params.name ?? 'Unknown').toUpperCase();
  const region = params.region ?? '—';
  const level = Math.min(30, Math.max(1, parseInt(params.level ?? '10', 10) || 10));
  const safetyScore = params.safetyScore ?? '—';
  const totalTrips = params.totalTrips ?? '—';
  const tier = getTierData(level);
  const avatarSeed = encodeURIComponent(name || id);

  const handleEstablishLink = () => {
    // Could show toast "SYNC REQUESTED" like reference
    safeBack();
  };

  return (
    <View style={styles.outer}>
      <TeslaHeader
        title="Pilot Node"
        subtitle="Public Tactical Data"
        variant="default"
        showBack
        onBack={safeBack}
        onNotificationClick={() => router.push("/notifications")}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + tier badge */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarWrap, { borderColor: tier.border }]}>
            <Image
              source={{ uri: `https://api.dicebear.com/7.x/avataaars/png?seed=${avatarSeed}` }}
              style={styles.avatar}
            />
          </View>
          <View style={[styles.levelBadge, { backgroundColor: tier.bg }]}>
            <Text style={styles.levelBadgeText}>LVL {level}</Text>
          </View>
        </View>

        <View style={styles.nameBlock}>
          <Text style={styles.nameText}>{name}</Text>
          <Text style={styles.idText}>{id}</Text>
        </View>

        {/* Stats grid — Safety Rating, Verified Trips */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <FontAwesome name="shield" size={28} color={EMERALD} style={styles.statIcon} />
            <Text style={styles.statValue}>{safetyScore === '—' ? '—' : `${safetyScore}%`}</Text>
            <Text style={styles.statLabel}>Safety Rating</Text>
          </View>
          <View style={styles.statCard}>
            <FontAwesome name="trophy" size={28} color="#F59E0B" style={styles.statIcon} />
            <Text style={styles.statValue}>{totalTrips}</Text>
            <Text style={styles.statLabel}>Verified Trips</Text>
          </View>
        </View>

        {/* Neural Status */}
        <Text style={styles.sectionLabel}>Neural Status</Text>
        <View style={styles.neuralCard}>
          <View style={styles.neuralRow}>
            <Text style={styles.neuralKey}>Region Lock</Text>
            <Text style={styles.neuralVal}>{region}</Text>
          </View>
          <View style={[styles.neuralRow, styles.neuralRowBorder]}>
            <Text style={styles.neuralKey}>Account Rank</Text>
            <Text style={[styles.neuralVal, { color: tier.color }]}>{tier.label} ELITE</Text>
          </View>
          <View style={[styles.neuralRow, styles.neuralRowBorder]}>
            <Text style={styles.neuralKey}>Verification</Text>
            <View style={styles.neuralActive}>
              <FontAwesome name="check-circle" size={14} color={EMERALD} />
              <Text style={styles.neuralActiveText}>Active</Text>
            </View>
          </View>
        </View>

        {/* Establish Link */}
        <TouchableOpacity
          style={styles.establishBtn}
          onPress={handleEstablishLink}
          activeOpacity={0.9}
        >
          <FontAwesome name="user-plus" size={20} color={Theme.textOnPrimary} />
          <Text style={styles.establishBtnText}>Establish Link</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.surface },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarWrap: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    overflow: 'hidden',
    backgroundColor: Theme.screenBackground,
  },
  avatar: { width: '100%', height: '100%' },
  levelBadge: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    marginLeft: -40,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
  },
  nameBlock: { alignItems: 'center', marginBottom: 24 },
  nameText: {
    fontSize: 28,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  idText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 20,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    alignItems: 'center',
  },
  statIcon: { marginBottom: 12 },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  neuralCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },
  neuralRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  neuralRowBorder: { borderTopWidth: 1, borderTopColor: Theme.borderLight, marginTop: 8, paddingTop: 12 },
  neuralKey: { fontSize: 11, fontWeight: '800', color: Theme.textSecondary, textTransform: 'uppercase' },
  neuralVal: { fontSize: 11, fontWeight: '800', color: Theme.textPrimaryDark, textTransform: 'uppercase' },
  neuralActive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  neuralActiveText: { fontSize: 11, fontWeight: '800', color: EMERALD, textTransform: 'uppercase' },
  establishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    backgroundColor: EMERALD,
    borderRadius: 20,
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  establishBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
