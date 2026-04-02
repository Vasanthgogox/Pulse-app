import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Constants from 'expo-constants';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getCapabilitiesFromProfile } from '@/lib/capabilities';
import { EditProfileModal } from '@/features/auth';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut, user, profile } = useAuth();

  const capabilities = getCapabilitiesFromProfile(profile);
  const hasDispatcherOrFleetAccess =
    capabilities.includes('finance_view') ||
    capabilities.includes('finance_manage') ||
    capabilities.includes('dispatch') ||
    capabilities.includes('dispatch_for_own_fleet');

  const handleClose = () => {
    router.back();
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleEditProfile = () => {
    setShowEditProfileModal(true);
  };

  const displayName =
    profile?.full_name ||
    profile?.displayName ||
    user?.email?.split("@")[0] ||
    'User';
  const userCode = profile?.uid ?? user?.uid?.slice(0, 8).toUpperCase() ?? '—';
  const roleLabel = profile?.aggregated ? 'Dispatcher + Fleet Owner' : 'Fleet User';
  const email = user?.email ?? '—';
  const phone = profile?.phone ?? 'Not added';
  const companyName = profile?.company_name ?? 'Not added';

  const handleDialPhone = async () => {
    if (phone === 'Not added') return;
    const normalized = phone.replace(/[^\d+]/g, '');
    if (!normalized) {
      Alert.alert('Unable to call', 'No valid phone number.');
      return;
    }
    const url = `tel:${normalized}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Unable to call',
        'Phone calls are not available on this device (for example, a simulator) or the number could not be opened.',
      );
    }
  };
  const statusText = profile?.status_text?.trim() || 'Hey there! I am using Q Mobile.';
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    '—';

  return (
    <View style={styles.outer}>
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset }]}>
        <TouchableOpacity onPress={handleClose} style={styles.headerBtn} activeOpacity={0.7}>
          <FontAwesome name="chevron-left" size={20} color={Theme.textOnDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleEditProfile} style={styles.headerBtn} activeOpacity={0.7}>
          <FontAwesome name="pencil" size={18} color={Theme.textOnDark} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Layout.sectionSpacing + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 400);
            }}
            tintColor={Theme.primary}
          />
        }
      >
        <View style={styles.profileHero}>
          <TouchableOpacity style={styles.avatarTouch} onPress={handleEditProfile} activeOpacity={0.8}>
            <Image
              source={{
                uri: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(displayName)}`,
              }}
              style={styles.avatar}
            />
            <View style={styles.avatarEditBadge}>
              <FontAwesome name="camera" size={12} color={Theme.textPrimaryDark} />
            </View>
          </TouchableOpacity>
          <Text numberOfLines={1} style={styles.nameText}>
            {displayName}
          </Text>
          <Text style={styles.aboutText} numberOfLines={2}>
            {statusText}
          </Text>
        </View>

        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={handleEditProfile} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="user" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>{displayName}</Text>
                <Text style={styles.menuLabel}>Name</Text>
              </View>
            </View>
            <FontAwesome name="chevron-right" size={14} color={Theme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, styles.menuDivider]}
            onPress={handleDialPhone}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="phone" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>{phone}</Text>
                <Text style={styles.menuLabel}>Phone</Text>
              </View>
            </View>
            <FontAwesome name="chevron-right" size={14} color={Theme.textMuted} />
          </TouchableOpacity>

          <View style={[styles.menuRow, styles.menuDivider]}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="envelope" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>{email}</Text>
                <Text style={styles.menuLabel}>Email</Text>
              </View>
            </View>
          </View>

          <View style={[styles.menuRow, styles.menuDivider]}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="building" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>{companyName}</Text>
                <Text style={styles.menuLabel}>Company</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.menuCard}>
          <View style={styles.menuRow}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="shield" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>{roleLabel}</Text>
                <Text style={styles.menuLabel}>Role</Text>
              </View>
            </View>
          </View>
          <View style={[styles.menuRow, styles.menuDivider]}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="key" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>
                  {hasDispatcherOrFleetAccess ? 'Operational Access Enabled' : 'Limited Access'}
                </Text>
                <Text style={styles.menuLabel}>Access</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.menuCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => Alert.alert('Account settings', 'Settings module is coming soon.')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="cog" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>Settings</Text>
                <Text style={styles.menuLabel}>Privacy, notifications and app controls</Text>
              </View>
            </View>
            <FontAwesome name="chevron-right" size={14} color={Theme.textMuted} />
          </TouchableOpacity>
          <View style={[styles.menuRow, styles.menuDivider]}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="info-circle" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>
                  Version {appVersion} ({buildNumber})
                </Text>
                <Text style={styles.menuLabel}>App info</Text>
              </View>
            </View>
          </View>
          <View style={[styles.menuRow, styles.menuDivider]}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <FontAwesome name="id-badge" size={16} color={Theme.textPrimaryDark} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuValue}>{userCode}</Text>
                <Text style={styles.menuLabel}>User ID</Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.85}
        >
          <FontAwesome name="sign-out" size={16} color={Theme.textOnDark} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ''}
        initialPhone={profile?.phone ?? ''}
        initialCompanyName={profile?.company_name ?? ''}
        email={user?.email ?? ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Layout.spacingMedium,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderOnDark,
  },
  headerTitle: {
    color: Theme.textOnDark,
    fontSize: 18,
    fontWeight: '700',
  },
  headerBtn: {
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.spacingLarge,
    gap: Layout.spacingExtraLarge,
  },
  profileHero: {
    alignItems: 'center',
    paddingTop: 8,
  },
  avatarTouch: {
    marginBottom: Layout.spacingMedium,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.borderLight,
  },
  nameText: {
    fontSize: 24,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  aboutText: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  menuCard: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize,
  },
  menuDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextWrap: { flex: 1, minWidth: 0 },
  menuValue: { fontSize: 14, color: Theme.textPrimaryDark, fontWeight: '600' },
  menuLabel: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  signOutBtn: {
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.darkBackground,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textOnDark,
  },
});
