/**
 * Lightweight client-side performance counters for chat observability.
 * Call markStart/markEnd around DB calls; flush() writes to console in dev,
 * or call getSnapshot() to POST metrics to an Edge Function.
 *
 * Not wired to any remote sink by default — add a remote sink via setReporter()
 * once you have an endpoint.
 */

export type ChatPerfMetric = {
  op: string;
  durationMs: number;
  meta?: Record<string, string | number>;
  ts: number;
};

const _log: ChatPerfMetric[] = [];
const _starts: Map<string, number> = new Map();

export function markStart(op: string): void {
  _starts.set(op, performance.now());
}

export function markEnd(op: string, meta?: Record<string, string | number>): number {
  const start = _starts.get(op);
  if (start == null) return 0;
  _starts.delete(op);
  const durationMs = Math.round(performance.now() - start);
  const metric: ChatPerfMetric = { op, durationMs, meta, ts: Date.now() };
  _log.push(metric);
  if (_log.length > 200) _log.shift();
  if (__DEV__) {
    console.debug(`[chatPerf] ${op} ${durationMs}ms`, meta ?? '');
  }
  return durationMs;
}

export function getSnapshot(): ChatPerfMetric[] {
  return [..._log];
}

export function getAverageDuration(op: string): number | null {
  const relevant = _log.filter((m) => m.op === op);
  if (!relevant.length) return null;
  return Math.round(relevant.reduce((s, m) => s + m.durationMs, 0) / relevant.length);
}

export function clear(): void {
  _log.length = 0;
  _starts.clear();
}
