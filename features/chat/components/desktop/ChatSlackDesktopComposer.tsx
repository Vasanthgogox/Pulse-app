/**
 * Desktop Slack-style composer.
 * Features: reply preview banner, character counter, formatting shortcuts,
 * typing callback, attach + emoji + send toolbar.
 */
import { Theme } from "@/constants/Theme";
import {
  ChatReplyComposerBanner,
  type ReplyPreviewData,
} from "@/features/chat/components/shared/ChatReplyPreview";
import {
  Bold,
  Code,
  Italic,
  Mic,
  Paperclip,
  Send,
  Smile,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from "react-native";
import { SLACK_DESKTOP, SLACK_DESKTOP_TYPE, slackDesktopStyles as st } from "./chatSlackDesktop.styles";

const INPUT_WEB: TextStyle = Platform.OS === "web" ? {} : {};
const MAX_LENGTH = 4_000;

export function ChatSlackDesktopComposer({
  value,
  onChangeText,
  onSend,
  onOpenAttach,
  quickMessages = [],
  placeholder = "Message",
  replyContext,
  onCancelReply,
  onUserTyping,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  onOpenAttach?: () => void;
  quickMessages?: string[];
  placeholder?: string;
  /** Reply context — shows reply banner above the composer box. */
  replyContext?: ReplyPreviewData | null;
  /** Called when user cancels the pending reply. */
  onCancelReply?: () => void;
  /** Called on every keystroke for typing indicator. */
  onUserTyping?: () => void;
}) {
  const canSend = value.trim().length > 0 && value.length <= MAX_LENGTH;
  const charCount = value.length;
  const nearLimit = charCount >= MAX_LENGTH * 0.85;
  const overLimit = charCount > MAX_LENGTH;

  const quickCursor = useRef(0);
  const inputRef = useRef<TextInput | null>(null);
  const [formatActive, setFormatActive] = useState<"bold" | "italic" | "code" | null>(null);

  useEffect(() => {
    if (!replyContext) return;
    // Move focus to the composer when Reply is selected from hover actions.
    inputRef.current?.focus();
  }, [replyContext]);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
      onUserTyping?.();
    },
    [onChangeText, onUserTyping],
  );

  const applySuggestion = () => {
    const fallback = "On it. Sharing an update shortly.";
    const suggestion =
      quickMessages.length > 0
        ? quickMessages[quickCursor.current % quickMessages.length] ?? fallback
        : fallback;
    quickCursor.current += 1;
    onChangeText(suggestion);
  };

  const addEmoji = () => {
    handleChangeText(value.trim().length > 0 ? `${value} 👍` : "👍");
  };

  /** Toggle markdown format wrapping on the current text. */
  const applyFormat = (fmt: "bold" | "italic" | "code") => {
    const marker = fmt === "bold" ? "**" : fmt === "italic" ? "_" : "`";
    const trimmed = value.trim();

    if (!trimmed) {
      setFormatActive((v) => (v === fmt ? null : fmt));
      return;
    }

    // Strip all occurrences of this marker (covers stacked cases like _**HI**_ → _HI_)
    const stripped = trimmed.split(marker).join("");
    if (stripped !== trimmed) {
      handleChangeText(stripped);
      setFormatActive(null);
    } else {
      handleChangeText(`${marker}${trimmed}${marker}`);
      setFormatActive(fmt);
    }
  };

  return (
    <View>
      {replyContext ? (
        <ChatReplyComposerBanner
          reply={replyContext}
          onCancel={() => onCancelReply?.()}
          variant="desktop"
        />
      ) : null}
      <View style={st.composerWrap}>
        <View style={st.composerBox}>
          <TextInput
            ref={inputRef}
            style={[st.composerInput, INPUT_WEB]}
            value={value}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor={SLACK_DESKTOP.textTertiary}
            multiline
            scrollEnabled
            blurOnSubmit={false}
            textAlignVertical="top"
            maxLength={MAX_LENGTH + 50}
          />
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              {/* Formatting buttons */}
              <TouchableOpacity
                style={[styles.toolBtn, formatActive === "bold" && styles.toolBtnActive]}
                hitSlop={6}
                onPress={() => applyFormat("bold")}
                accessibilityRole="button"
                accessibilityLabel="Bold"
              >
                <Bold size={13} color={formatActive === "bold" ? Theme.primary : SLACK_DESKTOP.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, formatActive === "italic" && styles.toolBtnActive]}
                hitSlop={6}
                onPress={() => applyFormat("italic")}
                accessibilityRole="button"
                accessibilityLabel="Italic"
              >
                <Italic size={13} color={formatActive === "italic" ? Theme.primary : SLACK_DESKTOP.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, formatActive === "code" && styles.toolBtnActive]}
                hitSlop={6}
                onPress={() => applyFormat("code")}
                accessibilityRole="button"
                accessibilityLabel="Code"
              >
                <Code size={13} color={formatActive === "code" ? Theme.primary : SLACK_DESKTOP.textTertiary} strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.toolSep} />

              {onOpenAttach ? (
                <TouchableOpacity onPress={onOpenAttach} style={styles.toolBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Attach file">
                  <Paperclip size={14} color={SLACK_DESKTOP.textTertiary} strokeWidth={1.65} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.toolBtn} hitSlop={6} onPress={addEmoji} accessibilityRole="button" accessibilityLabel="Add emoji">
                <Smile size={14} color={SLACK_DESKTOP.textTertiary} strokeWidth={1.65} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtn} hitSlop={6} onPress={applySuggestion} accessibilityRole="button" accessibilityLabel="Quick send suggestion">
                <Mic size={14} color={SLACK_DESKTOP.textTertiary} strokeWidth={1.65} />
              </TouchableOpacity>
            </View>

            <View style={styles.toolbarRight}>
              {nearLimit ? (
                <Text style={[styles.charCount, overLimit && styles.charCountOver]}>
                  {charCount}/{MAX_LENGTH}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={onSend}
                disabled={!canSend}
                style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <Send size={14} color={canSend ? "#FFFFFF" : SLACK_DESKTOP.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLACK_DESKTOP.border,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  toolBtnActive: {
    backgroundColor: "rgba(91, 94, 244, 0.1)",
  },
  toolSep: {
    width: 1,
    height: 16,
    backgroundColor: SLACK_DESKTOP.border,
    marginHorizontal: 4,
  },
  charCount: {
    fontSize: 10,
    fontWeight: "500",
    color: SLACK_DESKTOP.textTertiary,
  },
  charCountOver: {
    color: "#EF4444",
    fontWeight: "700",
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  sendBtnOff: {
    backgroundColor: "transparent",
  },
});
