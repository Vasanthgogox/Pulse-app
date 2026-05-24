/**
 * My Account screen — personal identity only.
 * Shows user's photo, name, phone, email, and an edit profile button.
 * No org data is displayed here.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PulseAvatar } from '@/components/PulseAvatar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { EditProfileModal } from '@/features/auth';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─────────────────────────────────────────────────────────────────────────────
// ProfileItemRow
// ─────────────────────────────────────────────────────────────────────────────

type ProfileItemRowProps = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
};

function ProfileItemRow({ icon, label, value }: ProfileItemRowProps) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemIconBox}>
        <FontAwesome name={icon} size={15} color={Theme.textMuted} />
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemValue} numberOfLines={1}>
          {value || '—'}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, status } = useAuth();

  const [editModalVisible, setEditModalVisible] = useState(false);

  const isLoading = status === 'restoring';

  if (isLoading) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: insets.top }]}>
        <LoadingIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  const fullName = profile?.full_name ?? profile?.displayName ?? '';
  const phone = profile?.phone ?? '';
  const email = profile?.email ?? '';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={18} color={Theme.textPrimaryDark} />
        </Pressable>
        <Text style={styles.headerTitle}>My Account</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Layout.sectionSpacing },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <PulseAvatar surface="personal" size={72} />
            <Pressable
              style={styles.editCameraBtn}
              onPress={() => setEditModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit profile photo"
            >
              <FontAwesome name="camera" size={11} color={Theme.buttonPrimaryText} />
            </Pressable>
          </View>
          <Text style={styles.avatarName}>{fullName || 'No name set'}</Text>
          {profile?.status_text ? (
            <Text style={styles.avatarStatus}>{profile.status_text}</Text>
          ) : null}
        </View>

        {/* Identity info card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Details</Text>
          <ProfileItemRow icon="user" label="Full Name" value={fullName} />
          <View style={styles.divider} />
          <ProfileItemRow icon="phone" label="Mobile" value={phone} />
          <View style={styles.divider} />
          <ProfileItemRow icon="envelope" label="Email" value={email} />
        </View>

        {/* Edit profile button */}
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
            onPress={() => setEditModalVisible(true)}
            accessibilityRole="button"
          >
            <FontAwesome
              name="pencil"
              size={14}
              color={Theme.buttonPrimaryText}
              style={styles.editBtnIcon}
            />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* Chat identity info card */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <FontAwesome name="comment" size={14} color={Theme.textMuted} />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoTitle}>Chat Identity</Text>
              <Text style={styles.infoBody}>
                Your personal avatar is shown in all chat conversations and when colleagues view
                your profile.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ''}
        initialPhone={profile?.phone ?? ''}
        initialCompanyName={profile?.company_name ?? ''}
        email={profile?.email ?? ''}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceGray,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  content: {
    padding: Layout.screenPaddingHorizontal,
    gap: 16,
  },
  // Avatar section
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Layout.sectionSpacing,
    gap: 8,
  },
  avatarWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  editCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  avatarStatus: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  // Card
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  // Profile item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextWrap: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
    marginBottom: 1,
  },
  itemValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginLeft: 60,
  },
  // Edit button
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Theme.primary,
    margin: 12,
    borderRadius: 10,
  },
  editBtnPressed: {
    opacity: 0.85,
  },
  editBtnIcon: {
    marginRight: 2,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  // Info card
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  infoBody: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
});
