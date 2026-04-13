/**
 * Edit profile modal — full name, phone, company name, profile photo, status.
 * Driver layout matches reference: hero avatar + sectioned form + primary Save; avatar tap opens action sheet.
 * Avatar: profile.avatar_url (signed) or preset (driver / user-2d). Colors from Theme only.
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
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import Typography from '@/constants/Typography';
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

/** Driver reference screen — background and forest accent (Theme tokens). */
const DRIVER_SCREEN_BG = Theme.surface;
const DRIVER_FOREST = Theme.darkGreen;
const DRIVER_INPUT_BG = Theme.liquidPillBg;
const DRIVER_AVATAR_SIZE = 152;
const DRIVER_EDIT_FAB = 44;

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
  /**
   * Optional line under the name on the driver hero (e.g. tier). When omitted, a generic "DRIVER" label is shown.
   */
  heroSubtitle?: string;
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
  heroSubtitle,
}: EditProfileModalProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isUser2D = avatarPresetStyle === 'user-2d';
  const driverRefLayout = !isUser2D;
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
  const [showAvatarActions, setShowAvatarActions] = useState(false);

  const heroRoleLine = (heroSubtitle?.trim() || 'DRIVER').toUpperCase();
  const emailTrimmed = email?.trim() ?? '';
  const hasEmail = emailTrimmed.length > 0;

  useEffect(() => {
    if (visible) {
      setFullName(initialFullName);
      setPhone(initialPhone);
      setCompanyName(initialCompanyName);
      setStatusText(initialStatusText);
      setError(null);
      setSelectedPresetSeed(initialAvatarSeed);
      setShowAvatarDropdown(false);
      setShowAvatarActions(false);
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
  const resolveAvatarUri = useCallback(
    async (avatarUrl: string | undefined, presetSeed: string) => {
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
    },
    [getPresetUri]
  );

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
    const statusErr = maxLength(
      VALIDATION.STATUS_TEXT_MAX_LENGTH,
      'Status must be at most ' + VALIDATION.STATUS_TEXT_MAX_LENGTH + ' characters.'
    )(statusText.trim());
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
    setShowAvatarActions(false);
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
      setAvatarUri(previewUri);
    }
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
    const { error: updateErr } = await authService.updateProfile({
      avatar_url: null,
      avatar_seed: seed,
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

  const userPreset =
    USER_2D_AVATARS.find((a) => a.seed === selectedPresetSeed) ?? USER_2D_AVATARS[0];
  const selectedPreset =
    avatarPresetStyle === 'user-2d'
      ? {
          seed: userPreset.seed,
          name: userPreset.name,
          image: { uri: getUser2DAvatarUriForSeed(userPreset.seed) },
        }
      : ALL_PRESET_AVATARS.find((a) => a.seed === selectedPresetSeed) ?? ALL_PRESET_AVATARS[0];

  const handleRemovePhoto = async () => {
    setError(null);
    const { error: updateErr } = await authService.updateProfile({
      avatar_url: null,
      avatar_seed: initialAvatarSeed,
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

  const openAvatarActions = () => {
    if (saving || photoUploading) return;
    setShowAvatarActions(true);
  };

  const onChooseAvatarFromSheet = () => {
    setShowAvatarActions(false);
    setShowAvatarDropdown(true);
  };

  const onUploadFromSheet = () => {
    setShowAvatarActions(false);
    void handleChangePhoto();
  };

  const handleDeactivateRequest = () => {
    Alert.alert(
      'Request account deactivation',
      'Your request will be reviewed by your fleet administrator. They will contact you if further action is needed.',
      [{ text: 'OK' }]
    );
  };

  const showEmailOnboardingHint = () => {
    Alert.alert(
      'Add email to your account',
      'Email is set when you sign in with email, or your fleet administrator can link one. If you use phone sign-in only, ask your administrator to add an email to your profile.',
      [{ text: 'OK' }]
    );
  };

  const inputStyle = [
    styles.input,
    styles.inputThemed,
    { borderColor: Theme.borderInput, backgroundColor: Theme.surfaceForm, color: Theme.textPrimary },
  ];
  const labelStyle = [styles.label, { color: Theme.textMuted }];

  const renderAvatarGrid = () => (
    <View style={styles.dropdownWrap}>
      <ScrollView
        style={styles.dropdownList}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.avatarGrid}>
          {(avatarPresetStyle === 'user-2d' ? USER_2D_AVATARS : ALL_PRESET_AVATARS).map((av) => {
            const seed = (av as { seed: string }).seed;
            const name = (av as { name?: string }).name ?? 'Avatar';
            const isSelected = selectedPresetSeed === seed;
            const imageSource =
              avatarPresetStyle === 'user-2d'
                ? ({ uri: getUser2DAvatarUriForSeed(seed) } as const)
                : (av as (typeof ALL_PRESET_AVATARS)[number]).image;
            return (
              <View key={seed} style={styles.avatarGridCell}>
                <TouchableOpacity
                  style={[styles.avatarGridItem, isSelected && styles.avatarGridItemSelected]}
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
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (driverRefLayout && showAvatarActions) {
          setShowAvatarActions(false);
          return;
        }
        onClose();
      }}
    >
      <KeyboardAvoidingView
        style={[styles.outer, driverRefLayout && { backgroundColor: DRIVER_SCREEN_BG }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        {driverRefLayout ? (
          <View
            style={[
              styles.driverHeader,
              {
                paddingTop: insets.top + Layout.spacingLarge,
                paddingBottom: Layout.spacingLarge,
                borderBottomColor: 'rgba(21, 128, 61, 0.08)',
              },
            ]}
          >
            <View style={styles.driverHeaderLeft}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.driverBackBtn}
                hitSlop={12}
                accessibilityLabel="Go back"
                disabled={saving}
              >
                <FontAwesome name="arrow-left" size={22} color={Theme.iconSlate} />
              </TouchableOpacity>
              <Text style={styles.driverHeaderTitle}>Edit Profile</Text>
            </View>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              accessibilityLabel="Save profile"
            >
              {saving ? (
                <ActivityIndicator size="small" color={DRIVER_FOREST} />
              ) : (
                <Text style={styles.driverHeaderSave}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.header,
              { paddingTop: insets.top + Layout.driverHeaderTopOffset },
              {
                backgroundColor: Theme.darkBackground,
                borderBottomColor: Theme.borderOnDark,
              },
            ]}
          >
            <TouchableOpacity
              onPress={onClose}
              style={[styles.headerBtn, { backgroundColor: 'transparent' }]}
              hitSlop={12}
              accessibilityLabel="Close"
              disabled={saving}
            >
              <FontAwesome name="times" size={20} color={Theme.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: Theme.textOnDark }]}>Edit profile</Text>
            <View style={styles.headerSpacer} />
          </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            driverRefLayout ? styles.scrollContentDriver : styles.scrollContent,
            driverRefLayout && {
              paddingBottom: insets.bottom + Layout.keyboardAvoidScrollPadding,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {driverRefLayout ? (
            <>
              <View style={styles.driverHeroBlock}>
                <View style={styles.driverAvatarWrap}>
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={openAvatarActions}
                    disabled={saving || photoUploading}
                    accessibilityLabel="Change profile photo"
                    accessibilityRole="button"
                  >
                    <View style={styles.driverAvatarRing}>
                      <Image
                        source={{ uri: avatarUri }}
                        style={styles.driverAvatarImage}
                      />
                      {photoUploading ? (
                        <View style={styles.driverAvatarLoading}>
                          <ActivityIndicator color={Theme.textOnPrimary} size="large" />
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.driverEditFab}
                    onPress={openAvatarActions}
                    disabled={saving || photoUploading}
                    activeOpacity={0.85}
                    accessibilityLabel="Edit profile photo"
                    accessibilityRole="button"
                  >
                    <FontAwesome name="pencil" size={16} color={Theme.textOnPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.driverHeroName} numberOfLines={1}>
                  {fullName.trim() || 'Your name'}
                </Text>
                <Text style={styles.driverHeroSubtitle} numberOfLines={1}>
                  {heroRoleLine}
                </Text>
              </View>

              {showAvatarDropdown ? (
                <View style={styles.driverAvatarPickerBlock}>
                  <View style={styles.driverAvatarPickerHeader}>
                    <Text style={styles.driverAvatarPickerTitle}>Choose avatar</Text>
                    <TouchableOpacity
                      onPress={() => setShowAvatarDropdown(false)}
                      hitSlop={12}
                      accessibilityLabel="Close avatar picker"
                    >
                      <Text style={styles.driverAvatarPickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  {renderAvatarGrid()}
                </View>
              ) : null}

              {profile?.avatar_url ? (
                <TouchableOpacity
                  style={[styles.photoRow, styles.photoRowRemove, { marginBottom: 20 }]}
                  onPress={handleRemovePhoto}
                  disabled={saving || photoUploading}
                  activeOpacity={0.7}
                  accessibilityLabel="Remove profile photo"
                >
                  <FontAwesome name="trash-o" size={18} color={Theme.textSecondary} style={styles.photoIcon} />
                  <Text style={[styles.photoLabel, { color: Theme.textSecondary }]}>Remove photo</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.driverSectionLegend}>Personal information</Text>

              <Text style={styles.driverFieldLabel}>Full Name</Text>
              <TextInput
                style={styles.driverInput}
                placeholder="Your name"
                placeholderTextColor={Theme.textMuted}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                editable={!saving}
                underlineColorAndroid="transparent"
              />

              <Text style={styles.driverFieldLabel}>Bio / Status</Text>
              <TextInput
                style={[styles.driverInput, styles.driverInputMultiline]}
                placeholder="e.g. Trust your feelings, be a good human being"
                placeholderTextColor={Theme.textMuted}
                value={statusText}
                onChangeText={setStatusText}
                multiline
                numberOfLines={3}
                maxLength={VALIDATION.STATUS_TEXT_MAX_LENGTH}
                autoCorrect
                spellCheck
                editable={!saving}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
              />
              <Text style={styles.driverBioHint}>
                Visible to passengers and fleet managers
              </Text>

              <Text style={[styles.driverSectionLegend, styles.driverSectionLegendSpaced]}>
                Contact details
              </Text>

              <Text style={styles.driverFieldLabel}>Email Address</Text>
              {hasEmail ? (
                <>
                  <View style={styles.driverEmailShell}>
                    <Text style={styles.driverEmailReadonlyText} numberOfLines={1}>
                      {emailTrimmed}
                    </Text>
                    <FontAwesome name="lock" size={14} color={Theme.textMuted} />
                  </View>
                  <Text style={styles.driverEmailAdminHint}>
                    Managed by corporate administrator.
                  </Text>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.driverEmailEmptyCard}
                    onPress={showEmailOnboardingHint}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Add email, more information"
                  >
                    <View style={styles.driverEmailEmptyRow}>
                      <FontAwesome name="envelope-o" size={16} color={DRIVER_FOREST} />
                      <Text style={styles.driverEmailEmptyCta}>Add email</Text>
                      <FontAwesome name="chevron-right" size={12} color={Theme.textMuted} />
                    </View>
                    <Text style={styles.driverEmailEmptySub}>
                      Tap for how email is added to your driver account
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.driverEmailAdminHint}>
                    No email on file yet. Your administrator can help if needed.
                  </Text>
                </>
              )}

              <Text style={styles.driverFieldLabel}>Phone Number</Text>
              <View style={styles.driverPhoneRow}>
                <TouchableOpacity
                  style={styles.driverPhonePrefix}
                  activeOpacity={0.85}
                  onPress={() =>
                    Alert.alert('Country code', 'Country code is set by your organization (+1).')
                  }
                  accessibilityLabel="Country code, plus one"
                >
                  <Text style={styles.driverPhonePrefixText}>+1</Text>
                  <FontAwesome name="chevron-down" size={14} color={Theme.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.driverInput, styles.driverPhoneInput]}
                  placeholder="555-012-3456"
                  placeholderTextColor={Theme.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={!saving}
                  underlineColorAndroid="transparent"
                />
              </View>

              <Text style={[styles.driverSectionLegend, styles.driverSectionLegendSpaced]}>
                Account details
              </Text>

              <Text style={styles.driverFieldLabel}>Registered Company Name</Text>
              <TextInput
                style={styles.driverInput}
                placeholder="Company name"
                placeholderTextColor={Theme.textMuted}
                value={companyName}
                onChangeText={setCompanyName}
                autoCapitalize="words"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                editable={!saving}
                underlineColorAndroid="transparent"
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.driverSaveChangesBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.9}
                accessibilityLabel="Save changes"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.driverSaveChangesBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.driverDeactivateBtn}
                onPress={handleDeactivateRequest}
                activeOpacity={0.75}
                accessibilityLabel="Request account deactivation"
                accessibilityRole="button"
              >
                <Text style={styles.driverDeactivateBtnText}>Request Account Deactivation</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.avatarSection}>
                <Text style={[styles.sectionLabel, { color: Theme.textMuted }]}>
                  Change profile photo
                </Text>
                <View
                  style={[
                    styles.avatarPreviewWrap,
                    styles.avatarRingGreen,
                    {
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
                    { backgroundColor: Theme.surface, borderColor: Theme.borderLight },
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
                    <Text style={styles.changePhotoOptionLabel} numberOfLines={1}>
                      Choose avatar
                    </Text>
                    <FontAwesome
                      name={showAvatarDropdown ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {showAvatarDropdown ? renderAvatarGrid() : null}

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
                autoCorrect
                spellCheck
                editable={!saving}
              />
              <Text style={styles.hint}>
                Shown under your name on profile ({statusText.length}/{VALIDATION.STATUS_TEXT_MAX_LENGTH}).
              </Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Text style={styles.storageNote}>Saved to your account (Supabase Auth).</Text>
            </>
          )}
        </ScrollView>

        {!driverRefLayout ? (
          <View
            style={[
              styles.footer,
              { backgroundColor: Theme.screenBackground, borderTopColor: Theme.borderLight },
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: Theme.darkBackground },
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
        ) : null}

        {driverRefLayout && showAvatarActions ? (
          <View style={styles.actionSheetOverlay} pointerEvents="box-none">
            <Pressable
              style={styles.actionSheetBackdropFill}
              onPress={() => setShowAvatarActions(false)}
              accessibilityLabel="Dismiss"
            />
            <View
              style={[
                styles.actionSheetCard,
                { paddingBottom: Math.max(insets.bottom, 16) + 12 },
              ]}
              pointerEvents="box-none"
            >
              <Text style={styles.actionSheetTitle}>Profile photo</Text>
              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={onChooseAvatarFromSheet}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Choose avatar"
              >
                <FontAwesome name="user" size={18} color={DRIVER_FOREST} style={styles.actionSheetIcon} />
                <Text style={styles.actionSheetRowLabel}>Choose Avatar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={onUploadFromSheet}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Upload photo"
                disabled={photoUploading}
              >
                <FontAwesome name="camera" size={18} color={DRIVER_FOREST} style={styles.actionSheetIcon} />
                <Text style={styles.actionSheetRowLabel}>Upload Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionSheetRow, styles.actionSheetRowLast]}
                onPress={() => setShowAvatarActions(false)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.actionSheetRowLabel, styles.actionSheetCancelText]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  driverHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  driverBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceBorder,
  },
  driverHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DRIVER_FOREST,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  driverHeaderSave: {
    fontSize: 16,
    fontWeight: '600',
    color: DRIVER_FOREST,
  },
  driverHeroBlock: {
    alignItems: 'center',
    marginBottom: Layout.sectionSpacing + 8,
  },
  driverAvatarWrap: {
    width: DRIVER_AVATAR_SIZE + 8,
    height: DRIVER_AVATAR_SIZE + 8,
    marginBottom: 16,
  },
  driverAvatarRing: {
    width: DRIVER_AVATAR_SIZE,
    height: DRIVER_AVATAR_SIZE,
    borderRadius: DRIVER_AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: Theme.screenBackground,
    overflow: 'hidden',
    backgroundColor: Theme.surfaceLight,
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: DRIVER_FOREST,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  driverAvatarImage: {
    width: '100%',
    height: '100%',
  },
  driverAvatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverEditFab: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: DRIVER_EDIT_FAB,
    height: DRIVER_EDIT_FAB,
    borderRadius: DRIVER_EDIT_FAB / 2,
    backgroundColor: DRIVER_FOREST,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: DRIVER_SCREEN_BG,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  driverHeroName: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    textAlign: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  driverHeroSubtitle: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: Theme.textMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  driverSectionLegend: {
    ...Typography.headerTitle,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: Theme.textSection,
    marginBottom: 12,
    marginTop: 4,
  },
  driverSectionLegendSpaced: {
    marginTop: Layout.sectionSpacing,
  },
  driverFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  driverInput: {
    backgroundColor: DRIVER_INPUT_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '400',
    color: Theme.textPrimaryDark,
    marginBottom: 20,
  },
  driverInputMultiline: {
    minHeight: 100,
    paddingTop: 16,
  },
  driverInputReadonly: {
    backgroundColor: Theme.surfaceBorder,
    color: Theme.textSecondary,
  },
  driverBioHint: {
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '400',
    color: Theme.textMuted,
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 4,
    lineHeight: 16,
  },
  driverEmailShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surfaceBorder,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 52,
    marginBottom: 0,
  },
  driverEmailReadonlyText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '400',
    color: Theme.textSecondary,
    marginRight: 10,
  },
  driverEmailEmptyCard: {
    backgroundColor: DRIVER_INPUT_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 0,
  },
  driverEmailEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  driverEmailEmptyCta: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  driverEmailEmptySub: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '400',
    color: Theme.textMuted,
    lineHeight: 16,
  },
  driverEmailAdminHint: {
    fontSize: 12,
    fontWeight: '400',
    color: Theme.textMuted,
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 2,
    lineHeight: 17,
  },
  driverPhoneRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 0,
  },
  driverPhonePrefix: {
    width: 88,
    backgroundColor: DRIVER_INPUT_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  driverPhonePrefixText: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  driverPhoneInput: {
    flex: 1,
    marginBottom: 20,
  },
  driverSaveChangesBtn: {
    marginTop: 12,
    backgroundColor: DRIVER_FOREST,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: DRIVER_FOREST,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  driverSaveChangesBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  driverDeactivateBtn: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  driverDeactivateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Theme.negative,
    textTransform: 'uppercase',
  },
  driverAvatarPickerBlock: {
    marginBottom: 20,
  },
  driverAvatarPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  driverAvatarPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  driverAvatarPickerDone: {
    fontSize: 15,
    fontWeight: '600',
    color: DRIVER_FOREST,
  },
  scrollContentDriver: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
  },
  actionSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
    ...Platform.select({ android: { elevation: 24 } }),
  },
  actionSheetBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
  },
  actionSheetCard: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  actionSheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  actionSheetRowLast: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
  actionSheetIcon: {
    marginRight: 14,
    width: 24,
  },
  actionSheetRowLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  actionSheetCancelText: {
    textAlign: 'center',
    flex: 1,
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
    marginBottom: 12,
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
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
});
