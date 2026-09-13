/** PostgREST builder cancellation — supabase-js 2.108.2 (`abortSignal`). */

export function withAbortSignal<T extends { abortSignal: (signal: AbortSignal) => T }>(
  builder: T,
  signal?: AbortSignal,
): T {
  return signal ? builder.abortSignal(signal) : builder;
}

export function cancelledQueryError(): Error {
  const err = new Error("Request cancelled");
  err.name = "AbortError";
  return err;
}

export function isCancelledRequest(
  signal?: AbortSignal,
  error?: { message?: string; hint?: string; name?: string } | null,
): boolean {
  if (signal?.aborted) return true;
  if (error?.name === "AbortError") return true;
  const hay = `${error?.message ?? ""} ${error?.hint ?? ""}`;
  return /AbortError|aborted locally|Request cancelled|The user aborted/i.test(hay);
}

export function throwIfCancelled(
  signal?: AbortSignal,
  error?: { message?: string; hint?: string; name?: string } | null,
): void {
  if (isCancelledRequest(signal, error)) {
    throw cancelledQueryError();
  }
}
