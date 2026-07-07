/**
 * Shared ticket-card tokens for Trips + Load Center (indents) mobile hub cards.
 */
import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

export const HUB_MOBILE_TICKET_REF = {
  card: Theme.screenBackground,
  ink: "#1c1c1e",
  inkMid: "#3d4650",
  muted: "#9aa3ad",
  hairline: "#e8ecf0",
  accent: "#1a73e8",
  radius: 16,
} as const;

/** Page/list strip — transparent (cards provide their own white surface). */
export const HUB_MOBILE_LIST_CANVAS_BG = "transparent";

export const hubMobileListCanvasStyles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
  },
  listPadded: {
    width: "100%",
    gap: 0,
    paddingHorizontal: 0,
  },
  cardWrap: {
    width: "100%",
    marginBottom: 12,
  },
});
