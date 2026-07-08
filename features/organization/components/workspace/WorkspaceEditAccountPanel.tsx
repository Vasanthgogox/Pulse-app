/**
 * Edit profile — workspace flex-card detail panel.
 *
 * Renders the same form fields and avatar editing flow as
 * `EditProfileModal`, but inline inside `WorkspaceDetailLayout` so it
 * lives in the 40vw side card (matching the My Account panel) instead of
 * opening as a native full-screen `<Modal>`. Back arrow returns to the
 * `"account"` panel; saving updates the profile and returns to the
 * account view.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { ALL_PRESET_AVATARS, getAvatarUriForSeed } from "@/constants/DriverLevels";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  USER_2D_AVATARS,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import * as authService from "@/features/auth/services/auth.service";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { useWorkspaceFeedback } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { getSignedAvatarUrl, pickAndUploadAvatar } from "@/lib/avatarUpload";
import { VALIDATION, maxLength, validateFullName } from "@/lib/validation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Camera, Check, ImagePlus, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const PURPLE = "#4D3636";
const PURPLE_TINT = "rgba(79,70,229,0.08)";
const PURPLE_BORDER = "rgba(79,70,229,0.22)";
const DEFAULT_AVATAR_SEED = "driver-1";

type Props = {
  onBack: () => void;
};

export function WorkspaceEditAccountPanel({ onBack }: Props) {
  const { profile, user, refreshSession } = useAuth();
  const { notice, confirm } = useWorkspaceFeedback();

  const initialFullName = profile?.full_name ?? profile?.displayName ?? "";
  const initialPhone = profile?.phone ?? "";
  const initialCompanyName = profile?.company_name ?? "";
  const initialStatusText = profile?.status_text ?? "";
  const initialAvatarSeed = profile?.avatar_seed ?? DEFAULT_USER_2D_AVATAR_SEED;
  const email = user?.email ?? profile?.email ?? "";
  const avatarPresetStyle: "driver" | "user-2d" = "user-2d";

  const [fullName, setFullName] = useState(initialFullName);
  const [statusText, setStatusText] = useState(initialStatusText);
  const [selectedPresetSeed, setSelectedPresetSeed] = useState<string>(initialAvatarSeed);
  const [avatarUri, setAvatarUri] = useState<string>(() =>
    avatarPresetStyle === "user-2d"
      ? getUser2DAvatarUriForSeed(initialAvatarSeed)
      : getAvatarUriForSeed(initialAvatarSeed),
  );
  const [showAvatarActions, setShowAvatarActions] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPresetUri = useCallback(
    (seed: string) =>
      avatarPresetStyle === "user-2d"
        ? getUser2DAvatarUriForSeed(seed)
        : getAvatarUriForSeed(seed),
    [avatarPresetStyle],
  );

  const resolveAvatarUri = useCallback(
    async (avatarUrl: string | undefined | null, presetSeed: string) => {
      if (!avatarUrl?.trim()) {
        setAvatarUri(getPresetUri(presetSeed));
        return;
      }
      if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
        setAvatarUri(avatarUrl);
        return;
      }
      const signed = await getSignedAvatarUrl(avatarUrl.trim());
      setAvatarUri(signed ?? getPresetUri(presetSeed));
    },
    [getPresetUri],
  );

  useEffect(() => {
    void resolveAvatarUri(profile?.avatar_url ?? null, selectedPresetSeed);
  }, [profile?.avatar_url, selectedPresetSeed, resolveAvatarUri]);

  const handleSave = async () => {
    setError(null);
    const nameErr = validateFullName(true)(fullName);
    if (nameErr) {
      setError(nameErr);
      notice({ kind: "error", title: "Check your full name", message: nameErr });
      return;
    }
    const trimmedStatus = statusText.trim();
    const statusErr = maxLength(
      VALIDATION.STATUS_TEXT_MAX_LENGTH,
      `Status must be at most ${VALIDATION.STATUS_TEXT_MAX_LENGTH} characters.`,
    )(trimmedStatus);
    if (statusErr) {
      setError(statusErr);
      notice({ kind: "error", title: "Status too long", message: statusErr });
      return;
    }
    setSaving(true);
    const { error: err } = await authService.updateProfile({
      full_name: fullName.trim(),
      status_text: trimmedStatus || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      notice({ kind: "error", title: "Couldn’t save", message: err.message });
      return;
    }
    await refreshSession();
    notice({
      kind: "success",
      title: "Profile updated",
      message: "Your changes are saved.",
    });
    onBack();
  };

  const handleUploadPhoto = async () => {
    const uid = profile?.uid;
    if (!uid) return;
    setShowAvatarActions(false);
    setError(null);
    setPhotoUploading(true);
    const { path, previewUri, error: pickErr } = await pickAndUploadAvatar(uid);
    setPhotoUploading(false);
    if (pickErr) {
      setError(pickErr.message);
      notice({ kind: "error", title: "Upload failed", message: pickErr.message });
      return;
    }
    if (!path) return;
    const { error: updateErr } = await authService.updateProfile({ avatar_url: path });
    if (updateErr) {
      setError(updateErr.message);
      notice({ kind: "error", title: "Couldn’t save photo", message: updateErr.message });
      return;
    }
    if (previewUri?.trim()) setAvatarUri(previewUri);
    const signed = await getSignedAvatarUrl(path);
    if (signed) setAvatarUri(signed);
    await refreshSession();
    notice({ kind: "success", title: "Profile photo updated" });
  };

  const handleSelectPreset = async (seed: string) => {
    setShowAvatarPicker(false);
    setShowAvatarActions(false);
    setError(null);
    const { error: updateErr } = await authService.updateProfile({
      avatar_url: null,
      avatar_seed: seed,
    } as authService.UpdateProfileOptions);
    if (updateErr) {
      setError(updateErr.message);
      notice({ kind: "error", title: "Couldn’t set avatar", message: updateErr.message });
      return;
    }
    setSelectedPresetSeed(seed);
    setAvatarUri(getPresetUri(seed));
    await refreshSession();
    notice({ kind: "success", title: "Avatar updated" });
  };

  const handleRemovePhoto = async () => {
    const ok = await confirm({
      title: "Remove profile photo?",
      message:
        "Your account will fall back to the default avatar until you upload a new photo.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setShowAvatarActions(false);
    setError(null);
    const { error: updateErr } = await authService.updateProfile({
      avatar_url: null,
      avatar_seed: initialAvatarSeed,
    } as authService.UpdateProfileOptions);
    if (updateErr) {
      setError(updateErr.message);
      notice({ kind: "error", title: "Couldn’t remove photo", message: updateErr.message });
      return;
    }
    setSelectedPresetSeed(initialAvatarSeed);
    setAvatarUri(getPresetUri(initialAvatarSeed));
    await refreshSession();
    notice({ kind: "success", title: "Profile photo removed" });
  };

  const presetList = useMemo(
    () => (avatarPresetStyle === "user-2d" ? USER_2D_AVATARS : ALL_PRESET_AVATARS),
    [avatarPresetStyle],
  );

  const footerSlot = (
    <View style={styles.footerRow}>
      <Pressable
        onPress={onBack}
        disabled={saving}
        style={({ pressed }) => [
          styles.cancelBtn,
          pressed && { opacity: 0.85 },
          saving && { opacity: 0.5 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </Pressable>
      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={({ pressed }) => [
          styles.saveBtn,
          pressed && { opacity: 0.9 },
          saving && { opacity: 0.75 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save profile"
      >
        {saving ? (
          <LoadingIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.saveBtnText}>Save changes</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES["account-edit"]}
      subtitle={WORKSPACE_PANEL_SUBTITLES["account-edit"]}
      onBack={onBack}
      footerSlot={footerSlot}
    >
      {/* Avatar card */}
      <View style={styles.avatarCard}>
        <Text style={styles.sectionEyebrow}>CHANGE PROFILE PHOTO</Text>
        <View style={styles.avatarRow}>
          <View style={styles.avatarRingWrap}>
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            {photoUploading ? (
              <View style={styles.avatarLoading}>
                <LoadingIndicator size="small" color="#ffffff" />
              </View>
            ) : null}
            <Pressable
              onPress={() => setShowAvatarActions((v) => !v)}
              disabled={saving || photoUploading}
              style={({ pressed }) => [
                styles.avatarEditBadge,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile photo"
            >
              <Camera size={12} color="#ffffff" strokeWidth={2.4} />
            </Pressable>
          </View>
          <View style={styles.avatarHelper}>
            <Text style={styles.avatarHelperTitle}>Profile photo</Text>
            <Text style={styles.avatarHelperBody}>
              Choose a preset avatar or upload your own. Visible to teammates and
              partners.
            </Text>
          </View>
        </View>

        {showAvatarActions ? (
          <View style={styles.avatarActionsRow}>
            <Pressable
              onPress={() => {
                setShowAvatarActions(false);
                setShowAvatarPicker(true);
              }}
              style={({ pressed }) => [
                styles.avatarActionChip,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <ImagePlus size={14} color={PURPLE} strokeWidth={2.4} />
              <Text style={styles.avatarActionChipText}>Choose preset</Text>
            </Pressable>
            <Pressable
              onPress={handleUploadPhoto}
              disabled={photoUploading}
              style={({ pressed }) => [
                styles.avatarActionChip,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Camera size={14} color={PURPLE} strokeWidth={2.4} />
              <Text style={styles.avatarActionChipText}>Upload photo</Text>
            </Pressable>
            {profile?.avatar_url ? (
              <Pressable
                onPress={handleRemovePhoto}
                style={({ pressed }) => [
                  styles.avatarActionChip,
                  styles.avatarActionChipDanger,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
              >
                <Trash2 size={14} color={Theme.negative} strokeWidth={2.4} />
                <Text
                  style={[styles.avatarActionChipText, { color: Theme.negative }]}
                >
                  Remove
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showAvatarPicker ? (
          <View style={styles.presetGridWrap}>
            <View style={styles.presetGridHeader}>
              <Text style={styles.presetGridTitle}>Choose avatar</Text>
              <Pressable
                onPress={() => setShowAvatarPicker(false)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.presetGridDone}>Done</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.presetGridScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.presetGrid}>
                {presetList.map((av) => {
                  const seed = (av as { seed: string }).seed;
                  const name = (av as { name?: string }).name ?? "Avatar";
                  const isSelected = selectedPresetSeed === seed;
                  const imageSource = (av as (typeof ALL_PRESET_AVATARS)[number]).image;
                  return (
                    <View key={seed} style={styles.presetCell}>
                      <Pressable
                        onPress={() => handleSelectPreset(seed)}
                        style={({ pressed }) => [
                          styles.presetItem,
                          isSelected && styles.presetItemSelected,
                          pressed && { opacity: 0.85 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={name}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Image
                          source={imageSource as never}
                          style={styles.presetImage}
                        />
                        {isSelected ? (
                          <View style={styles.presetCheck}>
                            <Check size={10} color="#ffffff" strokeWidth={3} />
                          </View>
                        ) : null}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* Form fields */}
      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Full name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your name"
          placeholderTextColor={Theme.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          spellCheck={false}
          editable={!saving}
        />

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          Email address
        </Text>
        <TextInput
          style={[styles.input, styles.inputReadonly]}
          value={email}
          editable={false}
          placeholder="—"
          placeholderTextColor={Theme.textMuted}
        />
        <Text style={styles.hint}>Email cannot be changed here.</Text>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          Primary phone
        </Text>
        <TextInput
          style={[styles.input, styles.inputReadonly]}
          value={initialPhone}
          editable={false}
          placeholder="—"
          placeholderTextColor={Theme.textMuted}
        />
        <Text style={styles.hint}>Phone cannot be changed here.</Text>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          Registered company
        </Text>
        <TextInput
          style={[styles.input, styles.inputReadonly]}
          value={initialCompanyName}
          editable={false}
          placeholder="—"
          placeholderTextColor={Theme.textMuted}
        />
        <Text style={styles.hint}>
          Registered at signup. Contact support to update.
        </Text>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          Status / quote
        </Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
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
          Shown under your name on profile ({statusText.length}/
          {VALIDATION.STATUS_TEXT_MAX_LENGTH}).
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.storageNote}>
          <FontAwesome name="lock" size={11} color={Theme.textMuted} />
          <Text style={styles.storageNoteText}>
            Saved to your account (Supabase Auth).
          </Text>
        </View>
      </View>
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  avatarCard: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarRingWrap: {
    position: "relative",
    width: 84,
    height: 84,
    padding: 3,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 76,
    height: 76,
    backgroundColor: Theme.surfaceLight,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHelper: { flex: 1, minWidth: 0, gap: 4 },
  avatarHelperTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  avatarHelperBody: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  avatarActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  avatarActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: PURPLE_TINT,
  },
  avatarActionChipDanger: {
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  avatarActionChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: PURPLE,
    letterSpacing: 0.2,
  },
  presetGridWrap: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  presetGridHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  presetGridTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  presetGridDone: {
    fontSize: 12,
    fontWeight: "800",
    color: PURPLE,
    letterSpacing: 0.2,
  },
  presetGridScroll: {
    maxHeight: 240,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 6,
  },
  presetCell: {
    flexBasis: "16.6667%",
    padding: 4,
  },
  presetItem: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  presetItemSelected: { borderColor: PURPLE },
  presetImage: { width: "100%", height: "100%" },
  presetCheck: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  formCard: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  fieldLabelSpaced: { marginTop: 14 },
  input: {
    backgroundColor: Theme.surfaceForm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
    minHeight: 44,
  },
  inputReadonly: {
    backgroundColor: Theme.surfaceBorder,
    color: Theme.textSecondary,
  },
  inputMultiline: { minHeight: 68 },
  hint: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 6,
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
    color: Theme.negative,
  },
  storageNote: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  storageNoteText: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0.3,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: Theme.surface,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  saveBtn: {
    minWidth: 150,
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonPrimaryText ?? "#ffffff",
    letterSpacing: 0.2,
  },
});
