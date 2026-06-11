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
import { ChatReplyThreadStrip, type ReplyPreviewData } from "@/features/chat/components/shared/ChatReplyPreview";
import type { SlackMessageGroupMeta } from "@/features/chat/utils/slackMessageGroup.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Clipboard,
  Platform,
  Pressable,
  Text,
  View,
  type TextStyle,
} from "react-native";
import {
  slackDesktopStyles as deskSt,
  SLACK_DESKTOP_AVATAR,
} from "../desktop/chatSlackDesktop.styles";
import {
  SLACK_AVATAR,
  slackMobileStyles as st,
} from "./chatSlackMobile.styles";

// ── Inline markdown renderer ──────────────────────────────────────────────────
// Parses **bold**, _italic_, `code` produced by our format toolbar.
// Handles one level of nesting (e.g. _**bold italic**_).
function renderMd(text: string): React.ReactNode[] {
  if (!text) return [];
  if (!/\*\*|_|`/.test(text)) return [text];

  const re = /(\*\*([^*\n]+)\*\*)|(_([^_\n]+)_)|(`([^`\n]+)`)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(<Text key={k++} style={mdBold}>{renderMd(match[2])}</Text>);
    } else if (match[3] !== undefined) {
      nodes.push(<Text key={k++} style={mdItalic}>{renderMd(match[4])}</Text>);
    } else if (match[5] !== undefined) {
      nodes.push(<Text key={k++} style={mdCode}>{match[6]}</Text>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const mdBold: TextStyle = { fontWeight: "700" };
const mdItalic: TextStyle = { fontStyle: "italic" };
const mdCode: TextStyle = {
  fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  backgroundColor: "rgba(0,0,0,0.06)",
  color: "#1D1C1D",
};

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
            <Text
              style={[
                styles.threadMsgText,
                isContinuation && styles.threadMsgTextContinuation,
                !showHeader && styles.threadMsgTextStacked,
              ]}
            >
              {renderMd(content)}
            </Text>
          </View>

          {/* Desktop hover toolbar — floats top-right of the row, above the row */}
          {isDesktop && hovered && onReact && onReply ? (
            <ChatMessageHoverActions
              onReact={onReact}
              onReply={onReply}
              onCopy={handleCopy}
              onHoverIn={showHoverActions}
              onHoverOut={hideHoverActions}
            />
          ) : null}
        </Pressable>

        {/* Reactions row */}
        {reactions && onReact ? (
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
        />
      ) : null}
    </>
  );
}

const rowHoverStyle = {
  backgroundColor: "rgba(0,0,0,0.025)",
  borderRadius: 6,
} as const;
