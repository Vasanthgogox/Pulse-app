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
const HUB_ONLY_WIDTH = Layout.workspaceCardHubWidth;
const CARD_MAX = Layout.workspaceCardMaxWidth;

type WorkspaceFlexCardShellProps = {
  hub: ReactNode;
  panel?: ReactNode;
  panelOpen: boolean;
  onDismiss: () => void;
  onClosePanel: () => void;
};

/**
 * Right-anchored workspace flex card — HubSpot / Zoho settings drawer pattern.
 * Desktop: dimmed backdrop + card from the right; widens when a panel opens.
 * Mobile: full-screen surface (no backdrop).
 */
export function WorkspaceFlexCardShell({
  hub,
  panel,
  panelOpen,
  onDismiss,
  onClosePanel,
}: WorkspaceFlexCardShellProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= SPLIT_MIN;
  const useSplit = isDesktop && panelOpen && !!panel;
  const cardWidth = isDesktop
    ? useSplit
      ? Math.min(Math.round(width * 0.74), CARD_MAX)
      : HUB_ONLY_WIDTH
    : width;
  const hubPaneWidth = useSplit
    ? Math.max(
        280,
        Math.min(Math.round(cardWidth * 0.38), Layout.workspaceCardHubWidth),
      )
    : cardWidth;

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
        {useSplit ? (
          <View style={styles.splitRow}>
            <View
              style={[styles.hubPane, { width: hubPaneWidth, maxWidth: hubPaneWidth }]}
              // Tap-to-close only fires for clicks on the pane background itself —
              // not on any button/link inside `hub`. Wrapping the whole pane in a
              // Pressable (as before) nested real <button> children inside an
              // outer <button>, which is invalid HTML and broke web hydration.
              // `onClick` is RN-Web-only (forwarded straight to the underlying
              // div); React Native's View types don't declare it.
              {...({
                onClick: (e: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
                  if (e.target === e.currentTarget) onClosePanel();
                },
              } as object)}
            >
              <View style={styles.hubPaneInner} pointerEvents="box-none">
                {hub}
              </View>
            </View>
            <View style={styles.detailPane}>{panel}</View>
          </View>
        ) : panelOpen && panel ? (
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
  splitRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 0,
  },
  hubPane: {
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  hubPaneInner: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  detailPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#f5f7fb",
  },
  singlePane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
});
