/**
 * Driver Job Card router.
 * Mode = SES stops or persisted trip.is_commerce / execution_plan_id.
 * Primitive A is not used to choose the card.
 */
import { DriverTripFlowCard, type DriverTripFlowCardProps } from '@/features/driver/components/DriverTripFlowCard';
import { useDriverStopExecution } from '@/features/driver/hooks/useDriverStopExecution';
import { DriverJobCardPending } from '@/features/driver/job-card/DriverJobCardPending';
import { DriverMultiOrderJobCard } from '@/features/driver/job-card/DriverMultiOrderJobCard';
import { resolveDriverJobExecutionMode } from '@/features/driver/job-card/resolveDriverJobExecutionMode';

export function DriverJobCard(props: DriverTripFlowCardProps) {
  const stopExecution = useDriverStopExecution(props.trip.id);
  const isCommerceTrip = Boolean(
    props.trip.is_commerce || (props.trip.execution_plan_id ?? '').trim(),
  );

  if (!stopExecution.hydrated) {
    return (
      <DriverJobCardPending
        trip={props.trip}
        edgeToEdge={props.edgeToEdge}
        variant={props.variant}
      />
    );
  }

  const mode = resolveDriverJobExecutionMode(stopExecution.stops, { isCommerceTrip });

  if (mode === 'multi_order') {
    return <DriverMultiOrderJobCard {...props} stopExecution={stopExecution} />;
  }

  return <DriverTripFlowCard {...props} skipStopExecution />;
}
