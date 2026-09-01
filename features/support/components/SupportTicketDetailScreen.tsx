/**
 * Support ticket detail + reply.
 *
 * Mobile: stacked — compact doc chips (thumb ~30% / meta ~70%), then discussion.
 * Desktop/tablet (≥768): ~1/3 Documents rail (portrait preview fills height)
 * + remaining width for discussion (no max-width cap).
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentPreview } from '@/features/chat/components/DocumentPreviewModal';
import {
  formatAttachmentSize,
  getSupportAttachmentSignedUrl,
  isImageAttachment,
  isSupportTicketClosed,
  markSupportTicketReadByUser,
  replyToSupportTicket,
  supportTicketStatusLabel,
  type SupportTicketAttachmentRow,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '@/features/support/services/supportTickets.service';
import { showAppAlert } from '@/lib/appAlert';
import { useSupportTicketDetailQuery } from '@/lib/queries/useSupportTicketDetailQuery';
import { queryKeys } from '@/lib/queryKeys';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { FileText, Send } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SPLIT_MIN_WIDTH = 768;
const MOBILE_THUMB = 56;

function fileNameFromPath(storagePath: string): string {
  return storagePath.split('/').pop() ?? 'Attachment';
}

/** Strip storage uuid prefix for readable labels (e.g. `uuid-IMG_7148.PNG` → `IMG_7148.PNG`). */
function displayFileName(storagePath: string): string {
  const raw = fileNameFromPath(storagePath);
  const stripped = raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  );
  return stripped || raw;
}

function useAttachmentUrls(attachments: SupportTicketAttachmentRow[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const attachmentKey = useMemo(
    () => attachments.map((a) => a.id).join(','),
    [attachments],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      for (const a of attachments) {
        const url = await getSupportAttachmentSignedUrl(a.storage_path);
        if (active && url) setUrls((prev) => ({ ...prev, [a.id]: url }));
      }
    })();
    return () => {
      active = false;
    };
  }, [attachmentKey, attachments]);

  return urls;
}

function PreviewFrame({
  size,
  url,
  mimeType,
}: {
  size: number;
  url?: string;
  mimeType: string | null;
}) {
  const isImage = isImageAttachment(mimeType);
  return (
    <View style={[styles.previewFrame, { width: size, height: size }]}>
      {isImage && url ? (
        <Image
          source={{ uri: url }}
          style={styles.previewImage}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <FileText size={Math.round(size * 0.28)} color={Theme.primary} />
      )}
    </View>
  );
}

/** Mobile: horizontal chip — thumb left (~30%), meta right (~70%). */
function MobileDocChip({
  attachment,
  url,
  onPreview,
}: {
  attachment: SupportTicketAttachmentRow;
  url?: string;
  onPreview: (url: string, mime: string | null, fileName: string) => void;
}) {
  const fileName = fileNameFromPath(attachment.storage_path);
  const label = displayFileName(attachment.storage_path);
  const mimeShort = attachment.mime_type?.split('/')[1]?.toUpperCase() ?? 'FILE';
  const sizeLabel = formatAttachmentSize(attachment.size_bytes);

  return (
    <Pressable
      onPress={() => url && onPreview(url, attachment.mime_type, fileName)}
      disabled={!url}
      style={({ pressed }) => [styles.mobileChip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${label}`}
    >
      <PreviewFrame size={MOBILE_THUMB} url={url} mimeType={attachment.mime_type} />
      <View style={styles.mobileChipText}>
        <Text style={styles.docName} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.docMeta} numberOfLines={1}>
          {[mimeShort, sizeLabel].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

/** Desktop: preview fills remaining page height inside a narrow rail. */
function DesktopPreviewFrame({
  url,
  mimeType,
}: {
  url?: string;
  mimeType: string | null;
}) {
  const isImage = isImageAttachment(mimeType);
  return (
    <View style={styles.desktopPreviewFrame}>
      {isImage && url ? (
        <Image
          source={{ uri: url }}
          style={styles.desktopPreviewImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.desktopPreviewPlaceholder}>
          <FileText size={28} color={Theme.primary} />
        </View>
      )}
    </View>
  );
}

function DesktopDocCard({
  attachment,
  url,
  onPreview,
  fillHeight,
}: {
  attachment: SupportTicketAttachmentRow;
  url?: string;
  onPreview: (url: string, mime: string | null, fileName: string) => void;
  fillHeight: boolean;
}) {
  const fileName = fileNameFromPath(attachment.storage_path);
  const label = displayFileName(attachment.storage_path);
  const sizeLabel = formatAttachmentSize(attachment.size_bytes);

  return (
    <Pressable
      onPress={() => url && onPreview(url, attachment.mime_type, fileName)}
      disabled={!url}
      style={({ pressed }) => [
        styles.desktopCard,
        fillHeight && styles.desktopCardFill,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${label}`}
    >
      <DesktopPreviewFrame url={url} mimeType={attachment.mime_type} />
      <Text style={styles.docName} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.docMeta} numberOfLines={1}>
        {sizeLabel || attachment.mime_type?.split('/')[1]?.toUpperCase() || 'File'}
      </Text>
    </Pressable>
  );
}

function AttachmentChips({
  attachments,
  onPreview,
}: {
  attachments: SupportTicketAttachmentRow[];
  onPreview: (url: string, mime: string | null, fileName: string) => void;
}) {
  const urls = useAttachmentUrls(attachments);
  if (!attachments.length) return null;
  return (
    <View style={styles.mobileChipList}>
      {attachments.map((a) => (
        <MobileDocChip
          key={a.id}
          attachment={a}
          url={urls[a.id]}
          onPreview={onPreview}
        />
      ))}
    </View>
  );
}

function TicketBubble({
  isOwn,
  author,
  timestamp,
  body,
  attachments,
  docHint,
  onPreview,
}: {
  isOwn: boolean;
  author: string;
  timestamp: string;
  body: string;
  attachments?: SupportTicketAttachmentRow[];
  docHint?: string | null;
  onPreview: (url: string, mime: string | null, fileName: string) => void;
}) {
  return (
    <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleSupport]}>
        <Text style={[styles.bubbleAuthor, isOwn && styles.bubbleAuthorOwn]}>
          {author} · {timestamp}
        </Text>
        <Text style={styles.bubbleBody}>{body}</Text>
        {attachments?.length ? (
          <AttachmentChips attachments={attachments} onPreview={onPreview} />
        ) : null}
        {docHint ? <Text style={styles.bubbleDocHint}>{docHint}</Text> : null}
      </View>
    </View>
  );
}

function DocumentsPanel({
  attachments,
  onPreview,
}: {
  attachments: SupportTicketAttachmentRow[];
  onPreview: (url: string, mime: string | null, fileName: string) => void;
}) {
  const urls = useAttachmentUrls(attachments);
  if (!attachments.length) return null;

  const fillHeight = attachments.length === 1;

  const cards = attachments.map((a) => (
    <DesktopDocCard
      key={a.id}
      attachment={a}
      url={urls[a.id]}
      onPreview={onPreview}
      fillHeight={fillHeight}
    />
  ));

  return (
    <View style={styles.desktopRail}>
      <Text style={styles.sectionLabel}>Documents</Text>
      {fillHeight ? (
        <View style={styles.desktopRailFill}>{cards}</View>
      ) : (
        <ScrollView
          style={styles.desktopRailScroll}
          contentContainerStyle={styles.desktopRailScrollContent}
          showsVerticalScrollIndicator
        >
          {cards}
        </ScrollView>
      )}
    </View>
  );
}

function statusColor(status: SupportTicketStatus): string {
  switch (status) {
    case 'resolved':
      return Theme.success;
    case 'closed':
      return Theme.textMuted;
    case 'waiting_for_user':
      return Theme.warning;
    default:
      return Theme.primary;
  }
}

function priorityLabel(priority: SupportTicketPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SupportTicketDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSplit = width >= SPLIT_MIN_WIDTH;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = typeof id === 'string' ? id : '';
  const { ticket, comments, attachments, isLoading, error, invalidate } =
    useSupportTicketDetailQuery(ticketId);
  const { open: openPreview, node: previewNode } = useDocumentPreview();
  const markedReadRef = useRef<string | null>(null);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const openingAttachments = useMemo(
    () => attachments.filter((a) => a.comment_id === null),
    [attachments],
  );
  const hasDocs = attachments.length > 0;
  const closed = ticket ? isSupportTicketClosed(ticket.status) : true;

  useEffect(() => {
    if (!ticketId || !ticket || markedReadRef.current === ticketId) return;
    markedReadRef.current = ticketId;
    void (async () => {
      const result = await markSupportTicketReadByUser(ticketId);
      if ('error' in result) return;
      if (user?.uid) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.support.myTickets(user.uid) });
      }
      invalidate();
    })();
  }, [ticketId, ticket, user?.uid, queryClient, invalidate]);

  const handlePreview = (url: string, mime: string | null, fileName: string) => {
    void openPreview(url, mime, fileName);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/support-tickets' as Href);
  };

  const handleSend = async () => {
    const body = reply.trim();
    if (!body || !ticketId || sending || closed) return;
    setSending(true);
    try {
      const result = await replyToSupportTicket(ticketId, body);
      if ('error' in result) {
        showAppAlert('Could not send reply', result.error.message);
        return;
      }
      setReply('');
      invalidate();
    } finally {
      setSending(false);
    }
  };

  const thread = ticket ? (
    <>
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.subject} numberOfLines={3}>
            {ticket.subject}
          </Text>
          <View
            style={[styles.statusPill, { backgroundColor: `${statusColor(ticket.status)}1A` }]}
          >
            <Text style={[styles.statusPillText, { color: statusColor(ticket.status) }]}>
              {supportTicketStatusLabel(ticket.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.metaLine}>
          {ticket.category} · {priorityLabel(ticket.priority)} priority
        </Text>
      </View>

      <TicketBubble
        isOwn
        author="You"
        timestamp={formatTimestamp(ticket.created_at)}
        body={ticket.description}
        attachments={isSplit ? undefined : openingAttachments}
        docHint={
          openingAttachments.length > 0 && isSplit
            ? `${openingAttachments.length} attachment${openingAttachments.length === 1 ? '' : 's'} — see Documents`
            : null
        }
        onPreview={handlePreview}
      />

      {comments.map((c) => {
        const commentAttachments = attachments.filter((a) => a.comment_id === c.id);
        const isOwn =
          c.author_type === 'user' ||
          (c.author_type !== 'agent' && c.author_user_id === user?.uid);
        return (
          <TicketBubble
            key={c.id}
            isOwn={isOwn}
            author={isOwn ? 'You' : 'Support'}
            timestamp={formatTimestamp(c.created_at)}
            body={c.body}
            attachments={isSplit ? undefined : commentAttachments}
            docHint={
              commentAttachments.length > 0 && isSplit
                ? `${commentAttachments.length} attachment${commentAttachments.length === 1 ? '' : 's'} — see Documents`
                : null
            }
            onPreview={handlePreview}
          />
        );
      })}

      {closed ? <Text style={styles.closedHint}>This ticket is closed.</Text> : null}
    </>
  ) : null;

  const composer = !closed ? (
    <View style={[styles.composerDock, { paddingBottom: Math.max(10, insets.bottom) }]}>
      <View style={styles.composerRow}>
        <TextInput
          style={styles.composerInput}
          value={reply}
          onChangeText={setReply}
          placeholder="Add a reply..."
          placeholderTextColor={Theme.textMuted}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!reply.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => void handleSend()}
          disabled={!reply.trim() || sending}
          activeOpacity={0.85}
          accessibilityLabel="Send reply"
        >
          {sending ? (
            <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
          ) : (
            <Send size={18} color={Theme.buttonPrimaryText} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  return (
    <>
      <View style={styles.screen}>
        <View
          style={[
            styles.navHeader,
            {
              paddingTop: insets.top + Layout.headerPaddingBelowInset,
              backgroundColor: Theme.screenBackground,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityLabel="Back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <FontAwesome name="arrow-left" size={20} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>
            {ticket?.display_id ?? 'Ticket'}
          </Text>
          <View style={styles.backBtn} />
        </View>

        {isLoading ? (
          <CenteredLoadingView />
        ) : error || !ticket ? (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Ticket not found.'}
          </Text>
        ) : hasDocs && isSplit ? (
          <View style={styles.desktopSplit}>
            <View style={styles.desktopLeft}>
              <DocumentsPanel
                attachments={attachments}
                onPreview={handlePreview}
              />
            </View>
            <View style={styles.desktopDivider} />
            <View style={styles.desktopRight}>
              <ScrollView
                style={styles.threadScroll}
                contentContainerStyle={styles.desktopRightContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {thread}
              </ScrollView>
              {composer}
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.mobileColumn}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              style={styles.threadScroll}
              contentContainerStyle={styles.mobileScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {thread}
            </ScrollView>
            {composer}
          </KeyboardAvoidingView>
        )}
      </View>
      {previewNode}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
  },
  errorText: {
    color: Theme.negative,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginHorizontal: Layout.screenPaddingHorizontal,
  },
  pressed: { opacity: 0.88 },

  previewFrame: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },

  // ── Mobile docs ──────────────────────────────────────────────────────────
  mobileChipList: {
    gap: 8,
    marginTop: 4,
  },
  mobileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 6,
    paddingRight: 10,
    minHeight: 44,
  },
  mobileChipText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  docName: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  docMeta: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
  },

  // ── Desktop split: ~1/3 preview (fills height) + remaining discussion ───
  desktopSplit: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    width: '100%',
    alignItems: 'stretch',
  },
  desktopLeft: {
    width: '34%',
    minWidth: 300,
    maxWidth: 460,
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  desktopDivider: {
    width: 0,
  },
  desktopRight: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
  },
  threadScroll: {
    flex: 1,
    minHeight: 0,
  },
  desktopRightContent: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  mobileColumn: {
    flex: 1,
    minHeight: 0,
  },
  desktopRail: {
    flex: 1,
    minHeight: 0,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Theme.textMuted,
    marginBottom: 10,
  },
  desktopRailFill: {
    flex: 1,
    minHeight: 0,
  },
  desktopRailScroll: { flex: 1, minHeight: 0 },
  desktopRailScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  desktopCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    padding: 8,
    gap: 8,
    width: '100%',
  },
  desktopCardFill: {
    flex: 1,
    minHeight: 0,
  },
  desktopPreviewFrame: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopPreviewImage: {
    width: '100%',
    height: '100%',
  },
  desktopPreviewPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
  },

  // ── Mobile / no-docs scroll ──────────────────────────────────────────────
  mobileScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 20,
    width: '100%',
    gap: 2,
  },

  // ── Discussion ───────────────────────────────────────────────────────────
  headerCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginBottom: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  subject: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  metaLine: { fontSize: 12, color: Theme.textMuted, fontWeight: '500' },
  bubbleWrap: {
    width: '100%',
    marginBottom: 8,
  },
  bubbleWrapOwn: {
    alignItems: 'flex-end',
  },
  bubbleWrapOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  bubbleOwn: {
    backgroundColor: Theme.surface,
    borderBottomRightRadius: 6,
  },
  bubbleSupport: {
    backgroundColor: Theme.brandBlueSoft,
    borderBottomLeftRadius: 6,
  },
  bubbleAuthor: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  bubbleAuthorOwn: {
    color: Theme.textMuted,
  },
  bubbleBody: {
    fontSize: 15,
    lineHeight: 21,
    color: Theme.textPrimaryDark,
    fontWeight: '500',
  },
  bubbleDocHint: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.primary,
    marginTop: 2,
  },
  composerDock: {
    flexShrink: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Theme.textPrimaryDark,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.4 },
  closedHint: {
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 13,
    color: Theme.textMuted,
  },
});
