/**
 * Pulse Products — Metronic-aligned 3-column grid in hub body.
 */
import Theme from "@/constants/Theme";
import {
  HUB_PURPLE,
} from "@/components/profile/workspaceHubMenu.styles";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { StyleSheet } from "react-native";

export const productGridStyles = StyleSheet.create({
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "#F9F9F9",
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  sectionHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: Theme.brandBluePressed,
    flexShrink: 0,
  },
  sectionTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    lineHeight: 14,
  },
  sectionHeaderPressed: {
    opacity: 0.88,
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  gridCell: {
    width: "33.333%",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  chip: {
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 72,
    borderRadius: 10,
  },
  chipActive: {},
  chipPressed: {
    opacity: 0.82,
  },
  chipName: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 13,
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
