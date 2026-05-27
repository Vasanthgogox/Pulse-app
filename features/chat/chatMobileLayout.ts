/**
 * Mobile chat layout tokens — WhatsApp-inspired spacing and typography.
 */
import { Platform } from "react-native";

export const CHAT_MOBILE = {
  /** Conversation thread background (warm neutral, like WhatsApp). */
  wallpaper: "#ECE5DD",
  composerBar: "#F0F2F5",
  composerInput: "#FFFFFF",
  headerBg: "#FFFFFF",
  headerBorder: "#E5E7EB",
  bubbleMaxWidthPct: "82%",
  avatarSize: 40,
  bubbleFontSize: 13.5,
  bubbleLineHeight: 19,
  bubblePadH: 11,
  bubblePadV: 7,
  metaFontSize: 10,
  headerTitleSize: 15,
  headerSubtitleSize: 11,
  listRowPad: 10,
  listAvatar: 56,
  listTitleSize: 13,
  listPreviewSize: 12,
  listTimeSize: 10,
  composerMinHeight: 38,
  composerMaxHeight: 112,
  composerFontSize: 16,
  composerLineHeight: 20,
  iconBtn: 36,
  sendBtn: 38,
  plusBtn: 36,
  /** Centered system / payment / location event cards in the thread. */
  eventCardRadius: 12,
  eventCardPadH: 14,
  eventCardPadV: 12,
  eventTitleSize: 14,
  eventTitleLine: 19,
  eventMetaSize: 11,
  eventMetaLine: 15,
  eventSubSize: 10,
  eventAmountSize: 13,
  eventTimeSize: 10,
  eventAvatar: 42,
  eventCardGap: 8,
} as const;

export function isChatNativeMobile(isDesktop: boolean): boolean {
  return Platform.OS !== "web" && !isDesktop;
}

/** Space reserved above a fixed mobile-web composer (input row + safe padding). */
export function mobileWebComposerReservePx(): number {
  return CHAT_MOBILE.composerMinHeight + 20;
}

