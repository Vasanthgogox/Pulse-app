import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Award, ShieldCheck, Star, ThumbsUp } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import { submitAtomicFeedback } from "../services/chat.service";
import { chatStore } from "../store/chatStore";
import type { FeedbackRequestMetadata, TripMessageRow } from "../types/chat.types";
import { parseFeedbackRequestMetadata } from "../utils/feedbackRequestMeta";

const TAG_OPTIONS = [
  "PUNCTUAL",
  "SECURE_LOAD",
  "PROFESSIONAL",
  "FLAWLESS_COMMS",
] as const;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function ChatTripFeedbackCard({
  message,
  tripId,
  ratingOrganizationId,
  conversationOwnerOrgId,
  currentOrgId,
  onSubmitted,
}: {
  message: TripMessageRow;
  tripId: string;
  ratingOrganizationId: string;
  conversationOwnerOrgId: string;
  currentOrgId: string;
  onSubmitted: () => void;
}) {
  const meta = useMemo(() => parseFeedbackRequestMetadata(message), [message]);
  const [rating, setRating] = useState(
    () => meta?.submitted_score ?? 0,
  );
  const [tags, setTags] = useState<string[]>(
    () => meta?.submitted_tags ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const m = parseFeedbackRequestMetadata(message);
    if (m?.submitted_at) {
      setRating(m.submitted_score ?? 0);
      setTags(m.submitted_tags ?? []);
    }
  }, [message]);

  const submitted = Boolean(meta?.submitted_at || meta?.rating_status === "rated");
  const canSubmit = !submitted && currentOrgId === conversationOwnerOrgId;

  const targetName = formatChatPartyName(
    meta?.rated_display_name ?? message.content,
  );

  const toggleTag = useCallback((t: string) => {
    setTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }, []);

  const onSubmit = useCallback(async () => {
    if (!meta || submitted || !canSubmit) return;
    if (rating < 1 || rating > 5) {
      setErr("Select a star rating first.");
      return;
    }
    setErr(null);
    setSubmitting(true);

    // ── Optimistic update ─────────────────────────────────────────────────
    // Patch the store immediately so the "Rated ✓" state shows before the DB
    // responds.  No DB re-fetch or hydrateConversationById needed.
    const now = new Date().toISOString();
    const optimisticMeta: FeedbackRequestMetadata = {
      ...meta,
      submitted_at:    now,
      submitted_score: rating,
      submitted_tags:  tags,
    };
    chatStore.submitFeedback(message.conversation_id, message.id, {
      metadata: optimisticMeta,
    });

    try {
      const result = await submitAtomicFeedback({
        organizationId: ratingOrganizationId,
        tripId,
        message,
        score:  rating,
        tags,
      });

      // Overwrite optimistic patch with server-confirmed values
      const confirmedMeta: FeedbackRequestMetadata = {
        ...meta,
        submitted_at:    result.submittedAt,
        submitted_score: result.submittedScore,
        submitted_tags:  result.submittedTags,
      };
      chatStore.patchMessage(message.conversation_id, message.id, {
        metadata: confirmedMeta,
      });

      onSubmitted();
    } catch (e) {
      // Rollback optimistic patch — restore original metadata
      chatStore.patchMessage(message.conversation_id, message.id, {
        metadata: meta,
      });
      setErr(e instanceof Error ? e.message : "Submission failed. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }, [
    meta,
    submitted,
    canSubmit,
    rating,
    tags,
    ratingOrganizationId,
    tripId,
    message,
    onSubmitted,
  ]);

  if (!meta) return null;

  return (
    <View style={s.wrap}>
      <View style={s.decoIcon}>
        <Award size={120} color="rgba(16, 185, 129, 0.06)" strokeWidth={1.2} />
      </View>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <View style={s.iconBadge}>
            <ThumbsUp size={22} color="#059669" strokeWidth={2} />
          </View>
          <View style={s.headerText}>
            <Text style={s.kicker}>MISSION DEBRIEF</Text>
            <Text style={s.title}>Rate handshake</Text>
            {targetName ? (
              <Text style={s.target} numberOfLines={2}>
                {targetName}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={s.protocolPill}>
          <Text style={s.protocolPillText}>PROTOCOL END</Text>
        </View>
      </View>

      <View style={s.panel}>
        <Text style={s.panelHint}>How was this partner on the trip?</Text>
        <View style={s.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = rating >= n;
            return (
              <TouchableOpacity
                key={n}
                style={[s.starBtn, on && s.starBtnOn]}
                onPress={() => !submitted && canSubmit && setRating(n)}
                disabled={submitted || !canSubmit}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${n} stars`}
              >
                <Star
                  size={22}
                  color={on ? "#fff" : "#cbd5e1"}
                  fill={on ? "#fbbf24" : "transparent"}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={s.tagsRow}>
          {TAG_OPTIONS.map((t) => {
            const on = tags.includes(t);
            return (
              <TouchableOpacity
                key={t}
                style={[s.tagPill, on && s.tagPillOn]}
                onPress={() => !submitted && canSubmit && toggleTag(t)}
                disabled={submitted || !canSubmit}
                activeOpacity={0.85}
              >
                <Text style={[s.tagText, on && s.tagTextOn]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {err ? <Text style={s.err}>{err}</Text> : null}

      {!canSubmit && !submitted ? (
        <Text style={s.readOnly}>
          Only the trip owner organization can submit this debrief.
        </Text>
      ) : null}

      {submitted ? (
        <View style={s.doneRow}>
          <ShieldCheck size={18} color={CHAT_ACCENT} strokeWidth={2.2} />
          <Text style={s.doneText}>
            Debrief recorded
            {meta.submitted_score != null
              ? ` · ${meta.submitted_score}/5`
              : ""}
          </Text>
        </View>
      ) : (
        <View style={s.footerRow}>
          <TouchableOpacity
            style={[s.submitBtn, (!canSubmit || submitting) && s.submitBtnOff]}
            onPress={onSubmit}
            disabled={!canSubmit || submitting}
            activeOpacity={0.88}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <ShieldCheck size={18} color="#fff" strokeWidth={2.2} />
                <Text style={s.submitText}>SUBMIT DEBRIEF</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={s.time}>{formatTime(message.created_at)}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    maxWidth: 420,
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginVertical: 8,
    overflow: "hidden",
  },
  decoIcon: {
    position: "absolute",
    right: -8,
    top: -12,
    transform: [{ rotate: "-12deg" }],
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconBadge: {
    width: 48,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  target: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  protocolPill: {
    backgroundColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  protocolPillText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.8,
  },
  panel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    gap: 10,
  },
  panelHint: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textAlign: "center",
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  starBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  starBtnOn: {
    backgroundColor: "#fbbf24",
    borderColor: "#f59e0b",
    transform: [{ scale: 1.05 }],
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  tagPillOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  tagText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  tagTextOn: { color: "#fff" },
  err: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: Theme.negative,
  },
  readOnly: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  footerRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  submitBtnOff: { opacity: 0.45 },
  submitText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  time: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  doneRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  doneText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
});
