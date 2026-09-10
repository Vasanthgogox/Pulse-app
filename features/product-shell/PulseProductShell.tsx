/**
 * Shared Pulse product chrome for Expo-hosted products (Invoice, POD).
 * Visual language follows Commerce (brand + product name + account menu).
 * Consumes AuthContext only — no new session/org fetches.
 */
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import {
  DEFAULT_DISPATCHER_ROUTE,
  ROUTES,
} from "@/lib/routes";
import {
  resolveSuiteProduct,
  type ExpoProductShellId,
} from "@/lib/suite/suiteProducts";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useRouter } from "expo-router";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PulseProductShellContext = createContext<ExpoProductShellId | null>(
  null,
);

export function usePulseProductShell(): ExpoProductShellId | null {
  return useContext(PulseProductShellContext);
}

export function PulseProductShell({
  productId,
  children,
}: {
  productId: ExpoProductShellId;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const product = resolveSuiteProduct(productId);

  const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "P";

  const avatarUri = useMemo(() => {
    if (profile?.avatar_url?.startsWith("http")) return profile.avatar_url;
    const seed = profile?.avatar_seed?.trim() || DEFAULT_USER_2D_AVATAR_SEED;
    return getUser2DAvatarUriForSeed(seed);
  }, [profile?.avatar_url, profile?.avatar_seed]);

  const goWorkspace = () => {
    setMenuOpen(false);
    router.push(ROUTES.WORKSPACE);
  };

  const goCore = () => {
    setMenuOpen(false);
    router.replace(DEFAULT_DISPATCHER_ROUTE);
  };

  return (
    <PulseProductShellContext.Provider value={productId}>
      <View style={styles.root}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 10, paddingBottom: 10 },
          ]}
        >
          <View style={styles.headerLeft}>
            <PulseBrandMark size="sm" numberOfLines={1} />
          </View>
          <Text style={styles.productName} numberOfLines={1}>
            {product.name}
          </Text>
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={styles.avatarBtn}
            accessibilityRole="button"
            accessibilityLabel="Open account menu"
            hitSlop={8}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.body}>{children}</View>

        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <View style={styles.menuBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setMenuOpen(false)}
            />
            <View style={[styles.menuCard, { marginTop: insets.top + 52 }]}>
              <Text style={styles.menuName} numberOfLines={1}>
                {displayName}
              </Text>
              <Pressable
                onPress={goWorkspace}
                style={styles.menuRow}
                accessibilityRole="button"
                accessibilityLabel="Open Workspace"
              >
                <Text style={styles.menuRowText}>Workspace</Text>
              </Pressable>
              <Pressable
                onPress={goCore}
                style={styles.menuRow}
                accessibilityRole="button"
                accessibilityLabel="Switch to Pulse Core"
              >
                <Text style={styles.menuRowText}>Switch to Pulse Core</Text>
              </Pressable>
              <Pressable
                onPress={() => setMenuOpen(false)}
                style={styles.menuCancel}
              >
                <Text style={styles.menuCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </PulseProductShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textPrimary,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 36,
    height: 36,
  },
  avatarInitials: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  body: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "flex-end",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  menuCard: {
    width: 240,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  menuName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuRow: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  menuRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  menuCancel: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  menuCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
