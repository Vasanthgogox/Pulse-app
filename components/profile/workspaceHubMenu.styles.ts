/**
 * Workspace hub drawer — KeenThemes / Metronic reference tokens.
 * @see features/network/components/desktop/networkDesktopHub.styles.ts (METRONIC)
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Platform, StyleSheet } from "react-native";

export { METRONIC };

/** Pastel blue gradient stops for the workspace header band. */
export const HUB_HEADER_GRADIENT = ["#B9E2F5", "#CDE9F7", "#E5F4FB"] as const;

export const HUB_PURPLE = Theme.brandBlueInk;
export const HUB_PURPLE_DEEP = "#9ACEEB";
export const HUB_PURPLE_VIVID = Theme.brandBluePressed;
export const HUB_PURPLE_LIGHT = Theme.primaryLight;
export const HUB_PURPLE_TINT = Theme.pulseIndigoWash;
export const HUB_PURPLE_BORDER = Theme.pulseIndigoRing;
export const HUB_MENU_ICON = METRONIC.subtle;

const HEADER_GLASS_WEB =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(14px) saturate(180%)",
        WebkitBackdropFilter: "blur(14px) saturate(180%)",
      } as const)
    : {};

export const hubStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: METRONIC.bodyBg,
    minWidth: 0,
    position: "relative",
    overflow: "hidden",
  },

  // ── Header band (violet gradient + glass) ───────────────────────────────
  headerBand: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 18,
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 8px 24px rgba(76, 29, 149, 0.28)" as unknown as undefined,
      },
      default: {
        shadowColor: HUB_PURPLE_DEEP,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: 8,
      },
    }),
  },
  headerGradientFill: {
    ...StyleSheet.absoluteFillObject,
  },
  headerSheen: {
    position: "absolute",
    top: -20,
    left: -10,
    right: "35%",
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.14)",
    opacity: 0.55,
    transform: [{ rotate: "-8deg" }],
  },
  headerVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(49, 16, 101, 0.22)",
  },
  headerBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerBandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 1,
  },
  headerLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...HEADER_GLASS_WEB,
    ...Platform.select({
      web: {
        boxShadow:
          "0 2px 10px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.35)" as unknown as undefined,
      },
      default: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
      },
    }),
  },
  headerLogoImage: { width: "100%", height: "100%", borderRadius: 9 },
  headerLogoFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoInitials: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },
  headerBandText: { flex: 1, minWidth: 0, gap: 3 },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    ...HEADER_GLASS_WEB,
    ...Platform.select({
      web: {
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)" as unknown as undefined,
      },
      default: {},
    }),
  },
  closeBtnPressed: { backgroundColor: "rgba(255,255,255,0.26)" },

  // ── Scroll body ────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },

  // Quick actions (Metronic symbol cards)
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 24,
    paddingHorizontal: 4,
  },
  quickAction: { alignItems: "center", gap: 8, minWidth: 72 },
  quickCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: METRONIC.heroBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(24, 28, 50, 0.06)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  quickAvatar: { width: "100%", height: "100%" },
  quickAvatarInitials: { fontSize: 16, fontWeight: "700", color: HUB_PURPLE },
  quickLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: METRONIC.text,
    textAlign: "center",
  },

  // Insight / promo card
  insightBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HUB_PURPLE_BORDER,
    backgroundColor: "rgba(124, 58, 237, 0.07)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  insightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: HUB_PURPLE_BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  insightTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  insightTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.15,
  },
  insightBody: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: METRONIC.muted,
  },

  // Section cards (Preferences / Party)
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "#F9F9F9",
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: HUB_PURPLE_VIVID,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
    minHeight: 44,
  },
  menuRowFirst: { borderTopWidth: 0 },
  menuRowPressed: { backgroundColor: METRONIC.bodyBg },
  menuRowSelected: { backgroundColor: HUB_PURPLE_TINT },
  menuRowIconPlain: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.text,
  },
  valuePill: {
    maxWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: HUB_PURPLE_BORDER,
    backgroundColor: "rgba(124, 58, 237, 0.04)",
  },
  valuePillText: {
    fontSize: 10,
    fontWeight: "600",
    color: HUB_PURPLE_DEEP,
    textAlign: "center",
  },

  // Footer
  footerWrap: { backgroundColor: METRONIC.heroBg },
  footerDivider: {
    height: 1,
    backgroundColor: METRONIC.border,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  footerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  footerAvatar: { width: 34, height: 34, borderRadius: 11 },
  footerAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: HUB_PURPLE_TINT,
    alignItems: "center",
    justifyContent: "center",
  },
  footerAvatarInitials: { fontSize: 12, fontWeight: "700", color: HUB_PURPLE },
  footerText: { flex: 1, minWidth: 0 },
  footerName: { fontSize: 12, fontWeight: "700", color: METRONIC.text },
  footerEmail: { fontSize: 10, color: METRONIC.muted, marginTop: 2 },
  signOutBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: METRONIC.bodyBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
  },
  signOutBtnPressed: { backgroundColor: "rgba(232, 33, 39, 0.06)" },

  // Sign-out modal
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: METRONIC.heroBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: METRONIC.border,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { fontSize: 17, fontWeight: "700", color: METRONIC.text },
  confirmBody: { fontSize: 14, color: METRONIC.muted, lineHeight: 20 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: METRONIC.bodyBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
  },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: METRONIC.subtle },
  confirmCtaBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: HUB_PURPLE,
    alignItems: "center",
  },
  confirmCtaText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
