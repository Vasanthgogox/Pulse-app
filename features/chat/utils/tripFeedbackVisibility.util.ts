import type { StatusChangeMetadata, TripConversation, TripMessageRow } from "../types/chat.types";

/** Trip lane: show in-chat feedback when a terminal success status appears in this lane's history. */
export function tripMessageHistoryHasCompletedStatus(messages: TripMessageRow[] | undefined): boolean {
  if (!messages?.length) return false;
  const done = new Set(["completed", "delivered", "done"]);
  for (const m of messages) {
    if (m.message_type !== "status_change") continue;
    const meta = m.metadata as StatusChangeMetadata | undefined;
    const ns = String(meta?.new_status ?? "").toLowerCase().trim();
    if (done.has(ns)) return true;
  }
  return false;
}

/**
 * Integrated indents: require the indent row to be `completed` before showing the
 * in-chat debrief card on client/supplier lanes. When `indent_status` is absent
 * (legacy bootstrap), fall back to trip-history checks only.
 */
export function indentAllowsInChatFeedbackDebrief(
  conv: Pick<TripConversation, "indent_id" | "indent_status">,
  tripTerminal = false,
): boolean {
  if (tripTerminal) return true;
  const hasIndent = Boolean(conv.indent_id && String(conv.indent_id).trim());
  if (!hasIndent) return true;
  const st = String(conv.indent_status ?? "").trim().toLowerCase();
  if (!st) return true;
  return st === "completed";
}
