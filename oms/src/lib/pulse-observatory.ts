import type { ObservatoryRecord, ObservatoryStatus } from '@/types/observatory';

const MAX_RECORDS = 500;
const records: ObservatoryRecord[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeObservatory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordObservatory(entry: Omit<ObservatoryRecord, 'id' | 'occurredAt'> & { occurredAt?: string }): ObservatoryRecord {
  const record: ObservatoryRecord = {
    id: crypto.randomUUID(),
    occurredAt: entry.occurredAt ?? new Date().toISOString(),
    ...entry,
  };
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.pop();
  notify();
  return record;
}

export function recordCommand(params: {
  correlationId: string;
  causationId?:  string;
  service:       string;
  action:        string;
  status:        ObservatoryStatus;
  latencyMs?:    number;
  payload?:      unknown;
  error?:        string;
}): ObservatoryRecord {
  return recordObservatory({
    type: 'command',
    workspace: 'commerce',
    ...params,
  });
}

export function recordEventObserved(params: {
  correlationId: string;
  causationId?:  string;
  parentEventId?: string;
  service:       string;
  action:        string;
  status?:       ObservatoryStatus;
  payload?:      unknown;
}): ObservatoryRecord {
  return recordObservatory({
    type: 'event',
    workspace: params.service,
    status: params.status ?? 'success',
    ...params,
  });
}

export function recordAudit(params: {
  correlationId: string;
  action:        string;
  payload?:      unknown;
}): ObservatoryRecord {
  return recordObservatory({
    type: 'audit',
    workspace: 'commerce',
    service: 'commerce',
    status: 'success',
    causationId: params.correlationId,
    ...params,
  });
}

export function getCorrelationTrace(correlationId: string): ObservatoryRecord[] {
  return records
    .filter(r => r.correlationId === correlationId || r.causationId === correlationId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function getRecentObservatoryRecords(limit = 50): ObservatoryRecord[] {
  return records.slice(0, limit);
}

export function getObservatoryStats() {
  const recent = records.slice(0, 100);
  return {
    total:        records.length,
    commands:     recent.filter(r => r.type === 'command').length,
    events:       recent.filter(r => r.type === 'event').length,
    failures:     recent.filter(r => r.status === 'failure').length,
    avgLatencyMs: Math.round(
      recent.filter(r => r.latencyMs).reduce((s, r) => s + (r.latencyMs ?? 0), 0)
      / Math.max(1, recent.filter(r => r.latencyMs).length),
    ),
  };
}

export function seedObservatoryTrace(trace: Omit<ObservatoryRecord, 'id'>[]): void {
  trace.forEach(t => recordObservatory(t));
}
