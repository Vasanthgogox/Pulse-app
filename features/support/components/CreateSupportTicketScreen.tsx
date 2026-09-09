/**
 * Support S1 — Contact Support entry point + Create Ticket form.
 * Replaces the old external-link "Contact Support" card (NetworkSupportHelpCards)
 * with an in-app destination. Optional trip/indent/vehicle/market-bid context is
 * only ever read from route params set by whoever navigated here — this screen
 * never invents context that wasn't already available to the caller.
 */
import { DetailPageLayout } from '@/components/DetailPageLayout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  formatAttachmentSize,
  SUPPORT_ATTACHMENT_MAX_PER_UPLOAD,
  SUPPORT_TICKET_CATEGORIES,
  submitSupportTicket,
  supportTicketStatusLabel,
  uploadSupportTicketAttachment,
  validateSupportAttachment,
  type StagedSupportAttachment,
  type SupportTicketCategory,
  type SupportTicketListItem,
  type SupportTicketStatus,
} from '@/features/support/services/supportTickets.service';
import {
  countSupportTicketsWithUserUpdate,
  formatSupportUnreadBadge,
  supportTicketHasUserUpdate,
} from '@/features/support/utils/supportTicketUnread.util';
import {
  filesFromClipboardData,
  pickSupportTicketAttachments,
  resolveSupportAttachmentMime,
  supportAttachmentsFromFiles,
  type PickedSupportAttachment,
} from '@/features/support/utils/supportAttachmentPick.util';
import { showAppAlert } from '@/lib/appAlert';
import { useMySupportTicketsQuery } from '@/lib/queries/useMySupportTicketsQuery';
import { ROUTES } from '@/lib/routes';
import { uuidv7 } from '@/lib/uuidv7';
import { Paperclip, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const MAX_ATTACHMENTS = SUPPORT_ATTACHMENT_MAX_PER_UPLOAD;
const RECENT_TICKETS_LIMIT = 5;

type StagedAttachment = StagedSupportAttachment & { localId: string };

function formatUpdatedAt(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60_000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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

export function CreateSupportTicketScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const params = useLocalSearchParams<{
    tripId?: string;
    indentId?: string;
    ownerVehicleId?: string;
    marketBidId?: string;
    sourceScreen?: string;
  }>();

  const [category, setCategory] = useState<SupportTicketCategory>(SUPPORT_TICKET_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);

  const ticketsQ = useMySupportTicketsQuery(user?.uid);
  const recentTickets = useMemo(
    () => (ticketsQ.tickets as SupportTicketListItem[]).slice(0, RECENT_TICKETS_LIMIT),
    [ticketsQ.tickets],
  );
  const updateCount = useMemo(
    () => countSupportTicketsWithUserUpdate(ticketsQ.tickets),
    [ticketsQ.tickets],
  );
  const updateBadge = formatSupportUnreadBadge(updateCount);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as Href);
  };

  const ingestPicked = useCallback((picked: PickedSupportAttachment[]) => {
    if (!picked.length) return;
    const prev = attachmentsRef.current;
    const room = MAX_ATTACHMENTS - prev.length;
    if (room <= 0) {
      showAppAlert('Attachment limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const toAdd = picked.slice(0, room);
    const errors: string[] = [];
    const valid: StagedAttachment[] = [];
    for (const file of toAdd) {
      const normalized = {
        ...file,
        mimeType: resolveSupportAttachmentMime(file.mimeType, file.fileName),
      };
      const err = validateSupportAttachment(normalized);
      if (err) errors.push(err);
      else valid.push({ ...normalized, localId: uuidv7() });
    }
    if (picked.length > toAdd.length) {
      errors.push(`Only ${MAX_ATTACHMENTS} attachments are allowed per ticket.`);
    }
    if (valid.length) {
      const next = [...prev, ...valid];
      attachmentsRef.current = next;
      setAttachments(next);
    }
    if (errors.length) showAppAlert("Some files weren't attached", errors.join('\n'));
  }, []);

  const handleAttach = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      showAppAlert('Attachment limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setPicking(true);
    const picked = await pickSupportTicketAttachments().catch(() => []);
    setPicking(false);
    ingestPicked(picked);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPaste = (event: Event) => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      const files = filesFromClipboardData(clipboard).filter((file) => {
        const mime = resolveSupportAttachmentMime(file.type, file.name);
        return mime.startsWith('image/') || mime === 'application/pdf';
      });
      if (!files.length) return;
      event.preventDefault();
      void supportAttachmentsFromFiles(files).then(ingestPicked);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [ingestPicked]);

  const handleRemoveAttachment = (localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  };

  const handleSubmit = async () => {
    if (!user?.uid) {
      showAppAlert('Sign in required', 'Sign in to contact Support.');
      return;
    }
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();
    if (!trimmedSubject) {
      showAppAlert('Subject required', 'Enter a short subject for your issue.');
      return;
    }
    if (!trimmedDescription) {
      showAppAlert('Description required', 'Describe what went wrong.');
      return;
    }

    setSubmitting(true);
    const result = await submitSupportTicket({
      category,
      subject: trimmedSubject,
      description: trimmedDescription,
      organizationId: currentOrganization?.id ?? null,
      tripId: params.tripId ?? null,
      indentId: params.indentId ?? null,
      ownerVehicleId: params.ownerVehicleId ?? null,
      marketBidId: params.marketBidId ?? null,
      sourceScreen: params.sourceScreen ?? null,
    });

    if ('error' in result) {
      setSubmitting(false);
      showAppAlert("Couldn't submit ticket", result.error.message);
      return;
    }

    const failedNames: string[] = [];
    for (const file of attachments) {
      const uploadResult = await uploadSupportTicketAttachment(result.ticketId, user.uid, file);
      if ('error' in uploadResult) failedNames.push(file.fileName);
    }
    setSubmitting(false);

    if (failedNames.length) {
      showAppAlert(
        `${result.displayId} created — attachment${failedNames.length === 1 ? '' : 's'} missing`,
        `Your ticket was submitted, but ${failedNames.length === 1 ? 'this file did' : 'these files did'} not upload and ${failedNames.length === 1 ? "is" : "are"} NOT attached to it: ${failedNames.join(', ')}. You can mention this in a reply on the ticket.`,
      );
    }
    router.replace(ROUTES.supportTicket(result.ticketId) as Href);
  };

  return (
    <DetailPageLayout
      title="Contact Support"
      onBack={handleBack}
      rightAction={
        <Pressable
          onPress={() => router.push(ROUTES.SUPPORT_TICKETS as Href)}
          hitSlop={10}
          style={styles.myTicketsBtn}
        >
          <Text style={styles.myTicketsBtnText}>My Tickets</Text>
        </Pressable>
      }
    >
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.categoryRow}>
        {SUPPORT_TICKET_CATEGORIES.map((c) => {
          const on = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.categoryChip, on && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryChipText, on && styles.categoryChipTextActive]}>
                {c}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Subject</Text>
      <TextInput
        style={styles.input}
        value={subject}
        onChangeText={setSubject}
        placeholder="Short summary of the issue"
        placeholderTextColor={Theme.placeholder}
        maxLength={120}
        returnKeyType="next"
      />

      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        value={description}
        onChangeText={setDescription}
        placeholder="What happened? Include as much detail as you can."
        placeholderTextColor={Theme.placeholder}
        multiline
        textAlignVertical="top"
        maxLength={2000}
      />

      <View
        {...(Platform.OS === 'web'
          ? {
              onDragOver: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.();
              },
              onDrop: (e: { preventDefault?: () => void; nativeEvent?: { dataTransfer?: DataTransfer } }) => {
                e.preventDefault?.();
                const dropped = Array.from(e.nativeEvent?.dataTransfer?.files ?? []);
                if (dropped.length) void supportAttachmentsFromFiles(dropped).then(ingestPicked);
              },
            }
          : {})}
      >
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => void handleAttach()}
          disabled={picking || submitting}
          activeOpacity={0.7}
        >
        {picking ? (
          <ActivityIndicator color={Theme.primary} size="small" />
        ) : (
          <Paperclip size={16} color={Theme.primary} />
        )}
        <View>
          <Text style={styles.attachBtnText}>Attach files</Text>
          <Text style={styles.attachBtnSubtext}>
            Screenshots, documents or other evidence
            {Platform.OS === 'web' ? ' — paste or drop images' : ''}
          </Text>
        </View>
      </TouchableOpacity>
      </View>

      {attachments.length > 0 && (
        <View style={styles.attachmentList}>
          {attachments.map((a) => (
            <View key={a.localId} style={styles.attachmentRow}>
              <View style={styles.attachmentInfo}>
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {a.fileName}
                </Text>
                <Text style={styles.attachmentMeta}>
                  {a.mimeType.split('/')[1]?.toUpperCase() ?? a.mimeType} ·{' '}
                  {formatAttachmentSize(a.sizeBytes)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveAttachment(a.localId)}
                hitSlop={10}
                disabled={submitting}
              >
                <X size={16} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={() => void handleSubmit()}
        disabled={submitting}
        activeOpacity={0.9}
      >
        {submitting ? (
          <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Submit</Text>
        )}
      </TouchableOpacity>

      <View style={styles.recentSection}>
        <View style={styles.recentHeader}>
          <View style={styles.recentTitleRow}>
            <Text style={styles.fieldLabel}>Recent tickets</Text>
            {updateBadge ? (
              <View style={styles.updateBadge} accessibilityLabel={`${updateBadge} updates`}>
                <Text style={styles.updateBadgeText}>{updateBadge}</Text>
              </View>
            ) : null}
          </View>
          {ticketsQ.tickets.length > 0 ? (
            <Pressable
              onPress={() => router.push(ROUTES.SUPPORT_TICKETS as Href)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See all support tickets"
            >
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {ticketsQ.isLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginTop: 8 }} />
        ) : recentTickets.length === 0 ? (
          <Text style={styles.recentEmpty}>
            No tickets yet. Submitted tickets will show up here.
          </Text>
        ) : (
          recentTickets.map((t) => {
            const hasUpdate = supportTicketHasUserUpdate(t);
            return (
              <Pressable
                key={t.id}
                onPress={() => router.push(ROUTES.supportTicket(t.id) as Href)}
                style={({ pressed }) => [
                  styles.recentCard,
                  hasUpdate && styles.recentCardUpdate,
                  pressed && styles.recentCardPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t.display_id} ${t.subject}${hasUpdate ? ', update available' : ''}`}
              >
                <View style={styles.recentCardTop}>
                  <View style={styles.recentIdRow}>
                    {hasUpdate ? <View style={styles.updateDot} /> : null}
                    <Text style={styles.recentDisplayId}>{t.display_id}</Text>
                  </View>
                  <View
                    style={[
                      styles.recentStatusPill,
                      { backgroundColor: `${statusColor(t.status)}1A` },
                    ]}
                  >
                    <Text style={[styles.recentStatusText, { color: statusColor(t.status) }]}>
                      {supportTicketStatusLabel(t.status)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.recentSubject, hasUpdate && styles.recentSubjectUpdate]} numberOfLines={1}>
                  {t.subject}
                </Text>
                <Text style={styles.recentMeta}>Updated {formatUpdatedAt(t.updated_at)}</Text>
              </Pressable>
            );
          })
        )}
      </View>
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Theme.textMuted,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  categoryChipActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  categoryChipTextActive: {
    color: Theme.buttonPrimaryText,
  },
  input: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    marginBottom: 16,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
  },
  descriptionInput: {
    minHeight: 140,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.primary,
  },
  attachBtnSubtext: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 1,
  },
  attachmentList: {
    gap: 8,
    marginBottom: 16,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  attachmentInfo: {
    flex: 1,
    gap: 2,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  attachmentMeta: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  submitBtn: {
    backgroundColor: Theme.buttonPrimary,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  recentSection: {
    marginTop: 28,
    marginBottom: 24,
    gap: 10,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  recentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.destructive,
    marginBottom: 8,
  },
  updateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.buttonDestructiveText,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.primary,
    marginBottom: 8,
  },
  recentEmpty: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textMuted,
    paddingVertical: 4,
  },
  recentCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 4,
  },
  recentCardUpdate: {
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  recentCardPressed: { opacity: 0.92 },
  recentCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recentIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  updateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.destructive,
  },
  recentDisplayId: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.3,
  },
  recentStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recentStatusText: { fontSize: 11, fontWeight: '700' },
  recentSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  recentSubjectUpdate: {
    fontWeight: '800',
  },
  recentMeta: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  myTicketsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  myTicketsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.primary,
  },
});
