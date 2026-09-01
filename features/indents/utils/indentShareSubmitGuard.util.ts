/** In-flight ticket confirm so a second Share/Draft does not replace the resolver. */
export type ConfirmInFlight<K extends string> = {
  kind: K;
  promise: Promise<boolean>;
} | null;

export function shouldSkipLockedSubmit(
  submitting: boolean,
  lock: { current: boolean },
): boolean {
  return submitting || lock.current;
}

export function acquireSubmitLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSubmitLock(lock: { current: boolean }): void {
  lock.current = false;
}

/**
 * Reuse the existing confirmation promise when the same kind is already open.
 * A different kind is ignored so Share cannot steal a Draft resolver (or vice versa).
 */
export function beginConfirmOnce<K extends string>(
  slot: { current: ConfirmInFlight<K> },
  kind: K,
  open: () => Promise<boolean>,
): Promise<boolean> {
  if (slot.current) {
    return slot.current.kind === kind
      ? slot.current.promise
      : Promise.resolve(false);
  }
  const promise = open().finally(() => {
    if (slot.current?.promise === promise) {
      slot.current = null;
    }
  });
  slot.current = { kind, promise };
  return promise;
}
