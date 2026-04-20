import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
    DEFAULT_USER_2D_AVATAR_SEED,
    getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { EditProfileModal } from "@/features/auth";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Image,
    Linking,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ProfileItemRowProps = {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value: string;
  onPress?: () => void;
  showChevron?: boolean;
};

function ProfileItemRow({
  icon,
  label,
  value,
  onPress,
  showChevron,
}: ProfileItemRowProps) {
  const content = (
    <>
      <View style={styles.profileItemLeft}>
        <View style={styles.profileItemIconBox}>
          <FontAwesome name={icon} size={16} color={Theme.textMuted} />
        </View>
        <View style={styles.profileItemTextWrap}>
          <Text style={styles.profileItemLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.profileItemValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
      {showChevron ? (
        <FontAwesome name="chevron-right" size={14} color={Theme.textSection} />
      ) : (
        <View style={styles.profileItemRightSpacer} />
      )}
    </>
  );

  if (!onPress) {
    return <View style={styles.profileItemRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileItemRow,
        pressed && styles.profileItemRowPressed,
      ]}
      accessibilityRole="button"
    >
      {({ pressed }) => (
        <View style={styles.profileItemRowInner}>
          <View style={styles.profileItemLeft}>
            <View
              style={[
                styles.profileItemIconBox,
                pressed && styles.profileItemIconBoxPressed,
              ]}
            >
              <FontAwesome
                name={icon}
                size={16}
                color={pressed ? Theme.textOnDark : Theme.textMuted}
              />
            </View>
            <View style={styles.profileItemTextWrap}>
              <Text style={styles.profileItemLabel} numberOfLines={1}>
                {label}
              </Text>
              <Text style={styles.profileItemValue} numberOfLines={1}>
                {value}
              </Text>
            </View>
          </View>
          {showChevron ? (
            <FontAwesome
              name="chevron-right"
              size={14}
              color={Theme.textSection}
            />
          ) : (
            <View style={styles.profileItemRightSpacer} />
          )}
        </View>
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { signOut, user, profile, refreshSession } = useAuth();

  const USER_AVATAR_SEED_KEY = "@q-mobile/user-avatar-seed";
  const [avatarSeed, setAvatarSeed] = useState(
    profile?.avatar_seed || DEFAULT_USER_2D_AVATAR_SEED,
  );

  useEffect(() => {
    if (profile?.avatar_seed) {
      setAvatarSeed(profile.avatar_seed);
    }
  }, [profile?.avatar_seed]);

  const [avatarUri, setAvatarUri] = useState<string>(() =>
    getUser2DAvatarUriForSeed(profile?.avatar_seed || DEFAULT_USER_2D_AVATAR_SEED),
  );

  const capabilities = getCapabilitiesFromProfile(profile);
  const hasDispatcherOrFleetAccess =
    capabilities.includes("finance_view") ||
    capabilities.includes("finance_manage") ||
    capabilities.includes("dispatch") ||
    capabilities.includes("dispatch_for_own_fleet");

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  };

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleEditProfile = () => {
    setShowEditProfileModal(true);
  };

  const openSignOutConfirm = () => {
    if (signOutLoading) return;
    setShowSignOutConfirm(true);
  };

  const closeSignOutConfirm = () => {
    if (signOutLoading) return;
    setShowSignOutConfirm(false);
  };

  const confirmSignOut = async () => {
    if (signOutLoading) return;
    setSignOutLoading(true);
    try {
      await signOut();
      setShowSignOutConfirm(false);
      router.replace("/sign-in");
    } finally {
      setSignOutLoading(false);
    }
  };

  const displayName =
    profile?.full_name ||
    profile?.displayName ||
    user?.email?.split("@")[0] ||
    "User";
  const userCode = profile?.uid ?? user?.uid?.slice(0, 8).toUpperCase() ?? "—";
  const roleLabel = profile?.aggregated
    ? "Dispatcher + Fleet Owner"
    : "Fleet User";
  const email = user?.email ?? "—";
  const phone = profile?.phone ?? "Not added";
  const companyName = profile?.company_name ?? "Not added";
  const accessLabel = useMemo(
    () =>
      hasDispatcherOrFleetAccess
        ? "Operational Access Enabled"
        : "Limited Access",
    [hasDispatcherOrFleetAccess],
  );

  const handleDialPhone = async () => {
    if (phone === "Not added") return;
    const normalized = phone.replace(/[^\d+]/g, "");
    if (!normalized) {
      Alert.alert("Unable to call", "No valid phone number.");
      return;
    }
    const url = `tel:${normalized}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Unable to call",
        "Phone calls are not available on this device (for example, a simulator) or the number could not be opened.",
      );
    }
  };
  const statusText =
    profile?.status_text?.trim() || "Hey there! I am using Q Mobile.";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    "—";

  useEffect(() => {
    let mounted = true;
    (async () => {
      const fallback = getUser2DAvatarUriForSeed(avatarSeed);
      const raw = profile?.avatar_url?.trim();
      if (!raw) {
        if (mounted) setAvatarUri(fallback);
        return;
      }
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        if (mounted) setAvatarUri(raw);
        return;
      }
      const signed = await getSignedAvatarUrl(raw);
      if (mounted) setAvatarUri(signed ?? fallback);
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.avatar_url, avatarSeed]);

  return (
    <View style={styles.outer}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Layout.sectionSpacing +
              insets.bottom +
              Layout.demoTabBarScrollBottomInset,
          },
        ]}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
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
        <View
          style={[
            styles.cinematicHeader,
            { paddingTop: insets.top + Layout.headerPaddingBelowInset },
          ]}
        >
          <View style={styles.cinematicHeaderBg}>
            <View style={styles.cinematicHeaderGlow} />
            <View style={styles.cinematicHeaderMesh} />
          </View>

          <View style={styles.cinematicHeaderTopRow}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.headerChip,
                pressed && styles.headerChipPressed,
              ]}
              accessibilityRole="button"
              hitSlop={Layout.touchTargetHitSlop}
            >
              <FontAwesome
                name="chevron-left"
                size={18}
                color={Theme.textOnDark}
              />
            </Pressable>

            <Text style={styles.cinematicHeaderTitle}>Profile</Text>

            <Pressable
              onPress={handleEditProfile}
              style={({ pressed }) => [
                styles.headerChip,
                pressed && styles.headerChipPressed,
              ]}
              accessibilityRole="button"
              hitSlop={Layout.touchTargetHitSlop}
            >
              <FontAwesome name="pencil" size={16} color={Theme.textOnDark} />
            </Pressable>
          </View>

          <View style={styles.profileHero}>
            <View style={styles.avatarGlow} />
            <Pressable
              style={({ pressed }) => [
                styles.avatarTouch,
                pressed && styles.avatarTouchPressed,
              ]}
              onPress={handleEditProfile}
              accessibilityRole="button"
            >
              <View style={styles.avatarFrame}>
                <Image
                  source={{
                    uri: avatarUri,
                  }}
                  style={styles.avatar}
                />
              </View>
              <View style={styles.avatarEditBadge}>
                <FontAwesome
                  name="camera"
                  size={14}
                  color={Theme.textPrimaryDark}
                />
              </View>
            </Pressable>

            <Text numberOfLines={1} style={styles.nameText}>
              {displayName}
            </Text>
            <Text style={styles.aboutText} numberOfLines={2}>
              {statusText}
            </Text>
          </View>
        </View>

        <View style={styles.contentWrap}>
          <View style={styles.premiumCard}>
            <View style={styles.premiumCardInner}>
              <ProfileItemRow
                icon="user"
                label="Name"
                value={displayName}
                onPress={handleEditProfile}
                showChevron
              />
              <View style={styles.premiumDivider} />
              <ProfileItemRow
                icon="phone"
                label="Phone"
                value={phone}
                onPress={handleDialPhone}
                showChevron
              />
              <View style={styles.premiumDivider} />
              <ProfileItemRow icon="envelope" label="Email" value={email} />
              <View style={styles.premiumDivider} />
              <ProfileItemRow
                icon="building"
                label="Company"
                value={companyName}
              />
            </View>
          </View>

          <View style={styles.premiumCard}>
            <View style={styles.premiumCardInner}>
              <ProfileItemRow icon="shield" label="Role" value={roleLabel} />
              <View style={styles.premiumDivider} />
              <ProfileItemRow icon="key" label="Access" value={accessLabel} />
            </View>
          </View>

          <View style={styles.premiumCard}>
            <View style={styles.premiumCardInner}>
              <ProfileItemRow
                icon="file-text-o"
                label="POD"
                value="Manage proof of delivery"
                onPress={() => router.push("/pod-reconciliation")}
                showChevron
              />
              <View style={styles.premiumDivider} />
              <ProfileItemRow
                icon="file-text"
                label="Invoice"
                value="Execute Invoicing"
                onPress={() => router.push("/invoicing-execute")}
                showChevron
              />
            </View>
          </View>

          <View style={styles.premiumCard}>
            <View style={styles.premiumCardInner}>
              <ProfileItemRow
                icon="cog"
                label="Settings"
                value="Branding & identity for invoice PDFs"
                onPress={() => router.push("/branding-settings")}
                showChevron
              />
              <View style={styles.premiumDivider} />
              <ProfileItemRow
                icon="info-circle"
                label="Version"
                value={`Version ${appVersion} (${buildNumber})`}
              />
            </View>
          </View>

          <Pressable
            onPress={openSignOutConfirm}
            style={({ pressed }) => [
              styles.signOutBtn,
              pressed && styles.signOutBtnPressed,
            ]}
            accessibilityRole="button"
          >
            <FontAwesome name="sign-out" size={16} color={Theme.textOnDark} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ""}
        initialPhone={profile?.phone ?? ""}
        initialCompanyName={profile?.company_name ?? ""}
        email={user?.email ?? ""}
        initialStatusText={profile?.status_text ?? ""}
        onPhotoUpdated={async (payload) => {
          if (payload?.avatarUri?.trim()) {
            setAvatarUri(payload.avatarUri);
          }
          await refreshSession();
        }}
        initialAvatarSeed={avatarSeed}
        avatarPresetStyle="user-2d"
        onPresetSelected={(seed) => {
          setAvatarSeed(seed);
        }}
      />
      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={closeSignOutConfirm}
      >
        <View style={styles.signOutConfirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSignOutConfirm} />
          <View style={styles.signOutConfirmCard}>
            <Text style={styles.signOutConfirmTitle}>Sign out</Text>
            <Text style={styles.signOutConfirmBody}>
              Are you sure you want to sign out?
            </Text>
            <View style={styles.signOutConfirmActions}>
              <Pressable
                onPress={closeSignOutConfirm}
                style={({ pressed }) => [
                  styles.signOutConfirmCancelBtn,
                  pressed && styles.signOutConfirmCancelBtnPressed,
                ]}
                accessibilityRole="button"
                disabled={signOutLoading}
              >
                <Text style={styles.signOutConfirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmSignOut()}
                style={({ pressed }) => [
                  styles.signOutConfirmCtaBtn,
                  pressed && styles.signOutConfirmCtaBtnPressed,
                  signOutLoading && styles.signOutConfirmCtaBtnDisabled,
                ]}
                accessibilityRole="button"
                disabled={signOutLoading}
              >
                <Text style={styles.signOutConfirmCtaText}>
                  {signOutLoading ? "Signing out..." : "Sign out"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.screenBackground },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 0,
    gap: 0,
  },

  cinematicHeader: {
    backgroundColor: Theme.cinematicHeaderBg,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 18,
    overflow: "hidden",
  },
  cinematicHeaderBg: {
    ...StyleSheet.absoluteFillObject,
  },
  cinematicHeaderGlow: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: Theme.cinematicGlowRed,
    opacity: 0.6,
  },
  cinematicHeaderMesh: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cinematicHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 8,
  },
  cinematicHeaderTitle: {
    ...Typography.headerTitle,
    color: Theme.textOnDark,
    letterSpacing: 3,
  },
  headerChip: {
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: Theme.cinematicHeaderChipBg,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  headerChipPressed: {
    backgroundColor: Theme.cinematicHeaderChipBgPressed,
  },

  profileHero: {
    alignItems: "center",
    paddingTop: 6,
  },
  avatarGlow: {
    position: "absolute",
    top: 14,
    width: 124,
    height: 124,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  avatarTouch: { marginBottom: Layout.spacingMedium },
  avatarTouchPressed: { transform: [{ scale: 0.98 }] },
  avatarFrame: {
    width: 112,
    height: 112,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: Theme.darkBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  avatar: {
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surfaceGray,
  },
  avatarEditBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.darkBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  nameText: {
    fontSize: 24,
    fontWeight: "700",
    color: Theme.textOnDark,
    marginBottom: 4,
  },
  aboutText: {
    fontSize: 10,
    color: Theme.textOnDarkMuted,
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 14,
    letterSpacing: 0.3,
  },

  contentWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 18,
    gap: 16,
  },
  premiumCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.cinematicCardBorder,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  premiumCardInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  premiumDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.cinematicDivider,
    marginLeft: 52,
  },

  profileItemRow: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  profileItemRowPressed: {
    opacity: 0.9,
  },
  profileItemRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  profileItemIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  profileItemIconBoxPressed: {
    backgroundColor: Theme.darkBackground,
  },
  profileItemTextWrap: { flex: 1, minWidth: 0 },
  profileItemLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2.2,
    color: Theme.textSecondary,
    marginBottom: 2,
  },
  profileItemValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  profileItemRightSpacer: { width: 14, height: 14 },

  signOutBtn: {
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.cinematicHeaderBg,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  signOutBtnPressed: {
    backgroundColor: Theme.teslaRed,
    transform: [{ scale: 0.985 }],
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 2.4,
  },
  signOutConfirmBackdrop: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: "center",
    backgroundColor: Theme.overlayBackdrop,
  },
  signOutConfirmCard: {
    backgroundColor: Theme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  signOutConfirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  signOutConfirmBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    marginBottom: 14,
  },
  signOutConfirmActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  signOutConfirmCancelBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 16,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.backgroundInput,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  signOutConfirmCancelBtnPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  signOutConfirmCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  signOutConfirmCtaBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.teslaRed,
  },
  signOutConfirmCtaBtnPressed: {
    opacity: 0.9,
  },
  signOutConfirmCtaBtnDisabled: {
    opacity: 0.7,
  },
  signOutConfirmCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
});
