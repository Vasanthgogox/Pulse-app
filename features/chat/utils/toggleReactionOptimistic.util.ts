/** Optimistic emoji reaction toggle for trip_messages.reactions JSONB shape. */
export function toggleReactionOptimistic(
  reactions: Record<string, string[]> | null | undefined,
  emoji: string,
  userId: string,
): Record<string, string[]> {
  const prev = reactions ?? {};
  const current = prev[emoji] ?? [];
  const hasMine = current.includes(userId);
  const nextUsers = hasMine
    ? current.filter((id) => id !== userId)
    : [...current, userId];
  const next: Record<string, string[]> = { ...prev };
  if (nextUsers.length > 0) next[emoji] = nextUsers;
  else delete next[emoji];
  return next;
}
