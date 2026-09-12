/**
 * Product-chrome account menu — same structure as Pulse Commerce UserMenu.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { platformShadow } from "@/lib/platformShadow";
import { DEFAULT_DISPATCHER_ROUTE, ROUTES } from "@/lib/routes";
import type { ExpoProductShellId } from "@/lib/suite/suiteProducts";
import { useRouter } from "expo-router";
import { ExternalLink, LogOut, Settings, UserRound } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  productId: ExpoProductShellId;
  avatarUri: string | null;
  initials: string;
};

export function PulseProductAccountMenu({
  productId,
  avatarUri,
  initials,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = (
    profile?.full_name ??
    profile?.displayName ??
    "User"
  ).trim();
  const email = (user?.email ?? profile?.email ?? "").trim();

  const close = useCallback(() => setOpen(false), []);

  const openWorkspacePanel = useCallback(
    (panel: "account" | "settings") => {
      close();
      router.push({
        pathname: ROUTES.WORKSPACE,
        params: { panel, fromProduct: productId },
      } as never);
    },
    [close, productId, router],
  );

  const switchToCore = useCallback(() => {
    close();
    router.replace(DEFAULT_DISPATCHER_ROUTE as never);
  }, [close, router]);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    close();
    try {
      router.replace(ROUTES.SIGN_IN_DIRECT as Parameters<typeof router.replace>[0]);
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, [close, router, signOut, signingOut]);

  const avatar = avatarUri ? (
    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
  ) : (
    <Text style={styles.avatarText}>{initials}</Text>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.avatarBtn}
        accessibilityRole="button"
        accessibilityLabel="Open account menu"
      >
        {avatar}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close account menu"
          />
          <View
            style={[
              styles.menu,
              { top: insets.top + 52, right: Layout.screenPaddingHorizontal + 4 },
            ]}
          >
            <View style={styles.identity}>
              <View style={styles.identityAvatar}>{avatar}</View>
              <View style={styles.identityText}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.identityEmail} numberOfLines={1}>
                  {email || "—"}
                </Text>
              </View>
            </View>

            <View style={styles.separator} />

            <Pressable
              onPress={() => openWorkspacePanel("account")}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              <UserRound size={16} color={Theme.textPrimary} strokeWidth={1.8} />
              <Text style={styles.rowLabel}>Profile</Text>
            </Pressable>
            <Pressable
              onPress={() => openWorkspacePanel("settings")}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Settings size={16} color={Theme.textPrimary} strokeWidth={1.8} />
              <Text style={styles.rowLabel}>Settings</Text>
            </Pressable>

            <View style={styles.separator} />

            <Pressable
              onPress={switchToCore}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Switch to Pulse Core"
            >
              <ExternalLink size={16} color={Theme.textPrimary} strokeWidth={1.8} />
              <Text style={styles.rowLabel}>Switch to Pulse Core</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSignOut()}
              disabled={signingOut}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <LogOut size={16} color={Theme.teslaRed} strokeWidth={1.8} />
              <Text style={styles.signOutLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
    borderWidth: 1.5,
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  overlay: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    width: 224,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
    ...platformShadow("0 8px 24px rgba(15, 23, 42, 0.12)", {
      color: Theme.textPrimaryDark,
      opacity: 0.12,
      radius: 16,
      offsetY: 8,
      elevation: 16,
    }),
    ...(Platform.OS === "web" ? ({ zIndex: 400 } as const) : null),
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  identityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  identityEmail: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 12,
  },
  rowPressed: {
    backgroundColor: Theme.backgroundInput,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  signOutLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "400",
    color: Theme.teslaRed,
  },
});
