import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Building2, Check, Clock, Lock, Mail, Sparkles, Truck, User } from 'lucide-react-native';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from '../signUpPulseTheme';

type CheckpointStatus = 'complete' | 'in_progress' | 'pending';
type EntityIcon = 'building' | 'truck' | 'user';

export interface SignUpWorkspaceReadyCheckpoint {
  id: string;
  label: string;
  detail?: string;
  status: CheckpointStatus;
}

export interface SignUpWorkspaceReadyCardProps {
  /** Primary display name (org, driver name, etc.) */
  entityName: string;
  /** @deprecated Use entityName */
  orgName?: string;
  verifying?: boolean;
  checkpoints: readonly SignUpWorkspaceReadyCheckpoint[];
  theme?: SignUpTheme;
  entityIcon?: EntityIcon;
  liveLabel?: string;
  gradientColors?: readonly [string, string, string];
  progressEndColor?: string;
  entityPillBorderColor?: string;
  /** Uploaded profile photo URI */
  profilePreviewUri?: string | null;
  /** Preset avatar image source */
  profileImage?: ImageSourcePropType;
  profilePhotoLabel?: string;
}

const ENTITY_ICONS = {
  building: Building2,
  truck: Truck,
  user: User,
} as const;

const STATUS_META: Record<
  CheckpointStatus,
  { Icon: typeof Check; dotColor: string; lineColor: string; chipLabel: string }
> = {
  complete: {
    Icon: Check,
    dotColor: '#059669',
    lineColor: '#a7f3d0',
    chipLabel: 'Done',
  },
  in_progress: {
    Icon: Clock,
    dotColor: '#d97706',
    lineColor: '#fde68a',
    chipLabel: 'Active',
  },
  pending: {
    Icon: Lock,
    dotColor: '#d1d5db',
    lineColor: '#e5e7eb',
    chipLabel: 'Queued',
  },
};

function SignUpWorkspaceReadyCardInner({
  entityName,
  orgName,
  verifying = false,
  checkpoints,
  theme = PULSE_SIGNUP,
  entityIcon = 'building',
  liveLabel = 'Live',
  gradientColors,
  progressEndColor,
  entityPillBorderColor,
  profilePreviewUri,
  profileImage,
  profilePhotoLabel = 'Profile photo selected',
}: SignUpWorkspaceReadyCardProps) {
  const name = entityName || orgName || '';
  const EntityIcon = ENTITY_ICONS[entityIcon];
  const hasProfilePhoto = !!profilePreviewUri || !!profileImage;
  const cardStyles = useMemo(
    () =>
      createStyles(
        theme,
        entityPillBorderColor ?? (entityIcon === 'truck' ? '#bbf7d0' : '#c7d2fe'),
      ),
    [entityIcon, entityPillBorderColor, theme],
  );

  const gradient = gradientColors ?? [
    theme.primaryTint,
    entityIcon === 'truck' ? '#f0fdf4' : '#f8f7ff',
    theme.bg,
  ];
  const progressEnd = progressEndColor ?? (entityIcon === 'truck' ? theme.primaryDark : '#8b5cf6');

  const completedCount = checkpoints.filter((cp) => cp.status === 'complete').length;
  const progressTarget = verifying ? completedCount / checkpoints.length : 1;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(24)).current;
  const badgeScale = useRef(new Animated.Value(0.6)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const ringScaleA = useRef(new Animated.Value(0.85)).current;
  const ringOpacityA = useRef(new Animated.Value(0)).current;
  const ringScaleB = useRef(new Animated.Value(0.85)).current;
  const ringOpacityB = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-120)).current;
  const profileOpacity = useRef(new Animated.Value(0)).current;
  const profileScale = useRef(new Animated.Value(0.88)).current;
  const rowAnims = useRef(checkpoints.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslateY, {
        toValue: 0,
        damping: 16,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.spring(badgeScale, {
            toValue: 1,
            damping: 12,
            stiffness: 220,
            useNativeDriver: true,
          }),
          Animated.timing(badgeOpacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(progressWidth, {
          toValue: progressTarget,
          duration: 880,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
    ]).start();

    if (!verifying) {
      const pulse = (scale: Animated.Value, opacity: Animated.Value, delay: number) => {
        opacity.setValue(0.35);
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(scale, {
                toValue: 1.18,
                duration: 1400,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0,
                duration: 1400,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(scale, { toValue: 0.92, duration: 0, useNativeDriver: true }),
              Animated.timing(opacity, { toValue: 0.35, duration: 0, useNativeDriver: true }),
            ]),
          ]),
        ).start();
      };
      pulse(ringScaleA, ringOpacityA, 0);
      pulse(ringScaleB, ringOpacityB, 420);
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: 300,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerX, { toValue: -120, duration: 0, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    ).start();

    Animated.stagger(
      90,
      rowAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();

    if (hasProfilePhoto) {
      Animated.sequence([
        Animated.delay(280),
        Animated.parallel([
          Animated.spring(profileScale, {
            toValue: 1,
            damping: 14,
            stiffness: 200,
            useNativeDriver: true,
          }),
          Animated.timing(profileOpacity, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [
    badgeOpacity,
    badgeScale,
    cardOpacity,
    cardTranslateY,
    checkpoints.length,
    hasProfilePhoto,
    profileOpacity,
    profileScale,
    progressTarget,
    progressWidth,
    ringOpacityA,
    ringOpacityB,
    ringScaleA,
    ringScaleB,
    rowAnims,
    shimmerX,
    verifying,
  ]);

  const progressBarWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        cardStyles.card,
        {
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }],
        },
      ]}
    >
      <LinearGradient
        colors={[...gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={cardStyles.cardGradient}
      >
        <View style={[cardStyles.progressTrack, { backgroundColor: theme.primaryTint }]}>
          <Animated.View style={[cardStyles.progressFill, { width: progressBarWidth }]}>
            <LinearGradient
              colors={[theme.primary, progressEnd]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[cardStyles.shimmer, { transform: [{ translateX: shimmerX }] }]}
          />
        </View>

        <View style={cardStyles.hero}>
          <View style={cardStyles.badgeOuter}>
            {!verifying ? (
              <>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    cardStyles.pulseRing,
                    {
                      opacity: ringOpacityA,
                      transform: [{ scale: ringScaleA }],
                    },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    cardStyles.pulseRing,
                    cardStyles.pulseRingOffset,
                    {
                      opacity: ringOpacityB,
                      transform: [{ scale: ringScaleB }],
                    },
                  ]}
                />
              </>
            ) : null}
            <Animated.View
              style={[
                cardStyles.badge,
                verifying ? cardStyles.badgeVerify : cardStyles.badgeSuccess,
                {
                  opacity: badgeOpacity,
                  transform: [{ scale: badgeScale }],
                },
              ]}
            >
              {verifying ? (
                <Mail size={28} color="#d97706" strokeWidth={2.5} />
              ) : (
                <FontAwesome name="check" size={28} color="#fff" />
              )}
            </Animated.View>
          </View>

          <View style={cardStyles.entityRow}>
            <View style={cardStyles.entityPill}>
              <EntityIcon size={14} color={theme.primary} strokeWidth={2.5} />
              <Text style={[cardStyles.entityPillText, { color: theme.primary }]} numberOfLines={1}>
                {name}
              </Text>
            </View>
            {!verifying ? (
              <View style={[cardStyles.liveTag, { backgroundColor: `${theme.primary}1a` }]}>
                <Sparkles size={11} color={theme.primary} strokeWidth={2.5} />
                <Text style={[cardStyles.liveTagText, { color: theme.primary }]}>{liveLabel}</Text>
              </View>
            ) : null}
          </View>

          {hasProfilePhoto ? (
            <Animated.View
              style={[
                cardStyles.profileRow,
                {
                  opacity: profileOpacity,
                  transform: [{ scale: profileScale }],
                },
              ]}
            >
              <View style={[cardStyles.profileAvatarWrap, { borderColor: theme.primary }]}>
                {profilePreviewUri ? (
                  <Image
                    key={profilePreviewUri}
                    source={{ uri: profilePreviewUri }}
                    style={cardStyles.profileAvatar}
                    resizeMode="cover"
                  />
                ) : profileImage ? (
                  <Image source={profileImage} style={cardStyles.profileAvatar} resizeMode="cover" />
                ) : null}
              </View>
              <Text style={[cardStyles.profileLabel, { color: theme.muted }]}>{profilePhotoLabel}</Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={cardStyles.sectionHeader}>
          <Text style={[cardStyles.sectionEyebrow, { color: theme.muted }]}>Activation summary</Text>
          <Text style={[cardStyles.sectionMeta, { color: theme.placeholder }]}>
            {completedCount}/{checkpoints.length} complete
          </Text>
        </View>

        <View style={cardStyles.timeline}>
          {checkpoints.map((cp, index) => {
            const meta = STATUS_META[cp.status];
            const Icon = meta.Icon;
            const isLast = index === checkpoints.length - 1;
            const rowAnim = rowAnims[index] ?? rowAnims[0];

            return (
              <Animated.View
                key={cp.id}
                style={[
                  cardStyles.timelineRow,
                  {
                    opacity: rowAnim,
                    transform: [
                      {
                        translateX: rowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-12, 0],
                        }),
                      },
                      {
                        translateY: rowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [6, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={cardStyles.timelineRail}>
                  <View style={[cardStyles.timelineDot, { backgroundColor: meta.dotColor }]}>
                    <Icon size={12} color="#fff" strokeWidth={3} />
                  </View>
                  {!isLast ? (
                    <View style={[cardStyles.timelineLine, { backgroundColor: meta.lineColor }]} />
                  ) : null}
                </View>

                <View style={cardStyles.timelineBody}>
                  <Text
                    style={[
                      cardStyles.timelineLabel,
                      { color: theme.text },
                      cp.status === 'pending' && { color: theme.muted, fontWeight: '700' },
                    ]}
                  >
                    {cp.label}
                  </Text>
                  {cp.detail ? (
                    <Text style={[cardStyles.timelineDetail, { color: theme.muted }]}>{cp.detail}</Text>
                  ) : null}
                </View>

                <View style={cardStyles.timelineStatus}>
                  {cp.status === 'complete' ? (
                    <View style={cardStyles.statusChipComplete}>
                      <Text style={cardStyles.statusChipCompleteText}>{meta.chipLabel}</Text>
                    </View>
                  ) : cp.status === 'in_progress' ? (
                    <View style={cardStyles.statusChipProgress}>
                      <Text style={cardStyles.statusChipProgressText}>{meta.chipLabel}</Text>
                    </View>
                  ) : (
                    <View style={[cardStyles.statusChipPending, { backgroundColor: theme.surface }]}>
                      <Text style={[cardStyles.statusChipPendingText, { color: theme.placeholder }]}>
                        {meta.chipLabel}
                      </Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export const SignUpWorkspaceReadyCard = memo(SignUpWorkspaceReadyCardInner);

const BADGE_SIZE = 72;

function createStyles(theme: SignUpTheme, entityPillBorderColor: string) {
  return StyleSheet.create({
    card: {
      width: '100%',
      maxWidth: 360,
      alignSelf: 'center',
      borderRadius: PULSE_SIGNUP_RADIUS.card,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
        },
        android: { elevation: 4 },
        web: {
          boxShadow: `0 16px 40px ${theme.primary}1a`,
        } as object,
      }),
    },
    cardGradient: {
      paddingHorizontal: 20,
      paddingTop: 0,
      paddingBottom: 8,
    },
    progressTrack: {
      height: 3,
      marginHorizontal: -20,
      marginBottom: 22,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
      overflow: 'hidden',
    },
    shimmer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 44,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    hero: {
      alignItems: 'center',
      marginBottom: 18,
    },
    badgeOuter: {
      width: BADGE_SIZE + 24,
      height: BADGE_SIZE + 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    pulseRing: {
      position: 'absolute',
      width: BADGE_SIZE + 24,
      height: BADGE_SIZE + 24,
      borderRadius: (BADGE_SIZE + 24) / 2,
      backgroundColor: theme.primaryTint,
    },
    pulseRingOffset: {
      width: BADGE_SIZE + 36,
      height: BADGE_SIZE + 36,
      borderRadius: (BADGE_SIZE + 36) / 2,
      backgroundColor: `${theme.primary}14`,
    },
    badge: {
      width: BADGE_SIZE,
      height: BADGE_SIZE,
      borderRadius: BADGE_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeSuccess: {
      backgroundColor: theme.primary,
      ...Platform.select({
        ios: {
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.35,
          shadowRadius: 16,
        },
        android: { elevation: 6 },
      }),
    },
    badgeVerify: {
      backgroundColor: '#fffbeb',
      borderWidth: 2,
      borderColor: '#fcd34d',
    },
    entityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      maxWidth: '100%',
      flexWrap: 'wrap',
    },
    entityPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '80%',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.primaryTint,
      borderWidth: 1,
      borderColor: entityPillBorderColor,
    },
    entityPillText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    liveTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    liveTagText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    profileRow: {
      alignItems: 'center',
      marginTop: 14,
      gap: 8,
    },
    profileAvatarWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      overflow: 'hidden',
      backgroundColor: '#fff',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        },
        android: { elevation: 3 },
      }),
    },
    profileAvatar: {
      width: '100%',
      height: '100%',
    },
    profileLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    sectionEyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    sectionMeta: {
      fontSize: 11,
      fontWeight: '700',
    },
    timeline: {
      width: '100%',
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      minHeight: 64,
      paddingBottom: 4,
    },
    timelineRail: {
      width: 32,
      alignItems: 'center',
      marginRight: 12,
    },
    timelineDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timelineLine: {
      width: 2,
      flex: 1,
      minHeight: 28,
      marginTop: 4,
      borderRadius: 1,
    },
    timelineBody: {
      flex: 1,
      minWidth: 0,
      paddingTop: 2,
      paddingRight: 8,
    },
    timelineLabel: {
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 20,
    },
    timelineDetail: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
    },
    timelineStatus: {
      paddingTop: 2,
      flexShrink: 0,
    },
    statusChipComplete: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#ecfdf5',
    },
    statusChipCompleteText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: '#059669',
    },
    statusChipProgress: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#fffbeb',
    },
    statusChipProgressText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: '#d97706',
    },
    statusChipPending: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    statusChipPendingText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
  });
}
