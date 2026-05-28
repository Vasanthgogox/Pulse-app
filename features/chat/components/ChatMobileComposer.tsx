/**
 * WhatsApp-style message composer — attach, multiline field, send.
 */
import { useOptionalKeyboardAccessory } from "@/contexts/KeyboardAccessoryContext";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { Plus, Send } from "lucide-react-native";
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
  placeholder = "Message",
}: ChatMobileComposerProps) {
  const keyboardAccessory = useOptionalKeyboardAccessory();
  const canSend = value.trim().length > 0;
  const sendScale = useRef(new Animated.Value(canSend ? 1 : 0.94)).current;

  useEffect(() => {
    Animated.spring(sendScale, {
      toValue: canSend ? 1 : 0.94,
      useNativeDriver: true,
      speed: 18,
      bounciness: 5,
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
      <View style={styles.row}>
        {onOpenAttach ? (
          <TouchableOpacity
            style={styles.plusBtn}
            onPress={onOpenAttach}
            hitSlop={8}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Attach"
          >
            <Plus size={20} color={CHAT_ICON_MUTED} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
        <TextInput
          style={[styles.input, INPUT_WEB]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8696A0"
          multiline
          scrollEnabled
          blurOnSubmit={false}
          returnKeyType="default"
          textAlignVertical="top"
          onFocus={() => keyboardAccessory?.releaseAccessoryBar()}
          autoCorrect
          autoCapitalize="sentences"
        />
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[styles.sendBtn, canSend ? styles.sendBtnOn : styles.sendBtnOff]}
            onPress={submit}
            disabled={!canSend}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Send size={17} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const CHAT_ICON_MUTED = "#8696A0";

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: CHAT_MOBILE.composerBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_MOBILE.headerBorder,
  },
  chipRow: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: CHAT_MOBILE.composerInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_MOBILE.headerBorder,
    maxWidth: 220,
  },
  chipText: {
    fontSize: 12,
    color: "#3B4A54",
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 48,
  },
  plusBtn: {
    width: CHAT_MOBILE.plusBtn,
    height: CHAT_MOBILE.plusBtn,
    borderRadius: CHAT_MOBILE.plusBtn / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_MOBILE.composerInput,
    marginBottom: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: CHAT_MOBILE.composerMinHeight,
    maxHeight: CHAT_MOBILE.composerMaxHeight,
    backgroundColor: CHAT_MOBILE.composerInput,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_MOBILE.headerBorder,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 9 : 8,
    paddingBottom: Platform.OS === "ios" ? 9 : 8,
    fontSize: CHAT_MOBILE.composerFontSize,
    lineHeight: CHAT_MOBILE.composerLineHeight,
    color: "#111B21",
  },
  sendBtn: {
    width: CHAT_MOBILE.sendBtn,
    height: CHAT_MOBILE.sendBtn,
    borderRadius: CHAT_MOBILE.sendBtn / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnOn: {
    backgroundColor: CHAT_ACCENT,
  },
  sendBtnOff: {
    backgroundColor: "#C5C9CE",
  },
});
