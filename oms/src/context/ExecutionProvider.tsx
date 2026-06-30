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
} from '@/lib/execution-store';
import { loadOrders, loadPlans } from '@/lib/order-store';
import { DEFAULT_TENANT } from '@/types/platform';
import type { ExecutionJob } from '@/types/execution';
import type { FleetDriver, FleetVehicle } from '@/types/onboarding';

interface ExecutionContextValue {
  jobs:              ExecutionJob[];
  pendingJobs:       ExecutionJob[];
  activeJobs:        ExecutionJob[];
  completedJobs:     ExecutionJob[];
  assignJob:         (jobId: string, driver: FleetDriver, vehicle: FleetVehicle) => ExecutionJob | null;
  completeNextStop:  (jobId: string, podRef?: string) => ExecutionJob | null;
  getJob:            (jobId: string) => ExecutionJob | undefined;
  getNextStop:       (jobId: string) => ReturnType<typeof getNextPendingStop>;
}

const ExecutionContext = createContext<ExecutionContextValue | undefined>(undefined);

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ExecutionJob[]>(() => {
    const plans = loadPlans();
    const orders = loadOrders();
    for (const plan of plans) {
      mirrorExecutionJobFromPublishedPlan(plan, orders, DEFAULT_TENANT, 'Admin');
    }
    return getExecutionJobs();
  });

  useEffect(() => subscribeExecutionStore(() => setJobs(getExecutionJobs())), []);

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
