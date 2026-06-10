import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalLanguage } from '@/contexts/LanguageContext';
import { DriverBrandMark } from '@/components/driver/DriverBrandMark';
import { ROUTES } from '@/lib/routes';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, Platform, Share, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AVATAR_SIZE = Layout.driverHeaderAvatarSize;
/** Ring sits outside the photo; blinks when the driver is online. */
const ONLINE_RING_SIZE = AVATAR_SIZE + 6;
const ONLINE_RING_WIDTH = 2.5;

type DriverHeaderColors = {
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  whiteMuted: string;
  emerald: string;
  emeraldMuted: string;
};

export type DriverHeaderVariant = 'default' | 'assigned';

type Props = {
  colors: DriverHeaderColors;
  avatarUri: string;
  driverName: string;
  isOnline: boolean;
  variant?: DriverHeaderVariant;
  onPressOtpClaim?: () => void;
  onPressNotifications?: () => void;
  onPressLanguage?: () => void;
  /** Number of pending fleet invitations — shows a badge on the invite icon. */
  pendingInviteCount?: number;
  onPressInvites?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function DriverHeader({
  colors,
  avatarUri,
  driverName,
  isOnline,
  variant = 'default',
  onPressNotifications,
  onPressLanguage,
  pendingInviteCount = 0,
  onPressInvites,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { localeOptions, locale } = useOptionalLanguage();
  const languageCode = (localeOptions.find((o) => o.value === locale)?.label ?? 'EN')
    .slice(0, 2)
    .toUpperCase();

  const title =
    variant === 'assigned' ? driverName : `Welcome, ${driverName}`;

  const ringPulse = useSharedValue(1);

  useEffect(() => {
    if (!isOnline) {
      cancelAnimation(ringPulse);
      ringPulse.value = 1;
      return;
    }
    ringPulse.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(ringPulse);
  }, [isOnline, ringPulse]);

  const onlineRingAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ringPulse.value,
  }));

  const handleInviteDrivers = () => {
    const base = 'https://pulse.netlify.app/invite';
    const ref = profile?.uid;
    const inviteUrl = ref ? `${base}?ref=${ref}` : base;
    const message =
      `Join me on Pulse Driver! Manage trips, payouts, and network requests.\n\n` +
      `Sign up here: ${inviteUrl}`;
    Share.share({
      title: 'Join Pulse Driver',
      message,
      url: inviteUrl,
    }).catch(() => {});
  };

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + Layout.driverHeaderTopOffset,
          paddingBottom: Layout.driverHeaderBottomPadding,
          paddingHorizontal: Layout.driverHeaderHorizontalPadding,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        style,
      ]}
    >
      <View style={styles.headerLeft}>
        <TouchableOpacity
          onPress={() => router.push('/(driver)/profile')}
          style={styles.avatarBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isOnline ? 'Profile, online' : 'Profile'}
          accessibilityHint="Opens your driver profile"
        >
          <View style={styles.avatarStack}>
            {isOnline ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.onlinePresenceRing,
                  {
                    width: ONLINE_RING_SIZE,
                    height: ONLINE_RING_SIZE,
                    borderRadius: ONLINE_RING_SIZE / 2,
                    borderWidth: ONLINE_RING_WIDTH,
                    borderColor: colors.emerald,
                  },
                  onlineRingAnimatedStyle,
                ]}
              />
            ) : null}
            <View
              style={[
                styles.avatarCircle,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.emeraldMuted,
                },
              ]}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <FontAwesome name="user" size={16} color={colors.text} />
              )}
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <DriverBrandMark color={colors.textMuted} />
          <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>

      <View style={styles.headerRight}>
        <TouchableOpacity
          onPress={
            onPressLanguage ??
            (() =>
              router.push(
                ROUTES.MODALS.LANGUAGE_SETTINGS as Parameters<typeof router.push>[0],
              ))
          }
          style={[
            styles.languageBtn,
            { backgroundColor: colors.whiteMuted, borderColor: colors.border },
          ]}
          activeOpacity={0.8}
          accessibilityLabel="Language"
          accessibilityHint="Change app display language"
        >
          <FontAwesome
            name="globe"
            size={Layout.driverHeaderActionIconSize - 1}
            color={colors.text}
          />
          <Text style={[styles.languageCode, { color: colors.textMuted }]}>
            {languageCode}
          </Text>
        </TouchableOpacity>

        {/* Fleet invitation icon — badge shows pending count */}
        <TouchableOpacity
          onPress={onPressInvites ?? handleInviteDrivers}
          style={[
            styles.notificationBtn,
            { backgroundColor: colors.whiteMuted, borderColor: colors.border },
          ]}
          activeOpacity={0.8}
          accessibilityLabel={pendingInviteCount > 0 ? `${pendingInviteCount} fleet invite${pendingInviteCount > 1 ? 's' : ''}` : 'Invite drivers'}
          accessibilityHint={pendingInviteCount > 0 ? 'Tap to view fleet invitations' : 'Share your invite link'}
        >
          <FontAwesome
            name={pendingInviteCount > 0 ? 'envelope' : 'user-plus'}
            size={Layout.driverHeaderActionIconSize}
            color={pendingInviteCount > 0 ? colors.emerald : colors.text}
          />
          {pendingInviteCount > 0 ? (
            <View style={[styles.inviteBadge, { backgroundColor: colors.emerald }]}>
              <Text style={styles.inviteBadgeText}>
                {pendingInviteCount > 9 ? '9+' : String(pendingInviteCount)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onPressNotifications ?? (() => router.push('/(driver)/notifications'))}
          style={[
            styles.notificationBtn,
            { backgroundColor: colors.whiteMuted, borderColor: colors.border },
          ]}
          activeOpacity={0.8}
          accessibilityLabel="Notifications"
          accessibilityHint="View notifications"
        >
          <FontAwesome
            name="bell"
            size={Layout.driverHeaderActionIconSize}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 6,
        }
      : { elevation: 1 }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  avatarBtn: {
    padding: 2,
    alignSelf: 'flex-start',
  },
  avatarStack: {
    width: ONLINE_RING_SIZE,
    height: ONLINE_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlinePresenceRing: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  avatarCircle: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    borderRadius: Layout.driverHeaderAvatarSize / 2,
    borderWidth: 2,
    borderColor: Theme.driverEmeraldBorder,
    backgroundColor: Theme.driverSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: Layout.driverHeaderAvatarSize / 2,
  },
  welcomeTitle: {
    ...Typography.headerTitle,
    textTransform: 'none',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  languageBtn: {
    minWidth: Layout.driverHeaderActionSize,
    height: Layout.driverHeaderActionSize,
    paddingHorizontal: 8,
    borderRadius: Layout.driverHeaderActionSize / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  languageCode: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 11,
  },
  notificationBtn: {
    width: Layout.driverHeaderActionSize,
    height: Layout.driverHeaderActionSize,
    borderRadius: Layout.driverHeaderActionSize / 2,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  inviteBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 12,
  },
});

