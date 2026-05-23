import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';

export type DriverInviteSalaryLine = {
  label: string;
  value: string;
  hint: string;
};

/** Structured salary / pay terms for invite preview UI. */
export function buildDriverInviteSalaryLines(inv: DriverInviteRow): DriverInviteSalaryLine[] {
  const lines: DriverInviteSalaryLine[] = [];

  if (inv.payable_amount != null && Number(inv.payable_amount) > 0) {
    lines.push({
      label: 'Fixed salary',
      value: `₹${Number(inv.payable_amount).toLocaleString('en-IN')}`,
      hint: 'Agreed fixed pay from this fleet (e.g. monthly salary)',
    });
  }
  if (inv.commission_percent != null && Number(inv.commission_percent) > 0) {
    lines.push({
      label: 'Trip commission',
      value: `${inv.commission_percent}%`,
      hint: 'Your share of trip earnings on each completed trip',
    });
  }
  if (inv.commission_per_km != null && Number(inv.commission_per_km) > 0) {
    lines.push({
      label: 'Per km rate',
      value: `₹${Number(inv.commission_per_km).toLocaleString('en-IN')}/km`,
      hint: 'Paid per kilometre driven on assigned trips',
    });
  }

  return lines;
}

export function hasDriverInviteSalaryTerms(inv: DriverInviteRow): boolean {
  return buildDriverInviteSalaryLines(inv).length > 0;
}
