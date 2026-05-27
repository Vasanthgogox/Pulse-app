import type {
  TripAdjustmentImpact,
  TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";

export const FINANCE_PROTOCOL_CHIPS = [
  "Loading",
  "Unloading",
  "Detention",
  "Damage",
  "Toll",
  "RTO",
] as const;

export type FinanceProtocolChip = (typeof FINANCE_PROTOCOL_CHIPS)[number];

export function protocolSupplierChipAdjustment(chip: FinanceProtocolChip): {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  reasonSeed: string;
} {
  if (chip === "Loading")
    return { type: "cost", impact: "plus", reasonSeed: "Loading Charges" };
  if (chip === "Unloading")
    return { type: "cost", impact: "plus", reasonSeed: "Unloading Charges" };
  if (chip === "Detention")
    return { type: "cost", impact: "plus", reasonSeed: "Detention" };
  if (chip === "Damage")
    return { type: "cost", impact: "plus", reasonSeed: "Damages / Missing" };
  if (chip === "Toll")
    return { type: "cost", impact: "plus", reasonSeed: "Pass Debit" };
  return { type: "cost", impact: "plus", reasonSeed: "Other" };
}

export function protocolClientChipAdjustment(chip: FinanceProtocolChip): {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  reasonSeed: string;
} {
  return { type: "revenue", impact: "plus", reasonSeed: chip };
}

export type TripAdjustmentWizardStep =
  | "lane"
  | "impact"
  | "protocol"
  | "amount"
  | "reason"
  | "review";

export function buildAdjustmentWizardSteps(opts: {
  laneLocked: boolean;
  impactLocked: boolean;
  reasonLocked: boolean;
  showProtocolShortcuts: boolean;
}): TripAdjustmentWizardStep[] {
  const steps: TripAdjustmentWizardStep[] = [];
  if (!opts.laneLocked) steps.push("lane");
  if (!opts.impactLocked) steps.push("impact");
  if (opts.showProtocolShortcuts) steps.push("protocol");
  steps.push("amount");
  if (!opts.reasonLocked) steps.push("reason");
  steps.push("review");
  return steps;
}

export function resolveAdjustmentInitialStepIndex(
  steps: TripAdjustmentWizardStep[],
  opts: { laneLocked: boolean; impactLocked: boolean; reasonLocked: boolean },
): number {
  if (opts.reasonLocked) {
    const amountIdx = steps.indexOf("amount");
    return amountIdx >= 0 ? amountIdx : 0;
  }
  if (opts.impactLocked && opts.laneLocked) {
    const amountIdx = steps.indexOf("amount");
    return amountIdx >= 0 ? amountIdx : 0;
  }
  return 0;
}
