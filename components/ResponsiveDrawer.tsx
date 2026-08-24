/**
 * Shared shell for "desktop right-side drawer, mobile bottom sheet" —
 * extracted from AwardModal.tsx, which had this exact Modal/backdrop/
 * animation logic hand-rolled inline. FindNetworkVehiclesDrawer.tsx and
 * BidSheet.tsx duplicate similar (but not identical — different
 * breakpoints/widths) logic; migrating them onto this primitive is a
 * separate, later step, not done here.
 *
 * This component owns ONLY the chrome: the Modal, the tap-to-close
 * backdrop, the drawer/sheet container (width, radius, shadow, safe-area
 * padding), and the mobile drag handle. It knows nothing about what's
 * inside — the consumer's entire panel (header, body, footer) is passed
 * as `children`, same as AwardModal's own `panelBody` did before.
 */
import Theme from "@/constants/Theme";
import { MotiView } from "moti";
import type { ReactNode } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";

const DEFAULT_DESKTOP_WIDTH = 780;
const DEFAULT_TABLET_WIDTH = 720;
/** Below this, render as a mobile bottom sheet instead of a side drawer. */
const DEFAULT_DRAWER_BREAKPOINT = 768;
/** At/above this, use desktopWidth; between breakpoint and this, tabletWidth. */
const DEFAULT_DESKTOP_BREAKPOINT = 1024;

export interface ResponsiveDrawerProps {
  visible: boolean;
  onClose: () => void;
  insets: { top: number; bottom: number };
  children: ReactNode;
  desktopWidth?: number;
  tabletWidth?: number;
  drawerBreakpoint?: number;
  desktopBreakpoint?: number;
  /** Narrow/native presentation when not a side drawer.
   * "sheet" (default) — bottom sheet: rounded top, drag handle, backdrop
   * tap-to-close (AwardModal's original mobile behavior).
   * "fullScreen" — full-screen slide-up modal, no backdrop, no handle
   * (FindNetworkVehiclesDrawer's original mobile behavior). */
  mobileVariant?: "sheet" | "fullScreen";
  /** Whether the side-drawer container itself applies its default padding
   * (horizontal 22px + safe-area top/bottom -- default true, matching
   * AwardModal's original panel, which has no padding of its own). Set
   * false when `children` already apply their own padding (horizontal
   * and/or insets-based) -- otherwise it stacks on top of theirs. */
  applyDrawerInsetPadding?: boolean;
}

export function ResponsiveDrawer({
  visible,
  onClose,
  insets,
  children,
  desktopWidth = DEFAULT_DESKTOP_WIDTH,
  tabletWidth = DEFAULT_TABLET_WIDTH,
  drawerBreakpoint = DEFAULT_DRAWER_BREAKPOINT,
  desktopBreakpoint = DEFAULT_DESKTOP_BREAKPOINT,
  mobileVariant = "sheet",
  applyDrawerInsetPadding = true,
}: ResponsiveDrawerProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isSideDrawer = Platform.OS === "web" && windowWidth >= drawerBreakpoint;
  const isDesktop = Platform.OS === "web" && windowWidth >= desktopBreakpoint;
  const drawerWidth = isDesktop ? desktopWidth : tabletWidth;

  if (isSideDrawer) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
        accessibilityViewIsModal
      >
        <View style={styles.desktopOverlay}>
          <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <MotiView
            from={{ translateX: drawerWidth }}
            animate={{ translateX: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 320, mass: 0.9 }}
            style={[
              styles.desktopDrawer,
              {
                width: drawerWidth,
                maxWidth: "92%" as unknown as number,
                ...(applyDrawerInsetPadding
                  ? {
                      paddingHorizontal: 22,
                      paddingTop: Math.max(insets.top, 16),
                      paddingBottom: 20 + insets.bottom,
                    }
                  : null),
              },
            ]}
          >
            <View style={styles.drawerInner}>{children}</View>
          </MotiView>
        </View>
      </Modal>
    );
  }

  if (mobileVariant === "fullScreen") {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        {children}
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close">
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <View style={[styles.modalSheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.modalHandle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  desktopOverlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  desktopDrawer: {
    height: "100%" as unknown as number,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 24,
    ...Platform.select({
      web: { boxShadow: "-8px 0 32px rgba(15,23,42,0.18)" } as object,
      default: {},
    }),
  },
  drawerInner: {
    flex: 1,
    minHeight: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    minWidth: 0,
    maxHeight: "92%" as unknown as number,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Theme.borderMedium,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
});
