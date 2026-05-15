/**
 * Shared dimmed overlay + elevated white shell for party-add flows.
 * Matches `PartyRegistrationPortal` (Finance) so popups look identical everywhere.
 */
import { Platform, StyleSheet, type ViewStyle } from "react-native";

export const partyAddModalChromeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor:
      Platform.OS === "web"
        ? "rgba(15, 23, 42, 0.52)"
        : "rgba(15, 23, 42, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    position: "relative",
    ...(Platform.OS === "web"
      ? ({ overflow: "auto" } as unknown as ViewStyle)
      : ({} as ViewStyle)),
  },
  /** Full-area tap target behind the shell (does not steal taps from the card). */
  overlayDismissHit: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  shell: {
    flexDirection: "column",
    width: "100%",
    maxHeight: 760,
    minHeight: 0,
    backgroundColor: "#fff",
    borderRadius: 22,
    overflow: "hidden",
    zIndex: 1,
    ...(Platform.OS === "web"
      ? ({
          boxShadow:
            "0 40px 100px -24px rgba(15,23,42,0.12), 0 1px 0 rgba(255,255,255,0.8)",
        } as ViewStyle)
      : ({
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 24 },
          shadowOpacity: 0.35,
          shadowRadius: 40,
          elevation: 12,
        } as ViewStyle)),
  },
});
