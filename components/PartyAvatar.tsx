/**
 * PartyAvatar — global, context-aware profile picture component.
 *
 * Uses `useAvatar` internally: uploaded photo, 2D seed preset, or coloured initials.
 *
 * Quick-use wrappers: <DriverAvatar />, <OrgAvatar />, <UserAvatar />
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { partyAvatarInitialsTextColor } from '@/lib/partyAvatarDisplay';
import {
  useAvatar,
  type AvatarContext,
  type AvatarParty,
  type DriverParty,
  type OrgParty,
  type UserParty,
} from '@/lib/useAvatar';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AvatarShape = 'circle' | 'rounded' | 'square';

export type PartyAvatarProps = {
  /** Typed party descriptor — see `lib/useAvatar.ts`. */
  party: AvatarParty;
  /**
   * `personal`              — show person's own photo (profile page, settings)
   * `representing_company`  — show org logo when user acts on behalf of company
   * Ignored for drivers (always own photo) and orgs (always logo).
   */
  context?: AvatarContext;
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  /** Override the border colour (default: `rgba(0,0,0,0.08)`) */
  borderColor?: string;
  /** Show 1px border ring. Default true. */
  showBorder?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function br(size: number, shape: AvatarShape): number {
  if (shape === 'circle') return size / 2;
  if (shape === 'rounded') return Math.round(size * 0.25);
  return 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core component
// ─────────────────────────────────────────────────────────────────────────────

export function PartyAvatar({
  party,
  context = 'personal',
  size,
  shape = 'circle',
  style,
  borderColor = 'rgba(0,0,0,0.08)',
  showBorder = true,
}: PartyAvatarProps) {
  const { imageUri, loading, initials, initialsColor } = useAvatar(party, context);

  const opacity = useRef(new Animated.Value(0)).current;
  const prevUri = useRef<string | null>(null);

  // Fade in when image URL first resolves
  useEffect(() => {
    if (imageUri && imageUri !== prevUri.current) {
      prevUri.current = imageUri;
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    if (!imageUri) {
      opacity.setValue(0);
      prevUri.current = null;
    }
  }, [imageUri, opacity]);

  const radius = br(size, shape);
  const baseStyle: StyleProp<ViewStyle> = [
    styles.base,
    {
      width: size,
      height: size,
      borderRadius: radius,
      borderWidth: showBorder ? StyleSheet.hairlineWidth : 0,
      borderColor,
    },
    style,
  ];

  // ── Image resolved ────────────────────────────────────────────────────────
  if (imageUri) {
    return (
      <View style={baseStyle}>
        <Animated.Image
          source={{ uri: imageUri }}
          style={[styles.img, { borderRadius: radius, opacity }]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  // ── Loading shimmer (no image yet, async in-flight) ───────────────────────
  if (loading) {
    return (
      <View style={[baseStyle, styles.shimmer]} />
    );
  }

  // ── Initials fallback ─────────────────────────────────────────────────────
  const textColor = partyAvatarInitialsTextColor(initialsColor);
  const fontSize = Math.round(size * 0.36);

  return (
    <View style={[baseStyle, { backgroundColor: initialsColor }]}>
      <Text
        style={[styles.initials, { fontSize, color: textColor }]}
        numberOfLines={1}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Driver avatar — always shows their own photo or initials.
 *
 * @example
 * <DriverAvatar name={driver.name} avatarUrl={driver.avatar_url} size={40} />
 */
export function DriverAvatar({
  name,
  avatarUrl,
  avatarSeed,
  size,
  shape = 'circle',
  style,
  showBorder,
}: Omit<DriverParty, 'type'> & {
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
}) {
  return (
    <PartyAvatar
      party={{ type: 'driver', name, avatarUrl, avatarSeed }}
      size={size}
      shape={shape}
      style={style}
      showBorder={showBorder}
    />
  );
}

/**
 * Org/company logo avatar — always shows company logo or initials.
 * Defaults to `shape="rounded"` to match company branding conventions.
 *
 * @example
 * <OrgAvatar name={org.name} logoUrl={org.logo_url} ownerAvatarUrl={owner.avatar_url} size={40} />
 */
export function OrgAvatar({
  name,
  logoUrl,
  ownerAvatarUrl,
  ownerAvatarSeed,
  size,
  shape = 'rounded',
  style,
  showBorder,
}: Omit<OrgParty, 'type'> & {
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
}) {
  return (
    <PartyAvatar
      party={{ type: 'organization', name, logoUrl, ownerAvatarUrl, ownerAvatarSeed }}
      size={size}
      shape={shape}
      style={style}
      showBorder={showBorder}
    />
  );
}

/**
 * User/employee avatar. Pass `context="representing_company"` to show the
 * org logo when the user is interacting with customers or dispatching.
 *
 * @example — personal profile page
 * <UserAvatar name={profile.full_name} avatarUrl={profile.avatar_url} size={40} />
 *
 * @example — dispatch card (shows org logo instead of personal photo)
 * <UserAvatar
 *   name={profile.full_name}
 *   avatarUrl={profile.avatar_url}
 *   orgLogoUrl={org.logo_url}
 *   orgOwnerAvatarUrl={ownerProfile.avatar_url}
 *   context="representing_company"
 *   size={40}
 * />
 */
export function UserAvatar({
  name,
  avatarUrl,
  orgLogoUrl,
  orgOwnerAvatarUrl,
  avatarSeed,
  orgOwnerAvatarSeed,
  context = 'personal',
  size,
  shape = 'circle',
  style,
  showBorder,
}: Omit<UserParty, 'type'> & {
  context?: AvatarContext;
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
}) {
  return (
    <PartyAvatar
      party={{
        type: 'user',
        name,
        avatarUrl,
        orgLogoUrl,
        orgOwnerAvatarUrl,
        avatarSeed,
        orgOwnerAvatarSeed,
      }}
      context={context}
      size={size}
      shape={shape}
      style={style}
      showBorder={showBorder}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  shimmer: {
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  initials: {
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
