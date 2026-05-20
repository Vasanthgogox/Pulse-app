/**
 * Desktop grid footer — sales, receivable due, payable due (status in card header).
 */
import {
  HubGridCardFooter,
  HubGridMetricsRow,
  HubGridStatusChip,
} from "@/components/hub/HubGridCardToolbar";
import Theme from "@/constants/Theme";
import { formatINRChip } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";

export type TripsHubTripCardToolbarProps = {
  revenue: number;
  receivableDue: number;
  payableDue: number;
  salesLabel: string;
  receivableLabel: string;
  payableLabel: string;
  clearedLabel: string;
  dense?: boolean;
};

function DueChip({
  amount,
  pending,
  pendingLabel,
  clearedLabel,
  iconName,
}: {
  amount: number;
  pending: boolean;
  pendingLabel: string;
  clearedLabel: string;
  iconName: React.ComponentProps<typeof FontAwesome>["name"];
}) {
  const tone = pending ? Theme.teslaRed : Theme.positive;
  return (
    <HubGridStatusChip
      fill
      compact
      amountLine
      accessibilityLabel={
        pending ? `${pendingLabel} ${formatINRChip(amount)}` : clearedLabel
      }
      icon={
        <FontAwesome
          name={pending ? iconName : "check"}
          size={9}
          color={tone}
        />
      }
      line1={formatINRChip(amount)}
    />
  );
}

export function TripsHubTripCardToolbar({
  revenue,
  receivableDue,
  payableDue,
  salesLabel,
  receivableLabel,
  payableLabel,
  clearedLabel,
  dense,
}: TripsHubTripCardToolbarProps) {
  const recvPending = receivableDue > 0;
  const payPending = payableDue > 0;

  return (
    <HubGridCardFooter dense={dense}>
      <HubGridMetricsRow>
        <HubGridStatusChip
          fill
          compact
          amountLine
          accessibilityLabel={`${salesLabel} ${formatINRChip(revenue)}`}
          icon={
            <FontAwesome name="rupee" size={9} color={Theme.textSecondary} />
          }
          line1={formatINRChip(revenue)}
        />
        <DueChip
          amount={receivableDue}
          pending={recvPending}
          pendingLabel={receivableLabel}
          clearedLabel={clearedLabel}
          iconName="arrow-down"
        />
        <DueChip
          amount={payableDue}
          pending={payPending}
          pendingLabel={payableLabel}
          clearedLabel={clearedLabel}
          iconName="arrow-up"
        />
      </HubGridMetricsRow>
    </HubGridCardFooter>
  );
}
