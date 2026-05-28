import type { TripFuelEntry, TripTollEntry } from "../types";
import type { ReimbursementState } from "../types";

type ReimbursableEntry = {
  id: string;
  trip_id: string;
  amount_inr: number;
  payment_owner: string;
  reimbursement_state?: ReimbursementState | null;
  entered_at: string;
  kind: "fuel" | "toll";
};

export function toReimbursableEntries(input: {
  fuelEntries: TripFuelEntry[];
  tollEntries: TripTollEntry[];
}): ReimbursableEntry[] {
  const fuel = input.fuelEntries
    .filter((entry) => entry.payment_owner === "driver")
    .map((entry) => ({
      id: entry.id,
      trip_id: entry.trip_id,
      amount_inr: Number(entry.amount_inr ?? 0),
      payment_owner: entry.payment_owner,
      reimbursement_state: entry.reimbursement_state ?? "reported",
      entered_at: entry.entered_at,
      kind: "fuel" as const,
    }));
  const toll = input.tollEntries
    .filter((entry) => entry.payment_owner === "driver")
    .map((entry) => ({
      id: entry.id,
      trip_id: entry.trip_id,
      amount_inr: Number(entry.amount_inr ?? 0),
      payment_owner: entry.payment_owner,
      reimbursement_state: entry.reimbursement_state ?? "reported",
      entered_at: entry.entered_at,
      kind: "toll" as const,
    }));
  return [...fuel, ...toll].sort(
    (a, b) => +new Date(b.entered_at) - +new Date(a.entered_at),
  );
}

export function groupPendingReimbursements(
  entries: ReimbursableEntry[],
): ReimbursableEntry[] {
  return entries.filter((entry) =>
    entry.reimbursement_state === "reported" ||
    entry.reimbursement_state === "approved" ||
    entry.reimbursement_state === "reimbursement_pending",
  );
}

export function sumPendingReimbursementAmount(
  entries: ReimbursableEntry[],
): number {
  return groupPendingReimbursements(entries).reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.amount_inr) || 0),
    0,
  );
}
