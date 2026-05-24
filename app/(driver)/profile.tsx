/**
 * Driver Profile — hero, fleet vehicle, levels, KYC shortcut to documents (single upload hub).
 */
import { LEVELS_CONFIG } from '@/constants/DriverLevels';
import { useAvatar } from '@/lib/useAvatar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { EditProfileModal } from '@/features/auth/components/EditProfileModal';
import {
  averageScore,
  getRatingsForDriver,
} from '@/features/ratings/services/ratings.service';
import type { RatingRow } from '@/features/ratings/types';
import { useLayoutInsets } from '@/lib/layoutInsets';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import * as driversService from '@/services/driversService';
import * as tripsService from '@/services/tripsService';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
    Camera,
    ChevronLeft,
    ChevronRight,
    Crown,
    Dna,
    Edit3,
    Fuel,
    Gauge,
    History,
    LogOut,
    Milestone,
    Quote,
    Share2,
    Shield,
    Star,
    Thermometer,
    Trophy,
    Truck,
    UserPlus,
    Wrench
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

const SCREEN_PAD = Layout.screenPaddingHorizontal;

/** Reference palette — heroes stay slate-900 for brand match; page bg uses theme. */
const SLATE_900 = '#0f172a';
const SLATE_50 = '#f8fafc';
const AMBER_400 = '#fbbf24';
const AMBER_500 = '#f59e0b';

type ProfileView = 'main' | 'vehicle' | 'levels';

const CAREER_ROADMAP = [
  { tier: 'Rookie', minTrips: 0, dot: Theme.driverEmerald },
  { tier: 'Pro', minTrips: 200, dot: '#3b82f6' },
  { tier: 'Veteran', minTrips: 1000, dot: AMBER_500 },
  { tier: 'Elite', minTrips: 2500, dot: '#9333ea' },
  { tier: 'Legend', minTrips: 5000, dot: Theme.driverEmeraldDark },
] as const;

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

function formatShortDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const { user, profile, signOut, refreshSession } = useAuth();
  const { avatarSeed, setAvatarSeed } = useDriverAvatar();
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [profileView, setProfileView] = useState<ProfileView>('main');
  const [drivers, setDrivers] = useState<driversService.DriverRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [driverRatings, setDriverRatings] = useState<RatingRow[]>([]);
  const [loadingDriverRatings, setLoadingDriverRatings] = useState(false);
  const [kycUploadedCount, setKycUploadedCount] = useState(0);

  const displayName =
    profile?.full_name?.trim() ||
    profile?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    'Pilot';

  const { imageUri: displayAvatarUri, initials: displayAvatarInitials, initialsColor: displayAvatarColor } = useAvatar({
    type: 'driver',
    name: displayName,
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_seed?.trim() || avatarSeed,
  });

  const loadTrips = useCallback(() => {
    if (!profile?.uid) {
      setLoadingTrips(false);
      return;
    }
    setLoadingTrips(true);
    driversService
      .getLinkedDriversForCurrentUser(profile.uid)
      .then((res) => {
        // All driver rows (including left fleets) — experience is cumulative.
        const allRows = res.drivers ?? [];
        setDrivers(allRows.filter((d) => !d.left_at)); // UI fleet display: active only
        if (allRows.length === 0) {
          setTrips([]);
          setLoadingTrips(false);
          return;
        }
        return tripsService.getTripsByDriverIds(allRows.map((d) => d.id)).then((tRes) => {
          setTrips(tRes.trips ?? []);
        });
      })
      .catch(() => {
        setTrips([]);
        setDrivers([]);
      })
      .finally(() => {
        setLoadingTrips(false);
      });
  }, [profile?.uid]);

  const loadKycSummary = useCallback(async () => {
    if (!profile?.uid) {
      setKycUploadedCount(0);
      return;
    }
    try {
      const {
        data: { user: authUser },
      } = await supabase().auth.getUser();
      const metadata =
        authUser?.user_metadata &&
        typeof authUser.user_metadata === 'object' &&
        authUser.user_metadata.driver_documents &&
        typeof authUser.user_metadata.driver_documents === 'object'
          ? (authUser.user_metadata.driver_documents as Record<string, unknown>)
          : {};

      const { data: profileRow } = await supabase()
        .from('profiles')
        .select('license_photo_url')
        .eq('id', profile.uid)
        .maybeSingle();
      const { data: storageItems } = await supabase()
        .storage
        .from('driver-documents')
        .list(profile.uid, { limit: 100 });
      const hasStoragePrefix = (prefix: string) =>
        (storageItems ?? []).some((item) => (item.name ?? '').toLowerCase().startsWith(prefix));

      const license = (profileRow as { license_photo_url?: string | null } | null)?.license_photo_url
        ?? (typeof metadata.license === 'string' ? metadata.license : null)
        ?? (hasStoragePrefix('license-') ? 'present' : null);
      const aadhaar =
        (typeof metadata.aadhaar === 'string' ? metadata.aadhaar : null)
        ?? (hasStoragePrefix('aadhaar-') ? 'present' : null);
      const pan =
        (typeof metadata.pan === 'string' ? metadata.pan : null)
        ?? (hasStoragePrefix('pan-') ? 'present' : null);

      const uploaded = [license, aadhaar, pan].filter((x) => Boolean((x ?? '').trim())).length;
      setKycUploadedCount(uploaded);
    } catch {
      setKycUploadedCount(0);
    }
  }, [profile?.uid]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useFocusEffect(useCallback(() => {
    loadTrips();
  }, [loadTrips]));

  useEffect(() => {
    const client = supabase();
    if (!client) return;
    const channel = client
      .channel('driver-profile-trips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        loadTrips();
      })
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [loadTrips]);

  useEffect(() => {
    void loadKycSummary();
  }, [loadKycSummary]);

  const tripsCount = useMemo(() => trips.filter((t) => isCompleted(t.status)).length, [trips]);

  const primaryDriverId = drivers[0]?.id ?? null;

  useEffect(() => {
    if (!primaryDriverId) {
      setDriverRatings([]);
      setLoadingDriverRatings(false);
      return;
    }
    let cancelled = false;
    setLoadingDriverRatings(true);
    void getRatingsForDriver(primaryDriverId)
      .then((res) => {
        if (cancelled) return;
        setDriverRatings(res.error ? [] : (res.ratings ?? []));
      })
      .catch(() => {
        if (!cancelled) setDriverRatings([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDriverRatings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [primaryDriverId]);

  const driverRatingAvg = useMemo(() => averageScore(driverRatings), [driverRatings]);
  const driverRatingCount = driverRatings.length;

  /** Same heuristic as `level-progression.tsx` for consistency across driver UI. */
  const currentLevel = useMemo(() => Math.min(1 + Math.floor(tripsCount / 2), 8), [tripsCount]);

  const currentLevelConfig = LEVELS_CONFIG.find((l) => l.level === currentLevel) ?? LEVELS_CONFIG[0];
  const nextLevelConfig = LEVELS_CONFIG.find((l) => l.level === currentLevel + 1);

  const experiencePct = useMemo(() => {
    const nextTarget = nextLevelConfig?.type === 'trips' ? nextLevelConfig.target : 0;
    if (nextTarget > 0) return Math.min(100, Math.floor((tripsCount / nextTarget) * 100));
    return nextLevelConfig ? 0 : 100;
  }, [nextLevelConfig, tripsCount]);

  const primaryDriver = drivers[0] ?? null;

  let activeRoadIdx = 0;
  for (let i = CAREER_ROADMAP.length - 1; i >= 0; i--) {
    if (tripsCount >= CAREER_ROADMAP[i].minTrips) {
      activeRoadIdx = i;
      break;
    }
  }
  const nextRoad = CAREER_ROADMAP[activeRoadIdx + 1];
  const tierProgressPct = nextRoad
    ? Math.min(
        100,
        Math.round(
          ((tripsCount - CAREER_ROADMAP[activeRoadIdx].minTrips) /
            Math.max(1, nextRoad.minTrips - CAREER_ROADMAP[activeRoadIdx].minTrips)) *
            100,
        ),
      )
    : 100;

  const vehicleDisplay = {
    model: 'Fleet vehicle',
    plate: primaryDriver ? 'Tap for details' : '—',
    fleetId: primaryDriver?.organization_id?.slice(0, 8)?.toUpperCase() ?? 'FLEET',
    assignedOn: formatShortDate(primaryDriver?.created_at),
    supervisor: 'Fleet supervisor',
    odometer: '—',
    fuel: '—',
    engineTemp: '—',
    specs: [
      { label: 'Engine', value: '—' },
      { label: 'Power', value: '—' },
      { label: 'Torque', value: '—' },
      { label: 'GVW', value: '—' },
    ] as { label: string; value: string }[],
    health: [
      { label: 'Tire pressure', value: 'OK', color: Theme.driverEmerald },
      { label: 'Brake lining', value: '—', color: Theme.driverEmerald },
      { label: 'Oil life', value: '—', color: '#f43f5e' },
    ] as { label: string; value: string; color: string }[],
  };

  const handleBack = () => {
    if (profileView !== 'main') {
      setProfileView('main');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)');
  };

  const buildDriverInviteUrl = () => {
    const base = 'https://q-web.netlify.app/invite';
    const ref = profile?.uid;
    return ref ? `${base}?ref=${ref}` : base;
  };

  const handleShareProfile = () => {
    Share.share({
      message: `${displayName} — Q Driver profile`,
      title: 'Share profile',
    }).catch(() => {});
  };

  const handleInviteDrivers = () => {
    const inviteUrl = buildDriverInviteUrl();
    const message =
      `Join me on Q Driver! Manage trips, payouts, and network requests.\n\n` +
      `Sign up here: ${inviteUrl}`;
    Share.share({
      title: 'Join Q Driver',
      message,
      url: inviteUrl,
    }).catch(() => {});
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace(ROUTES.SIGN_IN_DIRECT);
  };

  const pageBg = isDark ? colors.background : SLATE_50;
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)';
  const muted = colors.textMuted;

  const LevelView = () => (
    <View style={styles.subPage}>
      <View style={styles.subHeaderRow}>
        <TouchableOpacity style={[styles.iconPill, { borderColor: cardBorder, backgroundColor: colors.surface }]} onPress={() => setProfileView('main')}>
          <ChevronLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.subTitle, { color: colors.text }]}>EXPERIENCE ROADMAP</Text>
      </View>

      <View style={styles.heroDark}>
        <View style={styles.heroWatermark}>
          <Milestone size={120} color="rgba(255,255,255,0.06)" />
        </View>
        <View style={styles.rankRow}>
          <LinearGradient colors={[AMBER_500, '#d97706']} style={styles.crownBox}>
            <Crown size={28} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.heroEyebrowGold}>CURRENT RANK</Text>
            <Text style={styles.heroRankTitle}>{CAREER_ROADMAP[activeRoadIdx].tier}</Text>
          </View>
        </View>

        <View style={styles.roadLineWrap}>
          <View style={styles.roadLine} />
          {CAREER_ROADMAP.map((step, i) => {
            const active = i === activeRoadIdx;
            const past = i < activeRoadIdx;
            return (
              <View key={step.tier} style={styles.roadStep}>
                <View
                  style={[
                    styles.roadDot,
                    { borderColor: SLATE_900 },
                    active && { backgroundColor: AMBER_400 },
                    past && !active && { backgroundColor: Theme.driverEmerald },
                    !past && !active && { backgroundColor: '#475569' },
                  ]}
                />
                <View style={[styles.roadCard, active ? styles.roadCardActive : styles.roadCardMuted]}>
                  <View style={styles.roadCardTop}>
                    <Text style={styles.roadTier}>{step.tier}</Text>
                    <Text style={styles.roadMin}>{step.minTrips}+ trips</Text>
                  </View>
                  {active && nextRoad ? (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.roadProgLabels}>
                        <Text style={styles.roadProgLeft}>Progress to {nextRoad.tier}</Text>
                        <Text style={styles.roadProgPct}>{tierProgressPct}%</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFillGold, { width: `${tierProgressPct}%` }]} />
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.metricsCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <Text style={[styles.metricsTitle, { color: muted }]}>EXPERIENCE METRICS</Text>
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCell, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
            <Text style={[styles.metricLabel, { color: muted }]}>TOTAL TENURE</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {primaryDriver ? `${Math.max(1, Math.floor((Date.now() - new Date(primaryDriver.created_at).getTime()) / (86400000)))} days` : '—'}
            </Text>
          </View>
          <View style={[styles.metricCell, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
            <Text style={[styles.metricLabel, { color: muted }]}>CONSISTENCY</Text>
            <Text style={[styles.metricValue, { color: Theme.driverEmeraldDark }]}>High</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const VehicleTechnicalView = () => (
    <View style={styles.subPage}>
      <View style={styles.subHeaderRow}>
        <TouchableOpacity style={[styles.iconPill, { borderColor: cardBorder, backgroundColor: colors.surface }]} onPress={() => setProfileView('main')}>
          <ChevronLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.subTitle, { color: colors.text }]}>FLEET VEHICLE</Text>
      </View>

      <View style={styles.heroDark}>
        <View style={[styles.heroWatermark, { padding: 28 }]}>
          <Truck size={120} color="rgba(255,255,255,0.1)" />
        </View>
        <View style={styles.vehicleHeroTop}>
          <View style={styles.fleetBadge}>
            <Text style={styles.fleetBadgeText}>{vehicleDisplay.fleetId}</Text>
          </View>
          <View style={styles.connectedRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        </View>
        <Text style={styles.vehicleModel}>{vehicleDisplay.model}</Text>
        <Text style={styles.vehiclePlate}>{vehicleDisplay.plate}</Text>
        <View style={styles.vehicleGrid2}>
          <View style={styles.vehicleStatDark}>
            <Text style={styles.vehicleStatLabel}>ASSIGNED ON</Text>
            <Text style={styles.vehicleStatValue}>{vehicleDisplay.assignedOn}</Text>
          </View>
          <View style={styles.vehicleStatDark}>
            <Text style={styles.vehicleStatLabel}>SUPERVISOR</Text>
            <Text style={styles.vehicleStatValue}>{vehicleDisplay.supervisor}</Text>
          </View>
        </View>
      </View>

      <View style={styles.triGaugeRow}>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Fuel size={20} color={Theme.driverEmerald} />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.fuel}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>FUEL</Text>
        </View>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Gauge size={20} color="#3b82f6" />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.odometer}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>KM</Text>
        </View>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Thermometer size={20} color="#f43f5e" />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.engineTemp}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>TEMP</Text>
        </View>
      </View>

      <View style={[styles.whiteCardLg, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <View style={styles.cardHeadRow}>
          <Dna size={16} color={muted} />
          <Text style={[styles.cardHeadTitle, { color: muted }]}>TECH SPECS</Text>
        </View>
        {vehicleDisplay.specs.map((spec, i) => (
          <View key={spec.label} style={[styles.specRow, i < vehicleDisplay.specs.length - 1 && styles.specRowBorder]}>
            <Text style={[styles.specLabel, { color: muted }]}>{spec.label}</Text>
            <Text style={[styles.specValue, { color: colors.text }]}>{spec.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.whiteCardLg, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <View style={styles.cardHeadRow}>
          <Wrench size={16} color={muted} />
          <Text style={[styles.cardHeadTitle, { color: muted }]}>HEALTH DIAGNOSTICS</Text>
        </View>
        {vehicleDisplay.health.map((h) => (
          <View key={h.label} style={[styles.healthRow, { backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc' }]}>
            <Text style={[styles.healthLabel, { color: colors.text }]}>{h.label}</Text>
            <Text style={[styles.healthValue, { color: h.color }]}>{h.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.outer, { backgroundColor: pageBg }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingBottom: Layout.driverHeaderBottomPadding,
            borderBottomColor: cardBorder,
            backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.85)',
          },
        ]}
      >
        <TouchableOpacity style={styles.topIconBtn} onPress={handleBack} hitSlop={12}>
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleCenter}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.liveDot} />
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={handleInviteDrivers}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Invite drivers"
          >
            <UserPlus size={20} color={muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={handleShareProfile}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share profile"
          >
            <Share2 size={20} color={muted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: layout.scrollBottomPadding(16),
          paddingHorizontal: SCREEN_PAD,
        }}
        showsVerticalScrollIndicator={false}
      >
        <>
            {profileView === 'main' && (
              <View style={{ gap: 14 }}>
                <LinearGradient colors={['#0f172a', '#020617']} style={styles.profileHero}>
                  <View style={styles.heroGlow} />
                  <TouchableOpacity style={styles.avatarCluster} onPress={() => setShowEditProfileModal(true)} activeOpacity={0.9}>
                    <LinearGradient colors={[Theme.driverPrimary, Theme.driverEmeraldDark, '#0f766e']} style={styles.avatarRing}>
                      <View style={styles.avatarInner}>
                        {displayAvatarUri ? (
                          <Image source={{ uri: displayAvatarUri }} style={styles.avatarImg} />
                        ) : (
                          <View
                            style={[
                              styles.avatarImg,
                              {
                                backgroundColor: displayAvatarColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                              },
                            ]}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 24 }}>
                              {displayAvatarInitials}
                            </Text>
                          </View>
                        )}
                        <View style={styles.camOverlay}>
                          <Camera size={18} color="#fff" />
                        </View>
                      </View>
                    </LinearGradient>
                    <View style={styles.levelBadge}>
                      <Trophy size={12} color="#fff" />
                      <Text style={styles.levelBadgeText}>Lvl {currentLevel}</Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.profileNameHero}>{displayName}</Text>
                  <Text style={styles.tierSmall}>{currentLevelConfig.tier} rank · {currentLevelConfig.name}</Text>

                  <TouchableOpacity style={styles.xpCard} onPress={() => setProfileView('levels')} activeOpacity={0.88}>
                    <View style={styles.xpTop}>
                      <Text style={styles.xpEyebrow}>EXPERIENCE PROGRESS</Text>
                      <Text style={styles.xpPct}>{experiencePct}%</Text>
                    </View>
                    <View style={styles.progressTrackDark}>
                      <LinearGradient
                        colors={[Theme.driverEmerald, Theme.driverPrimary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFillEm, { width: `${experiencePct}%` }]}
                      />
                    </View>
                    <View style={styles.xpFooter}>
                      <Text style={styles.xpFooterTxt}>{tripsCount} trips</Text>
                      <Text style={styles.xpFooterTxt}>{nextLevelConfig?.name ?? 'Max'} next</Text>
                    </View>
                  </TouchableOpacity>
                </LinearGradient>

                <View style={[styles.bioStatementCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                  <View style={styles.bioStatementHeader}>
                    <View style={styles.bioStatementTitleRow}>
                      <View style={[styles.quoteIconWrap, { backgroundColor: isDark ? colors.emeraldMuted : 'rgba(167,243,208,0.38)' }]}>
                        <Quote size={15} color={Theme.driverEmerald} strokeWidth={2.2} />
                      </View>
                      <Text style={[styles.bioStatementEyebrow, { color: muted }]}>Pilot statement</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.bioEditBtn, { backgroundColor: isDark ? colors.whiteMuted : '#f1f5f9' }]}
                      onPress={() => setShowEditProfileModal(true)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Edit bio"
                    >
                      <Edit3 size={16} color={muted} strokeWidth={2.2} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.bioStatementBody, { color: colors.text }]}>
                    {(profile?.status_text ?? '').trim().length > 0
                      ? `"${(profile?.status_text ?? '').trim()}"`
                      : 'Add a short bio — visible to passengers and fleet managers. Tap edit to update.'}
                  </Text>
                </View>

                <TouchableOpacity style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: cardBorder }]} onPress={() => setProfileView('vehicle')} activeOpacity={0.88}>
                  <View style={styles.rowCardLeft}>
                    <View style={styles.blueIcon}>
                      <Truck size={20} color="#3b82f6" />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>FLEET ASSIGNED</Text>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{vehicleDisplay.model}</Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}
                  onPress={() => router.push('/(driver)/documents')}
                  activeOpacity={0.88}
                >
                  <View style={styles.rowCardLeft}>
                    <View style={styles.darkIcon}>
                      <Shield size={18} color="#fff" />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>KYC & COMPLIANCE</Text>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>Upload & verify documents</Text>
                      <Text style={[styles.rowSub, { color: muted }]} numberOfLines={2}>
                        {kycUploadedCount}/3 uploaded · Aadhaar, PAN, driving license
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </TouchableOpacity>

                <View style={styles.statsRow}>
                  <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                    <View style={styles.amberIcon}>
                      <Star size={18} color="#d97706" fill="#d97706" />
                    </View>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {primaryDriverId
                        ? loadingDriverRatings
                          ? '–'
                          : driverRatingAvg != null
                            ? driverRatingAvg.toFixed(1)
                            : '—'
                        : '—'}
                    </Text>
                    <Text style={[styles.statLbl, { color: muted }]}>AVG RATING</Text>
                    {primaryDriverId && !loadingDriverRatings && driverRatingCount > 0 ? (
                      <Text style={[styles.statHint, { color: muted }]} numberOfLines={1}>
                        {driverRatingCount} {driverRatingCount === 1 ? 'review' : 'reviews'}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                    <View style={styles.blueIconSm}>
                      <History size={18} color="#3b82f6" />
                    </View>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {loadingTrips ? '–' : tripsCount}
                    </Text>
                    <Text style={[styles.statLbl, { color: muted }]}>TRIPS</Text>
                  </View>
                </View>

                <TouchableOpacity style={[styles.signOutCard, { backgroundColor: colors.surface, borderColor: cardBorder }]} onPress={handleSignOut} activeOpacity={0.85}>
                  <LogOut size={18} color="#f43f5e" />
                  <Text style={styles.signOutLbl}>Sign out</Text>
                </TouchableOpacity>
              </View>
            )}
            {profileView === 'levels' && <LevelView />}
            {profileView === 'vehicle' && <VehicleTechnicalView />}
        </>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfileModal}
        onClose={() => {
          setShowEditProfileModal(false);
          refreshSession();
        }}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ''}
        initialPhone={profile?.phone ?? ''}
        initialCompanyName={profile?.company_name ?? ''}
        email={user?.email ?? ''}
        onPhotoUpdated={refreshSession}
        initialAvatarSeed={avatarSeed}
        onPresetSelected={(seed) => {
          setAvatarSeed(seed);
          refreshSession();
        }}
        initialStatusText={profile?.status_text ?? ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  topIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerName: { fontSize: 14, fontWeight: '700', maxWidth: 200 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverEmerald },
  scroll: { flex: 1 },

  profileHero: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  avatarCluster: { marginBottom: 12, alignItems: 'center' },
  avatarRing: { padding: 3, borderRadius: 26 },
  avatarInner: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: SLATE_900,
  },
  avatarImg: { width: '100%', height: '100%' },
  camOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute',
    right: -6,
    bottom: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Theme.driverEmeraldDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: SLATE_900,
  },
  levelBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  profileNameHero: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  tierSmall: { marginTop: 4, fontSize: 10, fontWeight: '700', color: Theme.driverPrimary, letterSpacing: 1 },
  xpCard: {
    marginTop: 14,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  xpTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpEyebrow: { fontSize: 9, fontWeight: '700', color: 'rgba(148,163,184,0.95)', letterSpacing: 1.2 },
  xpPct: { fontSize: 10, fontWeight: '800', color: Theme.driverPrimary },
  progressTrackDark: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.9)',
    overflow: 'hidden',
  },
  progressFillEm: { height: '100%', borderRadius: 999 },
  xpFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  xpFooterTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(148,163,184,0.9)' },

  bioStatementCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  bioStatementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bioStatementTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  quoteIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioStatementEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bioEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioStatementBody: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 19,
    opacity: 0.92,
  },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  rowCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  rowCardText: { flex: 1, minWidth: 0 },
  blueIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: SLATE_900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { marginTop: 4, fontSize: 11, fontWeight: '500', lineHeight: 15 },
  chevPill: { padding: 8, borderRadius: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  amberIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  blueIconSm: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { marginTop: 4, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  statHint: { marginTop: 3, fontSize: 10, fontWeight: '600' },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  signOutLbl: { fontSize: 13, fontWeight: '700', color: '#f43f5e' },

  subPage: { gap: 14, paddingBottom: 8 },
  subHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconPill: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  subTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },

  heroDark: {
    backgroundColor: SLATE_900,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
  },
  heroWatermark: { position: 'absolute', top: 0, right: 0, padding: 16 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  crownBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroEyebrowGold: { fontSize: 9, color: AMBER_400, fontWeight: '700', letterSpacing: 1.2 },
  heroRankTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  roadLineWrap: { paddingLeft: 28, gap: 22 },
  roadLine: {
    position: 'absolute',
    left: 11,
    top: 10,
    bottom: 10,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  roadStep: { flexDirection: 'row', gap: 12, position: 'relative' },
  roadDot: {
    position: 'absolute',
    left: -21,
    top: 14,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 4,
    zIndex: 2,
  },
  roadCard: { flex: 1, padding: 14, borderRadius: 18, borderWidth: 1 },
  roadCardActive: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.18)' },
  roadCardMuted: { borderColor: 'transparent', opacity: 0.45 },
  roadCardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  roadTier: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  roadMin: { fontSize: 10, fontWeight: '800', color: 'rgba(148,163,184,0.9)' },
  roadProgLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  roadProgLeft: { fontSize: 9, fontWeight: '800', color: 'rgba(148,163,184,0.85)', letterSpacing: 1 },
  roadProgPct: { fontSize: 9, fontWeight: '900', color: AMBER_400 },
  progressTrack: { height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 6 },
  progressFillGold: { height: '100%', backgroundColor: AMBER_400, borderRadius: 999 },

  metricsCard: { borderRadius: 32, padding: 22, borderWidth: 1 },
  metricsTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 3, marginBottom: 14 },
  metricsGrid: { flexDirection: 'row', gap: 12 },
  metricCell: { flex: 1, padding: 14, borderRadius: 18 },
  metricLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  metricValue: { fontSize: 14, fontWeight: '900' },

  vehicleHeroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  fleetBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fleetBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 1.2 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverEmerald },
  connectedText: { fontSize: 10, fontWeight: '600', color: Theme.driverPrimary },
  vehicleModel: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  vehiclePlate: { marginTop: 4, fontSize: 11, fontWeight: '700', color: 'rgba(148,163,184,0.95)', letterSpacing: 2 },
  vehicleGrid2: { flexDirection: 'row', gap: 10, marginTop: 14 },
  vehicleStatDark: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vehicleStatLabel: { fontSize: 10, color: 'rgba(148,163,184,0.85)', fontWeight: '600', marginBottom: 4 },
  vehicleStatValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
  triGaugeRow: { flexDirection: 'row', gap: 8 },
  gaugeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  gaugeVal: { fontSize: 16, fontWeight: '800' },
  gaugeLbl: { fontSize: 8, fontWeight: '700', letterSpacing: 1.2 },
  whiteCardLg: { borderRadius: 16, padding: 14, borderWidth: 1 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardHeadTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  specRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(226,232,240,0.8)' },
  specLabel: { fontSize: 12, fontWeight: '600' },
  specValue: { fontSize: 12, fontWeight: '700' },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  healthLabel: { fontSize: 12, fontWeight: '600' },
  healthValue: { fontSize: 10, fontWeight: '700' },
});
