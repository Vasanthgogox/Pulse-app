/**
 * Shared “assignment / allocation” modal shell — Staff Handshake, trip driver-vehicle picker, etc.
 * One visual language with TripAssignmentBlock (slate backdrop, white or slate card, step labels).
 */
import Theme from "@/constants/Theme";
import { Platform, StyleSheet } from "react-native";

export const assignmentShellColors = {
  backdrop: "rgba(45, 55, 72, 0.62)",
  borderSlate: "#e2e8f0",
  title: "#0f172a",
  subtitle: "#64748b",
  stepMuted: "#94a3b8",
  iconTileBg: "#edf2f7",
  closeBg: "#f1f5f9",
  cardWhite: "#ffffff",
  cardSlateBody: "#f8fafc",
} as const;

export const assignmentShellStyles = StyleSheet.create({
  webModalBackdrop: {
    flex: 1,
    backgroundColor: assignmentShellColors.backdrop,
    padding: 18,
    ...Platform.select({
      web: {
        justifyContent: "center",
        alignItems: "center",
      } as any,
    }),
  },

  /** Trip picker modal body (slate) — matches TripAssignmentBlock assignModalWrap */
  assignModalWrapSlate: {
    flex: Platform.OS === "web" ? 0 : 1,
    flexDirection: "column",
    backgroundColor: assignmentShellColors.cardSlateBody,
    borderRadius: Platform.OS === "web" ? 14 : 0,
    overflow: "hidden",
    ...Platform.select({
      web: {
        width: "100%",
        maxWidth: 760,
        maxHeight: "86%",
        minHeight: 420,
        borderWidth: 1,
        borderColor: assignmentShellColors.borderSlate,
      } as any,
    }),
  },

  /** Staff Handshake / white reference modal */
  webModalCardWhite: {
    width: "100%",
    maxWidth: 760,
    backgroundColor: assignmentShellColors.cardWhite,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: assignmentShellColors.borderSlate,
    ...Platform.select({
      web: {
        boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.2)",
        height: "85vh",
        minHeight: 420,
      } as any,
      default: {
        flex: 1,
        minHeight: 0,
      },
    }),
  },

  modalHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: assignmentShellColors.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
    gap: 12,
  },
  modalHeroText: { flex: 1, minWidth: 0 },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: assignmentShellColors.title,
    letterSpacing: -0.35,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: assignmentShellColors.subtitle,
    marginTop: 6,
    lineHeight: 18,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: assignmentShellColors.closeBg,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  modalBodyFlex: {
    flex: 1,
    minHeight: 0,
    backgroundColor: assignmentShellColors.cardWhite,
  },

  bodyScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: assignmentShellColors.cardWhite,
  },

  /** Matches TripAssignmentBlock assignStepLabel */
  stepLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: assignmentShellColors.stepMuted,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 2,
  },

  flowRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  flowRowStack: {
    flexDirection: "column",
    gap: 12,
  },

  choiceCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: assignmentShellColors.borderSlate,
    backgroundColor: assignmentShellColors.cardWhite,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      } as any,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: assignmentShellColors.iconTileBg,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: assignmentShellColors.title,
    letterSpacing: -0.15,
  },
  choiceSub: {
    fontSize: 11,
    fontWeight: "500",
    color: assignmentShellColors.subtitle,
    marginTop: 2,
    lineHeight: 15,
  },
  choiceChevron: { marginLeft: 4, opacity: 0.55 },

  modalFooterBar: {
    borderTopWidth: 1,
    borderTopColor: assignmentShellColors.borderSlate,
    backgroundColor: assignmentShellColors.cardWhite,
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 2,
    elevation: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },

  /** Back pill — light surface + primary text (reference) */
  wizardBackPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: assignmentShellColors.borderSlate,
    backgroundColor: "#e0f2fe",
    marginBottom: 16,
  },
  wizardBackText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  /** Aggregate “Current node” outer card — white on white modal */
  tripAssignSurfaceCard: {
    backgroundColor: assignmentShellColors.cardWhite,
    borderWidth: 1,
    borderColor: assignmentShellColors.borderSlate,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
      } as any,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  inputWell: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: assignmentShellColors.borderSlate,
  },
});
