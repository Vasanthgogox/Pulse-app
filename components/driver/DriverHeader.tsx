import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, Platform, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
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
  style?: StyleProp<ViewStyle>;
};

export function DriverHeader({
  colors,
  avatarUri,
  driverName,
  isOnline,
  variant = 'default',
  onPressNotifications,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          <Text style={[styles.brand, { color: colors.textMuted }]}>Q PILOT</Text>
          <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>

      <View style={styles.headerRight}>
        <TouchableOpacity
          onPress={() => router.push('/(driver)')}
          style={[
            styles.notificationBtn,
            { backgroundColor: colors.whiteMuted, borderColor: colors.border },
          ]}
          activeOpacity={0.8}
          accessibilityLabel="Requests"
          accessibilityHint="View connection requests"
        >
          <FontAwesome name="user-plus" size={18} color={colors.text} />
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
          <FontAwesome name="bell" size={18} color={colors.text} />
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
  brand: {
    ...Typography.headerSubtitle,
    marginBottom: 1,
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
    gap: 8,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

