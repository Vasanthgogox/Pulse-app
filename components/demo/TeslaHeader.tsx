/**
 * Demo-exact header: title, subtitle, optional back, Globe / Bell / Avatar.
 * Matches demo2 TeslaHeader 100%.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';

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
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12} activeOpacity={0.5}>
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
        )}
        <View style={styles.titleBlock}>
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
          <TouchableOpacity onPress={onProfileClick} style={styles.avatar} hitSlop={8} activeOpacity={0.7}>
            <FontAwesome name="user" size={12} color={Theme.textMutedDemo} />
          </TouchableOpacity>
        ) : (
          <View style={styles.avatar}>
            <FontAwesome name="user" size={12} color={Theme.textMutedDemo} />
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
  titleBlock: {},
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 7,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 2,
  },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
