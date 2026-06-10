/**
 * Pulse Products dock — Metronic-aligned chip launcher.
 */
import Theme from "@/constants/Theme";
import {
  HUB_PURPLE,
  HUB_PURPLE_BORDER,
  HUB_PURPLE_TINT,
} from "@/components/profile/workspaceHubMenu.styles";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { StyleSheet } from "react-native";

export const productDockStyles = StyleSheet.create({
  dock: {
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  dockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
  },
  dockHeaderPressed: {
    opacity: 0.88,
  },
  dockHeaderLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dockEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.15,
  },
  dockMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    lineHeight: 14,
  },
  catalogueLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  catalogueLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: HUB_PURPLE,
  },
  scrollContent: {
    paddingHorizontal: 10,
    gap: 4,
    paddingBottom: 2,
  },
  chip: {
    width: 64,
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: HUB_PURPLE_TINT,
    borderColor: HUB_PURPLE_BORDER,
  },
  chipPressed: {
    backgroundColor: METRONIC.bodyBg,
  },
  chipName: {
    fontSize: 9,
    fontWeight: "500",
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 12,
    width: "100%",
  },
  chipNameActive: {
    color: METRONIC.text,
    fontWeight: "600",
  },
  chipNameLocked: {
    color: Theme.textMuted,
    opacity: 0.65,
  },
});
