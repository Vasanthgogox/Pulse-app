import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

/** Shared Metronic connection / grow profile tile chrome. */
export const connectionCardStyles = StyleSheet.create({
  card: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EFF2F5",
    backgroundColor: Theme.cardWhite,
    minHeight: 188,
    gap: 5,
    flex: 1,
    minWidth: 0,
    ...({
      boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.05)",
    } as object),
  },
  cardPressed: {
    opacity: 0.92,
  },
  dismissBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  topMetaRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
    paddingRight: 20,
  },
  topMetaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  roleTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
  ratingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#181C32",
    minWidth: 22,
    textAlign: "right",
  },
  ratingTextEmpty: {
    color: "#A1A5B7",
  },
  avatarWrap: {
    width: 56,
    height: 56,
    position: "relative",
    marginBottom: 4,
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#50CD89",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: "#181C32",
    flexShrink: 1,
  },
  handle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
    maxWidth: "100%",
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  appTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  appTagOn: {
    backgroundColor: "rgba(80, 205, 137, 0.1)",
    borderColor: "rgba(80, 205, 137, 0.35)",
  },
  appTagOff: {
    backgroundColor: "#F5F8FA",
    borderColor: "#EFF2F5",
  },
  appTagPending: {
    backgroundColor: "rgba(255, 199, 0, 0.12)",
    borderColor: "rgba(255, 199, 0, 0.35)",
  },
  appTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  appTagDotOn: {
    backgroundColor: "#50CD89",
  },
  appTagDotOff: {
    backgroundColor: "#A1A5B7",
  },
  appTagDotPending: {
    backgroundColor: "#FFC700",
  },
  appTagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  appTagTextOn: {
    color: "#1B7F4A",
  },
  appTagTextOff: {
    color: "#78829D",
  },
  appTagTextPending: {
    color: "#B78103",
  },
  actionBtn: {
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
  },
  actionBtnInvite: {
    backgroundColor: Theme.primary,
  },
  actionBtnInviteText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.15,
  },
  actionBtnChat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF6FF",
    borderWidth: 1,
    borderColor: "rgba(0, 158, 247, 0.25)",
  },
  actionBtnChatText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.15,
  },
  actionBtnConnected: {
    backgroundColor: "#F5F8FA",
    borderWidth: 1,
    borderColor: "#EFF2F5",
  },
  actionBtnConnectedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#78829D",
    letterSpacing: 0.15,
  },
  actionBtnPending: {
    backgroundColor: "#F5F8FA",
    borderWidth: 1,
    borderColor: "#EFF2F5",
  },
  actionBtnPendingText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#78829D",
    letterSpacing: 0.15,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnPressed: {
    opacity: 0.88,
  },
});

/** Refined grow / discover tile — lighter type, softer chrome. */
export const growConnectionCardStyles = StyleSheet.create({
  card: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderColor: "rgba(76, 87, 125, 0.08)",
    gap: 6,
    minHeight: 180,
    ...({
      boxShadow: "0 1px 12px 0 rgba(76, 87, 125, 0.04)",
    } as object),
  },
  roleTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleTagText: {
    fontSize: 8,
    fontWeight: "500",
    letterSpacing: 0.35,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#78829D",
  },
  avatarWrap: {
    width: 52,
    height: 52,
    marginBottom: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: "500",
    color: "#3F4254",
    letterSpacing: -0.15,
  },
  handle: {
    fontSize: 11,
    fontWeight: "400",
    color: "#78829D",
  },
  footerRow: {
    marginTop: 6,
    gap: 8,
    alignSelf: "stretch",
    paddingHorizontal: 2,
    justifyContent: "space-between",
    alignItems: "center",
  },
  mutualFacepileSlot: {
    flexShrink: 0,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingRight: 4,
  },
  appTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  appTagText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  actionBtn: {
    minHeight: 28,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    flex: 1,
    minWidth: 0,
  },
  actionBtnInvite: {
    backgroundColor: "rgba(79, 70, 229, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.22)",
  },
  actionBtnInviteText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.primary,
    letterSpacing: 0,
  },
  actionBtnConnected: {
    flex: 1,
    backgroundColor: "rgba(80, 205, 137, 0.06)",
    borderColor: "rgba(80, 205, 137, 0.2)",
  },
  actionBtnConnectedText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1B7F4A",
  },
  actionBtnPending: {
    flex: 1,
    backgroundColor: "#F5F8FA",
    borderColor: "#EFF2F5",
  },
  actionBtnPendingText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#78829D",
    letterSpacing: 0.1,
  },
  footerActionOnly: {
    justifyContent: "center",
  },
});
