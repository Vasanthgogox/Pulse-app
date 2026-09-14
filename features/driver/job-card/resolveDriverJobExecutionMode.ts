/**
 * Job Card execution mode.
 * SES stops or a persisted commerce/execution-plan flag on the trip.
 * Never Primitive A — that hydrates orders only after multi-order is chosen.
 */
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import { shouldShowDriverMultiStop } from '@/features/driver/execution/normalizeDriverStopExecution';

export type DriverJobExecutionMode = 'legacy' | 'multi_order';

export type DriverJobExecutionHints = {
  isCommerceTrip?: boolean;
};

export function resolveDriverJobExecutionMode(
  stops: readonly DriverStopExecutionStop[],
  hints?: DriverJobExecutionHints,
): DriverJobExecutionMode {
  if (shouldShowDriverMultiStop(stops)) return 'multi_order';
  if (hints?.isCommerceTrip) return 'multi_order';
  return 'legacy';
}
