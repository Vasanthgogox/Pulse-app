import type { FeedbackRequestMetadata, TripMessageRow } from "../types/chat.types";

function coerceRatedId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length ? t : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function normalizeRatedPartyType(raw: unknown): "client" | "supplier" | "driver" | null {
  const t =
    (typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "")
      .trim()
      .toLowerCase();
  if (t === "client" || t === "supplier" || t === "driver") return t;
  return null;
}

/**
 * Parses `feedback_request` message metadata from DB / realtime payloads.
 * Tolerates stringified JSON and non-string `rated_id` (PostgREST / drivers).
 */
export function parseFeedbackRequestMetadata(
  message: Pick<TripMessageRow, "message_type" | "metadata">,
): FeedbackRequestMetadata | null {
  if (message.message_type !== "feedback_request") return null;

  let rawMeta: unknown = message.metadata;
  if (typeof rawMeta === "string") {
    const s = rawMeta.trim();
    if (!s) return null;
    try {
      rawMeta = JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  }

  if (!rawMeta || typeof rawMeta !== "object") return null;
  const o = rawMeta as Record<string, unknown>;
  const rt = normalizeRatedPartyType(o.rated_party_type ?? o.ratedPartyType);
  if (!rt) return null;

  const ratedId = coerceRatedId(o.rated_id);
  if (!ratedId) return null;

  const fv = o.feedback_version;
  const feedbackVersion =
    typeof fv === "number" && Number.isFinite(fv)
      ? fv
      : typeof fv === "string" && fv.trim() && Number.isFinite(Number(fv))
        ? Number(fv)
        : undefined;

  const submittedScore = o.submitted_score;
  const scoreNum =
    typeof submittedScore === "number" && Number.isFinite(submittedScore)
      ? submittedScore
      : typeof submittedScore === "string" &&
          submittedScore.trim() &&
          Number.isFinite(Number(submittedScore))
        ? Number(submittedScore)
        : undefined;

  return {
    feedback_version: feedbackVersion,
    rated_party_type: rt,
    rated_id: ratedId,
    rated_display_name:
      typeof o.rated_display_name === "string" ? o.rated_display_name : undefined,
    submitted_at: typeof o.submitted_at === "string" ? o.submitted_at : undefined,
    submitted_score: scoreNum,
    submitted_tags: Array.isArray(o.submitted_tags)
      ? (o.submitted_tags as unknown[]).filter((t): t is string => typeof t === "string")
      : undefined,
  };
}
