import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SPLIT_MIN = Layout.workspaceSplitMinWidth;
const CARD_MAX = Layout.workspaceCardMaxWidth;

type WorkspaceFlexCardShellProps = {
  hub: ReactNode;
  panel?: ReactNode;
  panelOpen: boolean;
  onDismiss: () => void;
};

/**
 * Right-anchored workspace flex card.
 * Desktop: dimmed backdrop + card from the right; widens when a panel opens.
 * Mobile: full-screen surface (no backdrop).
 * Always single-pane — hub and detail panel never render side by side.
 */
export function WorkspaceFlexCardShell({
  hub,
  panel,
  panelOpen,
  onDismiss,
}: WorkspaceFlexCardShellProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= SPLIT_MIN;
  const showPanel = panelOpen && !!panel;
  // Fixed card width regardless of hub vs. panel — the card must not resize
  // when navigating in and out of a detail page.
  const cardWidth = isDesktop ? Math.min(Math.round(width * 0.363), CARD_MAX) : width;

  if (!isDesktop) {
    return (
      <View style={styles.mobileRoot}>
        {panelOpen && panel ? panel : hub}
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close workspace"
      />
      <View
        style={[
          styles.card,
          {
            width: cardWidth,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {showPanel ? (
          <View style={styles.singlePane}>{panel}</View>
        ) : (
          <View style={styles.singlePane}>{hub}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileRoot: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    height: "100%",
    backgroundColor: Theme.screenBackground,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "-8px 0 32px rgba(15, 23, 42, 0.14)" as unknown as undefined },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 20,
      },
    }),
  },
  singlePane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
});
