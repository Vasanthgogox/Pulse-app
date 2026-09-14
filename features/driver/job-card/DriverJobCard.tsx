/**
 * Driver Job Card router.
 * SES hydrate chooses legacy vs multi-order. Commerce RPC is never used to decide.
 */
import { DriverTripFlowCard, type DriverTripFlowCardProps } from '@/features/driver/components/DriverTripFlowCard';
import { useDriverStopExecution } from '@/features/driver/hooks/useDriverStopExecution';
import { DriverJobCardPending } from '@/features/driver/job-card/DriverJobCardPending';
import { DriverMultiOrderJobCard } from '@/features/driver/job-card/DriverMultiOrderJobCard';
import { resolveDriverJobExecutionMode } from '@/features/driver/job-card/resolveDriverJobExecutionMode';

export function DriverJobCard(props: DriverTripFlowCardProps) {
  const stopExecution = useDriverStopExecution(props.trip.id);
  const mode = stopExecution.hydrated
    ? resolveDriverJobExecutionMode(stopExecution.stops)
    : null;

  if (!stopExecution.hydrated) {
    return (
      <DriverJobCardPending
        trip={props.trip}
        edgeToEdge={props.edgeToEdge}
        variant={props.variant}
      />
    );
  }

  if (mode === 'multi_order') {
    return <DriverMultiOrderJobCard {...props} stopExecution={stopExecution} />;
  }

  return <DriverTripFlowCard {...props} skipStopExecution />;
}
