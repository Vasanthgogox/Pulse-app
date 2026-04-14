import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Platform, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
          accessibilityLabel="Profile"
        >
          <View
            style={[
              styles.avatarCircle,
              { borderColor: colors.border, backgroundColor: colors.emeraldMuted },
            ]}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <FontAwesome name="user" size={16} color={colors.text} />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={[styles.brand, { color: colors.textMuted }]}>Q PILOT</Text>
          <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {isOnline && (
            <View
              style={[
                styles.statusPill,
                { backgroundColor: colors.emeraldMuted, borderColor: colors.border },
              ]}
            >
              <View style={[styles.onlineDot, { backgroundColor: colors.emerald }]} />
              <Text style={[styles.statusPillText, { color: colors.text }]}>Online</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.headerRight}>
        <TouchableOpacity
          onPress={() => router.push('/(driver)/requests')}
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
          onPress={onPressNotifications ?? (() => {})}
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
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 1,
    lineHeight: 11,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
    minHeight: 22,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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

