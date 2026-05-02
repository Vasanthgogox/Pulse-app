/**
 * Supabase Realtime channel names must be unique per subscription lifecycle.
 * Reusing the same topic after subscribe() (e.g. React Strict Mode remount or
 * effect re-run before removeChannel finishes) causes: "cannot add postgres_changes
 * callbacks ... after subscribe()".
 */
export function uniqueRealtimeChannelTopic(base: string): string {
  return `${base}:${Math.random().toString(36).slice(2, 11)}`;
}
