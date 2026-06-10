import {
  slackDesktopStyles as deskSt,
} from "@/features/chat/components/desktop/chatSlackDesktop.styles";
import {
  slackMobileStyles as mobileSt,
} from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { StyleSheet, Text, View } from "react-native";

const NOTICE =
  "Chat history expires 30 days from the date of delivery.";

type Props = {
  variant?: "mobile" | "desktop";
  slackLayout?: boolean;
};

export function ChatHistoryExpiryNotice({
  variant = "mobile",
  slackLayout = false,
}: Props) {
  if (slackLayout) {
    const styles = variant === "desktop" ? deskSt : mobileSt;
    return (
      <View style={styles.threadExpiryNotice}>
        <Text style={styles.threadExpiryNoticeText}>{NOTICE}</Text>
      </View>
    );
  }

  return (
    <View style={legacyStyles.wrap}>
      <Text style={legacyStyles.text}>{NOTICE}</Text>
    </View>
  );
}

const legacyStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: "#94a3b8",
    textAlign: "center",
  },
});
