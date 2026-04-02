/**
 * Milestone detail page — matches reference milestone.tsx levelDetail 100%.
 * Evolution Protocol: Upgrade Distance hero, Gold Path Progress, Next Mile Objectives.
 */
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { TeslaHeader } from '@/components/TeslaHeader';
import { useSafeBack } from '@/lib/useSafeBack';

function getTierData(level: number): { label: string; color: string; nextTier: string; levelsToNext: number; unlock: string } {
  if (level <= 10) return { label: 'SILVER', color: '#94A3B8', nextTier: 'GOLD', levelsToNext: 11 - level, unlock: 'Base Freight Access' };
  if (level <= 20) return { label: 'GOLD', color: '#F59E0B', nextTier: 'PLATINUM', levelsToNext: 21 - level, unlock: 'Priority Load Bidding' };
  if (level <= 30) return { label: 'PLATINUM', color: '#38BDF8', nextTier: 'TITANIUM', levelsToNext: 31 - level, unlock: 'Instant Settlement' };
  return { label: 'TITANIUM', color: '#E11D48', nextTier: 'MAX', levelsToNext: 0, unlock: 'Zero Fee Withdrawals' };
}

type QuestStatus = 'COMPLETED' | 'IN_PROGRESS';
interface Quest {
  id: string;
  title: string;
  desc: string;
  status: QuestStatus;
  xp: number;
  countReq: number;
  countDone: number;
  icon: string;
}

const PROFILE = {
  level: 14,
  xp: 780,
  xpToNext: 1000,
  quests: [
    { id: 'Q1', title: 'Neural Handshake', desc: 'Complete Biometric KYC', status: 'COMPLETED' as QuestStatus, xp: 500, countReq: 1, countDone: 1, icon: 'user' },
    { id: 'Q2', title: 'Fleet Pioneer', desc: 'Add 5 trips to ledger', status: 'IN_PROGRESS' as QuestStatus, xp: 1000, countReq: 5, countDone: 3, icon: 'truck' },
    { id: 'Q3', title: 'Elite Rating', desc: 'Get 10 5-star reviews', status: 'IN_PROGRESS' as QuestStatus, xp: 500, countReq: 10, countDone: 8, icon: 'star' },
    { id: 'Q4', title: 'Chain Verifier', desc: 'Settle 10 Shared Ledgers', status: 'IN_PROGRESS' as QuestStatus, xp: 1500, countReq: 10, countDone: 4, icon: 'refresh' },
  ] as Quest[],
};

const SEGMENTS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const EMERALD = '#10B981';

export default function MilestoneScreen() {
  const insets = useSafeAreaInsets();
  const safeBack = useSafeBack();
  const p = PROFILE;
  const currentTier = getTierData(p.level);
  const xpRemaining = p.xpToNext - p.xp;

  return (
    <View style={styles.outer}>
      <TeslaHeader
        title="Milestone Map"
        subtitle="Evolution Protocol"
        variant="default"
        showBack
        onBack={safeBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Dark hero — Upgrade Distance */}
        <View style={styles.hero}>
          <View style={styles.heroDeco}>
            <FontAwesome name="flag" size={100} color="rgba(255,255,255,0.1)" />
          </View>
          <View style={styles.heroChevron}>
            <FontAwesome name="chevron-up" size={32} color={EMERALD} />
          </View>
          <Text style={styles.heroLabel}>Upgrade Distance</Text>
          <Text style={styles.heroXp}>{xpRemaining} <Text style={styles.heroXpUnit}>XP</Text></Text>
          <Text style={styles.heroDesc}>
            Complete the tasks below to reach Level {p.level + 1} and unlock {currentTier.unlock}.
          </Text>
        </View>

        {/* Gold Path Progress */}
        <Text style={styles.sectionLabel}>Gold Path Progress</Text>
        <View style={styles.segmentsRow}>
          {SEGMENTS.map((s) => (
            <View key={s} style={styles.segmentCol}>
              <View
                style={[
                  styles.segmentBar,
                  s < p.level && styles.segmentBarDone,
                  s === p.level && styles.segmentBarCurrent,
                ]}
              />
              <Text style={[styles.segmentNum, s === p.level && styles.segmentNumCurrent]}>{s}</Text>
            </View>
          ))}
        </View>

        {/* Next Mile Objectives */}
        <View style={styles.objectivesHead}>
          <Text style={styles.objectivesTitle}>Next Mile Objectives</Text>
          <FontAwesome name="crosshairs" size={16} color={Theme.teslaRed} />
        </View>
        <View style={styles.questsList}>
          {p.quests.map((q) => (
            <View
              key={q.id}
              style={[styles.questCard, q.status === 'COMPLETED' && styles.questCardDone]}
            >
              <View style={[styles.questIconWrap, q.status === 'COMPLETED' && styles.questIconWrapDone]}>
                {q.status === 'COMPLETED' ? (
                  <FontAwesome name="check" size={24} color={Theme.textOnPrimary} />
                ) : (
                  <FontAwesome
                    name={(q.icon === 'refresh' ? 'refresh' : q.icon) as 'user' | 'truck' | 'star' | 'refresh'}
                    size={20}
                    color={Theme.textMutedDemo}
                  />
                )}
              </View>
              <View style={styles.questBody}>
                <Text style={[styles.questTitle, q.status === 'COMPLETED' && styles.questTitleDone]}>{q.title}</Text>
                <Text style={styles.questDesc}>{q.desc}</Text>
              </View>
              {q.status === 'COMPLETED' ? (
                <View style={styles.questVerified}>
                  <Text style={styles.questVerifiedText}>VERIFIED</Text>
                </View>
              ) : (
                <View style={styles.questProgressWrap}>
                  <Text style={styles.questCount}>{q.countDone}<Text style={styles.questCountTotal}>/{q.countReq}</Text></Text>
                  <View style={styles.questProgressBg}>
                    <View style={[styles.questProgressFill, { width: `${(q.countDone / q.countReq) * 100}%` }]} />
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.screenBackground },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  hero: {
    backgroundColor: '#0F172A',
    borderRadius: 32,
    padding: 28,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  heroDeco: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 24,
    opacity: 0.2,
  },
  heroChevron: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  heroXp: {
    fontSize: 42,
    fontWeight: '800',
    color: Theme.textOnDark,
    textAlign: 'center',
    letterSpacing: -1,
  },
  heroXpUnit: { fontSize: 14, color: EMERALD },
  heroDesc: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
    letterSpacing: 0.5,
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
  segmentsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  segmentCol: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  segmentBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceLight,
    marginBottom: 8,
  },
  segmentBarDone: { backgroundColor: EMERALD },
  segmentBarCurrent: { backgroundColor: EMERALD, shadowColor: EMERALD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 2 },
  segmentNum: { fontSize: 7, fontWeight: '800', color: Theme.textMutedDemo },
  segmentNumCurrent: { color: EMERALD },
  objectivesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  objectivesTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questsList: { gap: 12 },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    overflow: 'hidden',
  },
  questCardDone: {
    backgroundColor: Theme.positiveMuted,
    borderColor: 'rgba(21,128,61,0.15)',
    opacity: 0.9,
  },
  questIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  questIconWrapDone: {
    backgroundColor: EMERALD,
    borderColor: EMERALD,
  },
  questBody: { flex: 1, minWidth: 0 },
  questTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  questTitleDone: {
    textDecorationLine: 'line-through',
    color: Theme.textSecondary,
  },
  questDesc: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  questVerified: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  questVerifiedText: { fontSize: 8, fontWeight: '800', color: Theme.darkGreen, letterSpacing: 0.5 },
  questProgressWrap: { alignItems: 'flex-end', marginLeft: 8 },
  questCount: { fontSize: 18, fontWeight: '800', color: Theme.textPrimaryDark },
  questCountTotal: { fontSize: 12, fontWeight: '600', color: Theme.textSecondary },
  questProgressBg: {
    width: 64,
    height: 4,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  questProgressFill: { height: '100%', backgroundColor: Theme.teslaRed, borderRadius: 2 },
});
