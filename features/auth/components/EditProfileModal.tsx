/**
 * Edit profile modal — full name, phone, company name, profile photo.
 * Avatar: same as driver — profile.avatar_url (signed) or driver preset from assets/drivers (getAvatarUriForSeed).
 * Change profile photo: pickAndUploadAvatar → updateProfile → onPhotoUpdated. Optional remove to clear and use preset.
 * Green/orange from Theme only (darkGreen, positiveMuted, driverEmerald, driverGold).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { getAvatarUriForSeed, ALL_PRESET_AVATARS } from '@/constants/DriverLevels';
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  USER_2D_AVATARS,
  getUser2DAvatarUriForSeed,
} from '@/constants/UserAvatars';
import { useAuth } from '@/contexts/AuthContext';
import { pickAndUploadAvatar, getSignedAvatarUrl } from '@/lib/avatarUpload';
import { validatePhone } from '@/lib/phoneValidation';
import { VALIDATION, maxLength, validateFullName } from '@/lib/validation';
import * as authService from '../services/auth.service';

/** Default preset seed when no uploaded avatar (same as driver — assets/drivers/driver-1.png etc.). */
const DEFAULT_AVATAR_SEED = 'driver-1';

export interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  /** Current profile values (from useAuth().profile / user) */
  initialFullName: string;
  initialPhone: string;
  initialCompanyName: string;
  /** Read-only; shown for context */
  email: string;
  /** Called after profile photo is updated so parent can refresh (e.g. refreshSession). */
  onPhotoUpdated?: (payload?: {
    avatarUri?: string | null;
    avatarPath?: string | null;
  }) => void | Promise<void>;
  /** Current preset seed when no uploaded photo (driver: from useDriverAvatar; tabs: from AsyncStorage). */
  initialAvatarSeed?: string;
  /** When user selects a preset from the grid, call this so parent can persist (e.g. setAvatarSeed or AsyncStorage). */
  onPresetSelected?: (seed: string) => void;
  /** Profile quote/status (WhatsApp-style). Shown in Edit when provided (e.g. driver profile). */
  initialStatusText?: string;
  /** Controls which preset avatars to show when choosing an avatar. */
  avatarPresetStyle?: 'driver' | 'user-2d';
}

export function EditProfileModal({
  visible,
  onClose,
  initialFullName,
  initialPhone,
  initialCompanyName,
  email,
  onPhotoUpdated,
  initialAvatarSeed = DEFAULT_AVATAR_SEED,
  onPresetSelected,
  initialStatusText = '',
  avatarPresetStyle = 'driver',
}: EditProfileModalProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isUser2D = avatarPresetStyle === 'user-2d';
  const accent = isUser2D ? Theme.primary : Theme.positive;
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [statusText, setStatusText] = useState(initialStatusText);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const defaultPresetSeed =
    avatarPresetStyle === 'user-2d' ? DEFAULT_USER_2D_AVATAR_SEED : DEFAULT_AVATAR_SEED;
  const [avatarUri, setAvatarUri] = useState<string>(() =>
    avatarPresetStyle === 'user-2d'
      ? getUser2DAvatarUriForSeed(defaultPresetSeed)
      : getAvatarUriForSeed(defaultPresetSeed)
  );
  const [selectedPresetSeed, setSelectedPresetSeed] = useState<string>(initialAvatarSeed);
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  useEffect(() => {
    if (visible) {
      setFullName(initialFullName);
      setPhone(initialPhone);
      setCompanyName(initialCompanyName);
      setStatusText(initialStatusText);
      setError(null);
      setSelectedPresetSeed(initialAvatarSeed);
      setShowAvatarDropdown(false);
    }
  }, [visible, initialFullName, initialPhone, initialCompanyName, initialStatusText, initialAvatarSeed]);

  const getPresetUri = useCallback(
    (seed: string) => {
      return avatarPresetStyle === 'user-2d'
        ? getUser2DAvatarUriForSeed(seed)
        : getAvatarUriForSeed(seed);
    },
    [avatarPresetStyle]
  );

  /** Resolve display URI: uploaded (signed URL) or preset avatar. */
  const resolveAvatarUri = useCallback(async (avatarUrl: string | undefined, presetSeed: string) => {
    if (!avatarUrl?.trim()) {
      setAvatarUri(getPresetUri(presetSeed));
      return;
    }
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      setAvatarUri(avatarUrl);
      return;
    }
    const signed = await getSignedAvatarUrl(avatarUrl.trim());
    setAvatarUri(signed ?? getPresetUri(presetSeed));
  }, [getPresetUri]);

  useEffect(() => {
    if (!visible) return;
    resolveAvatarUri(profile?.avatar_url, selectedPresetSeed);
  }, [visible, profile?.avatar_url, selectedPresetSeed, resolveAvatarUri]);

  const handleSave = async () => {
    setError(null);
    const nameErr = validateFullName(true)(fullName);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const phoneTrimmed = phone.trim();
    if (phoneTrimmed.length > 0) {
      const phoneErr = validatePhone(phoneTrimmed);
      if (phoneErr) {
        setError(phoneErr);
        return;
      }
    }
    const companyErr = maxLength(200, 'Company name must be at most 200 characters.')(companyName);
    if (companyErr) {
      setError(companyErr);
      return;
    }
    const statusErr = maxLength(VALIDATION.STATUS_TEXT_MAX_LENGTH, 'Status must be at most ' + VALIDATION.STATUS_TEXT_MAX_LENGTH + ' characters.')(statusText.trim());
    if (statusErr) {
      setError(statusErr);
      return;
    }
    const name = fullName.trim();
    setSaving(true);
    const { error: err } = await authService.updateProfile({
      full_name: name,
      phone: phoneTrimmed,
      company_name: companyName.trim(),
      status_text: statusText.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onPhotoUpdated?.();
    onClose();
  };

  const handleChangePhoto = async () => {
    const uid = profile?.uid;
    if (!uid) return;
    setError(null);
    setPhotoUploading(true);
    const { path, previewUri, error: pickErr } = await pickAndUploadAvatar(uid);
    setPhotoUploading(false);
    if (pickErr) {
      setError(pickErr.message);
      return;
    }
    if (!path) return; // user cancelled
    const { error: updateErr } = await authService.updateProfile({ avatar_url: path });
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    if (previewUri?.trim()) {
      // Optimistic local preview so user sees the uploaded photo immediately.
      setAvatarUri(previewUri);
    }
    // Only replace optimistic preview when we successfully resolve a remote URL.
    // If signed/public read fails due policy lag, keep the local preview instead of reverting.
    const signed = await getSignedAvatarUrl(path);
    if (signed) {
      setAvatarUri(signed);
    }
    await onPhotoUpdated?.({
      avatarUri: signed ?? previewUri ?? null,
      avatarPath: path,
    });
  };

  const handleSelectPreset = async (seed: string) => {
    setShowAvatarDropdown(false);
    setError(null);
    // When selecting a preset, we clear the uploaded avatar_url and set the avatar_seed
    const { error: updateErr } = await authService.updateProfile({ 
      avatar_url: null,
      avatar_seed: seed
    } as authService.UpdateProfileOptions);
    
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setSelectedPresetSeed(seed);
    setAvatarUri(getPresetUri(seed));
    onPresetSelected?.(seed);
    await onPhotoUpdated?.({
      avatarUri: getPresetUri(seed),
      avatarPath: null,
    });
  };

  const driverPreset =
    ALL_PRESET_AVATARS.find((a) => a.seed === selectedPresetSeed) ?? ALL_PRESET_AVATARS[0];
  const userPreset =
    USER_2D_AVATARS.find((a) => a.seed === selectedPresetSeed) ?? USER_2D_AVATARS[0];
  const selectedPreset =
    avatarPresetStyle === 'user-2d'
      ? { seed: userPreset.seed, name: userPreset.name, image: { uri: getUser2DAvatarUriForSeed(userPreset.seed) } }
      : driverPreset;

  const handleRemovePhoto = async () => {
    setError(null);
    const { error: updateErr } = await authService.updateProfile({ 
      avatar_url: null,
      avatar_seed: initialAvatarSeed // fallback to the one passed or default
    } as authService.UpdateProfileOptions);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setSelectedPresetSeed(initialAvatarSeed);
    setAvatarUri(getPresetUri(initialAvatarSeed));
    await onPhotoUpdated?.({
      avatarUri: getPresetUri(initialAvatarSeed),
      avatarPath: null,
    });
  };

  const inputStyle = [
    styles.input,
    styles.inputThemed,
    { borderColor: Theme.borderInput, backgroundColor: Theme.surfaceForm, color: Theme.textPrimary },
  ];
  const labelStyle = [styles.label, { color: Theme.textMuted }];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.outer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + Layout.driverHeaderTopOffset },
            isUser2D
              ? {
                  backgroundColor: Theme.darkBackground,
                  borderBottomColor: Theme.borderOnDark,
                }
              : styles.headerThemed,
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.headerBtn,
              isUser2D && { backgroundColor: 'transparent' },
            ]}
            hitSlop={12}
            accessibilityLabel="Close"
            disabled={saving}
          >
            <FontAwesome
              name="times"
              size={20}
              color={isUser2D ? Theme.textOnDark : Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isUser2D && { color: Theme.textOnDark }]}>
            Edit profile
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Change profile photo: one section with two options — Upload photo | Choose avatar (dropdown with arrow) */}
          <View style={styles.avatarSection}>
            <Text style={[styles.sectionLabel, { color: Theme.textMuted }]}>
              Change profile photo
            </Text>
            <View
              style={[
                styles.avatarPreviewWrap,
                styles.avatarRingGreen,
                isUser2D && {
                  backgroundColor: Theme.surfaceGray,
                  borderColor: Theme.borderLight,
                },
              ]}
            >
              <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
            </View>

            <View
              style={[
                styles.changePhotoOptionsCard,
                isUser2D && { backgroundColor: Theme.surface, borderColor: Theme.borderLight },
              ]}
            >
              <TouchableOpacity
                style={[styles.changePhotoOptionRow, styles.changePhotoOptionBorder]}
                onPress={handleChangePhoto}
                disabled={saving || photoUploading}
                activeOpacity={0.7}
                accessibilityLabel="Upload photo"
              >
                {photoUploading ? (
                  <ActivityIndicator size="small" color={accent} style={styles.photoIcon} />
                ) : (
                  <FontAwesome
                    name="cloud-upload"
                    size={18}
                    color={accent}
                    style={styles.photoIcon}
                  />
                )}
                <Text style={styles.changePhotoOptionLabel}>
                  {photoUploading ? 'Uploading…' : 'Profile photo upload'}
                </Text>
                <FontAwesome name="chevron-right" size={12} color={Theme.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.changePhotoOptionRow}
                onPress={() => setShowAvatarDropdown((v) => !v)}
                disabled={saving || photoUploading}
                activeOpacity={0.7}
                accessibilityLabel="Choose avatar"
                accessibilityState={{ expanded: showAvatarDropdown }}
              >
                <Image source={selectedPreset.image} style={styles.changePhotoOptionAvatar} />
                <Text style={styles.changePhotoOptionLabel} numberOfLines={1}>Choose avatar</Text>
                <FontAwesome
                  name={showAvatarDropdown ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={Theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            {showAvatarDropdown ? (
              <View style={styles.dropdownWrap}>
                <ScrollView
                  style={styles.dropdownList}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.avatarGrid}>
                    {(avatarPresetStyle === 'user-2d' ? USER_2D_AVATARS : ALL_PRESET_AVATARS).map((av) => {
                      const seed = (av as { seed: string }).seed;
                      const name = (av as { name?: string }).name ?? 'Avatar';
                      const isSelected = selectedPresetSeed === seed;
                      const imageSource =
                        avatarPresetStyle === 'user-2d'
                          ? ({ uri: getUser2DAvatarUriForSeed(seed) } as const)
                          : (av as { image: unknown }).image;
                      return (
                        <View key={seed} style={styles.avatarGridCell}>
                          <TouchableOpacity
                            style={[
                              styles.avatarGridItem,
                              isSelected && styles.avatarGridItemSelected,
                            ]}
                            onPress={() => handleSelectPreset(seed)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={name}
                            accessibilityState={{ selected: isSelected }}
                          >
                            <Image source={imageSource as never} style={styles.avatarGridAvatar} />
                            {isSelected ? (
                              <View style={styles.avatarGridCheck}>
                                <FontAwesome name="check" size={12} color={Theme.textOnPrimary} />
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {profile?.avatar_url ? (
              <TouchableOpacity
                style={[styles.photoRow, styles.photoRowRemove, { marginTop: 10 }]}
                onPress={handleRemovePhoto}
                disabled={saving || photoUploading}
                activeOpacity={0.7}
                accessibilityLabel="Remove profile photo"
              >
                <FontAwesome name="trash-o" size={18} color={Theme.textSecondary} style={styles.photoIcon} />
                <Text style={[styles.photoLabel, { color: Theme.textSecondary }]}>Remove photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={labelStyle}>Full name</Text>
          <TextInput
            style={inputStyle}
            placeholder="Your name"
            placeholderTextColor={Theme.textMuted}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            editable={!saving}
          />

          <Text style={labelStyle}>Email address</Text>
          <TextInput
            style={[inputStyle, styles.inputReadOnly]}
            value={email}
            editable={false}
            placeholder="—"
            placeholderTextColor={Theme.textMuted}
          />
          <Text style={styles.hint}>Email cannot be changed here.</Text>

          <Text style={labelStyle}>Primary phone</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. 9025186111"
            placeholderTextColor={Theme.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            editable={!saving}
          />

          <Text style={labelStyle}>Registered company</Text>
          <TextInput
            style={inputStyle}
            placeholder="Company name"
            placeholderTextColor={Theme.textMuted}
            value={companyName}
            onChangeText={setCompanyName}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            editable={!saving}
          />

          <Text style={labelStyle}>Status / Quote</Text>
          <TextInput
            style={[inputStyle, { minHeight: 64 }]}
            placeholder="e.g. Trust your feelings, be a good human being"
            placeholderTextColor={Theme.textMuted}
            value={statusText}
            onChangeText={setStatusText}
            multiline
            numberOfLines={2}
            maxLength={VALIDATION.STATUS_TEXT_MAX_LENGTH}
            autoCorrect={true}
            spellCheck={true}
            editable={!saving}
          />
          <Text style={styles.hint}>
            Shown under your name on profile ({statusText.length}/{VALIDATION.STATUS_TEXT_MAX_LENGTH}).
          </Text>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <Text style={styles.storageNote}>
            Saved to your account (Supabase Auth).
          </Text>
        </ScrollView>

        <View
          style={[
            styles.footer,
            isUser2D
              ? { backgroundColor: Theme.screenBackground, borderTopColor: Theme.borderLight }
              : styles.footerThemed,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.saveBtn,
              styles.saveBtnGreen,
              isUser2D && { backgroundColor: Theme.darkBackground },
              saving && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Layout.spacingMedium,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerThemed: {
    borderBottomColor: Theme.positiveMuted,
    backgroundColor: Theme.screenBackground,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    paddingBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 8,
    color: Theme.textMuted,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 18,
    minHeight: 48,
  },
  inputThemed: {
    borderWidth: 1.5,
  },
  inputReadOnly: {
    backgroundColor: Theme.surfaceBorder,
    color: Theme.textSecondary,
  },
  hint: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: -8,
    marginBottom: 16,
  },
  avatarSection: {
    marginBottom: 20,
    alignItems: 'stretch',
  },
  avatarPreviewWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  changePhotoOptionsCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: 'hidden',
  },
  changePhotoOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  changePhotoOptionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  changePhotoOptionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: Theme.surface,
  },
  changePhotoOptionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  avatarRingGreen: {
    padding: 4,
    borderRadius: 50,
    alignSelf: 'center',
    backgroundColor: Theme.positiveMuted,
    borderWidth: 2,
    borderColor: Theme.positive,
  },
  avatarPreview: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Theme.surfaceLight,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  photoRowRemove: {
    marginTop: 8,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  dropdownWrap: {
    marginTop: 8,
  },
  dropdownList: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    maxHeight: 280,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  avatarGridCell: {
    flexBasis: '16.6667%',
    padding: 5,
  },
  avatarGridItem: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    overflow: 'hidden',
  },
  avatarGridItemSelected: {
    borderColor: Theme.positive,
  },
  avatarGridAvatar: {
    width: '100%',
    height: '100%',
  },
  avatarGridCheck: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIcon: { marginRight: 14 },
  photoLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  errorText: {
    fontSize: 13,
    color: Theme.negative,
    marginBottom: 8,
  },
  storageNote: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 8,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  footerThemed: {
    borderTopColor: Theme.positiveMuted,
    backgroundColor: Theme.screenBackground,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    backgroundColor: Theme.positive,
  },
  saveBtnGreen: {
    backgroundColor: Theme.positive,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
});
