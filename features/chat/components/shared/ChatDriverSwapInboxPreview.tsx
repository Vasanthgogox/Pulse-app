import type { DriverSwapPair } from "@/features/chat/utils/chatAvatar.util";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { StyleSheet, View } from "react-native";
import { slackDesktopStyles as deskSt } from "../desktop/chatSlackDesktop.styles";
import { slackMobileStyles as mobileSt } from "../mobile/chatSlackMobile.styles";
import { ChatDriverSwapAvatarCompact } from "./ChatDriverSwapAvatarCompact";
import { ChatDriverSwapPreviewCopy } from "./ChatDriverSwapPreviewCopy";

/** Slack-style inbox row: swap avatar pill + assignment copy (matches thread card). */
export function ChatDriverSwapInboxPreview({
  swap,
  text,
  variant = "mobile",
}: {
  swap: DriverSwapPair;
  text: string;
  variant?: "mobile" | "desktop";
}) {
  const textStyle = variant === "desktop" ? deskSt.sidebarRowPreview : mobileSt.listRowPreview;

  return (
    <View style={styles.card}>
      <View style={styles.accentRail} pointerEvents="none" />
      <ChatDriverSwapAvatarCompact swap={swap} />
      <View style={styles.copyWrap}>
        <ChatDriverSwapPreviewCopy text={text} style={textStyle} numberOfLines={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 10,
    paddingLeft: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.14)",
    backgroundColor: "#FAFBFF",
    overflow: "hidden",
    position: "relative",
  },
  accentRail: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 2.5,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: CHAT_ACCENT,
    opacity: 0.55,
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
});
