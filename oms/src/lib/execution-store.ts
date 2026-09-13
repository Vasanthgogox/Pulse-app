import type { ExecutionJob, ExecutionTripStop } from '@/types/execution';

const JOBS_KEY = 'pulse-execution-jobs-v1';
const jobs = new Map<string, ExecutionJob>();
const listeners = new Set<() => void>();

function loadPersistedJobs(): ExecutionJob[] {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    return raw ? (JSON.parse(raw) as ExecutionJob[]) : [];
  } catch {
    return [];
  }
}

function persistJobs(): void {
  localStorage.setItem(JOBS_KEY, JSON.stringify([...jobs.values()]));
}

for (const job of loadPersistedJobs()) {
  jobs.set(job.id, job);
}

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeExecutionStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getExecutionJobs(): ExecutionJob[] {
  return [...jobs.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function getExecutionJob(id: string): ExecutionJob | undefined {
  return jobs.get(id);
}

export function getJobByCorrelationId(correlationId: string): ExecutionJob | undefined {
  return [...jobs.values()].find(j => j.correlationId === correlationId);
}

export function getJobByPlanId(planId: string): ExecutionJob | undefined {
  return [...jobs.values()].find(j => j.executionPlanId === planId);
}

export function upsertExecutionJob(job: ExecutionJob): ExecutionJob {
  jobs.set(job.id, job);
  persistJobs();
  notify();
  return job;
}

export function removeExecutionJob(id: string): void {
  if (!jobs.delete(id)) return;
  persistJobs();
  notify();
}

export function updateExecutionJob(
  id: string,
  patch: Partial<ExecutionJob>,
): ExecutionJob | undefined {
  const current = jobs.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  jobs.set(id, next);
  persistJobs();
  notify();
  return next;
}

export function buildStopsFromCommand(command: ExecutionJob['command']): ExecutionTripStop[] {
  const stopById = new Map(command.stops.map(s => [s.stopId, s]));
  const result: ExecutionTripStop[] = [];
  for (let i = 0; i < command.route.sequence.length; i++) {
    const stopId = command.route.sequence[i];
    const s = stopById.get(stopId);
    if (!s) continue;
    result.push({
      stopId:      s.stopId,
      sequence:    i + 1,
      label:       s.label,
      type:        s.type,
      city:        s.address.city,
      status:      'pending',
      podRequired: s.podRequired,
    });
  }
  return result;
}
