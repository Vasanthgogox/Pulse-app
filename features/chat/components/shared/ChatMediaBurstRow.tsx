import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatReactionsRow, type ChatReactions } from "@/features/chat/components/shared/ChatReactionsRow";
import { ChatReplyThreadStrip, type ReplyPreviewData } from "@/features/chat/components/shared/ChatReplyPreview";
import { ChatThreadMediaStrip } from "@/features/chat/components/shared/ChatThreadMediaStrip";
import type { ChatMediaBurstLeader } from "@/features/chat/utils/chatMediaBurst.util";
import type { SlackMessageGroupMeta } from "@/features/chat/utils/slackMessageGroup.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
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
} from "../mobile/chatSlackMobile.styles";

function renderMd(text: string): ReactNode[] {
  if (!text) return [];
  if (!/\*\*|_|`/.test(text)) return [text];

  const re = /(\*\*([^*\n]+)\*\*)|(_([^_\n]+)_)|(`([^`\n]+)`)/g;
  const nodes: ReactNode[] = [];
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

export type ChatMediaBurstRowProps = {
  burst: ChatMediaBurstLeader;
  senderName: string;
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
  reactions?: ChatReactions | null;
  selfUserId?: string | null;
  onReact?: (emoji: string) => void;
  replyPreview?: ReplyPreviewData | null;
  isNew?: boolean;
};

export function ChatMediaBurstRow({
  burst,
  senderName,
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
  isNew,
}: ChatMediaBurstRowProps) {
  const styles = variant === "desktop" ? deskSt : st;
  const avatarSize = variant === "desktop" ? SLACK_DESKTOP_AVATAR.message : SLACK_AVATAR.thread;
  const showHeader = group?.showHeader ?? true;
  const showAvatar = group?.showAvatar ?? true;
  const isContinuation = group?.isContinuation ?? false;
  const caption = burst.captionText.trim();

  const wasNewRef = useRef(isNew === true);
  const wasNew = wasNewRef.current;
  const enterOpacity = useRef(new Animated.Value(wasNew ? 0 : 1)).current;
  const enterY = useRef(new Animated.Value(wasNew ? 8 : 0)).current;

  useEffect(() => {
    if (!wasNew) return;
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(enterY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <Animated.View
      style={{
        opacity: enterOpacity,
        transform: [{ translateY: enterY }],
      }}
    >
      {replyPreview ? (
        <View style={{ paddingLeft: avatarSize + 6 }}>
          <ChatReplyThreadStrip reply={replyPreview} />
        </View>
      ) : null}

      <View
        style={[
          styles.threadMsgRow,
          isContinuation ? styles.threadMsgRowContinuation : styles.threadMsgRowLead,
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

          <ChatThreadMediaStrip items={burst.imageItems} />

          {caption ? (
            <Text
              style={[
                styles.threadMsgText,
                { marginTop: 6 },
                isContinuation && styles.threadMsgTextContinuation,
                !showHeader && styles.threadMsgTextStacked,
              ]}
            >
              {renderMd(caption)}
            </Text>
          ) : null}
        </View>
      </View>

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
  );
}
