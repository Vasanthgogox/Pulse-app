import { ChatAnimatedEmoji } from "@/features/chat/components/shared/ChatAnimatedEmoji";
import {
  parseEmojiOnlyGlyphs,
  resolveInboxEmojiPreviewSize,
} from "@/features/chat/utils/chatEmojiAnim.util";
import { ChatInlineMarkdownText } from "@/features/chat/utils/chatInlineMarkdown.util";
import { StyleSheet, View, type StyleProp, type TextStyle } from "react-native";

/** Inbox / sidebar preview line — doubles emoji-only previews vs normal text. */
export function ChatListPreviewText({
  text,
  style,
  numberOfLines = 2,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const glyphs = parseEmojiOnlyGlyphs(text);
  if (glyphs) {
    const size = resolveInboxEmojiPreviewSize(glyphs.length);
    const visible = glyphs.slice(0, 6);
    return (
      <View style={styles.emojiRow}>
        {visible.map((glyph, index) => (
          <ChatAnimatedEmoji
            key={`${glyph}-${index}`}
            emoji={glyph}
            size={size}
            loop={false}
          />
        ))}
      </View>
    );
  }

  return (
    <ChatInlineMarkdownText text={text} style={style} numberOfLines={numberOfLines} />
  );
}

const styles = StyleSheet.create({
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    minHeight: 22,
  },
});
