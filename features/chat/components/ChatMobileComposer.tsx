/**
 * Metronic-style message composer — avatar, bordered field, black Send CTA.
 */
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import {
  CHAT_ACCENT_BORDER,
  CHAT_SEND_BG,
  CHAT_SURFACE,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
} from "@/features/chat/chatTheme";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { Upload } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from "react-native";

const INPUT_WEB: TextStyle = Platform.OS === "web" ? {} : {};

export type ChatMobileComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onOpenAttach?: () => void;
  quickMessages?: string[];
  /** Hide horizontal quick-reply chips (e.g. keyboard open). */
  hideQuickChips?: boolean;
  placeholder?: string;
};

export function ChatMobileComposer({
  value,
  onChangeText,
  onSend,
  onOpenAttach,
  quickMessages = [],
  hideQuickChips = false,
  placeholder = "Type a message",
}: ChatMobileComposerProps) {
  const auth = useOptionalAuth();
  const orgCtx = useOptionalOrganization();
  const profile = auth?.profile;
  const canSend = value.trim().length > 0;
  const sendScale = useRef(new Animated.Value(canSend ? 1 : 0.96)).current;

  useEffect(() => {
    Animated.spring(sendScale, {
      toValue: canSend ? 1 : 0.96,
      useNativeDriver: true,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [canSend, sendScale]);

  const submit = useCallback(() => {
    if (!value.trim()) return;
    onSend();
  }, [value, onSend]);

  return (
    <View style={styles.wrap}>
      {!hideQuickChips && quickMessages.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}
        >
          {quickMessages.map((m, i) => (
            <TouchableOpacity
              key={`${i}-${m.slice(0, 12)}`}
              style={styles.chip}
              onPress={() => onChangeText(m)}
              activeOpacity={0.75}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.shell}>
        <ChatPartyAvatar
          identity={{
            displayName: profile?.full_name || profile?.displayName || "You",
            entityType: "client",
          }}
          isOwnUser
          userName={profile?.full_name || profile?.displayName || "You"}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={orgCtx?.currentOrganization?.logo_url ?? null}
          userOrgOwnerAvatarSeed={profile?.avatar_seed ?? null}
          size={28}
        />
        <View style={styles.fieldRow}>
          <TextInput
            style={[styles.input, INPUT_WEB]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={CHAT_TEXT_MUTED}
            multiline
            scrollEnabled
            blurOnSubmit={false}
            returnKeyType="default"
            textAlignVertical="top"
            autoCorrect
            autoCapitalize="sentences"
          />
          {onOpenAttach ? (
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={onOpenAttach}
              hitSlop={8}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Attach file"
            >
              <Upload size={16} color={CHAT_TEXT_MUTED} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
            onPress={submit}
            disabled={!canSend}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={[styles.sendBtnText, !canSend && styles.sendBtnTextOff]}>
              Send
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: CHAT_SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  chipRow: {
    paddingBottom: 6,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: CHAT_SURFACE,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    maxWidth: 200,
  },
  chipText: {
    fontSize: 10,
    color: CHAT_TEXT_PRIMARY,
    fontWeight: "600",
  },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    borderRadius: 10,
    backgroundColor: CHAT_SURFACE,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fieldRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minWidth: 0,
    gap: 4,
  },
  attachBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: CHAT_MOBILE.composerMinHeight,
    maxHeight: CHAT_MOBILE.composerMaxHeight,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "ios" ? 7 : 6,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    fontSize: CHAT_MOBILE.composerFontSize,
    lineHeight: CHAT_MOBILE.composerLineHeight,
    color: CHAT_TEXT_PRIMARY,
  },
  sendBtn: {
    minWidth: CHAT_MOBILE.sendBtnMinWidth,
    height: CHAT_MOBILE.sendBtnHeight,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_SEND_BG,
    marginBottom: 1,
  },
  sendBtnOff: {
    backgroundColor: "#E4E6EF",
  },
  sendBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  sendBtnTextOff: {
    color: CHAT_TEXT_MUTED,
  },
});
