/**
 * Slack-style message row — shared across mobile and desktop thread views.
 *
 * Features added:
 *   • Emoji reactions row (ChatReactionsRow)
 *   • Reply-to quoted preview strip (ChatReplyThreadStrip)
 *   • Long-press context menu on mobile (ChatMessageContextMenu)
 *   • Desktop hover action toolbar (ChatMessageHoverActions)
 *   • Animated entry for new (Realtime) messages
 */
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatMessageContextMenu, ChatMessageHoverActions } from "@/features/chat/components/shared/ChatMessageContextMenu";
import { ChatReactionsRow, type ChatReactions } from "@/features/chat/components/shared/ChatReactionsRow";
import {
  ChatJumboEmojiMessage,
  isJumboEmojiMessage,
} from "@/features/chat/components/shared/ChatJumboEmojiMessage";
import { ChatReplyThreadStrip, type ReplyPreviewData } from "@/features/chat/components/shared/ChatReplyPreview";
import type { SlackMessageGroupMeta } from "@/features/chat/utils/slackMessageGroup.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Clipboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  slackDesktopStyles as deskSt,
  SLACK_DESKTOP_AVATAR,
} from "../desktop/chatSlackDesktop.styles";
import { renderChatInlineMarkdown } from "@/features/chat/utils/chatInlineMarkdown.util";
import {
  SLACK_AVATAR,
  slackMobileStyles as st,
} from "./chatSlackMobile.styles";

export type ChatSlackMessageRowProps = {
  messageId?: string;
  senderName: string;
  content: string;
  timestamp: string;
  avatar: ResolvedPartyAvatarIdentity;
  isOwn?: boolean;
  userAvatarUrl?: string | null;
  userAvatarSeed?: string | null;
  userOrgLogoUrl?: string | null;
  userName?: string;
  onAvatarPress?: () => void;
  variant?: "mobile" | "desktop";
  group?: SlackMessageGroupMeta;
  /** Emoji reactions map { "👍": ["uid1"] } */
  reactions?: ChatReactions | null;
  selfUserId?: string | null;
  onReact?: (emoji: string) => void;
  /** Quoted message this message replies to */
  replyPreview?: ReplyPreviewData | null;
  /** Called when user taps Reply in the context menu */
  onReply?: () => void;
  /** Whether this message just arrived via Realtime (triggers slide-in animation) */
  isNew?: boolean;
  /** Whether the message was edited after sending. */
  isEdited?: boolean;
  /** Called when user confirms an edit with new content. */
  onEdit?: (newContent: string) => void;
  /** Called when user confirms delete. */
  onDelete?: () => void;
};

export function ChatSlackMessageRow({
  messageId,
  senderName,
  content,
  timestamp,
  avatar,
  isOwn,
  userAvatarUrl,
  userAvatarSeed,
  userOrgLogoUrl,
  userName,
  onAvatarPress,
  variant = "mobile",
  group,
  reactions,
  selfUserId,
  onReact,
  replyPreview,
  onReply,
  isNew,
  isEdited,
  onEdit,
  onDelete,
}: ChatSlackMessageRowProps) {
  const styles = variant === "desktop" ? deskSt : st;
  const avatarSize = variant === "desktop" ? SLACK_DESKTOP_AVATAR.message : SLACK_AVATAR.thread;
  const showHeader = group?.showHeader ?? true;
  const showAvatar = group?.showAvatar ?? true;
  const isContinuation = group?.isContinuation ?? false;

  // ── Entry animation for Realtime messages ──────────────────────────────
  const wasNewRef = useRef(isNew === true);
  const wasNew = wasNewRef.current;
  const enterOpacity = useRef(new Animated.Value(wasNew ? 0 : 1)).current;
  const enterY = useRef(new Animated.Value(wasNew ? 6 : 0)).current;

  useEffect(() => {
    if (!wasNew) return;
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(enterY, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Desktop: hover actions visibility ─────────────────────────────────
  const [hovered, setHovered] = useState(false);
  const isDesktop = variant === "desktop";
  const hoverHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverHideTimeout = () => {
    if (hoverHideTimeoutRef.current) {
      clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    }
  };

  const showHoverActions = () => {
    clearHoverHideTimeout();
    setHovered(true);
  };

  const hideHoverActions = () => {
    clearHoverHideTimeout();
    hoverHideTimeoutRef.current = setTimeout(() => {
      setHovered(false);
      hoverHideTimeoutRef.current = null;
    }, 120);
  };

  useEffect(() => {
    return () => clearHoverHideTimeout();
  }, []);

  // ── Mobile: long-press context menu ───────────────────────────────────
  const [menuVisible, setMenuVisible] = useState(false);

  // ── Inline edit mode ──────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(content);

  const handleStartEdit = () => {
    setEditDraft(content);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editDraft.trim();
    if (trimmed && trimmed !== content) {
      onEdit?.(trimmed);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditDraft(content);
  };

  const handleDeleteConfirm = () => {
    Alert.alert(
      "Delete message",
      "This message will be removed for everyone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete?.() },
      ],
    );
  };

  const handleLongPress = () => {
    if (!isDesktop) setMenuVisible(true);
  };

  const handleCopy = () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      void navigator.clipboard?.writeText?.(content).catch(() => {
        if (Clipboard?.setString) Clipboard.setString(content);
      });
      return;
    }
    if (Clipboard?.setString) Clipboard.setString(content);
  };

  // ── Timestamp formatting ───────────────────────────────────────────────
  let displayTime = timestamp;
  try {
    displayTime = new Date(timestamp).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  // ── Avatar column ──────────────────────────────────────────────────────
  const avatarNode = (
    <View style={styles.threadMsgAvatarCircle}>
      <ChatPartyAvatar
        identity={avatar}
        size={avatarSize}
        isOwnUser={isOwn}
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        userAvatarSeed={userAvatarSeed}
        userOrgLogoUrl={userOrgLogoUrl}
      />
    </View>
  );

  const avatarColumn = showAvatar ? (
    onAvatarPress ? (
      <Pressable onPress={onAvatarPress} hitSlop={6}>
        {avatarNode}
      </Pressable>
    ) : (
      avatarNode
    )
  ) : (
    <View style={[styles.threadMsgAvatarSpacer, { width: avatarSize }]} />
  );

  return (
    <>
      <Animated.View
        style={[
          {
            opacity: enterOpacity,
            transform: [{ translateY: enterY }],
          },
        ]}
      >
        {/* Reply preview strip above the message */}
        {replyPreview ? (
          <View style={{ paddingLeft: avatarSize + 6 }}>
            <ChatReplyThreadStrip reply={replyPreview} />
          </View>
        ) : null}

        {/* Main message row */}
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={380}
          {...(isDesktop
            ? {
                onHoverIn: showHoverActions,
                onHoverOut: hideHoverActions,
              }
            : {})}
          style={[
            styles.threadMsgRow,
            isContinuation ? styles.threadMsgRowContinuation : styles.threadMsgRowLead,
            group?.partyBreak && styles.threadMsgRowPartyBreak,
            hovered && (isDesktop ? rowHoverStyle : undefined),
            { position: "relative" as const },
          ]}
        >
          {avatarColumn}
          <View style={styles.threadMsgBody}>
            {showHeader ? (
              <View style={styles.threadMsgHeader}>
                <Text style={styles.threadMsgName} numberOfLines={1}>
                  {senderName}
                </Text>
                <Text style={styles.threadMsgTime} numberOfLines={1}>
                  {displayTime}
                </Text>
              </View>
            ) : null}
            {editing ? (
              <View style={inlineEditWrap}>
                <TextInput
                  value={editDraft}
                  onChangeText={setEditDraft}
                  autoFocus
                  multiline
                  style={inlineEditInput}
                />
                <View style={inlineEditActions}>
                  <TouchableOpacity onPress={handleCancelEdit} style={inlineEditCancel}>
                    <Text style={inlineEditCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveEdit} style={inlineEditSave}>
                    <Text style={inlineEditSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : isJumboEmojiMessage(content) ? (
              <ChatJumboEmojiMessage content={content} compact={showHeader} />
            ) : (
              <View>
                <Text
                  style={[
                    styles.threadMsgText,
                    isContinuation && styles.threadMsgTextContinuation,
                    !showHeader && styles.threadMsgTextStacked,
                  ]}
                >
                  {renderChatInlineMarkdown(content)}
                </Text>
                {isEdited ? (
                  <Text style={editedLabel}>(edited)</Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Desktop hover toolbar — floats top-right of the row, above the row */}
          {isDesktop && hovered ? (
            <ChatMessageHoverActions
              onReact={onReact}
              onReply={onReply}
              onCopy={handleCopy}
              onEdit={isOwn && onEdit ? handleStartEdit : undefined}
              onDelete={isOwn && onDelete ? handleDeleteConfirm : undefined}
              onHoverIn={showHoverActions}
              onHoverOut={hideHoverActions}
            />
          ) : null}
        </Pressable>

        {/* Reactions row */}
        {onReact &&
        reactions &&
        Object.keys(reactions).length > 0 ? (
          <ChatReactionsRow
            reactions={reactions}
            selfUserId={selfUserId}
            onToggle={onReact}
            avatarOffset={avatarSize + 6}
            variant={variant}
          />
        ) : null}
      </Animated.View>

      {/* Mobile long-press context menu */}
      {!isDesktop ? (
        <ChatMessageContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          onReact={(emoji) => onReact?.(emoji)}
          onReply={() => onReply?.()}
          onCopy={handleCopy}
          isOwn={isOwn}
          onEdit={onEdit ? handleStartEdit : undefined}
          onDelete={onDelete ? handleDeleteConfirm : undefined}
        />
      ) : null}
    </>
  );
}

const rowHoverStyle = {
  backgroundColor: "rgba(0,0,0,0.025)",
  borderRadius: 6,
} as const;

const editSt = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 6,
  } as ViewStyle,
  input: {
    borderWidth: 1.5,
    borderColor: "#5b5ef4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: "#1D1C1D",
    lineHeight: 20,
    minHeight: 40,
  } as TextStyle,
  actions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  } as ViewStyle,
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
  } as ViewStyle,
  cancelText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  } as TextStyle,
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#5b5ef4",
  } as ViewStyle,
  saveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  } as TextStyle,
  editedLabel: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  } as TextStyle,
});

const inlineEditWrap = editSt.wrap;
const inlineEditInput = editSt.input;
const inlineEditActions = editSt.actions;
const inlineEditCancel = editSt.cancelBtn;
const inlineEditCancelText = editSt.cancelText;
const inlineEditSave = editSt.saveBtn;
const inlineEditSaveText = editSt.saveText;
const editedLabel = editSt.editedLabel;
