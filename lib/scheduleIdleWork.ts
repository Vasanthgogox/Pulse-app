/** Run work after first paint without blocking interaction. */
export function scheduleIdleWork(fn: () => void, timeoutMs = 2500): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: timeoutMs });
    return;
  }
  setTimeout(fn, Math.min(timeoutMs, 1500));
}
