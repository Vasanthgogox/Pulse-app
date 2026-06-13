/**
 * Driver level progression — matches user profile / User Profile design:
 * Dark Elite Evolution card, 2x2 stats grid, Next Mile Objectives with VERIFIED and progress bars.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Theme from '@/constants/Theme';
import { LEVELS_CONFIG } from '@/constants/DriverLevels';
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { supabase } from '@/lib/supabase';


const DARK_HERO_BG = '#0f0f0f';
const DARK_CARD_BORDER = 'rgba(255,255,255,0.06)';

/** Icon name per level type for Next Mile Objectives. */
function getLevelIcon(type: string): 'user' | 'truck' | 'id-card' | 'star' {
  if (type === 'trips') return 'truck';
  if (type === 'ratings') return 'star';
  if (type === 'verification') return 'id-card';
  return 'user';
}

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

export default function LevelProgressionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  };
  const { profile } = useAuth();
  const [tripsCount, setTripsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback((showLoading = true) => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    driversService.getLinkedDriversForCurrentUser(profile.uid).then((res) => {
      // Experience is cumulative — include ALL driver rows (including left fleets).
      const drivers = res.drivers ?? [];
      if (drivers.length > 0) {
        tripsService.getTripsByDriverIds(drivers.map((d) => d.id)).then((tRes) => {
          const list = tRes.trips ?? [];
          setTripsCount(list.filter((t) => isCompleted(t.status)).length);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload when screen comes back into focus (e.g. after returning from another screen).
  useFocusEffect(useCallback(() => {
    load(false);
  }, [load]));

  // Supabase Realtime: re-fetch trips count whenever any of the driver's trips change.
  useEffect(() => {
    const client = supabase();
    if (!client) return;
    const channel = client
      .channel('level-progression-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        () => { load(false); },
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  const currentLevel = Math.min(1 + Math.floor(tripsCount / 2), 8);
  const currentLevelConfig = LEVELS_CONFIG.find((l) => l.level === currentLevel) ?? LEVELS_CONFIG[0];
  const nextLevelConfig = LEVELS_CONFIG.find((l) => l.level === currentLevel + 1);

  // Elite Evolution progress: trips (e.g. 6 / 10) when next level is trip-based
  const nextTarget = nextLevelConfig?.type === 'trips' ? nextLevelConfig.target : 0;
  const progressCurrent = nextTarget > 0 ? Math.min(tripsCount, nextTarget) : 0;
  const progressTotal = nextTarget > 0 ? nextTarget : 1;
  const progressPct = nextTarget > 0 ? Math.min(100, Math.floor((tripsCount / nextTarget) * 100)) : 0;

  // Road to [next tier] label
  const roadToLabel = nextLevelConfig
    ? `ROAD TO LEVEL ${nextLevelConfig.level}`
    : `${currentLevelConfig.tier.toUpperCase()} MAX`;

  if (loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.driverPrimary} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="Your level" onBack={handleBack} backAccessibilityLabel="Back to profile" />

      <ScrollView
        style={[styles.container, { backgroundColor: pageBg }]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 16,
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: insets.bottom + 80,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
      {/* Elite Evolution — dark card (same as user profile) */}
      <View style={[styles.eliteCard, Platform.OS === 'ios' ? styles.eliteCardShadowIos : styles.eliteCardShadowAndroid]}>
        <View style={[styles.cardDeco, { pointerEvents: 'none' }]}>
          <FontAwesome name="star" size={72} color="rgba(255,255,255,0.12)" />
        </View>
        <Text style={styles.eliteLabel}>Elite Evolution</Text>
        <Text style={styles.eliteTitle}>{roadToLabel}</Text>
        <View style={styles.eliteXpRow}>
          <Text style={styles.eliteXpValue}>
            {progressCurrent} / {progressTotal}
          </Text>
          <Text style={styles.eliteXpLabel}>XP Progress</Text>
        </View>
        <View style={styles.xpBarBg}>
          <View style={[styles.xpBarFill, { width: `${Math.max(progressPct, 2)}%` }]} />
        </View>
        <Text style={styles.eliteStatus}>Status: Active · Milestone Tracker</Text>
      </View>

      {/* Stats grid — Safety, Reliability, Trips Logged, XP Level (same as user profile) */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statCardDeco, { pointerEvents: 'none' }]}>
            <FontAwesome name="shield" size={56} color={colors.emerald ? `${colors.emerald}20` : 'rgba(21,128,61,0.12)'} />
          </View>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Safety Score</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.text }]}>—</Text>
            <FontAwesome name="shield" size={14} color={Theme.darkGreen} />
          </View>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statCardDeco, { pointerEvents: 'none' }]}>
            <FontAwesome name="line-chart" size={56} color={colors.emerald ? `${colors.emerald}20` : 'rgba(21,128,61,0.12)'} />
          </View>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Reliability</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.text }]}>—</Text>
            <FontAwesome name="line-chart" size={14} color={Theme.darkGreen} />
          </View>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statCardDeco, { pointerEvents: 'none' }]}>
            <FontAwesome name="trophy" size={56} color="rgba(217,119,6,0.14)" />
          </View>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Trips Logged</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.text }]}>{tripsCount}</Text>
            <FontAwesome name="trophy" size={14} color="#d97706" />
          </View>
        </View>
        <View style={[styles.statCard, styles.statCardDark]}>
          <View style={[styles.statCardDecoDark, { pointerEvents: 'none' }]}>
            <FontAwesome name="star" size={56} color="rgba(255,255,255,0.12)" />
          </View>
          <Text style={styles.statLabelDark}>XP Level</Text>
          <View style={styles.statRow}>
            <Text style={styles.statValueDark}>{currentLevel}</Text>
            <FontAwesome name="star" size={14} color={Theme.darkGreen} />
          </View>
        </View>
      </View>

      {/* Next Mile Objectives — same card layout as user profile */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Next Mile Objectives</Text>
      <View style={styles.questsList}>
        {LEVELS_CONFIG.map((lvl) => {
          const completed = lvl.level < currentLevel;
          const inProgress = lvl.level === currentLevel;
          const countDone = lvl.type === 'trips' ? Math.min(tripsCount, lvl.target) : (completed ? lvl.target : 0);
          const countReq = lvl.target;
          const progressPctObj = inProgress && countReq > 0 ? Math.min(100, Math.floor((countDone / countReq) * 100)) : 0;
          const iconName = getLevelIcon(lvl.type);
          return (
            <View
              key={lvl.level}
              style={[
                styles.questCard,
                { backgroundColor: colors.surface ?? Theme.screenBackground, borderColor: colors.border ?? Theme.borderLight },
                completed && styles.questCardDone,
              ]}
            >
              <View style={[styles.questCardDeco, { pointerEvents: 'none' }]}>
                <FontAwesome
                  name={iconName}
                  size={48}
                  color={completed ? 'rgba(21,128,61,0.1)' : 'rgba(0,0,0,0.06)'}
                />
              </View>
              <View style={[styles.questIconWrap, completed && styles.questIconWrapDone]}>
                {completed ? (
                  <FontAwesome name="check" size={20} color={Theme.textOnPrimary} />
                ) : (
                  <FontAwesome
                    name={iconName}
                    size={18}
                    color={colors.textMuted ?? Theme.textMutedDemo}
                  />
                )}
              </View>
              <View style={styles.questBody}>
                <Text style={[styles.questTitle, { color: colors.text }, completed && styles.questTitleDone]}>
                  {lvl.name.toUpperCase()}
                </Text>
                <Text style={[styles.questDesc, { color: colors.textMuted }]}>{lvl.goalText.toUpperCase()}</Text>
              </View>
              {completed ? (
                <View style={styles.questVerified}>
                  <Text style={styles.questVerifiedText}>VERIFIED</Text>
                </View>
              ) : inProgress ? (
                <View style={styles.questProgressWrap}>
                  <Text style={[styles.questCount, { color: colors.text }]}>
                    {countDone}
                    <Text style={[styles.questCountTotal, { color: colors.textMuted }]}>/{countReq}</Text>
                  </Text>
                  <View style={styles.questProgressBg}>
                    <View style={[styles.questProgressFill, { width: `${progressPctObj}%` }]} />
                  </View>
                </View>
              ) : (
                <View style={styles.questProgressWrap}>
                  <Text style={[styles.questCount, { color: colors.textMuted }]}>
                    0<Text style={[styles.questCountTotal, { color: colors.textMuted }]}>/{countReq}</Text>
                  </Text>
                  <View style={styles.questProgressBg}>
                    <View style={[styles.questProgressFill, { width: '0%' }]} />
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {},
  // Elite Evolution (dark card — same as user profile)
  eliteCard: {
    backgroundColor: DARK_HERO_BG,
    borderRadius: 28,
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: DARK_CARD_BORDER,
  },
  eliteCardShadowIos: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  eliteCardShadowAndroid: { elevation: 8 },
  cardDeco: {
    position: 'absolute',
    top: 8,
    right: 8,
    opacity: 1,
  },
  eliteLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  eliteTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  eliteXpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  eliteXpValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
  eliteXpLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  xpBarBg: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: Theme.screenBackground,
    borderRadius: 3,
  },
  eliteStatus: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Stats grid (same as user profile)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    width: '47%',
    padding: 20,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  statCardDeco: {
    position: 'absolute',
    top: 8,
    right: 8,
    opacity: 1,
  },
  statCardDark: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  statCardDecoDark: {
    position: 'absolute',
    top: 8,
    right: 8,
    opacity: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statLabelDark: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statValueDark: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },

  // Next Mile Objectives (same as user profile)
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  questsList: { marginBottom: 24 },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 20,
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  questCardDeco: {
    position: 'absolute',
    top: 8,
    right: 12,
    opacity: 1,
  },
  questCardDone: {
    backgroundColor: Theme.positiveMuted,
    borderColor: 'rgba(21,128,61,0.2)',
  },
  questIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  questIconWrapDone: {
    backgroundColor: Theme.darkGreen,
  },
  questBody: { flex: 1, minWidth: 0 },
  questTitle: {
    fontSize: 13,
    fontWeight: '800',
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
    textTransform: 'uppercase',
    marginTop: 2,
  },
  questVerified: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  questVerifiedText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.darkGreen,
    letterSpacing: 0.5,
  },
  questProgressWrap: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  questCount: {
    fontSize: 16,
    fontWeight: '800',
  },
  questCountTotal: {
    fontSize: 12,
    fontWeight: '600',
  },
  questProgressBg: {
    width: 56,
    height: 4,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  questProgressFill: {
    height: '100%',
    backgroundColor: Theme.teslaRed,
    borderRadius: 2,
  },
});
