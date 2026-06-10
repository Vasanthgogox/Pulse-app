/**
 * Demo header aligned to pulse-unified-base mobile header language.
 * Branded left lockup + right utility cluster (bell, profile).
 */
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { getSignedAvatarUrl } from '@/lib/avatarUpload';
import { DEFAULT_USER_2D_AVATAR_SEED, getUser2DAvatarUriForSeed } from '@/constants/UserAvatars';

export interface TeslaHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onNetworkClick?: () => void;
  /** When set, avatar is tappable and navigates to profile (or caller's action). */
  onProfileClick?: () => void;
}

export function TeslaHeader({
  title,
  subtitle,
  showBack,
  onBack,
  onNetworkClick,
  onProfileClick,
}: TeslaHeaderProps) {
  const { profile } = useAuth();
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const displayName = (profile?.full_name ?? profile?.displayName ?? 'User').trim();
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U';
  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted) setProfileAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted) setProfileAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, profile?.avatar_seed]);
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12} activeOpacity={0.5}>
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
        )}
        <View style={styles.logoBadge}>
          <FontAwesome name="terminal" size={11} color={Theme.textPrimaryDark} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.brandText} numberOfLines={1}>PULSE</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle != null && subtitle !== '' && (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          )}
        </View>
      </View>
      <View style={styles.icons}>
        <TouchableOpacity onPress={onNetworkClick} style={styles.iconBtn} hitSlop={8} activeOpacity={0.7}>
          <FontAwesome name="globe" size={15} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
        <View style={styles.bellWrap}>
          <TouchableOpacity style={styles.iconBtn} hitSlop={8}>
            <FontAwesome name="bell" size={14} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <View style={styles.bellDot} />
        </View>
        {onProfileClick ? (
          <TouchableOpacity onPress={onProfileClick} style={[styles.avatar, profileAvatarUri ? styles.avatarWithImage : null]} hitSlop={8} activeOpacity={0.7}>
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.avatar, profileAvatarUri ? styles.avatarWithImage : null]}>
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  backBtn: { padding: 4 },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginRight: 2,
  },
  titleBlock: { minWidth: 0, flexShrink: 1 },
  brandText: {
    fontSize: 11,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: -0.2,
    fontStyle: 'italic',
    marginBottom: 1,
  },
  title: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  subtitle: {
    fontSize: 7,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 2,
  },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  bellWrap: { position: 'relative' },
  bellDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWithImage: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  avatarInitials: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
