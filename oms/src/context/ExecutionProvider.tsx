import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  assignExecutionJob,
  advanceExecutionStop,
  getNextPendingStop,
  mirrorExecutionJobFromPublishedPlan,
} from '@/lib/execution-adapter';
import {
  getExecutionJobs,
  getExecutionJob,
  subscribeExecutionStore,
  upsertExecutionJob,
  removeExecutionJob,
} from '@/lib/execution-store';
import { loadOrders, loadPlans } from '@/lib/order-store';
import { fetchCommerceExecutions, toExecutionJob, type CommerceExecution } from '@/lib/services/execution-visibility.service';
import { collapseCommerceExecutionsToIndentGroups } from '@/lib/commerce-ops-hub';
import { useOrganization } from '@/context/OrganizationProvider';
import { DEFAULT_TENANT } from '@/types/platform';
import type { ExecutionJob } from '@/types/execution';
import type { FleetDriver, FleetVehicle } from '@/types/onboarding';

interface ExecutionContextValue {
  jobs:               ExecutionJob[];
  pendingJobs:        ExecutionJob[];
  activeJobs:         ExecutionJob[];
  completedJobs:      ExecutionJob[];
  /** Rich, authoritative plan → orders → stops → indent → trip view for the Commerce Execution UI. */
  commerceExecutions: CommerceExecution[];
  /** True once the first authoritative read has completed (success or failure). */
  commerceExecutionsLoaded: boolean;
  /** Set when the authoritative read itself failed — distinct from "no executions yet". */
  commerceExecutionsError: boolean;
  refreshCommerceExecutions: () => Promise<void>;
  assignJob:         (jobId: string, driver: FleetDriver, vehicle: FleetVehicle) => ExecutionJob | null;
  completeNextStop:  (jobId: string, podRef?: string) => ExecutionJob | null;
  getJob:            (jobId: string) => ExecutionJob | undefined;
  getNextStop:       (jobId: string) => ReturnType<typeof getNextPendingStop>;
}

const ExecutionContext = createContext<ExecutionContextValue | undefined>(undefined);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const org = useOrganization();
  const [jobs, setJobs] = useState<ExecutionJob[]>(() => {
    const plans = loadPlans();
    const orders = loadOrders();
    for (const plan of plans) {
      mirrorExecutionJobFromPublishedPlan(plan, orders, DEFAULT_TENANT, 'Admin');
    }
    return getExecutionJobs();
  });

  useEffect(() => subscribeExecutionStore(() => setJobs(getExecutionJobs())), []);

  const [commerceExecutions, setCommerceExecutions] = useState<CommerceExecution[]>([]);
  const [commerceExecutionsLoaded, setCommerceExecutionsLoaded] = useState(false);
  const [commerceExecutionsError, setCommerceExecutionsError] = useState(false);

  const applyExecutions = useCallback((executions: CommerceExecution[], workspaceId: string) => {
    setCommerceExecutions(executions);
    setCommerceExecutionsLoaded(true);
    setCommerceExecutionsError(false);
    const persisted = executions.map(exec => toExecutionJob(exec, workspaceId));
    for (const job of persisted) upsertExecutionJob(job);
    const confirmedPlanIds = new Set(persisted.map(j => j.executionPlanId));
    for (const job of getExecutionJobs()) {
      if (
        job.status === 'received' &&
        job.command.workspaceId === workspaceId &&
        !confirmedPlanIds.has(job.executionPlanId)
      ) {
        removeExecutionJob(job.id);
      }
    }
  }, []);

  const refreshCommerceExecutions = useCallback(async () => {
    const workspaceId = org.platformOrganization?.id;
    if (!workspaceId) return;
    try {
      const executions = collapseCommerceExecutionsToIndentGroups(
        await fetchCommerceExecutions(workspaceId),
      );
      applyExecutions(executions, workspaceId);
    } catch {
      setCommerceExecutionsLoaded(true);
      setCommerceExecutionsError(true);
    }
  }, [org.platformOrganization?.id, applyExecutions]);

  // Authoritative reconciliation: the local execution-store above is an
  // optimistic mirror populated at dispatch time. On mount (refresh/reopen)
  // and whenever the org becomes available, re-derive state from what is
  // actually persisted in Core — refreshing confirmed jobs with real
  // status/summary/indent data, and dropping any locally-mirrored "received"
  // job whose plan never actually made it into Core (Step 8: a stale local
  // mirror must not keep showing a false published state). The same
  // authoritative read also feeds `commerceExecutions`, the rich plan →
  // orders → stops → indent → trip view the Commerce Execution UI renders.
  useEffect(() => {
    const workspaceId = org.platformOrganization?.id;
    if (!org.organizationHydrated || !workspaceId) return;
    let cancelled = false;

    (async () => {
      let executions: CommerceExecution[];
      try {
        executions = collapseCommerceExecutionsToIndentGroups(
          await fetchCommerceExecutions(workspaceId),
        );
      } catch {
        // Persisted read failed (e.g. offline) — keep the local mirror as-is
        // rather than incorrectly pruning jobs we simply couldn't confirm,
        // and surface an explicit error state rather than an empty one.
        if (!cancelled) {
          setCommerceExecutionsLoaded(true);
          setCommerceExecutionsError(true);
        }
        return;
      }
      if (cancelled) return;
      applyExecutions(executions, workspaceId);
    })();

    return () => { cancelled = true; };
  }, [org.organizationHydrated, org.platformOrganization?.id, applyExecutions]);

  const pendingJobs = useMemo(() => jobs.filter(j => j.status === 'received'), [jobs]);
  const activeJobs  = useMemo(() => jobs.filter(j => j.status === 'assigned' || j.status === 'in_progress'), [jobs]);
  const completedJobs = useMemo(() => jobs.filter(j => j.status === 'completed'), [jobs]);

  const assignJob = useCallback((jobId: string, driver: FleetDriver, vehicle: FleetVehicle) => {
    return assignExecutionJob(jobId, driver, vehicle);
  }, []);

  const completeNextStop = useCallback((jobId: string, podRef?: string) => {
    const job = getExecutionJob(jobId);
    if (!job) return null;
    const next = getNextPendingStop(job);
    if (!next) return job;
    return advanceExecutionStop(jobId, next.stopId, podRef);
  }, []);

  return (
    <ExecutionContext.Provider value={{
      jobs, pendingJobs, activeJobs, completedJobs,
      commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError,
      refreshCommerceExecutions,
      assignJob, completeNextStop,
      getJob: getExecutionJob,
      getNextStop: (jobId) => {
        const job = getExecutionJob(jobId);
        return job ? getNextPendingStop(job) : undefined;
      },
    }}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useExecution(): ExecutionContextValue {
  const ctx = useContext(ExecutionContext);
  if (!ctx) throw new Error('useExecution must be used inside ExecutionProvider');
  return ctx;
}
