import Theme from '@/constants/Theme';
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
import { resolveOrgAvatarUri } from '@/features/vehicles/utils/fleetAvatar.util';
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { partyInitialsFromName, partyAvatarBackgroundColor } from '@/lib/partyAvatarDisplay';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Building2,
  Check,
  Handshake,
  Sparkles,
  Truck,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const PURPLE = Theme.pulseIndigo;
const PURPLE_DARK = Theme.actionAccentBorder;
const LAVENDER = 'rgba(199,210,254,0.95)';

function offerIcon(kind: ConnectionOfferTile['icon'], size = 16) {
  if (kind === 'client') {
    return <Building2 size={size} color={PURPLE} strokeWidth={2.2} />;
  }
  if (kind === 'supplier') {
    return <Truck size={size} color={PURPLE} strokeWidth={2.2} />;
  }
  return <Handshake size={size} color={PURPLE} strokeWidth={2.2} />;
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

  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [invite.id]);

  const orgLogoUri = useMemo(
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

  const orgName = invite.name?.trim() || 'Organization';
  const orgInitials = partyInitialsFromName(orgName);
  const orgInitialsBg = partyAvatarBackgroundColor(invite.partnerOrgId);
  const yourRoleTiles = useMemo(() => buildYourRoleTiles(invite.type), [invite.type]);
  const inviteDateLabel = useMemo(
    () => formatConnectionInviteDate(invite.createdAt),
    [invite.createdAt],
  );
  const nextSteps = useMemo(() => connectionNextSteps(orgName), [orgName]);
  const yourRolePill = connectionYourRolePill(invite.type);

  const experienceValue = formatConnectionExperience(invite.orgCreatedAt);
  const tripsValue = formatConnectionTripsValue(invite.tripCount);
  const ratingValue = formatConnectionRatingValue(
    invite.averageRating,
    invite.ratingCount,
  );
  const reviewsLabel = formatConnectionRatingCount(invite.ratingCount);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, Platform.OS === 'web' ? styles.backdropWeb : null]}>
        <View
          key={invite.id}
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 4 },
          ]}
        >
          <LinearGradient
            colors={[PURPLE_DARK, PURPLE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrowRow}>
                <Sparkles size={12} color={LAVENDER} strokeWidth={2.5} />
                <Text style={styles.heroEyebrow}>BUSINESS CONNECTION</Text>
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
                  onPress={onLater}
                  style={styles.closeBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={16} color="#fff" strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>

            <View style={styles.heroBody}>
              <View style={styles.heroLogoWrap}>
                {!logoLoadFailed ? (
                  <Image
                    source={{ uri: orgLogoUri }}
                    style={styles.heroLogo}
                    resizeMode="cover"
                    onError={() => setLogoLoadFailed(true)}
                  />
                ) : (
                  <View style={[styles.heroLogoFallback, { backgroundColor: orgInitialsBg }]}>
                    <Text style={styles.heroLogoInitials}>{orgInitials}</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  Connect with {orgName}
                </Text>
                <View style={styles.heroPillRow}>
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>{yourRolePill}</Text>
                  </View>
                  {inviteDateLabel ? (
                    <Text style={styles.heroDate}>Sent {inviteDateLabel}</Text>
                  ) : null}
                </View>
                {invite.subtitle ? (
                  <Text style={styles.heroSubtitle} numberOfLines={1}>
                    {invite.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, { paddingBottom: 8 }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
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
              <Text style={styles.sectionLabel}>YOUR ROLE</Text>
              <View style={styles.offerPill}>
                <Text style={styles.offerPillText}>
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
                    yourRoleTiles.length === 1 ? styles.payTileFull : undefined,
                  ]}
                >
                  <View style={[styles.payTileIconWrap, i === 0 && styles.payTileIconPrimary]}>
                    {offerIcon(tile.icon, 16)}
                  </View>
                  <Text style={styles.payTileAmount}>{tile.value}</Text>
                  <Text style={styles.payTileLabel}>{tile.label}</Text>
                  <Text style={styles.payTileHint} numberOfLines={2}>
                    {tile.hint}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.nextCard}>
              <Text style={styles.nextTitle}>What happens next</Text>
              {nextSteps.map((item) => (
                <View key={item} style={styles.nextRow}>
                  <ArrowRight size={13} color={PURPLE} strokeWidth={2.4} />
                  <Text style={styles.nextText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.reminderBanner}>
              <Sparkles size={12} color={PURPLE} strokeWidth={2.2} />
              <Text style={styles.reminderText}>
                This request stays active until you accept or decline.
              </Text>
            </View>
          </ScrollView>

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
                <LinearGradient
                  colors={[PURPLE, PURPLE_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.acceptGradient}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Check size={15} color="#fff" strokeWidth={3} />
                      <Text style={styles.acceptText}>Accept & connect</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {queueTotal > 1 && onNext ? (
              <TouchableOpacity
                onPress={onNext}
                disabled={busy}
                style={styles.nextRequestBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.nextRequestText}>View next request</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={onLater}
              disabled={busy}
              style={styles.laterBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.laterText}>Remind me later</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  backdropWeb: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: Theme.screenBackground,
    maxHeight: Platform.OS === 'web' ? '92%' : '82%',
    ...(Platform.OS === 'web'
      ? { width: '100%', maxWidth: 440, borderRadius: 28 }
      : {}),
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
    color: LAVENDER,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroLogoWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
    flexShrink: 0,
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
    gap: 6,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
    lineHeight: 26,
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
    color: LAVENDER,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: LAVENDER,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    gap: 10,
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
    backgroundColor: Theme.pulseIndigoWash,
  },
  offerPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: PURPLE,
  },
  payGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payTile: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 3,
    minWidth: 130,
    width: '48%',
    flexGrow: 1,
  },
  payTileFull: {
    width: '100%',
  },
  payTilePrimary: {
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: Theme.pulseIndigoRing,
  },
  payTileSecondary: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  payTileIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    backgroundColor: Theme.surface,
  },
  payTileIconPrimary: {
    backgroundColor: '#fff',
  },
  payTileAmount: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 24,
    color: Theme.textPrimaryDark,
  },
  payTileLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PURPLE,
  },
  payTileHint: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '400',
    color: Theme.textSecondary,
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
    borderColor: Theme.pulseIndigoRing,
    backgroundColor: Theme.pulseIndigoWash,
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
    paddingHorizontal: 18,
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
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
  nextRequestBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  nextRequestText: {
    fontSize: 13,
    fontWeight: '700',
    color: PURPLE,
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
