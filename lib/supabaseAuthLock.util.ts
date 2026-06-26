/** Supabase GoTrue navigator-lock races (dev reload / parallel refetch). */
export function isIgnorableSupabaseAuthLockError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("lock was stolen by another request") ||
    msg.includes('lock "lock:sb-') ||
    msg.includes("was not released within")
  );
}
