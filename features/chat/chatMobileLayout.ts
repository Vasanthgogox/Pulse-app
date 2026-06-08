/**
 * Mobile chat layout tokens — Metronic demo2 density (compact typography).
 */
import { Platform } from "react-native";

export const CHAT_MOBILE = {
  /** Conversation thread background */
  wallpaper: "#FFFFFF",
  composerBar: "#FFFFFF",
  composerInput: "#FFFFFF",
  headerBg: "#FFFFFF",
  headerBorder: "#EFF2F5",
  bubbleMaxWidthPct: "78%",
  avatarSize: 32,
  bubbleFontSize: 12,
  bubbleLineHeight: 17,
  bubblePadH: 10,
  bubblePadV: 8,
  bubbleRadius: 12,
  metaFontSize: 9,
  headerTitleSize: 13,
  headerSubtitleSize: 10,
  listRowPad: 8,
  listAvatar: 44,
  listTitleSize: 12,
  listPreviewSize: 11,
  listTimeSize: 9,
  composerMinHeight: 36,
  composerMaxHeight: 96,
  composerFontSize: 13,
  composerLineHeight: 18,
  iconBtn: 32,
  sendBtnHeight: 34,
  sendBtnMinWidth: 64,
  plusBtn: 32,
  /** Centered system / payment / location event cards in the thread. */
  eventCardRadius: 10,
  eventCardPadH: 12,
  eventCardPadV: 10,
  eventTitleSize: 12,
  eventTitleLine: 16,
  eventMetaSize: 10,
  eventMetaLine: 14,
  eventSubSize: 9,
  eventAmountSize: 12,
  eventTimeSize: 9,
  eventAvatar: 36,
  eventCardGap: 6,
} as const;

export function isChatNativeMobile(isDesktop: boolean): boolean {
  return Platform.OS !== "web" && !isDesktop;
}

/** Space reserved above a fixed mobile-web composer (input row + safe padding). */
export function mobileWebComposerReservePx(): number {
  return CHAT_MOBILE.composerMinHeight + CHAT_MOBILE.sendBtnHeight + 28;
}
