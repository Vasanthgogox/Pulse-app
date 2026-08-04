/**
 * Lightweight DM composer on the story — avoids navigating to /chat
 * (ChatScreen is a multi-thousand-module chunk that freezes web).
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  StoryFlowSheetPortal,
  useStoryPhonePopup,
} from "@/features/network/components/StoryMobilePopupShell";
import {
  getOrCreateNetworkConversation,
  sendNetworkMessage,
} from "@/features/chat/services/networkConversation.service";
import { buildStoryReplyMetadata } from "@/features/network/utils/storyReplyPreview.util";
import { MessageSquare, Send, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;

type Props = {
  visible: boolean;
  partnerOrgId: string;
  partnerOrgName: string;
  /** Story context for WhatsApp-style "replied to story" quote in chat. */
  story?: {
    postId: string;
    storyType?: string | null;
    title?: string | null;
    origin?: string | null;
    destination?: string | null;
  } | null;
  onClose: () => void;
};

export function StoryMessageSheet({
  visible,
  partnerOrgId,
  partnerOrgName,
  story,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const phonePopup = useStoryPhonePopup();
  const { user, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const myOrgId = currentOrganization?.id ?? "";
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const storyMeta = useMemo(() => {
    if (!story?.postId) return null;
    return buildStoryReplyMetadata({
      postId: story.postId,
      storyType: story.storyType,
      title: story.title,
      origin: story.origin,
      destination: story.destination,
      ownerName: partnerOrgName,
    });
  }, [story, partnerOrgName]);

  const storyQuoteLabel = useMemo(() => {
    const s = storyMeta?.reply_to_story;
    if (!s) return null;
    const title = (s.title ?? "").trim();
    const route = (s.route ?? "").trim();
    if (title && route) return `${title} · ${route}`;
    return title || route || "Story";
  }, [storyMeta]);

  useEffect(() => {
    if (!visible) {
      setText("");
      setSending(false);
    }
  }, [visible]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !myOrgId || !partnerOrgId || sending) return;
    setSending(true);
    try {
      const orgName = currentOrganization?.name?.trim() || "My Organization";
      const conversation = await getOrCreateNetworkConversation({
        orgId: myOrgId,
        orgName,
        partnerOrgId,
        partnerOrgName: partnerOrgName.trim() || "Partner",
      });
      const senderName =
        (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
        currentOrganization?.name?.trim() ||
        "Me";
      await sendNetworkMessage({
        conversationId: conversation.id,
        senderOrgId: myOrgId,
        senderUserId: user?.uid ?? null,
        senderName,
        content,
        metadata: storyMeta,
      });
      setText("");
      onClose();
      Alert.alert("Message sent", `Delivered to ${partnerOrgName || "partner"}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not send message.";
      Alert.alert("Message", message);
    } finally {
      setSending(false);
    }
  };

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close message"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.sheet,
          { paddingBottom: Math.max(phonePopup ? 16 : insets.bottom, 16) + 8 },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MessageSquare size={18} color={INK} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                Message {partnerOrgName || "partner"}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                Send a quick note about this load
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}
          >
            <X size={18} color={MUTED} />
          </Pressable>
        </View>

        {storyQuoteLabel ? (
          <View style={styles.quote}>
            <View style={styles.quoteBar} />
            <View style={styles.quoteBody}>
              <Text style={styles.quoteSender} numberOfLines={1}>
                Replying to story
              </Text>
              <Text style={styles.quoteContent} numberOfLines={2}>
                {storyQuoteLabel}
              </Text>
            </View>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Write a message…"
          placeholderTextColor={MUTED}
          multiline
          maxLength={2000}
          editable={!sending}
          autoFocus={visible}
        />

        <Pressable
          style={[
            styles.sendBtn,
            (!text.trim() || sending) && styles.sendBtnDisabled,
          ]}
          onPress={() => {
            void handleSend();
          }}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color={Theme.buttonPrimaryText} />
          ) : (
            <>
              <Send size={16} color={Theme.buttonPrimaryText} />
              <Text style={styles.sendText}>Send</Text>
            </>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </StoryFlowSheetPortal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.border,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: INK,
  },
  sub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  quote: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.surface,
  },
  quoteBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.buttonPrimary,
  },
  quoteBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  quoteSender: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  quoteContent: {
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },
  input: {
    minHeight: 96,
    maxHeight: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: INK,
    textAlignVertical: "top",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
  sendText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
});
