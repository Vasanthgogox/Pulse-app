import Theme from '@/constants/Theme';
import { OrgVerificationBadges } from '@/features/network/components/OrgVerificationBadges';
import { platformShadow } from '@/lib/platformShadow';
import {
  buildYourRoleTiles,
  connectionNextSteps,
  connectionYourRolePill,
  formatConnectionExperience,
  formatConnectionInviteDate,
  formatConnectionRatingCount,
  formatConnectionRatingValue,
  formatConnectionTripsValue,
  type ConnectionOfferTile,
} from '@/features/network/utils/businessConnectionOffer.util';
import { isOrgKycVerified } from '@/features/network/utils/orgVerification.util';
import {
  getFleetAvatarUriForOrg,
  resolveOrgAvatarUri,
} from '@/features/vehicles/utils/fleetAvatar.util';
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import {
  partyInitialsFromName,
  partyAvatarBackgroundColor,
  resolvePartyDisplayUri,
  resolvePartyPhotoUriAsync,
} from '@/lib/partyAvatarDisplay';

import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Handshake,
  Sparkles,
  Truck,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFailedImageUriGuard } from "@/hooks/useFailedImageUriGuard";

const WEB_DESKTOP_BREAKPOINT = 600;

type Props = {
  visible: boolean;
  invite: InboundProtocolInviteItem;
  queueIndex?: number;
  queueTotal?: number;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onLater: () => void;
  onNext?: () => void;
};

const DISMISS_DRAG_PX = 72;
const DISMISS_VELOCITY = 0.65;

/** Pulse brand brown — solid, professional connection invite chrome. */
const CONNECTION_BROWN = Theme.brandBlueInk;

type InvitePalette = {
  gradientStart: string;
  gradientEnd: string;
  accent: string;
  accentSoftBg: string;
  accentSoftBorder: string;
  accentIconBg: string;
  textOnAccent: string;
  mutedOnAccent: string;
  inlinePillBg: string;
};

function invitePaletteForType(_type: string): InvitePalette {
  return {
    gradientStart: CONNECTION_BROWN,
    gradientEnd: CONNECTION_BROWN,
    accent: CONNECTION_BROWN,
    accentSoftBg: 'rgba(77, 54, 54, 0.06)',
    accentSoftBorder: Theme.brandBlueRing,
    accentIconBg: 'rgba(77, 54, 54, 0.1)',
    textOnAccent: Theme.textOnDark,
    mutedOnAccent: Theme.textOnDarkMuted,
    inlinePillBg: 'rgba(255, 255, 255, 0.14)',
  };
}

function offerIcon(kind: ConnectionOfferTile['icon'], color: string, size = 16) {
  if (kind === 'client') {
    return <Building2 size={size} color={color} strokeWidth={2.2} />;
  }
  if (kind === 'supplier') {
    return <Truck size={size} color={color} strokeWidth={2.2} />;
  }
  return <Handshake size={size} color={color} strokeWidth={2.2} />;
}

export function BusinessConnectionRequestModal({
  visible,
  invite,
  queueIndex = 1,
  queueTotal = 1,
  busy = false,
  onAccept,
  onDecline,
  onLater,
  onNext,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && screenWidth >= WEB_DESKTOP_BREAKPOINT;
  const dragY = useRef(new Animated.Value(0)).current;
  const dismissingRef = useRef(false);
  const [shellVisible, setShellVisible] = useState(visible);
  const [isDragging, setIsDragging] = useState(false);

  const [fetchedVerificationStatus, setFetchedVerificationStatus] = useState<
    string | null
  >(null);

  useEffect(() => {
    setFetchedVerificationStatus(null);
  }, [invite.id]);

  useEffect(() => {
    if (!visible || !invite.partnerOrgId) return;
    if (invite.verificationStatus) {
      setFetchedVerificationStatus(invite.verificationStatus);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { getLinkedOrgProfile } = await import(
        '@/features/clients/services/clients.service'
      );
      const { profile } = await getLinkedOrgProfile(invite.partnerOrgId);
      if (cancelled) return;
      setFetchedVerificationStatus(profile?.verificationStatus ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, invite.id, invite.partnerOrgId, invite.verificationStatus]);
  useEffect(() => {
    if (visible) {
      // Parent still wants the sheet open (including "next invite" after Later).
      dismissingRef.current = false;
      setShellVisible(true);
      dragY.setValue(0);
      setIsDragging(false);
      return;
    }
    // Parent dismissed — close shell. Keep dismissingRef until here so an
    // intermediate shellVisible=false render cannot race-reopen while visible
    // was still true for a frame.
    dismissingRef.current = false;
    setShellVisible(false);
    dragY.setValue(0);
    setIsDragging(false);
  }, [visible, dragY]);

  const resetDrag = useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 9,
      tension: 120,
    }).start();
    setIsDragging(false);
  }, [dragY]);

  const requestDismiss = useCallback(() => {
    if (busy || dismissingRef.current) return;
    dismissingRef.current = true;
    // Flip parent visibility first so the visible effect cannot reopen the shell.
    onLater();
    Animated.timing(dragY, {
      toValue: 480,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      dragY.setValue(0);
      setIsDragging(false);
      setShellVisible(false);
    });
  }, [busy, dragY, onLater]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !busy &&
          gesture.dy > 6 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => setIsDragging(true),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) {
            dragY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (
            gesture.dy >= DISMISS_DRAG_PX ||
            gesture.vy >= DISMISS_VELOCITY
          ) {
            requestDismiss();
            return;
          }
          resetDrag();
        },
        onPanResponderTerminate: resetDrag,
      }),
    [busy, dragY, requestDismiss, resetDrag],
  );

  const sheetTranslate = dragY.interpolate({
    inputRange: [0, 480],
    outputRange: [0, 480],
    extrapolate: 'clamp',
  });

  const orgLogoFallbackUri = useMemo(
    () =>
      resolveOrgAvatarUri(
        invite.partnerOrgId,
        invite.name?.trim() || 'Organization',
        invite.logoUrl ?? null,
        invite.orgAvatarSeed ?? null,
        null,
      ),
    [invite.logoUrl, invite.name, invite.orgAvatarSeed, invite.partnerOrgId],
  );
  const [orgLogoUri, setOrgLogoUri] = useState<string>(orgLogoFallbackUri);

  useEffect(() => {
    let cancelled = false;
    const fallback = resolveOrgAvatarUri(
      invite.partnerOrgId,
      invite.name?.trim() || 'Organization',
      invite.logoUrl ?? null,
      invite.orgAvatarSeed ?? null,
      null,
    );
    setOrgLogoUri(fallback);
    resolvePartyPhotoUriAsync({
      organizationImageUrl: invite.logoUrl ?? null,
      avatarUrl: null,
    })
      .then((signedLogoUri) => {
        if (cancelled) return;
        if (signedLogoUri) {
          setOrgLogoUri(signedLogoUri);
          return;
        }
        setOrgLogoUri(fallback);
      })
      .catch(() => {
        if (!cancelled) setOrgLogoUri(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [invite.logoUrl, invite.name, invite.orgAvatarSeed, invite.partnerOrgId]);

  const orgName = invite.name?.trim() || 'Organization';
  const orgInitials = partyInitialsFromName(orgName);
  const orgInitialsBg = partyAvatarBackgroundColor(invite.partnerOrgId);
  const senderName = invite.contactPerson?.trim() || '';
  const senderPhone = invite.subtitle?.trim() || '';
  const senderLabel = senderName || 'Team member';
  const senderInitials = partyInitialsFromName(senderLabel);
  const senderInitialsBg = partyAvatarBackgroundColor(
    invite.partnerOwnerId ?? invite.partnerOrgId,
  );
  const senderAvatarUri = useMemo(
    () =>
      resolvePartyDisplayUri({
        avatarUrl: invite.ownerAvatarUrl ?? null,
        avatarSeed: invite.senderAvatarSeed ?? null,
      }) ??
      getFleetAvatarUriForOrg(
        invite.partnerOwnerId ?? invite.partnerOrgId,
        senderLabel,
      ),
    [
      invite.ownerAvatarUrl,
      invite.partnerOrgId,
      invite.partnerOwnerId,
      invite.senderAvatarSeed,
      senderLabel,
    ],
  );
  const { failed: logoLoadFailed, onError: onLogoError } =
    useFailedImageUriGuard(orgLogoUri);
  const { failed: senderAvatarLoadFailed, onError: onSenderAvatarError } =
    useFailedImageUriGuard(senderAvatarUri);
  const showSenderRow = senderName.length > 0 || senderPhone.length > 0;
  const yourRoleTiles = useMemo(() => buildYourRoleTiles(invite.type), [invite.type]);
  const inviteDateLabel = useMemo(
    () => formatConnectionInviteDate(invite.createdAt),
    [invite.createdAt],
  );
  const nextSteps = useMemo(() => connectionNextSteps(orgName), [orgName]);
  const yourRolePill = connectionYourRolePill(invite.type);
  const palette = useMemo(() => invitePaletteForType(invite.type), [invite.type]);

  const experienceValue = formatConnectionExperience(invite.orgCreatedAt);
  const tripsValue = formatConnectionTripsValue(invite.tripCount);
  const ratingValue = formatConnectionRatingValue(
    invite.averageRating,
    invite.ratingCount,
  );
  const reviewsLabel = formatConnectionRatingCount(invite.ratingCount);
  const verificationStatus =
    invite.verificationStatus ?? fetchedVerificationStatus;
  const isKycVerified = isOrgKycVerified({
    verificationStatus,
  });

  if (!shellVisible && !visible) return null;

  const heroContent = (
    <>
      <View style={styles.heroTopRow}>
        <View style={styles.heroEyebrowRow}>
          <Sparkles size={12} color={palette.mutedOnAccent} strokeWidth={2.5} />
          <Text style={[styles.heroEyebrow, { color: palette.mutedOnAccent }]}>
            BUSINESS CONNECTION
          </Text>
        </View>
        <View style={styles.heroTopActions}>
          {queueTotal > 1 ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueText}>
                {queueIndex}/{queueTotal}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={requestDismiss}
            style={styles.closeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={16} color={palette.textOnAccent} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      <View style={styles.heroBody}>
        <View style={styles.heroOrgRow}>
          <View style={styles.heroLogoWrap}>
            {!logoLoadFailed ? (
              <Image
                source={{ uri: orgLogoUri }}
                style={styles.heroLogo}
                resizeMode="cover"
                onError={onLogoError}
              />
            ) : (
              <View style={[styles.heroLogoFallback, { backgroundColor: orgInitialsBg }]}>
                <Text style={styles.heroLogoInitials}>{orgInitials}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroTextBlock}>
            <View style={styles.heroTitleRow}>
              <Text style={[styles.heroTitle, { color: palette.textOnAccent }]} numberOfLines={1}>
                {orgName}
              </Text>
              {isKycVerified ? (
                <BadgeCheck size={16} color="#50CD89" strokeWidth={2.4} />
              ) : null}
            </View>
            <Text style={[styles.heroOrgKicker, { color: palette.mutedOnAccent }]} numberOfLines={1}>
              Business connection invite
            </Text>
            <OrgVerificationBadges
              verification={{ verificationStatus }}
              compact
              tone="onDark"
              style={styles.heroVerificationRow}
            />
            <View style={styles.heroPillRow}>
              <View style={[styles.heroPill, { backgroundColor: palette.inlinePillBg }]}>
                <Text style={[styles.heroPillText, { color: palette.textOnAccent }]}>{yourRolePill}</Text>
              </View>
              {inviteDateLabel ? (
                <Text style={[styles.heroDate, { color: palette.mutedOnAccent }]}>
                  Sent {inviteDateLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </>
  );

  return (
    <Modal
      visible={shellVisible}
      transparent
      animationType="none"
      onRequestClose={requestDismiss}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, isWebDesktop ? styles.backdropWebDesktop : (Platform.OS === 'web' ? styles.backdropWebMobile : null)]}>
        <Pressable
          style={styles.backdropTouch}
          onPress={requestDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Dismiss connection request"
        />
        <Animated.View
          style={[
            styles.sheet,
            isWebDesktop ? styles.sheetWebDesktop : styles.sheetMobile,
            !isWebDesktop && { transform: [{ translateY: sheetTranslate }] },
            isDragging && styles.sheetDragging,
          ]}
        >
          {!isWebDesktop ? (
            <View
              style={styles.sheetDragCapture}
              {...panResponder.panHandlers}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.dragHandle} />
            </View>
          ) : null}

          <View style={[styles.hero, { backgroundColor: palette.gradientStart }]}>
            {heroContent}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={[
              styles.bodyContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 4 },
            ]}
            showsVerticalScrollIndicator={false}
            bounces
            keyboardShouldPersistTaps="handled"
          >
            {showSenderRow ? (
              <View style={styles.senderRow}>
                <View style={styles.senderAvatarWrap}>
                  {!senderAvatarLoadFailed ? (
                    <Image
                      source={{ uri: senderAvatarUri }}
                      style={styles.senderAvatar}
                      resizeMode="cover"
                      onError={onSenderAvatarError}
                    />
                  ) : (
                    <View
                      style={[
                        styles.senderAvatarFallback,
                        { backgroundColor: senderInitialsBg },
                      ]}
                    >
                      <Text style={styles.senderInitials}>{senderInitials}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.senderText}>
                  <View style={styles.senderHeadRow}>
                    <Text style={styles.senderName} numberOfLines={1}>
                      {senderLabel}
                    </Text>
                    <Text style={styles.senderKicker}>Invited by</Text>
                  </View>
                  {senderPhone ? (
                    <Text style={styles.senderMeta} numberOfLines={1}>
                      {senderPhone}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.experienceCard}>
              <Text style={styles.experienceCardTitle}>Their track record</Text>
              <View style={styles.experienceMetricsRow}>
                <View style={styles.experienceMetric}>
                  <Text style={styles.experienceMetricValue}>{experienceValue}</Text>
                  <Text style={styles.experienceMetricLabel}>Experience</Text>
                </View>
                <View style={styles.experienceMetricDivider} />
                <View style={styles.experienceMetric}>
                  <Text style={styles.experienceMetricValue}>{tripsValue}</Text>
                  <Text style={styles.experienceMetricLabel}>Trips</Text>
                </View>
                <View style={styles.experienceMetricDivider} />
                <View style={styles.experienceMetric}>
                  <Text style={styles.experienceMetricValue}>{ratingValue}</Text>
                  <Text style={styles.experienceMetricLabel} numberOfLines={1}>
                    {reviewsLabel === 'No reviews' ? 'Avg rating' : `Avg · ${reviewsLabel}`}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>WHAT THEY'LL BE TO YOU</Text>
              <View
                style={[
                  styles.offerPill,
                  {
                    backgroundColor: palette.accentSoftBg,
                  },
                ]}
              >
                <Text style={[styles.offerPillText, { color: palette.accent }]}>
                  {yourRoleTiles.length} role{yourRoleTiles.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            <View style={styles.payGrid}>
              {yourRoleTiles.map((tile, i) => (
                <View
                  key={tile.label}
                  style={[
                    styles.payTile,
                    i === 0 ? styles.payTilePrimary : styles.payTileSecondary,
                    i === 0
                      ? {
                          backgroundColor: palette.accentSoftBg,
                          borderColor: palette.accentSoftBorder,
                        }
                      : undefined,
                    yourRoleTiles.length === 1 ? styles.payTileFull : undefined,
                  ]}
                >
                  <View style={styles.payTileRow}>
                    <View style={[styles.payTileIconWrap, i === 0 && styles.payTileIconPrimary]}>
                      {offerIcon(tile.icon, palette.accent, 14)}
                    </View>
                    <View style={styles.payTileTextCol}>
                      <View style={styles.payTileCopy}>
                        <Text style={styles.payTileAmount} numberOfLines={1}>
                          {tile.value}
                        </Text>
                        <Text style={styles.payTileSep} accessibilityElementsHidden>
                          ·
                        </Text>
                        <Text style={[styles.payTileLabel, { color: palette.accent }]} numberOfLines={1}>
                          {tile.label}
                        </Text>
                      </View>
                      <Text style={styles.payTileHint}>{tile.hint}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.nextCard}>
              <Text style={styles.nextTitle}>What happens next</Text>
              {nextSteps.map((item) => (
                <View key={item} style={styles.nextRow}>
                  <ArrowRight size={13} color={palette.accent} strokeWidth={2.4} />
                  <Text style={styles.nextText}>{item}</Text>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.reminderBanner,
                {
                  borderColor: palette.accentSoftBorder,
                  backgroundColor: palette.accentSoftBg,
                },
              ]}
            >
              <Sparkles size={12} color={palette.accent} strokeWidth={2.2} />
              <Text style={styles.reminderText}>
                This request stays active until you accept or decline.
              </Text>
            </View>

            <View style={styles.footer}>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={onDecline}
                  disabled={busy}
                  activeOpacity={0.82}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.acceptBtn, busy && styles.disabled]}
                  onPress={onAccept}
                  disabled={busy}
                  activeOpacity={0.88}
                >
                  <View
                    style={[
                      styles.acceptGradient,
                      { backgroundColor: palette.accent },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={palette.textOnAccent} />
                    ) : (
                      <>
                        <Check size={15} color={palette.textOnAccent} strokeWidth={3} />
                        <Text style={[styles.acceptText, { color: palette.textOnAccent }]}>
                          Accept & connect
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </View>

              {queueTotal > 1 && onNext ? (
                <TouchableOpacity
                  onPress={onNext}
                  disabled={busy}
                  style={styles.nextRequestBtn}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.nextRequestText, { color: palette.accent }]}>
                    View next request
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={requestDismiss}
                disabled={busy}
                style={styles.laterBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.laterText}>Remind me later</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: { cursor: 'pointer' as const },
      default: {},
    }),
  },
  // Desktop web: centered dialog
  backdropWebDesktop: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Mobile web: bottom sheet (same as native)
  backdropWebMobile: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: 'flex-end',
  },
  sheet: {
    overflow: 'hidden',
    backgroundColor: Theme.screenBackground,
    flexDirection: 'column',
    position: 'relative',
  },
  // Desktop web: full dialog card, centered
  sheetWebDesktop: {
    borderRadius: 28,
    width: '100%',
    maxWidth: 460,
    maxHeight: '92vh' as unknown as number,
    alignSelf: 'center',
  },
  // Native + mobile web: bottom sheet
  sheetMobile: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    alignSelf: 'stretch',
    maxHeight: '86%',
  },
  sheetDragging: {
    opacity: 0.98,
  },
  sheetDragCapture: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 88,
    height: 36,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  hero: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
  },
  queueBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  queueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroBody: {
    gap: 8,
  },
  heroOrgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginBottom: 2,
  },
  senderAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: Theme.surfaceForm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    flexShrink: 0,
  },
  senderAvatar: {
    width: '100%',
    height: '100%',
  },
  senderAvatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderInitials: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  senderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  senderHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  senderKicker: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Theme.textMuted,
    flexShrink: 0,
  },
  senderName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  senderMeta: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  heroLogoWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#fff',
    overflow: 'hidden',
    flexShrink: 0,
    ...platformShadow('0 6px 12px rgba(0, 0, 0, 0.22)', {
      color: '#000',
      opacity: 0.22,
      radius: 12,
      offsetY: 6,
      elevation: 8,
    }),
  },
  heroLogo: {
    width: '100%',
    height: '100%',
  },
  heroLogoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogoInitials: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  heroTextBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.45,
    lineHeight: 24,
    flexShrink: 1,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  heroVerificationRow: {
    justifyContent: 'flex-start',
    marginTop: 6,
    marginBottom: 2,
  },
  heroOrgKicker: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textOnDarkMuted,
    lineHeight: 14,
  },
  heroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  heroDate: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textOnDarkMuted,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    gap: 10,
    flexGrow: 1,
  },
  experienceCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  experienceCardTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  experienceMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  experienceMetric: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  experienceMetricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: Theme.borderLight,
  },
  experienceMetricValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  experienceMetricLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  offerPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 54, 54, 0.06)',
  },
  offerPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: CONNECTION_BROWN,
  },
  payGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payTile: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 130,
    width: '48%',
    flexGrow: 1,
    justifyContent: 'center',
  },
  payTileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payTileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  payTileCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  payTileHint: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: Theme.textMuted,
  },
  payTileFull: {
    width: '100%',
  },
  payTilePrimary: {
    backgroundColor: 'rgba(77, 54, 54, 0.06)',
    borderColor: Theme.brandBlueRing,
  },
  payTileSecondary: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  payTileIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    flexShrink: 0,
  },
  payTileIconPrimary: {
    backgroundColor: '#fff',
  },
  payTileAmount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 18,
    color: Theme.textPrimaryDark,
    flexShrink: 0,
  },
  payTileSep: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
    lineHeight: 18,
  },
  payTileLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: CONNECTION_BROWN,
    lineHeight: 12,
  },
  nextCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    padding: 10,
    gap: 6,
  },
  nextTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 0,
    color: Theme.textPrimaryDark,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  nextText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textSecondary,
  },
  reminderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.brandBlueRing,
    backgroundColor: 'rgba(77, 54, 54, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reminderText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textSecondary,
  },
  footer: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
  },
  declineText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  acceptBtn: {
    flex: 1.6,
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
  },
  acceptGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  acceptText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.15,
  },
  nextRequestBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  nextRequestText: {
    fontSize: 13,
    fontWeight: '700',
    color: CONNECTION_BROWN,
  },
  laterBtn: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingBottom: 2,
  },
  laterText: {
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textMuted,
  },
  disabled: {
    opacity: 0.6,
  },
});
