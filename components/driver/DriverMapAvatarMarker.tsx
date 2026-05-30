import Theme from '@/constants/Theme';
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from '@/constants/UserAvatars';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type DriverMapAvatarMarkerProps = {
  avatarUri?: string | null;
  avatarSeed?: string | null;
  isOnline?: boolean;
  /** Outer diameter including ring (default 48). */
  size?: number;
};

function resolveAvatarSource(
  avatarUri?: string | null,
  avatarSeed?: string | null,
): { uri: string } | number {
  const trimmed = avatarUri?.trim();
  if (trimmed && (trimmed.startsWith('http') || trimmed.startsWith('data:'))) {
    return { uri: trimmed };
  }
  return { uri: getUser2DAvatarUriForSeed(avatarSeed?.trim() || DEFAULT_USER_2D_AVATAR_SEED) };
}

export function DriverMapAvatarMarker({
  avatarUri,
  avatarSeed,
  isOnline = false,
  size = 48,
}: DriverMapAvatarMarkerProps) {
  const ringColor = isOnline ? Theme.darkGreen : Theme.teslaRed;
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    if (!isOnline) {
      pulse.value = 0.2;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [isOnline, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  const ring = Math.max(3, Math.round(size * 0.1));
  const inner = size - ring * 2;
  const tailW = Math.max(10, Math.round(size * 0.22));
  const tailH = Math.max(6, Math.round(size * 0.14));

  return (
    <View style={[styles.wrap, { width: size, height: size + tailH }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.pulseRing,
          pulseStyle,
          {
            width: size + 8,
            height: size + 8,
            borderRadius: (size + 8) / 2,
            borderColor: ringColor,
            top: -4,
            left: -4,
          },
        ]}
      />
      <View
        style={[
          styles.avatarShell,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ring,
            borderColor: ringColor,
          },
        ]}
      >
        <Image
          source={resolveAvatarSource(avatarUri, avatarSeed)}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          }}
          resizeMode="cover"
        />
        <View
          style={[
            styles.statusChip,
            { backgroundColor: ringColor, borderColor: '#fff' },
          ]}
        />
      </View>
      <View
        style={[
          styles.pointer,
          {
            borderLeftWidth: tailW / 2,
            borderRightWidth: tailW / 2,
            borderTopWidth: tailH,
            borderTopColor: ringColor,
            marginTop: -1,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  avatarShell: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  statusChip: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  pointer: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
