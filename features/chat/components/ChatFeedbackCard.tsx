import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Check } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import { useChatStore } from "../store/useChatStore";
import type { TripMessageRow } from "../types/chat.types";
import { parseFeedbackRequestMetadata } from "../utils/feedbackRequestMeta";
import { isFeedbackRequestAlreadyRatedMeta } from "../utils/feedbackRequestMeta.util";

/** Five smileys → 1–5 scale; persisted in `trip_messages.metadata.rating` (atomic RPC). */
const SMILEY_OPTIONS = [
  { emoji: "😠", score: 1, a11y: "Terrible, 1 of 5" },
  { emoji: "😟", score: 2, a11y: "Poor, 2 of 5" },
  { emoji: "😐", score: 3, a11y: "Average, 3 of 5" },
  { emoji: "🙂", score: 4, a11y: "Good, 4 of 5" },
  { emoji: "🤩", score: 5, a11y: "Excellent, 5 of 5" },
] as const;

type FeedbackCardPhase = "pick" | "submitting" | "success" | "already_rated";

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

function isAlreadySubmittedMessage(s: string): boolean {
  return /already_submitted|feedback already submitted/i.test(s);
}

export function ChatFeedbackCard({
  message,
  tripId: _tripId,
  ratingOrganizationId,
  currentOrgId,
  onSubmitted,
}: {
  message: TripMessageRow;
  tripId: string;
  /** Fleet org that owns the trip (`trips.organization_id`); must match viewer to submit. */
  ratingOrganizationId: string;
  currentOrgId: string;
  onSubmitted: () => void;
}) {
  const meta = useMemo(() => parseFeedbackRequestMetadata(message), [message]);

  const [phase, setPhase] = useState<FeedbackCardPhase>(() =>
    isFeedbackRequestAlreadyRatedMeta(meta) ? "already_rated" : "pick",
  );
  const [pickedScore, setPickedScore] = useState<number | null>(() => {
    if (!meta) return null;
    const s = meta.submitted_score ?? meta.rating;
    return typeof s === "number" && s >= 1 && s <= 5 ? s : null;
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const m = parseFeedbackRequestMetadata(message);
    if (!m) return;
    const s = m.submitted_score ?? m.rating;
    setPickedScore(typeof s === "number" && s >= 1 && s <= 5 ? s : null);
    setPhase((p) => {
      if (p === "success" || p === "submitting") return p;
      return isFeedbackRequestAlreadyRatedMeta(m) ? "already_rated" : "pick";
    });
  }, [message]);

  const canSubmit =
    phase === "pick" &&
    currentOrgId.trim() === (ratingOrganizationId ?? "").trim();

  const targetName = formatChatPartyName(
    meta?.rated_display_name ?? message.content,
  );

  const onPickSmiley = useCallback(
    async (score: number) => {
      if (!meta || !canSubmit) return;
      if (pickedScore != null || phase !== "pick") return;
      setErr(null);
      setPhase("submitting");
      setPickedScore(score);

      const { error } = await useChatStore.getState().submitSmileyFeedback(message.id, score);
      if (error) {
        if (isAlreadySubmittedMessage(error)) {
          setPhase("success");
          onSubmitted();
          return;
        }
        setPhase("pick");
        setPickedScore(null);
        setErr(error);
        return;
      }
      setPhase("success");
      onSubmitted();
    },
    [meta, canSubmit, message, onSubmitted, pickedScore, phase],
  );

  if (!meta) return null;

  const displayScore =
    phase === "already_rated"
      ? (meta.submitted_score ?? meta.rating ?? pickedScore ?? 0)
      : (pickedScore ?? 0);

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <View style={s.kickerCol}>
          <Text style={s.kicker}>PULSE CHAT</Text>
          <Text style={s.title}>How was the coordination?</Text>
          {targetName ? (
            <Text style={s.target} numberOfLines={2}>
              {targetName}
            </Text>
          ) : null}
        </View>
        <View style={s.sheetPill}>
          <Text style={s.sheetPillText}>SYSTEM</Text>
        </View>
      </View>

      {phase === "pick" || phase === "submitting" ? (
        <Text style={s.hint} numberOfLines={2}>
          Trip closed — tap a face (1–5) to record your rating.
        </Text>
      ) : null}

      {phase === "pick" || phase === "submitting" ? (
        <View style={s.smileyRow}>
          {SMILEY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.score}
              style={[
                s.smileyBtn,
                pickedScore === opt.score && phase === "submitting" && s.smileyBtnActive,
              ]}
              onPress={() => void onPickSmiley(opt.score)}
              disabled={phase !== "pick" || !canSubmit}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={opt.a11y}
            >
              <Text style={s.smileyEmoji}>{opt.emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {phase === "submitting" ? (
        <View style={s.inlineSpinner}>
          <ActivityIndicator size="small" color={CHAT_ACCENT} />
        </View>
      ) : null}

      {err ? <Text style={s.err}>{err}</Text> : null}

      {!canSubmit && phase === "pick" ? (
        <Text style={s.readOnly}>
          Only the trip owner organization can submit this debrief.
        </Text>
      ) : null}

      {phase === "success" || phase === "already_rated" ? (
        <View style={s.doneRow}>
          <Check size={16} color={CHAT_ACCENT} strokeWidth={2.4} />
          <Text style={s.doneText}>
            {phase === "already_rated" ? "Feedback on file" : "Feedback submitted"}
            {displayScore > 0 ? ` · ${displayScore}/5` : ""}
          </Text>
        </View>
      ) : null}

      <View style={s.footerRow}>
        <Text style={s.time}>{formatTime(message.created_at)}</Text>
      </View>
    </View>
  );
}

/** @deprecated Prefer `ChatFeedbackCard` — kept for legacy imports. */
export const ChatTripFeedbackCard = ChatFeedbackCard;

const s = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    maxWidth: 420,
    width: "100%",
    backgroundColor: CHAT_ACCENT_SOFT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(67, 56, 202, 0.12)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginVertical: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  kickerCol: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 1.1,
    fontStyle: "italic",
  },
  title: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    fontStyle: "italic",
  },
  target: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  sheetPill: {
    backgroundColor: "rgba(67, 56, 202, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sheetPillText: {
    fontSize: 8,
    fontWeight: "900",
    color: CHAT_ACCENT,
    letterSpacing: 0.6,
  },
  hint: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  smileyRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  smileyBtn: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    maxHeight: 52,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  smileyBtnActive: {
    borderColor: CHAT_ACCENT,
    backgroundColor: "rgba(67, 56, 202, 0.06)",
  },
  smileyEmoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  inlineSpinner: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
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
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  time: {
    fontSize: 10,
    fontWeight: "700",
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
    fontWeight: "700",
    color: Theme.textSecondary,
  },
});
