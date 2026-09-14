import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import { shouldShowDriverMultiStop } from '@/features/driver/execution/normalizeDriverStopExecution';

/**
 * Job Card execution mode. Decided from Core stop_execution_state rows
 * already loaded for Phase 2D/2E — never from get_driver_trip_stop_orders.
 */
export type DriverJobExecutionMode = 'legacy' | 'multi_order';

export function resolveDriverJobExecutionMode(
  stops: readonly DriverStopExecutionStop[],
): DriverJobExecutionMode {
  return shouldShowDriverMultiStop(stops) ? 'multi_order' : 'legacy';
}
