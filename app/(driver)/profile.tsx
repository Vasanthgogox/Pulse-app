/**
 * Driver Profile — flat UI: profile block + menu list; respects Driver theme (light/dark).
 */
import { getAvatarUriForSeed } from '@/constants/DriverLevels';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { EditProfileModal } from '@/features/auth/components/EditProfileModal';
import * as authService from '@/features/auth/services/auth.service';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { VALIDATION, maxLength } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Horizontal padding aligned with Layout. */
const SCREEN_PADDING_H = Layout.screenPaddingHorizontal;
/** Menu row horizontal inset for icon/label/chevron alignment. */
const MENU_ROW_PADDING_H = 8;

/** Menu: Account, Documents, Level progression, Notification, Privacy, About, Settings. */
const MENU_ITEMS: { id: string; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }[] = [
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'documents', label: 'Documents', icon: 'id-card' },
  { id: 'level', label: 'Level progression', icon: 'star' },
  { id: 'notification', label: 'Notification', icon: 'bell' },
  { id: 'privacy', label: 'Privacy and security', icon: 'lock' },
  { id: 'about', label: 'About', icon: 'info-circle' },
  { id: 'settings', label: 'Settings', icon: 'cog' },
];

const DEFAULT_TAGLINE = 'Trust your feelings, be a good human beings';

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useDriverThemeColors();
  const { user, profile, signOut, refreshSession } = useAuth();
  const { avatarSeed, setAvatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();
  const [avatarError, setAvatarError] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showEditQuoteModal, setShowEditQuoteModal] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const displayName =
    profile?.full_name ||
    profile?.displayName ||
    user?.email?.split('@')[0] ||
    'Pilot';
  const tagline = profile?.status_text?.trim() || DEFAULT_TAGLINE;
  const displayAvatarUri = avatarError ? getAvatarUriForSeed(displayName || 'pilot') : (avatarUri || getAvatarUriForSeed(displayName || 'pilot'));

  const handleCloseEditProfile = () => {
    setShowEditProfileModal(false);
    refreshSession();
  };

  useEffect(() => {
    if (showEditQuoteModal) {
      setQuoteDraft(profile?.status_text?.trim() ?? '');
      setQuoteError(null);
    }
  }, [showEditQuoteModal, profile?.status_text]);

  const handleSaveQuote = async () => {
    const trimmed = quoteDraft.trim();
    const err = maxLength(VALIDATION.STATUS_TEXT_MAX_LENGTH, 'Quote must be at most ' + VALIDATION.STATUS_TEXT_MAX_LENGTH + ' characters.')(trimmed);
    if (err) {
      setQuoteError(err);
      return;
    }
    setQuoteError(null);
    setQuoteSaving(true);
    const { error } = await authService.updateProfile({ status_text: trimmed || null });
    setQuoteSaving(false);
    if (error) {
      setQuoteError(error.message);
      return;
    }
    setShowEditQuoteModal(false);
    refreshSession();
  };

  const handleMenuPress = (id: string) => {
    if (id === 'account') {
      setShowEditProfileModal(true);
      return;
    }
    if (id === 'documents') router.push('/(driver)/documents');
    else if (id === 'level') router.push('/(driver)/level-progression');
    else if (id === 'settings') router.push('/(driver)/settings');
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  return (
    <View style={[styles.outer, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingHorizontal: Layout.driverHeaderHorizontalPadding,
            paddingBottom: Layout.driverHeaderBottomPadding,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityLabel="Back"
        >
          <FontAwesome name="chevron-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => {}}
          activeOpacity={0.7}
          accessibilityLabel="Search"
        >
          <FontAwesome name="search" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Layout.sectionSpacing + insets.bottom, paddingHorizontal: SCREEN_PADDING_H },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.profileBlock}
          onPress={() => setShowEditProfileModal(true)}
          activeOpacity={0.9}
          accessibilityLabel="Edit profile"
        >
          <Image
            source={{ uri: displayAvatarUri }}
            style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]}
            onError={() => setAvatarError(true)}
            onLoad={() => setAvatarError(false)}
          />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.taglineRow}>
              <Text style={[styles.profileTagline, { color: colors.textMuted }]} numberOfLines={2}>
                {tagline}
              </Text>
              <TouchableOpacity
                onPress={() => setShowEditQuoteModal(true)}
                style={styles.pencilBtn}
                hitSlop={12}
                activeOpacity={0.7}
                accessibilityLabel="Edit quote"
                accessibilityRole="button"
              >
                <FontAwesome name="pencil" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.menuList}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuRow,
                index > 0 && [styles.menuRowDivider, { borderTopColor: colors.border }],
                { paddingLeft: MENU_ROW_PADDING_H, paddingRight: MENU_ROW_PADDING_H },
              ]}
              onPress={() => handleMenuPress(item.id)}
              activeOpacity={0.7}
              accessibilityLabel={item.label}
              accessibilityRole="button"
            >
              <View style={styles.menuRowLeft}>
                <FontAwesome name={item.icon} size={20} color={colors.primary} style={styles.menuIcon} />
                <Text style={[styles.menuLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
              </View>
              <View style={styles.menuRowRight}>
                <FontAwesome name="chevron-right" size={14} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <FontAwesome name="sign-out" size={18} color={colors.text} />
          <Text style={[styles.signOutText, { color: colors.text }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfileModal}
        onClose={handleCloseEditProfile}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ''}
        initialPhone={profile?.phone ?? ''}
        initialCompanyName={profile?.company_name ?? ''}
        email={user?.email ?? ''}
        onPhotoUpdated={refreshSession}
        initialAvatarSeed={avatarSeed}
        onPresetSelected={(seed) => {
          setAvatarSeed(seed);
          refreshSession();
        }}
        initialStatusText={profile?.status_text ?? ''}
      />

      <Modal
        visible={showEditQuoteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !quoteSaving && setShowEditQuoteModal(false)}
      >
        <KeyboardAvoidingView
          style={[styles.quoteModalOuter, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.quoteModalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => !quoteSaving && setShowEditQuoteModal(false)}
              style={styles.quoteModalHeaderBtn}
              hitSlop={12}
              disabled={quoteSaving}
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.quoteModalCancelText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.quoteModalTitle, { color: colors.text }]}>Edit quote</Text>
            <TouchableOpacity
              onPress={handleSaveQuote}
              style={[styles.quoteModalHeaderBtn, styles.quoteModalHeaderBtnRight]}
              hitSlop={12}
              disabled={quoteSaving}
              accessibilityLabel="Save"
            >
              {quoteSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.quoteModalSaveText, { color: colors.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.quoteModalScroll}
            contentContainerStyle={styles.quoteModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              style={[styles.quoteInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="e.g. Trust your feelings, be a good human being"
              placeholderTextColor={colors.placeholder}
              value={quoteDraft}
              onChangeText={(t) => { setQuoteDraft(t); setQuoteError(null); }}
              multiline
              numberOfLines={3}
              maxLength={VALIDATION.STATUS_TEXT_MAX_LENGTH}
              autoCorrect
              spellCheck
              editable={!quoteSaving}
            />
            <Text style={[styles.quoteCharCount, { color: colors.textMuted }]}>
              {quoteDraft.length}/{VALIDATION.STATUS_TEXT_MAX_LENGTH}
            </Text>
            {quoteError ? <Text style={styles.quoteError}>{quoteError}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    ...Typography.headerTitle,
    textAlign: 'center',
  },
  searchBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 20,
  },
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
  },
  profileInfo: { flex: 1, minWidth: 0 },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pencilBtn: {
    padding: 6,
    marginLeft: 2,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  profileTagline: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  menuList: {
    marginTop: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    minHeight: Layout.minTouchTargetSize,
  },
  menuRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  menuRowRight: {
    minWidth: 28,
    paddingLeft: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  menuIcon: {
    width: 24,
    marginRight: 16,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: Layout.sectionSpacing,
    paddingVertical: 16,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
  },
  quoteModalOuter: {
    flex: 1,
  },
  quoteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  quoteModalHeaderBtn: {
    minWidth: 60,
    alignItems: 'flex-start',
  },
  quoteModalHeaderBtnRight: {
    alignItems: 'flex-end',
  },
  quoteModalCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  quoteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  quoteModalSaveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  quoteModalScroll: { flex: 1 },
  quoteModalScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    paddingBottom: 20,
  },
  quoteInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  quoteCharCount: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  quoteError: {
    fontSize: 13,
    color: Theme.negative,
    marginTop: 4,
  },
});
