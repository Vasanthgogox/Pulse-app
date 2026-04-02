import { Text, TextInput, TouchableOpacity, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MessageAttachment } from "../types";
import type { OpsRef } from "../types";
import type { OpsAgentStyles } from "../opsAgentStyles";
import { SP } from "../constants";

interface OpsAgentInputBarProps {
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  isTyping: boolean;
  pendingAttachment: MessageAttachment | null;
  onRemoveAttachment: () => void;
  showAttachMenu: boolean;
  onToggleAttachMenu: () => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onAddContact: () => void;
  keyboardVisible: boolean;
  onDismissKeyboard: () => void;
  error: string | null;
  triggerSuccess: (msg: string) => void;
  themeRef: OpsRef;
  styles: OpsAgentStyles;
  bottomPadding: number;
}

export function OpsAgentInputBar({
  chatInput,
  onChatInputChange,
  onSend,
  isTyping,
  pendingAttachment,
  onRemoveAttachment,
  showAttachMenu,
  onToggleAttachMenu,
  onTakePhoto,
  onPickImage,
  onAddContact,
  keyboardVisible,
  onDismissKeyboard,
  error,
  triggerSuccess,
  themeRef: REF,
  styles,
  bottomPadding,
}: OpsAgentInputBarProps) {
  const { t } = useLanguage();
  const canSend = (chatInput.trim() || pendingAttachment) && !isTyping;
  return (
    <View style={[styles.quInputWrap, { paddingBottom: keyboardVisible ? SP.sm : SP.sm + bottomPadding }]}>
      {error ? (
        <Text style={styles.errorText} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
      {pendingAttachment && (
        <View style={styles.quAttachmentStrip}>
          <View style={styles.quAttachmentStripLeft}>
            <FontAwesome
              name={pendingAttachment.type === "image" ? "image" : "user"}
              size={16}
              color={REF.accent}
            />
            <Text style={styles.quAttachmentStripText}>
              {pendingAttachment.type === "image"
                ? t("imageReady")
                : `${t("contact")}: ${pendingAttachment.data.name}`}
            </Text>
          </View>
          <TouchableOpacity style={styles.quAttachmentStripRemove} onPress={onRemoveAttachment} activeOpacity={0.8}>
            <FontAwesome name="times" size={12} color={REF.red} />
          </TouchableOpacity>
        </View>
      )}
      {showAttachMenu && (
        <View style={styles.attachMenu}>
          <TouchableOpacity style={styles.attachMenuItem} onPress={onTakePhoto} activeOpacity={0.8}>
            <FontAwesome name="camera" size={18} color={REF.text2} />
            <Text style={styles.attachMenuItemText}>{t("takePhoto")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachMenuItem} onPress={onPickImage} activeOpacity={0.8}>
            <FontAwesome name="paperclip" size={18} color={REF.text2} />
            <Text style={styles.attachMenuItemText}>{t("addPhotosFiles")}</Text>
          </TouchableOpacity>
          <View style={styles.attachMenuDivider} />
          <TouchableOpacity style={styles.attachMenuItem} onPress={onAddContact} activeOpacity={0.8}>
            <Feather name="user-plus" size={18} color={REF.text2} strokeWidth={1.5} />
            <Text style={styles.attachMenuItemText}>{t("addContact")}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.quInputRow}>
        <TouchableOpacity
          style={[styles.quInputPlusBtn, showAttachMenu && styles.quInputPlusBtnActive]}
          onPress={onToggleAttachMenu}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={20} color={showAttachMenu ? REF.accent : REF.text2} strokeWidth={1.5} />
        </TouchableOpacity>
        <TextInput
          style={styles.quInput}
          value={chatInput}
          onChangeText={onChatInputChange}
          placeholder={t("askAnything")}
          placeholderTextColor={REF.text3}
          multiline
          maxLength={500}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          onSubmitEditing={onSend}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        {keyboardVisible ? (
          <TouchableOpacity
            style={styles.quInputActionBtn}
            onPress={onDismissKeyboard}
            activeOpacity={0.8}
            accessibilityLabel={t("closeKeyboard")}
          >
            <Feather name="chevron-down" size={18} color={REF.text3} strokeWidth={1.5} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.quInputActionBtn}
          onPress={() => triggerSuccess(t("voiceInputComingSoon"))}
          activeOpacity={0.8}
        >
          <FontAwesome name="microphone" size={18} color={REF.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.quSendBtn,
            canSend ? styles.quSendBtnActive : styles.quSendBtnDisabled,
          ]}
          onPress={onSend}
          disabled={!canSend}
          activeOpacity={0.8}
        >
          <Feather
            name="arrow-up"
            size={18}
            color={canSend ? REF.text : REF.text3}
            strokeWidth={1.5}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
